import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, BrainCircuit, Flame, Play, ScanLine, Sparkles, Trophy, WifiOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import ExerciseVisual from './ExerciseVisual';
import Counter from './react-bits/Counter';
import { computeStreak, hasTargets, leadExercise, localDayBounds, nextSplitDay, sessionVolume, streakOptionsFromProfile, sumMeals, volumeLastDays } from './analytics';
import { fetchSessionPage, fetchTrainingDays, loadAthleteContext } from './analyticsData';
import './dataExperiences.css';

function nextFocus(profile, sessions) {
  if (!sessions.length) return { title: 'Build your first session', caption: 'Choose movements that match today.', action: 'Start building', lead: null };
  const last = sessions[0];
  const next = nextSplitDay(profile?.custom_split, last?.split_day);
  if (next) {
    // Illustrate the plan with the most recent session of that same split day.
    const sameDay = sessions.find((session) => String(session.split_day || '').trim().toLowerCase() === next.title.trim().toLowerCase());
    return { title: next.title, caption: next.known ? 'Next in your active split.' : 'Start your split from the top.', action: 'Start session', lead: leadExercise(sameDay) || leadExercise(last) };
  }
  return { title: 'Continue your rhythm', caption: last?.split_day ? `Your last completed focus was ${last.split_day}.` : 'Your next session is ready.', action: 'Build session', lead: leadExercise(last) };
}

