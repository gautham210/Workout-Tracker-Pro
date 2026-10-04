import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, BrainCircuit, CalendarDays, Gauge, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import Counter from './react-bits/Counter';
import { computeStreak, exerciseSignals, localDayBounds, sessionVolume, streakOptionsFromProfile } from './analytics';
import { fetchAllSessions, fetchTrainingDays } from './analyticsData';
import './dataExperiences.css';

function insightCards(sessions, streak, meals, targets, signals, restNote) {
  const cards = [];
  if (sessions.length) {
    const recent = sessions.slice(0, 7);
    const volume = recent.reduce((total, session) => total + sessionVolume(session), 0);
    const movementCount = new Set(recent.flatMap((session) => session.session_exercises || []).map((entry) => entry.exercises?.name).filter(Boolean)).size;
    cards.push(
      { icon: Gauge, label: 'Training load', title: `${Math.round(volume).toLocaleString()} kg in your last ${recent.length} ${recent.length === 1 ? 'session' : 'sessions'}`, copy: 'Volume is completed, non-warm-up set weight x reps. It is not a projected score.' },
      { icon: CalendarDays, label: 'Consistency', title: `${streak} day active streak`, copy: restNote },
      { icon: TrendingUp, label: 'Movement variety', title: `${movementCount} movements in your recent training`, copy: 'Use this signal with your own goals; it is not a medical or recovery recommendation.' },
    );
    for (const signal of signals.slice(0, 3)) cards.push({ icon: signal.status === 'plateau' ? TrendingDown : TrendingUp, label: signal.status === 'plateau' ? 'Possible plateau' : 'Progressing', title: signal.name, copy: signal.status === 'plateau' ? `Estimated 1RM moved under 2% over your last 4 sessions (${Math.round(signal.from)} to ${Math.round(signal.to)} kg). Consider a change in load, reps or recovery.` : `Estimated 1RM is up ${(signal.change * 100).toFixed(1)}% across your last 4 sessions.` });
  }
  if (meals.length) {
    const protein = meals.reduce((total, meal) => total + (Number(meal.protein_g) || 0), 0);
    const targetProtein = Number(targets?.protein_g) || 0;
    cards.push({
      icon: Sparkles,
      label: 'Today’s nutrition',
      title: targetProtein ? `${Math.round(protein)} / ${Math.round(targetProtein)} g protein logged` : `${Math.round(protein)} g protein logged today`,
      copy: `Based on ${meals.length} saved ${meals.length === 1 ? 'meal' : 'meals'}; photo estimates remain editable ranges.`,
    });
  }
  return cards;
}

export default function InsightsExperience() {
  const { user, profile } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [dayRows, setDayRows] = useState([]);
  const [meals, setMeals] = useState([]);
  const [targets, setTargets] = useState(null);
  const [state, setState] = useState('loading');
  useEffect(() => {
    let live = true;
    if (!user?.id) return () => { live = false; };
    const bounds = localDayBounds();
    Promise.all([
      fetchAllSessions(user.id),
      fetchTrainingDays(user.id, 400),
      supabase.from('food_entries').select('logged_at,protein_g').eq('user_id', user.id).gte('logged_at', bounds.start).lt('logged_at', bounds.end).limit(100),
      supabase.from('nutrition_targets').select('protein_g').eq('user_id', user.id).maybeSingle(),
    ]).then(([sessionRows, days, mealResponse, targetResponse]) => {
      if (!live) return;
      // Nutrition is an additive signal. A transient nutrition query must not hide
      // otherwise valid training insights behind a generic error state.
      setSessions(sessionRows); setDayRows(days);
      setMeals(mealResponse.error ? [] : mealResponse.data || []);
      setTargets(targetResponse.error ? null : targetResponse.data || null);
      setState('ready');
    }).catch(() => { if (live) setState('error'); });
    return () => { live = false; };
  }, [user?.id]);
  const options = streakOptionsFromProfile(profile);
  const streak = useMemo(() => computeStreak(dayRows.length ? dayRows : sessions, { restDays: profile?.rest_days, includeRestDays: profile?.include_rest_days }), [dayRows, sessions, profile?.rest_days, profile?.include_rest_days]);
  const signals = useMemo(() => exerciseSignals(sessions).filter((signal) => signal.status !== 'insufficient'), [sessions]);
  const restNote = options.includeRestDays && options.restDays.length ? 'Counts consecutive training days; your planned rest days do not break it.' : 'Counts consecutive training days. Planned rest days can be set in Settings.';
  const cards = useMemo(() => insightCards(sessions, streak, meals, targets, signals, restNote), [meals, sessions, streak, targets, signals, restNote]);
  const total = useMemo(() => sessions.reduce((sum, session) => sum + sessionVolume(session), 0), [sessions]);
  return <main className="experience insights-experience">
    <section className="insights-hero"><div className="insight-orb"><BrainCircuit size={23} /></div><p className="eyebrow">AI insights</p><h1>See the signal.<br />Keep the context.</h1><p>This space makes your verified training data legible. Ask Coach when you want a real AI response, not a simulated one.</p></section>
    {state === 'loading' && <div className="insights-skeleton"><span /><span /><span /></div>}
    {state === 'error' && <div className="quiet-panel"><h2>Insights could not load.</h2><p>Your training data will stay private while you reconnect. Reload the page to try again.</p></div>}
    {state === 'ready' && !cards.length && <div className="empty-state"><Sparkles size={24} /><h2>Give your training a first signal.</h2><p>Complete one real workout or save a meal to unlock a data-based insight, then use Coach to explore it.</p><Link className="secondary-action" to="/workout">Build workout</Link></div>}
    {state === 'ready' && cards.length > 0 && <>{sessions.length > 0 && <section className="insight-metric"><span>Total recorded volume</span><strong><Counter value={Math.round(total)} fontSize={34} gap={0} horizontalPadding={0} gradientHeight={0} /><small> kg</small></strong><p>Across {sessions.length} completed {sessions.length === 1 ? 'session' : 'sessions'}, working sets only.</p></section>}<section className="insight-card-list">{cards.map(({ icon: Icon, label, title, copy }) => <article key={label}><div className="insight-card-icon"><Icon size={18} /></div><p className="eyebrow">{label}</p><h2>{title}</h2><span>{copy}</span></article>)}</section><Link className="insight-coach-bridge" to="/ai-coach"><span><p className="eyebrow">Make it personal</p><strong>Ask Coach to explain this in your training context.</strong></span><ArrowUpRight size={20} /></Link></>}
  </main>;
}
