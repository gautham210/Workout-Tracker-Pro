import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Award, Scale, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ExerciseVisual from './ExerciseVisual';
import Counter from './react-bits/Counter';
import { getCompletedSessions, sessionVolume } from './trainingData';

export default function ProgressExperience() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange] = useState('recent');
  const [rangeAnchor, setRangeAnchor] = useState(0);
  useEffect(() => { let alive = true; if (!user?.id) return undefined; getCompletedSessions(user.id).then((value) => { if (alive) { setSessions(value); setRangeAnchor(Date.now()); } }).catch(() => alive && setError('Progress is unavailable right now.')).finally(() => alive && setLoading(false)); return () => { alive = false; }; }, [user?.id]);
  const scopedSessions = useMemo(() => {
    if (range === 'all') return sessions;
    if (range === 'month') {
      const cutoff = rangeAnchor - (30 * 24 * 60 * 60 * 1000);
      if (!rangeAnchor) return sessions;
      return sessions.filter((session) => new Date(session.date).getTime() >= cutoff);
    }
    return sessions.slice(0, 7);
  }, [range, rangeAnchor, sessions]);
  const data = useMemo(() => {
    const volume = scopedSessions.reduce((total, session) => total + sessionVolume(session), 0);
    const byExercise = new Map();
    scopedSessions.forEach((session) => session.session_exercises?.forEach((item) => item.sets?.forEach((set) => {
      const name = item.exercises?.name; if (!name || !set.completed) return;
      const candidate = (Number(set.weight_kg) || 0) * (1 + (Number(set.reps) || 0) / 30);
      const current = byExercise.get(name); if (!current || candidate > current.score) byExercise.set(name, { name, muscle: item.exercises?.muscle_group, score: candidate, weight: Number(set.weight_kg) || 0, reps: Number(set.reps) || 0 });
    })));
    return { volume, prs: [...byExercise.values()].sort((a, b) => b.score - a.score).slice(0, 4), recent: scopedSessions.slice(0, 7).reverse().map((session) => sessionVolume(session)) };
  }, [scopedSessions]);
  return <div className="experience progress-experience"><section className="progress-hero"><p className="eyebrow">Built from your completed sets</p><h1>Progress,<br />not noise.</h1><p>Every number here comes from your real training history.</p></section>{error && <div className="inline-state is-error">{error}</div>}{loading ? <ProgressSkeleton /> : sessions.length === 0 ? <ProgressEmpty /> : <><div className="segmented-control" aria-label="Progress time range">{[{ id: 'recent', label: '7 sessions' }, { id: 'month', label: '30 days' }, { id: 'all', label: 'All time' }].map((option) => <button key={option.id} className={range === option.id ? 'is-active' : ''} type="button" onClick={() => setRange(option.id)}>{option.label}</button>)}</div><section className="progress-total"><div><p className="eyebrow">{range === 'all' ? 'Lifetime volume' : 'Training volume'}</p><strong><Counter value={Math.round(data.volume)} fontSize={39} gap={0} horizontalPadding={0} gradientHeight={0} /> <small>kg</small></strong><span>{scopedSessions.length} completed sessions in view</span></div><TrendingUp size={29} color="#007aff" /></section><section className="progress-chart-section"><div className="section-heading"><div><p className="eyebrow">Volume rhythm</p><h2>Your sessions, in motion.</h2></div><Link to="/history" className="section-link">History <ArrowUpRight size={15} /></Link></div><VolumeChart values={data.recent} /></section><section className="home-section progress-prs"><div className="section-heading"><div><p className="eyebrow">Personal bests</p><h2>Your top lifts</h2></div><Award size={20} color="#ff8a00" /></div><div className="personal-best-list">{data.prs.map((pr) => <article key={pr.name}><ExerciseVisual name={pr.name} muscle={pr.muscle} compact /><div><h3>{pr.name}</h3><p>{pr.muscle || 'Movement'} · e1RM estimate</p></div><strong>{pr.weight}<small>kg × {pr.reps}</small></strong></article>)}</div></section><Link to="/bodyweight" className="metric-link"><Scale size={19} /><span><strong>Body metrics</strong><small>Track weight alongside your performance.</small></span><ArrowUpRight size={18} /></Link><Link to="/insights" className="metric-link insight-metric-link"><TrendingUp size={19} /><span><strong>AI insights</strong><small>Explore explainable signals from real training data.</small></span><ArrowUpRight size={18} /></Link></>}</div>;
}
function VolumeChart({ values }) {
  const safeValues = values.length ? values : [0];
  const maximum = Math.max(...safeValues, 1);
  const points = safeValues.map((value, index) => {
    const x = safeValues.length === 1 ? 50 : (index / (safeValues.length - 1)) * 100;
    const y = 88 - ((value / maximum) * 68);
    return `${x},${y}`;
  }).join(' ');
  return <div className="volume-chart" aria-label="Training volume chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="volumeStroke" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#06c7d8" /><stop offset="1" stopColor="#007aff" /></linearGradient></defs><path className="volume-chart-area" d={`M 0,100 L ${points} L 100,100 Z`} /><polyline className="volume-chart-line" points={points} /></svg><div className="volume-bars">{safeValues.map((volume, index) => <div key={`${volume}-${index}`}><span style={{ height: `${Math.max(12, (volume / maximum) * 100)}%` }} /><small>{index + 1}</small></div>)}</div></div>;
}
function ProgressSkeleton() { return <div className="progress-skeleton" aria-label="Loading progress"><div className="skeleton skeleton-stat" /><div className="skeleton skeleton-chart" /><div className="skeleton skeleton-list" /></div>; }
function ProgressEmpty() { return <div className="empty-state"><ExerciseVisual name="Progress" compact /><div><h3>Your progress will be real.</h3><p>Complete a workout with a logged set to unlock volume, personal bests, and trends.</p></div><Link to="/workout" className="secondary-action">Start training</Link></div>; }
