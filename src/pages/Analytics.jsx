import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Activity, Dumbbell, AlertTriangle, TrendingUp, BarChart2 } from 'lucide-react';

export default function Analytics() {
  const { user } = useAuth();

  const [loading, setLoading]           = useState(true);
  const [fetchError, setFetchError]     = useState(null);
  const [noData, setNoData]             = useState(false);

  const [totals,        setTotals]        = useState({ workouts: 0, volume: 0 });
  const [muscleStats,   setMuscleStats]   = useState({ most: null, least: null });
  const [exerciseStats, setExerciseStats] = useState({ mostUsed: null, strongestLift: null, strongestWeight: 0 });
  const [imbalances,    setImbalances]    = useState([]);

  useEffect(() => {
    if (!user) return;

    const run = async () => {
      setLoading(true);
      setFetchError(null);

      // ── CORRECT PIPELINE ────────────────────────────────────────────────────
      // workout_sessions → session_exercises → exercises (name, muscle_group)
      //                                      → sets (reps, weight_kg)
      // user_id filter is explicit (belt + suspenders alongside RLS)
      const { data: sessions, error } = await supabase
        .from('workout_sessions')
        .select(`
          id,
          date,
          session_exercises (
            id,
            exercises ( name, muscle_group ),
            sets ( reps, weight_kg )
          )
        `)
        .eq('user_id', user.id)
        .order('date', { ascending: false });

      console.log('[ANALYTICS FETCH]', {
        count: sessions?.length ?? 0,
        error: error?.message,
        code:  error?.code,
        sample: sessions?.[0],
      });

      if (error) {
        setFetchError(error.message);
        setLoading(false);
        return;
      }

      if (!sessions || sessions.length === 0) {
        setNoData(true);
        setLoading(false);
        return;
      }

      // ── AGGREGATION ─────────────────────────────────────────────────────────
      let totalVolume = 0;
      let hasSets     = false;

      // exercise frequency (times an exercise appeared across all sessions)
      const exerciseFreq = {};
      // volume per muscle group (kg × reps summed)
      const muscleVolume = {};
      // max single-set weight per exercise
      const exerciseMaxW = {};

      sessions.forEach(session => {
        session.session_exercises?.forEach(se => {
          const name     = se.exercises?.name;
          const muscle   = se.exercises?.muscle_group;

          if (name) {
            exerciseFreq[name] = (exerciseFreq[name] || 0) + 1;
          }

          se.sets?.forEach(set => {
            const r = parseInt(set.reps,     10) || 0;
            const w = parseFloat(set.weight_kg)  || 0;
            if (r === 0 && w === 0) return; // skip empty sets

            hasSets = true;
            const vol = r * w;
            totalVolume += vol;

            // Muscle volume (volume-weighted, not just frequency)
            if (muscle) {
              muscleVolume[muscle] = (muscleVolume[muscle] || 0) + vol;
            }

            // Track per-exercise max weight (for strongest lift)
            if (name) {
              exerciseMaxW[name] = Math.max(exerciseMaxW[name] || 0, w);
            }
          });
        });
      });

      console.log('[ANALYTICS COMPUTED]', {
        totalVolume,
        hasSets,
        exerciseFreq,
        muscleVolume,
        exerciseMaxW,
      });

      if (!hasSets) {
        setNoData(true);
        setLoading(false);
        return;
      }

      // ── MUSCLE STATS (ranked by volume lifted, not frequency) ────────────────
      const sortedMuscles = Object.entries(muscleVolume).sort((a, b) => b[1] - a[1]);
      const mostMuscle    = sortedMuscles[0]?.[0]                             ?? null;
      const leastMuscle   = sortedMuscles[sortedMuscles.length - 1]?.[0]     ?? null;

      // ── IMBALANCE ENGINE (push vs pull volume) ────────────────────────────────
      const PUSH_MUSCLES = ['Chest', 'Shoulders', 'Triceps'];
      const PULL_MUSCLES = ['Back', 'Biceps'];
      const pushVol = PUSH_MUSCLES.reduce((s, m) => s + (muscleVolume[m] || 0), 0);
      const pullVol = PULL_MUSCLES.reduce((s, m) => s + (muscleVolume[m] || 0), 0);

      const flags = [];
      if (pushVol > 0 && pullVol > 0) {
        const ratio = pushVol / pullVol;
        if (ratio > 2)     flags.push(`Push-heavy imbalance (${ratio.toFixed(1)}× more push than pull). Add rows and pull-downs.`);
        else if (ratio < 0.5) flags.push(`Pull-heavy imbalance (${(1 / ratio).toFixed(1)}× more pull than push). Add pressing movements.`);
      }

      // ── STRONGEST LIFT (exercise with highest single-set weight) ─────────────
      let strongestLift   = null;
      let strongestWeight = 0;
      Object.entries(exerciseMaxW).forEach(([name, w]) => {
        if (w > strongestWeight) { strongestWeight = w; strongestLift = name; }
      });

      // ── MOST USED EXERCISE (by frequency across sessions) ────────────────────
      const sortedEx  = Object.entries(exerciseFreq).sort((a, b) => b[1] - a[1]);
      const mostUsed  = sortedEx[0]?.[0] ?? null;
      const usedCount = sortedEx[0]?.[1] ?? 0;

      setTotals({ workouts: sessions.length, volume: totalVolume });
      setMuscleStats({ most: mostMuscle, least: leastMuscle });
      setExerciseStats({ mostUsed, usedCount, strongestLift, strongestWeight });
      setImbalances(flags);
      setLoading(false);
    };

    run();
  }, [user]);

  // ── Render states ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ textAlign: 'center', paddingTop: '100px', paddingBottom: '120px' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>Compiling analytics...</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div style={{ textAlign: 'center', paddingTop: '100px', paddingBottom: '120px', maxWidth: '600px', margin: '0 auto' }}>
        <AlertTriangle size={48} color="var(--error-color)" style={{ marginBottom: '16px' }} />
        <p style={{ fontSize: '18px', fontWeight: '700', color: 'var(--error-color)' }}>
          Failed to load analytics
        </p>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '8px' }}>
          {fetchError}
        </p>
      </div>
    );
  }

  if (noData) {
    return (
      <div style={{ textAlign: 'center', paddingTop: '100px', paddingBottom: '120px', maxWidth: '800px', margin: '0 auto' }}>
        <Dumbbell size={64} color="rgba(255,255,255,0.1)" style={{ marginBottom: '24px' }} />
        <p style={{ fontSize: '24px', fontWeight: '800', color: 'white', letterSpacing: '-0.5px' }}>
          Not enough data yet.
        </p>
        <p style={{ fontSize: '16px', color: 'var(--text-secondary)', marginTop: '12px' }}>
          Complete a session with logged sets to see your analytics.
        </p>
      </div>
    );
  }

  return (
    <div className="page-enter" style={{ position: 'relative', paddingBottom: '120px', maxWidth: '1000px', margin: '0 auto' }}>

      <div style={{ marginBottom: '32px', marginTop: '16px' }}>
        <h1 className="title" style={{ fontSize: '40px', margin: 0, letterSpacing: '-1px' }}>Analytics</h1>
        <p style={{ marginTop: '8px', fontSize: '15px', color: 'var(--text-secondary)' }}>
          Computed from {totals.workouts} session{totals.workouts !== 1 ? 's' : ''} of real data.
        </p>
      </div>

      {/* ── Overview ── */}
      <h2 className="subtitle" style={{ marginBottom: '14px' }}>Overview</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '14px', marginBottom: '32px' }}>
        <div className="glass card interactive-card" style={{ padding: '20px', margin: 0 }}>
          <Activity size={24} color="var(--accent-hover)" style={{ marginBottom: '10px' }} />
          <div style={{ fontSize: '36px', fontWeight: '800', color: 'white' }}>{totals.workouts}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '4px', fontWeight: '700' }}>Total Sessions</div>
        </div>
        <div className="glass card interactive-card" style={{ padding: '20px', margin: 0 }}>
          <TrendingUp size={24} color="#30D158" style={{ marginBottom: '10px' }} />
          <div style={{ fontSize: '36px', fontWeight: '800', color: 'white' }}>{Math.round(totals.volume).toLocaleString()}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '4px', fontWeight: '700' }}>Total Volume (kg)</div>
        </div>
      </div>

      {/* ── Imbalances ── */}
      {imbalances.length > 0 && (
        <div style={{ marginBottom: '32px' }}>
          <h2 className="subtitle" style={{ marginBottom: '14px' }}>Imbalance Flags</h2>
          <div className="glass card" style={{ borderLeft: '4px solid var(--error-color)', padding: '20px', background: 'rgba(255,69,58,0.05)' }}>
            {imbalances.map((w, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <AlertTriangle size={22} color="var(--error-color)" />
                <span style={{ fontSize: '15px', fontWeight: '600', color: 'white' }}>{w}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Muscle + Exercise ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '20px' }}>

        <div className="glass card hover-glow" style={{ padding: '20px', margin: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <BarChart2 size={20} color="var(--accent-hover)" />
            <h2 className="subtitle" style={{ margin: 0 }}>Muscle Groups</h2>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '14px', marginBottom: '14px' }}>
            <span style={{ color: 'var(--text-secondary)', fontWeight: '600', fontSize: '14px' }}>Most Volume</span>
            <span style={{ color: 'white', fontWeight: '800' }}>{muscleStats.most ?? '—'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)', fontWeight: '600', fontSize: '14px' }}>Least Volume</span>
            <span style={{ color: 'white', fontWeight: '800' }}>{muscleStats.least ?? '—'}</span>
          </div>
        </div>

        <div className="glass card hover-glow" style={{ padding: '20px', margin: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <Dumbbell size={20} color="#30D158" />
            <h2 className="subtitle" style={{ margin: 0 }}>Exercise Index</h2>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '14px', marginBottom: '14px' }}>
            <span style={{ color: 'var(--text-secondary)', fontWeight: '600', fontSize: '14px' }}>Most Used</span>
            <span style={{ color: 'white', fontWeight: '800', textAlign: 'right', maxWidth: '55%' }}>
              {exerciseStats.mostUsed
                ? `${exerciseStats.mostUsed} (×${exerciseStats.usedCount})`
                : '—'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)', fontWeight: '600', fontSize: '14px' }}>Strongest Lift</span>
            <span style={{ color: '#32ADE6', fontWeight: '800', textAlign: 'right', maxWidth: '55%' }}>
              {exerciseStats.strongestLift
                ? `${exerciseStats.strongestLift} — ${exerciseStats.strongestWeight}kg`
                : '—'}
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
