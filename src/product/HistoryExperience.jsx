import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Dumbbell, History, RotateCcw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ExerciseVisual from './ExerciseVisual';
import { getCompletedSessions, kg, sessionVolume } from './trainingData';

function labelDate(value) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}

export default function HistoryExperience() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [state, setState] = useState('loading');

  useEffect(() => {
    let alive = true;
    getCompletedSessions(user?.id, 100)
      .then((data) => { if (alive) { setSessions(data); setState('ready'); } })
      .catch(() => { if (alive) setState('error'); });
    return () => { alive = false; };
  }, [user?.id]);

  const groups = useMemo(() => sessions.reduce((all, session) => {
    const key = labelDate(session.date);
    if (!all[key]) all[key] = [];
    all[key].push(session);
    return all;
  }, {}), [sessions]);

  return <main className="experience history-experience">
    <section className="history-hero"><div><p className="eyebrow">Training archive</p><h1>Your work,<br />kept honestly.</h1><p>Every completed session is shown from your authenticated training history.</p></div><div className="history-count"><History size={17} /><strong>{sessions.length}</strong><span>sessions</span></div></section>
    {state === 'loading' && <HistorySkeleton />}
    {state === 'error' && <div className="quiet-panel"><RotateCcw size={22} /><h2>Your archive is unavailable.</h2><p>Check your connection, then return to refresh the timeline.</p></div>}
    {state === 'ready' && sessions.length === 0 && <div className="quiet-panel history-empty"><Dumbbell size={28} /><h2>Your first session starts the story.</h2><p>Finish a workout and its real sets, volume, and movements will appear here.</p></div>}
    {Object.entries(groups).map(([date, daily]) => <section className="history-day" key={date}><p className="history-date">{date}</p>{daily.map((session) => <SessionRow key={session.id} session={session} open={expanded === session.id} toggle={() => setExpanded((id) => id === session.id ? null : session.id)} />)}</section>)}
  </main>;
}

function SessionRow({ session, open, toggle }) {
  const exercises = [...(session.session_exercises || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const volume = sessionVolume(session);
  return <article className={`history-session ${open ? 'is-open' : ''}`}><button type="button" className="history-session-top" onClick={toggle} aria-expanded={open}><div><p>{session.split_type || 'Workout'} · {session.duration_minutes ? `${session.duration_minutes} min` : 'Session'}</p><h2>{session.split_day || 'Training day'}</h2><span>{exercises.length} movements · {kg(volume)} kg volume</span></div><div className="session-disclosure">{open ? <ChevronDown size={19} /> : <ChevronRight size={19} />}</div></button>{open && <div className="history-detail">{exercises.length ? exercises.map((item) => <div className="history-exercise" key={item.id}><ExerciseVisual name={item.exercises?.name} muscle={item.exercises?.muscle_group} compact /><div><h3>{item.exercises?.name || 'Exercise'}</h3><p>{(item.sets || []).filter((set) => set.completed !== false).map((set) => `${set.weight_kg ?? 0} kg × ${set.reps ?? 0}`).join('  ·  ') || 'No completed sets'}</p></div></div>) : <p className="quiet-state">No exercise detail was recorded for this session.</p>}</div>}</article>;
}

function HistorySkeleton() {
  return <div className="history-skeleton" aria-label="Loading training history"><span /><span /><span /></div>;
}
