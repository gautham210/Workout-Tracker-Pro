import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Award, Scale, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ExerciseVisual from './ExerciseVisual';
import { getCompletedSessions, kg, sessionVolume } from './trainingData';

export default function ProgressExperience() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { let alive = true; if (!user?.id) return undefined; getCompletedSessions(user.id).then((value) => alive && setSessions(value)).catch(() => alive && setError('Progress is unavailable right now.')).finally(() => alive && setLoading(false)); return () => { alive = false; }; }, [user?.id]);
  const data = useMemo(() => {
    const volume = sessions.reduce((total, session) => total + sessionVolume(session), 0);
    const byExercise = new Map();
    sessions.forEach((session) => session.session_exercises?.forEach((item) => item.sets?.forEach((set) => {
      const name = item.exercises?.name; if (!name || !set.completed) return;
      const candidate = (Number(set.weight_kg) || 0) * (1 + (Number(set.reps) || 0) / 30);
      const current = byExercise.get(name); if (!current || candidate > current.score) byExercise.set(name, { name, muscle: item.exercises?.muscle_group, score: candidate, weight: Number(set.weight_kg) || 0, reps: Number(set.reps) || 0 });
    })));
    return { volume, prs: [...byExercise.values()].sort((a, b) => b.score - a.score).slice(0, 4), recent: sessions.slice(0, 7).reverse().map((session) => sessionVolume(session)) };
  }, [sessions]);
  return <div className="experience progress-experience"><section className="progress-hero"><p className="eyebrow">Built from your completed sets</p><h1>Progress,<br />not noise.</h1><p>Every number here comes from your real training history.</p></section>{error && <div className="inline-state is-error">{error}</div>}{loading ? <div className="skeleton-stack"><div className="skeleton short" /><div className="skeleton row" /></div> : sessions.length === 0 ? <ProgressEmpty /> : <><section className="progress-total"><div><p className="eyebrow">Lifetime volume</p><strong>{kg(data.volume)} <small>kg</small></strong><span>{sessions.length} completed sessions</span></div><TrendingUp size={29} color="#007aff" /></section><section className="home-section"><div className="section-heading"><div><p className="eyebrow">Volume rhythm</p><h2>Recent sessions</h2></div></div><div className="volume-bars">{data.recent.map((volume, index) => <div key={`${volume}-${index}`}><span style={{ height: `${Math.max(12, (volume / Math.max(...data.recent, 1)) * 100)}%` }} /><small>{index + 1}</small></div>)}</div></section><section className="home-section"><div className="section-heading"><div><p className="eyebrow">Personal bests</p><h2>Your top lifts</h2></div><Award size={20} color="#ff8a00" /></div><div className="personal-best-list">{data.prs.map((pr) => <article key={pr.name}><ExerciseVisual name={pr.name} muscle={pr.muscle} compact /><div><h3>{pr.name}</h3><p>{pr.muscle || 'Movement'} · e1RM estimate</p></div><strong>{pr.weight}<small>kg × {pr.reps}</small></strong></article>)}</div></section><Link to="/bodyweight" className="metric-link"><Scale size={19} /><span><strong>Body metrics</strong><small>Track weight alongside your performance.</small></span><ArrowUpRight size={18} /></Link></>}</div>;
}
function ProgressEmpty() { return <div className="empty-state"><ExerciseVisual name="Progress" compact /><div><h3>Your progress will be real.</h3><p>Complete a workout with a logged set to unlock volume, personal bests, and trends.</p></div><Link to="/workout" className="secondary-action">Start training</Link></div>; }
