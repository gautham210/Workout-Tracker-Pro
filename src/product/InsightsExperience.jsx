import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, BrainCircuit, CalendarDays, Gauge, Sparkles, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Counter from './react-bits/Counter';
import { computeStreak, getCompletedSessions, sessionVolume } from './trainingData';

function insightCards(sessions) {
  if (!sessions.length) return [];
  const recent = sessions.slice(0, 7);
  const volume = recent.reduce((total, session) => total + sessionVolume(session), 0);
  const movementCount = new Set(recent.flatMap((session) => session.session_exercises || []).map((entry) => entry.exercises?.name).filter(Boolean)).size;
  return [
    { icon: Gauge, label: 'Training load', title: `${Math.round(volume).toLocaleString()} kg in your recent sessions`, copy: 'Volume is calculated from completed set weight and reps—not a projected score.' },
    { icon: CalendarDays, label: 'Consistency', title: `${computeStreak(sessions)} day active streak`, copy: 'Your streak only reflects completed workouts in your authenticated history.' },
    { icon: TrendingUp, label: 'Movement variety', title: `${movementCount} movements in your recent training`, copy: 'Use this signal with your own goals; it is not a medical or recovery recommendation.' },
  ];
}

export default function InsightsExperience() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [state, setState] = useState('loading');
  useEffect(() => {
    let live = true;
    getCompletedSessions(user?.id, 60).then((data) => { if (live) { setSessions(data); setState('ready'); } }).catch(() => { if (live) setState('error'); });
    return () => { live = false; };
  }, [user?.id]);
  const cards = useMemo(() => insightCards(sessions), [sessions]);
  const total = useMemo(() => sessions.reduce((sum, session) => sum + sessionVolume(session), 0), [sessions]);
  return <main className="experience insights-experience">
    <section className="insights-hero"><div className="insight-orb"><BrainCircuit size={23} /></div><p className="eyebrow">AI insights</p><h1>See the signal.<br />Keep the context.</h1><p>This space makes your verified training data legible. Ask Coach when you want a real AI response, not a simulated one.</p></section>
    {state === 'loading' && <div className="insights-skeleton"><span /><span /><span /></div>}
    {state === 'error' && <div className="quiet-panel"><h2>Insights could not load.</h2><p>Your training data will stay private while you reconnect.</p></div>}
    {state === 'ready' && !sessions.length && <div className="empty-state"><Sparkles size={24} /><h2>Give your training a first signal.</h2><p>Complete one real workout to unlock a data-based insight, then use Coach to explore it.</p><Link className="secondary-action" to="/workout">Build workout</Link></div>}
    {state === 'ready' && sessions.length > 0 && <><section className="insight-metric"><span>Total recorded volume</span><strong><Counter value={Math.round(total)} fontSize={34} gap={0} horizontalPadding={0} gradientHeight={0} /><small> kg</small></strong><p>Across {sessions.length} completed sessions.</p></section><section className="insight-card-list">{cards.map(({ icon: Icon, label, title, copy }) => <article key={label}><div className="insight-card-icon"><Icon size={18} /></div><p className="eyebrow">{label}</p><h2>{title}</h2><span>{copy}</span></article>)}</section><Link className="insight-coach-bridge" to="/ai-coach"><span><p className="eyebrow">Make it personal</p><strong>Ask Coach to explain this in your training context.</strong></span><ArrowUpRight size={20} /></Link></>}
  </main>;
}