export default function HomeExperience() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [dayRows, setDayRows] = useState([]);
  const [totalSessions, setTotalSessions] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState({ meals: null, athlete: null });

  useEffect(() => {
    let alive = true;
    if (!user?.id) return undefined;
    Promise.all([
      fetchSessionPage(user.id, { size: 30 }),
      fetchTrainingDays(user.id, 400),
      supabase.from('workout_sessions').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_finished', true),
    ])
      .then(([page, days, count]) => { if (alive) { setSessions(page); setDayRows(days); setTotalSessions(count.count ?? days.length); } })
      .catch(() => { if (alive) setError('Your training timeline could not be refreshed.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return undefined;
    let live = true;
    const bounds = localDayBounds();
    Promise.all([
      supabase.from('food_entries').select('calories,protein_g').eq('user_id', user.id).gte('logged_at', bounds.start).lt('logged_at', bounds.end).limit(100),
      loadAthleteContext(user.id, profile).catch(() => null),
    ]).then(([meals, athlete]) => {
      if (live) setContext({ meals: meals.error ? null : meals.data || [], athlete });
    });
    return () => { live = false; };
  }, [user?.id, profile]);

  const streak = useMemo(() => computeStreak(dayRows.length ? dayRows : sessions, streakOptionsFromProfile(profile)), [dayRows, sessions, profile]);
  const weekVolume = useMemo(() => volumeLastDays(sessions, 7), [sessions]);
  const focus = useMemo(() => nextFocus(profile, sessions), [profile, sessions]);
  const name = profile?.name?.trim()?.split(' ')[0] || user?.email?.split('@')[0] || 'there';
  const { meals, athlete } = context;
  const totals = useMemo(() => sumMeals(meals || []), [meals]);
  const targets = athlete?.targets;

  return (
    <div className="experience home-experience">
      <section className="home-intro">
        <div>
          <p className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h1>Good to see you,<br />{name}.</h1>
        </div>
        <Link to="/ai-coach" className="coach-launch" aria-label="Open AI Coach"><Sparkles size={19} /></Link>
      </section>

      {error && <div className="inline-state is-error"><WifiOff size={17} /> {error}</div>}
      {loading ? <HomeSkeleton /> : (
        <>
          <section className="today-stage">
            <div className="stage-content">
              <p className="eyebrow">Today&apos;s training</p>
              <h2>{focus.title}</h2>
              <p>{focus.caption}</p>
              <button className="primary-action" type="button" onClick={() => navigate('/workout')}><Play size={17} fill="currentColor" /> {focus.action}</button>
            </div>
            <ExerciseVisual name={focus.lead?.name || 'Training'} muscle={focus.lead?.muscle} />
          </section>

          <section className="glance-strip" aria-label="Training summary">
            <div><Flame size={18} color="#ff8a00" /><strong className="glance-value"><Counter value={streak} fontSize={22} gap={0} horizontalPadding={0} gradientHeight={0} /></strong><span className="glance-label">day streak</span></div>
            <div><Trophy size={18} color="#007aff" /><strong className="glance-value"><Counter value={totalSessions} fontSize={22} gap={0} horizontalPadding={0} gradientHeight={0} /></strong><span className="glance-label">sessions</span></div>
            <div><ArrowUpRight size={18} color="#34c759" /><strong className="glance-value"><Counter value={Math.round(weekVolume)} fontSize={22} gap={0} horizontalPadding={0} gradientHeight={0} /></strong><span className="glance-label">kg · last 7 days</span></div>
          </section>

          <section className="home-action-grid" aria-label="Quick actions">
            <Link to="/nutrition"><ScanLine size={17} /><span><strong>Scan meal</strong><small>Log nutrition</small></span></Link>
            <Link to="/insights"><BrainCircuit size={17} /><span><strong>Insights</strong><small>Your signals</small></span></Link>
            <Link to="/ai-coach"><Sparkles size={17} /><span><strong>Coach</strong><small>Ask with context</small></span></Link>
          </section>

          <section className="home-section home-context-snapshot">
            <div className="section-heading"><div><p className="eyebrow">Today in context</p><h2>Small facts, connected.</h2></div><Link to="/bodyweight">Metrics</Link></div>
            <div>
              <Link to="/nutrition"><span>Nutrition</span>{meals === null ? <><strong>—</strong><small>Not available right now</small></> : meals.length ? <><strong>{Math.round(totals.calories)} kcal</strong><small>{targets?.calories > 0 ? `${Math.max(0, Math.round(Number(targets.calories) - totals.calories))} kcal remaining · ` : ''}{Math.round(totals.protein_g)}g protein</small></> : <><strong>No meals logged today</strong><small>{hasTargets(targets) && targets.calories > 0 ? `Target ${Math.round(targets.calories)} kcal` : 'Scan or log your first meal'}</small></>}</Link>
              <Link to="/bodyweight"><span>Bodyweight</span>{athlete?.weightKg ? <><strong>{athlete.weightKg.toFixed(1)} kg</strong><small>Latest private metric</small></> : <><strong>Not logged</strong><small>Add your weight in Body metrics</small></>}</Link>
            </div>
          </section>

          <section className="home-section">
            <div className="section-heading"><div><p className="eyebrow">Your path</p><h2>Recent training</h2></div><Link to="/history">See all</Link></div>
            {sessions.length ? (
              <div className="recent-list">
                {sessions.slice(0, 4).map((session) => {
                  const lead = leadExercise(session);
                  return (
                    <Link to="/history" className="recent-row" key={session.id}>
                      <ExerciseVisual name={lead?.name || session.split_day || 'Workout'} muscle={lead?.muscle} compact />
                      <div><h3>{session.split_day || 'Workout'}</h3><p>{new Date(session.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {session.session_exercises?.length || 0} movements{session.duration_minutes ? ` · ${session.duration_minutes} min` : ''}</p></div>
                      <strong>{Math.round(sessionVolume(session)).toLocaleString()}<small> kg</small></strong>
                    </Link>
                  );
                })}
              </div>
            ) : <EmptyTraining />}
          </section>
        </>
      )}
    </div>
  );
}

function EmptyTraining() {
  return <div className="empty-state"><ExerciseVisual name="First workout" compact /><div><h3>Your story starts with one set.</h3><p>Build a session and your real trend, streak, and personal bests will appear here.</p></div><Link className="secondary-action" to="/workout">Build workout</Link></div>;
}

function HomeSkeleton() {
  return <div className="skeleton-stack" aria-label="Loading training data"><div className="skeleton hero" /><div className="skeleton short" /><div className="skeleton row" /></div>;
}
