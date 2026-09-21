import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calculator, Save } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { calculateBodyMetrics, roundMetric } from '../lib/athleteMetrics';

const today = () => new Date().toISOString().slice(0, 10);
const numericInput = value => value === null || value === undefined ? '' : String(value);
const base = { logged_at: today(), weight_kg: '', waist_cm: '', neck_cm: '', chest_cm: '', hips_cm: '', height_cm: '', age: '', sex: 'unspecified', activity_level: 'moderate', training_goal: 'general_fitness' };

export default function BodyMetricsExperience() {
  const { user, profile, refreshProfile } = useAuth();
  const [logs, setLogs] = useState([]);
  const [form, setForm] = useState(base);
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    if (!user?.id) return;
    setState('loading'); setError('');
    const { data, error: loadError } = await supabase.from('body_metrics_logs').select('id,logged_at,weight_kg,waist_cm,neck_cm,chest_cm,hips_cm,notes').eq('user_id', user.id).order('logged_at', { ascending: true }).limit(120);
    if (loadError) { setState('error'); setError(loadError.message); return; }
    setLogs(data || []); setState('ready');
  }, [user]);
  useEffect(() => { queueMicrotask(load); }, [load]);
  useEffect(() => {
    if (!profile) return;
    queueMicrotask(() => setForm(current => ({
      ...current,
      height_cm: numericInput(profile.height_cm),
      age: numericInput(profile.age || (profile.birth_year ? new Date().getFullYear() - Number(profile.birth_year) : '')),
      sex: profile.sex || profile.gender || 'unspecified',
      activity_level: profile.activity_level || 'moderate',
      training_goal: profile.training_goal || 'general_fitness',
    })));
  }, [profile]);
  const metrics = useMemo(() => calculateBodyMetrics({ weightKg: form.weight_kg, heightCm: form.height_cm, age: form.age, sex: form.sex, waistCm: form.waist_cm, neckCm: form.neck_cm, hipsCm: form.hips_cm, activityLevel: form.activity_level, goal: form.training_goal }), [form]);
  const latest = logs.at(-1)?.weight_kg;
  const prior = logs.length > 1 ? logs.at(-2)?.weight_kg : null;
  const chartBounds = useMemo(() => {
    const values = logs.map(entry => Number(entry.weight_kg)).filter(Number.isFinite);
    const high = Math.max(...values, 1); const low = Math.min(...values, high);
    return { low, range: Math.max(1, high - low) };
  }, [logs]);
  const update = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const save = async event => {
    event.preventDefault(); if (saving) return;
    const weight = form.weight_kg === '' ? null : Number(form.weight_kg);
    if (weight !== null && (!Number.isFinite(weight) || weight <= 0 || weight > 500)) { setError('Enter bodyweight between 0 and 500 kg.'); return; }
    const height = Number(form.height_cm);
    if (!Number.isFinite(height) || height < 80 || height > 260) { setError('Height is required to calculate a usable body-metrics estimate.'); return; }
    setSaving(true); setError('');
    const payload = { ...form, target_calories: roundMetric(metrics.targetCalories), target_protein_g: roundMetric(metrics.proteinG), target_carbs_g: roundMetric(metrics.carbsG), target_fat_g: roundMetric(metrics.fatG), target_fiber_g: metrics.targetCalories ? Math.round(Math.max(25, metrics.targetCalories / 1000 * 14)) : null, target_water_ml: weight ? Math.round(weight * 35) : null };
    const { error: saveError } = await supabase.rpc('save_athlete_metrics', { p_payload: payload });
    setSaving(false);
    if (saveError) { setError(saveError.message || 'Body metrics could not be saved.'); return; }
    await Promise.all([load(), refreshProfile()]);
  };
  return <main className="experience metrics-experience">
    <section className="metrics-hero"><div><p className="eyebrow">Body metrics</p><h1>Know the inputs.<br />Use the estimates.</h1><p>Targets use established formulas and clearly stay estimates—not clinical measurements.</p></div><div className="metric-orb"><Calculator size={21} /></div></section>
    {state === 'loading' && <div className="history-skeleton"><span /><span /></div>}
    {state === 'error' && <section className="quiet-panel"><h2>Metrics need setup.</h2><p>{error}</p><button type="button" className="secondary-action" onClick={load}>Retry</button></section>}
    {state === 'ready' && <>
      <section className="weight-highlight"><span>Latest bodyweight</span><strong>{latest ? `${Number(latest).toFixed(1)} kg` : '—'}</strong><p>{latest && prior ? `${Number(latest) - Number(prior) >= 0 ? '+' : ''}${(Number(latest) - Number(prior)).toFixed(1)} kg since the prior entry` : 'Add measurements to establish your own baseline.'}</p><div className="weight-chart" aria-label="Bodyweight history">{logs.length ? logs.slice(-30).map(entry => <i key={entry.id} style={{ height: `${18 + ((Number(entry.weight_kg) - chartBounds.low) / chartBounds.range) * 72}%` }} title={`${entry.logged_at}: ${entry.weight_kg} kg`} />) : <span>No data yet</span>}</div></section>
      <form className="body-metrics-form" onSubmit={save}>
        <div className="section-heading"><div><p className="eyebrow">Calculator</p><h2>Your current inputs</h2></div></div>
        <div className="metrics-input-grid">{[['weight_kg', 'Weight kg'], ['height_cm', 'Height cm'], ['age', 'Age'], ['waist_cm', 'Waist cm'], ['neck_cm', 'Neck cm'], ['chest_cm', 'Chest cm'], ['hips_cm', 'Hips cm']].map(([field, label]) => <label key={field}>{label}<input inputMode="decimal" value={form[field]} onChange={event => update(field, event.target.value)} placeholder="—" /></label>)}</div>
        <div className="metrics-select-grid"><label>Sex<select value={form.sex} onChange={event => update('sex', event.target.value)}><option value="unspecified">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option></select></label><label>Activity<select value={form.activity_level} onChange={event => update('activity_level', event.target.value)}><option value="sedentary">Sedentary</option><option value="light">Light</option><option value="moderate">Moderate</option><option value="very_active">Very active</option><option value="athlete">Athlete</option></select></label><label>Goal<select value={form.training_goal} onChange={event => update('training_goal', event.target.value)}><option value="general_fitness">General fitness</option><option value="strength">Strength</option><option value="hypertrophy">Hypertrophy</option><option value="fat_loss">Fat loss</option><option value="maintenance">Maintenance</option></select></label></div>
        <input aria-label="Metric log date" type="date" max={today()} value={form.logged_at} onChange={event => update('logged_at', event.target.value)} />
        <button className="primary-action" type="submit" disabled={saving}><Save size={16} />{saving ? 'Saving metrics…' : 'Save metrics and targets'}</button>
      </form>
      <MetricsResults metrics={metrics} />
      <section className="metric-log"><div className="section-heading"><div><p className="eyebrow">Record</p><h2>Recent entries</h2></div></div>{logs.length ? [...logs].reverse().slice(0, 8).map(entry => <article key={entry.id}><span>{new Date(entry.logged_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><strong>{entry.weight_kg ? `${Number(entry.weight_kg).toFixed(1)} kg` : 'Measurements'}</strong><small>{entry.waist_cm ? `${entry.waist_cm} cm waist` : 'No circumference logged'}</small></article>) : <div className="empty-state"><p>Your private metrics history will appear here after the first save.</p></div>}</section>
    </>}
  </main>;
}

function MetricsResults({ metrics }) {
  const items = [['BMI', metrics.bmi, ''], ['BMR', metrics.bmr, ' kcal'], ['Maintenance', metrics.tdee, ' kcal'], ['Target calories', metrics.targetCalories, ' kcal'], ['Protein', metrics.proteinG, ' g'], ['Carbs', metrics.carbsG, ' g'], ['Fat', metrics.fatG, ' g'], ['Body fat', metrics.bodyFatPercentage, ' %'], ['Lean mass', metrics.leanMassKg, ' kg'], ['Fat mass', metrics.fatMassKg, ' kg']];
  return <section className="metrics-results"><div className="section-heading"><div><p className="eyebrow">Estimated outputs</p><h2>Use as a starting point.</h2></div></div><div>{items.map(([label, value, unit]) => <article key={label}><span>{label}</span><strong>{value === null ? '—' : `${roundMetric(value, label === 'BMI' || label === 'Body fat' ? 1 : 0)}${unit}`}</strong></article>)}</div><p>{metrics.assumptions[0]} {metrics.assumptions.at(-1)}</p></section>;
}
