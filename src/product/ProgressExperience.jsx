import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Award, BrainCircuit, Flame, History, Scale, TrendingDown, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ExerciseVisual from './ExerciseVisual';
import DomainLinks from './DomainLinks';
import Counter from './react-bits/Counter';
import { addLocalDays, computeStreak, computePersonalBests, exerciseSignals, localDayKey, localDayStart, sessionVolume, streakOptionsFromProfile, weeklyBuckets } from './analytics';
import { fetchAllSessions, fetchTrainingDays } from './analyticsData';
import './dataExperiences.css';

const links = [{ to: '/history', icon: History, title: 'History', copy: 'Completed sessions' }, { to: '/bodyweight', icon: Scale, title: 'Body metrics', copy: 'Weight and trends' }, { to: '/insights', icon: BrainCircuit, title: 'AI insights', copy: 'Explainable signals' }];
const shortDate = (value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function chartPoints(range, sessions, scoped, now) {
  if (range === 'recent') return scoped.slice(0, 7).reverse().map((session) => ({ label: shortDate(session.date), value: sessionVolume(session), title: `${shortDate(session.date)} · ${session.split_day || 'Workout'}` }));
  const weeks = range === 'month' ? 5 : 12;
  return weeklyBuckets(sessions, weeks, now).map((bucket) => ({ label: shortDate(bucket.start), value: bucket.volume, title: `Week of ${shortDate(bucket.start)} · ${bucket.sessions} sessions` }));
}

export default function ProgressExperience() {
  const { user, profile } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [dayRows, setDayRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange] = useState('recent');
  const [now, setNow] = useState(() => new Date());

  const [reloadKey, setReloadKey] = useState(0);
  const retry = () => { setError(''); setLoading(true); setReloadKey((key) => key + 1); };
  useEffect(() => {
    if (!user?.id) return undefined;
    let alive = true;
    Promise.all([fetchAllSessions(user.id), fetchTrainingDays(user.id, 400)])
      .then(([all, days]) => { if (alive) { setSessions(all); setDayRows(days); setNow(new Date()); } })
      .catch(() => { if (alive) setError('Progress is unavailable right now.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [user?.id, reloadKey]);

  const scopedSessions = useMemo(() => {
    if (range === 'all') return sessions;
    if (range === 'month') { const cutoff = localDayKey(addLocalDays(localDayStart(now), -29)); return sessions.filter((session) => localDayKey(session.date) >= cutoff); }
    return sessions.slice(0, 7);
  }, [range, sessions, now]);
  const volume = useMemo(() => scopedSessions.reduce((total, session) => total + sessionVolume(session), 0), [scopedSessions]);
  const points = useMemo(() => chartPoints(range, sessions, scopedSessions, now), [range, sessions, scopedSessions, now]);
  // Personal bests and signals always use the whole history, never the range filter.
  const prs = useMemo(() => computePersonalBests(sessions, 6), [sessions]);
  const signals = useMemo(() => exerciseSignals(sessions).filter((signal) => signal.status !== 'insufficient').slice(0, 4), [sessions]);
  const streakOptions = streakOptionsFromProfile(profile);
  const streak = useMemo(() => computeStreak(dayRows.length ? dayRows : sessions, { restDays: profile?.rest_days, includeRestDays: profile?.include_rest_days, now }), [dayRows, sessions, profile?.rest_days, profile?.include_rest_days, now]);

  const hero = <><section className="progress-hero"><p className="eyebrow">Built from your completed sets</p><h1>Progress,<br />not noise.</h1><p>Every number here comes from your real training history.</p></section><DomainLinks label="Progress tools" title="See the whole picture" items={links} /></>;
  if (error) return <div className="experience progress-experience">{hero}<ProgressError message={error} onRetry={retry} /></div>;
  return <div className="experience progress-experience">{hero}{loading ? <ProgressSkeleton /> : sessions.length === 0 ? <ProgressEmpty /> : <>
    <div className="segmented-control" aria-label="Progress time range">{[{ id: 'recent', label: '7 sessions' }, { id: 'month', label: '30 days' }, { id: 'all', label: 'All time' }].map((option) => <button key={option.id} className={range === option.id ? 'is-active' : ''} type="button" onClick={() => setRange(option.id)}>{option.label}</button>)}</div>
    <section className="progress-total"><div><p className="eyebrow">{range === 'all' ? 'Lifetime volume' : 'Training volume'}</p><strong><Counter value={Math.round(volume)} fontSize={39} gap={0} horizontalPadding={0} gradientHeight={0} /> <small>kg</small></strong><span>{scopedSessions.length} completed {scopedSessions.length === 1 ? 'session' : 'sessions'} in view · completed working sets only</span></div><TrendingUp size={29} color="#007aff" /></section>
    <section className="streak-note"><Flame size={18} color="#ff8a00" /><div><strong>{streak} day streak</strong><small>{streakOptions.includeRestDays && streakOptions.restDays.length ? `Planned rest days (${streakOptions.restDays.map((day) => String(day).slice(0, 3)).join(', ')}) do not break it.` : 'Rest days break the streak. Set planned rest days in Settings to keep it through them.'}</small></div></section>
    <section className="progress-chart-section"><div className="section-heading"><div><p className="eyebrow">{range === 'recent' ? 'Volume per session' : 'Weekly volume'}</p><h2>Your training, in motion.</h2></div><Link to="/history" className="section-link">History <ArrowUpRight size={15} /></Link></div><VolumeChart points={points} /></section>
    <section className="home-section progress-prs"><div className="section-heading"><div><p className="eyebrow">Personal bests</p><h2>All-time top lifts</h2></div><Award size={20} color="#ff8a00" /></div>
      {prs.length ? <div className="personal-best-list">{prs.map((pr) => <article key={pr.name}><ExerciseVisual name={pr.name} muscle={pr.muscle} compact /><div><h3>{pr.name}</h3><p>{pr.weight} kg × {pr.reps}{Number.isFinite(Number(pr.rir)) && pr.rir !== null ? ` @ ${pr.rir} RIR` : ''} · {shortDate(pr.date)}</p></div><strong>{Math.round(pr.e1rm)}<small>kg e1RM</small></strong></article>)}</div> : <p className="quiet-state">No completed weighted sets yet. Log a set with weight and reps to unlock personal bests.</p>}
      <p className="quiet-state">Estimated one-rep max (Brzycki to 10 reps, Epley above), best set per exercise across your full history.</p></section>
    <section className="home-section progress-signals"><div className="section-heading"><div><p className="eyebrow">Signals</p><h2>Overload and plateaus</h2></div></div>
      {signals.length ? <div className="signal-list">{signals.map((signal) => <article key={signal.name} className={`signal ${signal.status}`}>{signal.status === 'plateau' ? <TrendingDown size={17} /> : <TrendingUp size={17} />}<div><h3>{signal.name}</h3><p>{signal.status === 'plateau' ? `e1RM held within 2% over your last 4 sessions (${Math.round(signal.from)} to ${Math.round(signal.to)} kg).` : `e1RM up ${(signal.change * 100).toFixed(1)}% across your last 4 sessions.`}</p></div></article>)}</div> : <p className="quiet-state">Signals need 4 sessions of the same exercise across at least 3 weeks. Nothing is guessed before then.</p>}</section>
    <Link to="/bodyweight" className="metric-link"><Scale size={19} /><span><strong>Body metrics</strong><small>Track weight alongside your performance.</small></span><ArrowUpRight size={18} /></Link>
    <Link to="/insights" className="metric-link insight-metric-link"><TrendingUp size={19} /><span><strong>AI insights</strong><small>Explore explainable signals from real training data.</small></span><ArrowUpRight size={18} /></Link></>}</div>;
}

function VolumeChart({ points }) {
  const maximum = Math.max(...points.map((point) => point.value), 0);
  if (!points.length || maximum <= 0) return <div className="volume-chart is-empty" aria-label="Training volume chart"><p className="quiet-state">No completed working sets in this range yet.</p></div>;
  const coords = points.map((point, index) => ({ x: ((index + 0.5) / points.length) * 100, y: 100 - (point.value / maximum) * 76 }));
  const line = coords.map((c) => `${c.x},${c.y}`).join(' ');
  return <div className="volume-chart" role="img" aria-label={`Training volume, ${points.length} points, peak ${Math.round(maximum).toLocaleString()} kg`}>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="volumeStroke" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#06c7d8" /><stop offset="1" stopColor="#007aff" /></linearGradient></defs><path className="volume-chart-area" d={`M ${coords[0].x},100 L ${line} L ${coords.at(-1).x},100 Z`} /><polyline className="volume-chart-line" points={line} /></svg>
    <div className="volume-bars">{points.map((point, index) => <div key={`${point.label}-${index}`} title={`${point.title}: ${Math.round(point.value).toLocaleString()} kg`}><div className="volume-plot" style={{ '--h': `${Math.max(point.value > 0 ? 3 : 0.5, (point.value / maximum) * 76)}%` }}><em>{point.value >= 1000 ? `${(point.value / 1000).toFixed(1)}k` : Math.round(point.value)}</em><span /></div><small>{point.label}</small></div>)}</div>
  </div>;
}
function ProgressSkeleton() { return <div className="progress-skeleton" aria-label="Loading progress"><div className="skeleton skeleton-stat" /><div className="skeleton skeleton-chart" /><div className="skeleton skeleton-list" /></div>; }
function ProgressEmpty() { return <div className="empty-state"><ExerciseVisual name="Progress" compact /><div><h3>Your progress will be real.</h3><p>Complete a workout with a logged set to unlock volume, personal bests, and trends.</p></div><Link to="/workout" className="secondary-action">Start training</Link></div>; }
function ProgressError({ message, onRetry }) { return <section className="quiet-panel"><h2>Progress needs attention.</h2><p>{message}</p><button className="secondary-action" type="button" onClick={onRetry}>Retry</button></section>; }
