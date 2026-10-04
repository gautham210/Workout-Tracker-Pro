import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, CloudOff, Dumbbell, History, RotateCcw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import ExerciseVisual from './ExerciseVisual';
import AnimatedList from './react-bits/AnimatedList';
import { addLocalDays, localDayKey, localDayStart, sessionVolume } from './analytics';
import { fetchSessionPage } from './analyticsData';
import './dataExperiences.css';

const PAGE = 20;
const kg = (value) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Number(value) || 0);
// pendingSync.js is created by another workstream; glob resolves to {} until it exists.
const pendingModules = import.meta.glob('./pendingSync.js');

async function loadPending(userId) {
  try {
    const loader = pendingModules['./pendingSync.js'];
    if (!loader) return [];
    const module = await loader();
    const rows = await module.getPendingWorkouts?.(userId);
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}

// Normalise a queued (unsynced) workout into the same shape the list renders.
function pendingToSession(item, index) {
  const exercises = item.exercises || item.session_exercises || item.payload?.exercises || [];
  const source = item.payload || item;
  return {
    id: `pending-${item.id || source.id || index}`, pending: true,
    date: source.date || source.finished_at || item.created_at || new Date().toISOString(),
    split_type: source.split_type, split_day: source.split_day, duration_minutes: source.duration_minutes,
    session_exercises: exercises.map((row, i) => ({ id: row.id || `p${i}`, order_index: row.order_index ?? i, exercises: row.exercises || { name: row.name || row.exercise_name, muscle_group: row.muscle_group }, sets: (row.sets || []).map((set) => ({ ...set, completed: set.completed === true || set.completed === 1, is_warmup: Boolean(set.is_warmup) })) })),
  };
}

function labelDay(key) {
  const today = localDayKey(new Date());
  if (key === today) return 'Today';
  if (key === localDayKey(addLocalDays(new Date(), -1))) return 'Yesterday';
  const date = localDayStart(key);
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}

export default function HistoryExperience() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [pending, setPending] = useState([]);
  const [total, setTotal] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [state, setState] = useState('loading');
  const [moreState, setMoreState] = useState('idle');

  const [reloadKey, setReloadKey] = useState(0);
  const retry = () => { setState('loading'); setReloadKey((key) => key + 1); };
  useEffect(() => {
    if (!user?.id) return undefined;
    let alive = true;
    Promise.all([
      fetchSessionPage(user.id, { from: 0, size: PAGE }),
      loadPending(user.id),
      supabase.from('workout_sessions').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_finished', true),
    ]).then(([page, queued, count]) => {
      if (!alive) return;
      setSessions(page); setPending(queued.map(pendingToSession)); setTotal(count.error ? null : count.count);
      setHasMore(page.length === PAGE); setState('ready');
    }).catch(() => { if (alive) setState('error'); });
    return () => { alive = false; };
  }, [user?.id, reloadKey]);

  const loadMore = async () => {
    if (!user?.id || moreState === 'loading') return;
    setMoreState('loading');
    try {
      const page = await fetchSessionPage(user.id, { from: sessions.length, size: PAGE });
      setSessions((current) => { const seen = new Set(current.map((item) => item.id)); return [...current, ...page.filter((item) => !seen.has(item.id))]; });
      setHasMore(page.length === PAGE); setMoreState('idle');
    } catch { setMoreState('error'); }
  };

  const all = useMemo(() => [...pending, ...sessions].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)), [pending, sessions]);
  const groups = useMemo(() => {
    const map = new Map();
    for (const session of all) { const key = localDayKey(session.date); if (!map.has(key)) map.set(key, []); map.get(key).push(session); }
    return [...map.entries()];
  }, [all]);

  return <main className="experience history-experience">
    <section className="history-hero"><div><p className="eyebrow">Training archive</p><h1>Your work,<br />kept honestly.</h1><p>Every completed session is shown from your authenticated training history.</p></div><div className="history-count"><History size={17} /><strong>{(total ?? sessions.length) + pending.length}</strong><span>sessions</span></div></section>
    {state === 'loading' && <HistorySkeleton />}
    {state === 'error' && <div className="quiet-panel"><RotateCcw size={22} /><h2>Your archive is unavailable.</h2><p>Check your connection, then try again.</p><button type="button" className="secondary-action" onClick={retry}>Retry</button></div>}
    {state === 'ready' && all.length === 0 && <div className="quiet-panel history-empty"><Dumbbell size={28} /><h2>Your first session starts the story.</h2><p>Finish a workout and its real sets, volume, and movements will appear here.</p></div>}
    {state === 'ready' && pending.length > 0 && <div className="inline-state pending-banner"><CloudOff size={17} /> {pending.length} {pending.length === 1 ? 'workout is' : 'workouts are'} saved on this device and not synced yet. {pending.length === 1 ? 'It' : 'They'} will upload when you are online.</div>}
    {state === 'ready' && all.length > 0 && <section className="history-motion-strip"><div className="section-heading"><div><p className="eyebrow">Recent rhythm</p><h2>Tap a session to open it.</h2></div></div><AnimatedList items={all.slice(0, 5).map((session) => `${labelDay(localDayKey(session.date))} · ${session.split_day || 'Workout'} · ${kg(sessionVolume(session))} kg${session.pending ? ' · not synced' : ''}`)} showGradients={false} displayScrollbar={false} enableArrowNavigation={false} className="history-animated-list" itemClassName="history-animated-item" onItemSelect={(_, index) => setExpanded(all[index]?.id || null)} /></section>}
    {state === 'ready' && groups.map(([key, daily]) => <section className="history-day" key={key}><p className="history-date">{labelDay(key)}</p>{daily.map((session) => <SessionRow key={session.id} session={session} open={expanded === session.id} toggle={() => setExpanded((id) => id === session.id ? null : session.id)} />)}</section>)}
    {state === 'ready' && hasMore && <div className="history-more"><button type="button" className="secondary-action" onClick={loadMore} disabled={moreState === 'loading'}>{moreState === 'loading' ? 'Loading…' : 'Load older sessions'}</button>{moreState === 'error' && <p className="profile-feedback">Older sessions could not load. Try again.</p>}</div>}
  </main>;
}

function SessionRow({ session, open, toggle }) {
  const exercises = [...(session.session_exercises || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const volume = sessionVolume(session);
  return <article className={`history-session ${open ? 'is-open' : ''}`}><button type="button" className="history-session-top" onClick={toggle} aria-expanded={open}><div><p>{session.split_type || 'Workout'} · {session.duration_minutes ? `${session.duration_minutes} min` : 'Session'}{session.pending ? ' · not synced' : ''}</p><h2>{session.split_day || 'Training day'}</h2><span>{exercises.length} movements · {kg(volume)} kg volume</span></div><div className="session-disclosure">{open ? <ChevronDown size={19} /> : <ChevronRight size={19} />}</div></button>{open && <div className="history-detail">{exercises.length ? exercises.map((item) => <div className="history-exercise" key={item.id}><ExerciseVisual name={item.exercises?.name} muscle={item.exercises?.muscle_group} compact /><div><h3>{item.exercises?.name || 'Exercise'}</h3><p>{(item.sets || []).filter((set) => set.completed === true).map((set) => `${set.is_warmup ? 'W ' : ''}${set.weight_kg ?? 0} kg × ${set.reps ?? 0}`).join('  ·  ') || 'No completed sets'}</p></div></div>) : <p className="quiet-state">No exercise detail was recorded for this session.</p>}</div>}</article>;
}

function HistorySkeleton() {
  return <div className="history-skeleton" aria-label="Loading training history"><span /><span /><span /></div>;
}
