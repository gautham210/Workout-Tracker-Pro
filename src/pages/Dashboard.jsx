import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Play, Sparkles, Activity, Flame } from 'lucide-react';

// ── Canonical split definitions ───────────────────────────────────────────────
const SPLITS = {
  'PPL':           ['Push', 'Pull', 'Legs'],
  'Bro Split':     ['Chest', 'Back', 'Shoulders', 'Triceps', 'Biceps', 'Legs'],
  'Upper / Lower': ['Upper', 'Lower'],
  'Full Body':     ['Full Body'],
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ── Timezone-safe local date key ──────────────────────────────────────────────
const toLocalKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ── Streak engine ─────────────────────────────────────────────────────────────
// Iterates backwards day-by-day (local timezone).
// includeRestDays = true  → rest days don't break streak (they're expected off days)
// includeRestDays = false → rest days are treated like any other day (skip but don't break)
function computeStreak(sessions, includeRestDays, restDays) {
  if (!sessions.length) return 0;

  const dateSet = new Set(sessions.map(s => toLocalKey(s.date)));

  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  for (let i = 0; i < 730; i++) {
    const key        = toLocalKey(cursor);
    const dayName    = DAY_NAMES[cursor.getDay()];
    const hasWorkout = dateSet.has(key);
    const isRestDay  = restDays.includes(dayName);

    if (hasWorkout) {
      streak++;
    } else if (i === 0) {
      // Today — still possible to work out. Don't count, don't break.
    } else if (isRestDay) {
      // Rest day: streak continues regardless of include_rest_days toggle.
      // The toggle controls whether rest days are counted in *consistency %*, not streak.
    } else {
      break; // Real missed training day — streak ends
    }

    cursor.setDate(cursor.getDate() - 1);
  }

  console.log('[STREAK]', { streak, dateSetSize: dateSet.size });
  return streak;
}

// ── Consistency % (rest-day aware denominator) ────────────────────────────────
function computeConsistencyPct(sessions, includeRestDays, restDays) {
  const thirtyAgo = new Date();
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  thirtyAgo.setHours(0, 0, 0, 0);

  const workoutsLast30 = sessions.filter(s => new Date(s.date) >= thirtyAgo).length;

  let denominator = 30;
  if (!includeRestDays && restDays.length > 0) {
    // Count how many rest days fell in the last 30 days
    let restCount = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    for (let i = 0; i < 30; i++) {
      if (restDays.includes(DAY_NAMES[cursor.getDay()])) restCount++;
      cursor.setDate(cursor.getDate() - 1);
    }
    denominator = Math.max(30 - restCount, 1);
  }

  return Math.min(Math.round((workoutsLast30 / denominator) * 100), 100);
}

// ── Auto-detect split from recent session history ─────────────────────────────
function detectSplit(sessions) {
  if (sessions.length < 3) return null;

  const recent = sessions.slice(0, 12).map(s => (s.split_day || '').trim().toLowerCase());

  for (const [name, days] of Object.entries(SPLITS)) {
    const lowerDays = days.map(d => d.toLowerCase());
    const matches   = recent.filter(r => lowerDays.includes(r));
    if (matches.length >= Math.min(3, days.length)) return { name, days };
  }

  return null;
}

// ── Priority-ordered split resolution ────────────────────────────────────────
// 1. active_loop  2. custom_split  3. detected  4. known split_type  5. null
function resolveNextSession(profile, sessions) {
  // 1. Active Loop — days may be {name, exercises} objects OR legacy strings
  if (profile.active_loop) {
    const loop = profile.active_loop;
    const days = loop.days;
    const len  = days?.length || 0;
    if (len > 0) {
      const start   = new Date(loop.start_date ?? new Date());
      start.setHours(0, 0, 0, 0);
      const today   = new Date();
      today.setHours(0, 0, 0, 0);
      const elapsed = Math.floor((today - start) / 86_400_000);
      const slot    = days[elapsed % len];
      const name    = typeof slot === 'object' ? slot.name : slot;
      return { day: `${name} Day`, label: 'Active Program', source: 'loop' };
    }
  }

  // 2. Custom Split
  const customSplit = profile.custom_split;
  if (customSplit?.length > 0 && sessions.length > 0) {
    const last     = sessions[0];
    const lowerCS  = customSplit.map(d => d.toLowerCase());
    const lastIdx  = lowerCS.indexOf((last.split_day || '').toLowerCase());
    if (lastIdx !== -1) {
      const next = customSplit[(lastIdx + 1) % customSplit.length];
      return { day: `${next} Day`, label: 'Custom Program', source: 'custom' };
    }
    // last day not in custom split — fall through
  }

  if (sessions.length === 0) return null;
  const last = sessions[0];

  // 3. Auto-detected split
  const detected = detectSplit(sessions);
  if (detected) {
    const lowerDays = detected.days.map(d => d.toLowerCase());
    const lastIdx   = lowerDays.indexOf((last.split_day || '').toLowerCase());
    if (lastIdx !== -1) {
      const next = detected.days[(lastIdx + 1) % detected.days.length];
      return { day: `${next} Day`, label: 'Inferred Split', source: 'detected' };
    }
  }

  // 4. Last session's known split_type
  const knownSeq = SPLITS[last.split_type];
  if (knownSeq) {
    const lastIdx = knownSeq.findIndex(
      d => d.toLowerCase() === (last.split_day || '').toLowerCase()
    );
    if (lastIdx !== -1) {
      const next = knownSeq[(lastIdx + 1) % knownSeq.length];
      return { day: `${next} Day`, label: last.split_type, source: 'manual' };
    }
  }

  return null; // Can't determine next session without guessing
}

export default function Dashboard() {
  const navigate          = useNavigate();
  const { user, profile } = useAuth();

  const [sessions, setSessions] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data, error } = await supabase
        .from('workout_sessions')
        .select('id, date, split_type, split_day')
        .eq('user_id', user.id)
        .order('date', { ascending: false });

      console.log('[DASHBOARD] sessions:', { count: data?.length, error: error?.message });
      if (data) setSessions(data);
      setLoading(false);
    };
    load();
  }, [user]);

  if (loading || !profile) {
    return <div style={{ padding: '80px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>;
  }

  // ── Identity ─────────────────────────────────────────────────────────────────
  const displayName = profile.name?.trim() || user?.email?.split('@')[0] || 'Athlete';

  // ── Streak + Consistency ──────────────────────────────────────────────────────
  const includeRestDays = profile.include_rest_days ?? false;
  const restDays        = profile.rest_days         ?? [];
  const currentStreak   = computeStreak(sessions, includeRestDays, restDays);

  // ── Next session (priority-ordered, no fake values) ───────────────────────────
  const nextSession = resolveNextSession(profile, sessions);

  // ── Insights (real data only) ─────────────────────────────────────────────────
  const insights = [];

  if (sessions.length === 0) {
    insights.push('Log your first workout to begin tracking your progress here.');
  } else {
    const todayKey      = toLocalKey(new Date());
    const lastKey       = toLocalKey(sessions[0].date);
    const daysSinceLast = Math.round(
      (new Date(todayKey).getTime() - new Date(lastKey).getTime()) / 86_400_000
    );

    const nextDay = nextSession?.day ?? 'next';

    if (daysSinceLast === 0) {
      insights.push(`Session logged today. ${nextDay} is next in rotation.`);
    } else if (daysSinceLast === 1) {
      insights.push(`Yesterday was your last session. ${nextDay} is up next.`);
    } else if (daysSinceLast >= 3) {
      insights.push(`${daysSinceLast} days since your last session. Return with ${nextDay} to stay on track.`);
    }

    if (currentStreak >= 7) {
      insights.push(`${currentStreak}-day streak active. Elite consistency — don't stop now.`);
    } else if (currentStreak >= 3) {
      insights.push(`${currentStreak}-day streak. Momentum is building.`);
    }

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    oneWeekAgo.setHours(0, 0, 0, 0);
    const weekCount = sessions.filter(s => new Date(s.date) >= oneWeekAgo).length;
    if (weekCount >= 5) {
      insights.push(`${weekCount} sessions this week — exceptional frequency.`);
    }
  }

  // ── 3D tilt effect ────────────────────────────────────────────────────────────
  const handleMouseMove = (e) => {
    if (window.innerWidth < 768) return;
    const el   = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const rotX = (((rect.height / 2) - (e.clientY - rect.top))  / (rect.height / 2)) * 4;
    const rotY = (((e.clientX - rect.left) - (rect.width / 2))  / (rect.width  / 2)) * 4;
    el.style.transform = `perspective(1000px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale3d(1.02,1.02,1.02)`;
  };
  const handleMouseLeave = (e) => {
    e.currentTarget.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)';
  };

  return (
    <div className="page-enter">

      {/* ── Hero ── */}
      <div style={{ marginBottom: '40px', marginTop: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Flame
            size={20}
            color={currentStreak > 0 ? '#FF9F0A' : 'var(--text-secondary)'}
            style={{ filter: currentStreak > 0 ? 'drop-shadow(0 0 10px rgba(255,159,10,0.5))' : 'none' }}
          />
          <span style={{ fontWeight: '800', fontSize: '13px', letterSpacing: '1.5px', color: currentStreak > 0 ? '#FF9F0A' : 'var(--text-secondary)' }}>
            {currentStreak} DAY STREAK
          </span>
        </div>
        <h1
          className="title"
          style={{ fontSize: '48px', margin: 0, letterSpacing: '-1.5px', background: 'linear-gradient(180deg,#fff 0%,rgba(255,255,255,0.7) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
        >
          {sessions.length === 0 ? `Welcome, ${displayName}.` : `Back again, ${displayName}.`}
        </h1>
        <p style={{ marginTop: '12px', fontSize: '18px', color: 'var(--text-secondary)', fontWeight: '500' }}>
          Endurance is earned, not given.
        </p>
      </div>

      {/* ── Insights ── */}
      {insights.length > 0 && (
        <div style={{ marginBottom: '40px' }}>
          <h2 className="subtitle" style={{ marginBottom: '16px' }}>Insights</h2>
          <div className="glass card interactive-card" style={{ borderLeft: '4px solid var(--accent-color)' }}>
            {insights.slice(0, 2).map((text, idx) => (
              <div
                key={idx}
                style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', marginBottom: idx < Math.min(2, insights.length) - 1 ? '20px' : 0 }}
              >
                <div style={{ background: 'rgba(0,122,255,0.1)', padding: '10px', borderRadius: '12px', flexShrink: 0 }}>
                  <Sparkles size={18} color="var(--accent-hover)" />
                </div>
                <p style={{ margin: 0, fontSize: '15px', color: '#fff', lineHeight: '1.6', fontWeight: '500', alignSelf: 'center' }}>
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Next Session Card ── */}
      <div style={{ marginBottom: '40px' }}>
        <h2 className="subtitle" style={{ marginBottom: '16px' }}>Next Session</h2>
        <div
          className="glass card"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{
            padding: '32px',
            position: 'relative',
            overflow: 'hidden',
            cursor: 'default',
            transition: 'box-shadow 0.3s ease, transform 0.1s linear',
            boxShadow: nextSession ? '0 0 40px rgba(0,122,255,0.08)' : 'none',
          }}
        >
          <div style={{ position: 'absolute', right: '-40px', top: '10px', opacity: 0.04, transform: 'rotate(15deg)', pointerEvents: 'none' }}>
            <Activity size={200} />
          </div>

          {nextSession ? (
            <>
              <p style={{ margin: '0 0 8px', color: 'var(--accent-hover)', fontWeight: '800', fontSize: '12px', letterSpacing: '2px', textTransform: 'uppercase', opacity: 0.85 }}>
                {nextSession.label}
              </p>
              <h3 style={{ margin: '0 0 32px', fontSize: '40px', fontWeight: '800', letterSpacing: '-1.5px' }}>
                {nextSession.day}
              </h3>
              <button
                className="btn btn-primary"
                style={{ width: '100%', fontSize: '18px', padding: '20px', borderRadius: '18px' }}
                onClick={() => navigate('/workout')}
              >
                <Play fill="currentColor" size={22} style={{ marginRight: '10px' }} />
                Start Session
              </button>
            </>
          ) : (
            <>
              <p style={{ margin: '0 0 12px', color: 'var(--text-secondary)', fontWeight: '700', fontSize: '12px', letterSpacing: '2px', textTransform: 'uppercase' }}>
                No training data yet
              </p>
              <h3 style={{ margin: '0 0 8px', fontSize: '26px', fontWeight: '800', letterSpacing: '-0.5px', color: 'rgba(255,255,255,0.6)' }}>
                Ready when you are.
              </h3>
              <p style={{ margin: '0 0 32px', fontSize: '15px', color: 'var(--text-secondary)', fontWeight: '500' }}>
                Your next session will be calculated after your first workout.
              </p>
              <button
                className="btn btn-primary"
                style={{ width: '100%', fontSize: '18px', padding: '20px', borderRadius: '18px' }}
                onClick={() => navigate('/workout')}
              >
                <Play fill="currentColor" size={22} style={{ marginRight: '10px' }} />
                Start First Workout
              </button>
            </>
          )}
        </div>
      </div>

    </div>
  );
}
