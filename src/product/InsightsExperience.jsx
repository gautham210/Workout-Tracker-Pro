import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, BrainCircuit, CalendarDays, Gauge, Sparkles, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import Counter from './react-bits/Counter';
import { computeStreak, getCompletedSessions, sessionVolume } from './trainingData';

const todayKey = () => new Date().toISOString().slice(0, 10);

function insightCards(sessions, meals, targets) {
  const cards = [];
  if (sessions.length) {
    const recent = sessions.slice(0, 7);
    const volume = recent.reduce((total, session) => total + sessionVolume(session), 0);
    const movementCount = new Set(recent.flatMap((session) => session.session_exercises || []).map((entry) => entry.exercises?.name).filter(Boolean)).size;
    cards.push(
      { icon: Gauge, label: 'Training load', title: `${Math.round(volume).toLocaleString()} kg in your recent sessions`, copy: 'Volume is calculated from completed set weight and reps—not a projected score.' },
      { icon: CalendarDays, label: 'Consistency', title: `${computeStreak(sessions)} day active streak`, copy: 'Your streak only reflects completed workouts in your authenticated history.' },
      { icon: TrendingUp, label: 'Movement variety', title: `${movementCount} movements in your recent training`, copy: 'Use this signal with your own goals; it is not a medical or recovery recommendation.' },
    );
  }
  const todayMeals = meals.filter(meal => String(meal.logged_at).slice(0, 10) === todayKey());
  const protein = todayMeals.reduce((total, meal) => total + (Number(meal.protein_g) || 0), 0);
  const targetProtein = Number(targets?.protein_g) || 0;
  if (todayMeals.length) cards.push({
    icon: Sparkles,
    label: 'Today’s nutrition',
    title: targetProtein ? `${Math.round(protein)} / ${Math.round(targetProtein)} g protein logged` : `${Math.round(protein)} g protein logged today`,
    copy: `Based on ${todayMeals.length} saved ${todayMeals.length === 1 ? 'meal' : 'meals'}; photo estimates remain editable ranges.`,
  });
  return cards;
}

export default function InsightsExperience() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [meals, setMeals] = useState([]);
  const [targets, setTargets] = useState(null);
  const [state, setState] = useState('loading');
  useEffect(() => {
    let live = true;
    if (!user?.id) return () => { live = false; };
    Promise.all([
      getCompletedSessions(user.id, 60),
      supabase.from('food_entries').select('logged_at,protein_g').eq('user_id', user.id).order('logged_at', { ascending: false }).limit(80),
      supabase.from('nutrition_targets').select('protein_g').eq('user_id', user.id).maybeSingle(),
    ]).then(([sessionRows, mealResponse, targetResponse]) => {
      if (!live) return;
      // Nutrition is an additive signal. A transient nutrition query must not hide
      // otherwise valid training insights behind a generic error state.
      setSessions(sessionRows);
      setMeals(mealResponse.error ? [] : mealResponse.data || []);
      setTargets(targetResponse.error ? null : targetResponse.data || null);
      setState('ready');
    }).catch(() => { if (live) setState('error'); });
    return () => { live = false; };
  }, [user?.id]);
  const cards = useMemo(() => insightCards(sessions, meals, targets), [meals, sessions, targets]);
  const total = useMemo(() => sessions.reduce((sum, session) => sum + sessionVolume(session), 0), [sessions]);
  return <main className="experience insights-experience">
    <section className="insights-hero"><div className="insight-orb"><BrainCircuit size={23} /></div><p className="eyebrow">AI insights</p><h1>See the signal.<br />Keep the context.</h1><p>This space makes your verified training data legible. Ask Coach when you want a real AI response, not a simulated one.</p></section>
    {state === 'loading' && <div className="insights-skeleton"><span /><span /><span /></div>}
    {state === 'error' && <div className="quiet-panel"><h2>Insights could not load.</h2><p>Your training data will stay private while you reconnect.</p></div>}
    {state === 'ready' && !sessions.length && !meals.length && <div className="empty-state"><Sparkles size={24} /><h2>Give your training a first signal.</h2><p>Complete one real workout or save a meal to unlock a data-based insight, then use Coach to explore it.</p><Link className="secondary-action" to="/workout">Build workout</Link></div>}
    {state === 'ready' && cards.length > 0 && <>{sessions.length > 0 && <section className="insight-metric"><span>Total recorded volume</span><strong><Counter value={Math.round(total)} fontSize={34} gap={0} horizontalPadding={0} gradientHeight={0} /><small> kg</small></strong><p>Across {sessions.length} completed sessions.</p></section>}<section className="insight-card-list">{cards.map(({ icon: Icon, label, title, copy }) => <article key={label}><div className="insight-card-icon"><Icon size={18} /></div><p className="eyebrow">{label}</p><h2>{title}</h2><span>{copy}</span></article>)}</section><Link className="insight-coach-bridge" to="/ai-coach"><span><p className="eyebrow">Make it personal</p><strong>Ask Coach to explain this in your training context.</strong></span><ArrowUpRight size={20} /></Link></>}
  </main>;
}
