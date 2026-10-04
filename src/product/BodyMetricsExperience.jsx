import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calculator, Save } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { calculateBodyMetrics, roundMetric } from '../lib/athleteMetrics';
import { localDayStart, profileAge, todayKey as today } from './analytics';
import './dataExperiences.css';

const numericInput = value => value === null || value === undefined ? '' : String(value);
const base = () => ({ logged_at: today(), weight_kg: '', waist_cm: '', neck_cm: '', chest_cm: '', hips_cm: '', height_cm: '', age: '', sex: 'unspecified', activity_level: 'moderate', training_goal: 'general_fitness' });

export default function BodyMetricsExperience() {
  const { user, profile, refreshProfile } = useAuth();
  const [logs, setLogs] = useState([]);
  const [form, setForm] = useState(base);
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    if (!user?.id) return;
    setState('loading'); setError('');
    const { data, error: loadError } = await supabase.from('body_metrics_logs').select('id,logged_at,weight_kg,waist_cm,neck_cm,chest_cm,hips_cm,notes').eq('user_id', user.id).order('logged_at', { ascending: false }).limit(120);
    if (loadError) { setState('error'); setError(loadError.message); return; }
    setLogs([...(data || [])].reverse()); setState('ready');
  }, [user]);
  useEffect(() => { queueMicrotask(load); }, [load]);
  // Seed the form once per profile id, and only while the user has not typed.
  // Profile refreshes (e.g. after saving) must never clobber in-progress edits.
  const seeded = useRef({ id: null, dirty: false });
  useEffect(() => {
    if (!profile?.id || (seeded.current.id === profile.id && seeded.current.dirty)) return;
    seeded.current.id = profile.id;
    const age = profileAge(profile);
    queueMicrotask(() => setForm(current => ({
      ...current,
      height_cm: numericInput(profile.height_cm),
      age: numericInput(age),
      sex: profile.sex || profile.gender || 'unspecified',
      activity_level: profile.activity_level || 'moderate',
      training_goal: profile.training_goal || 'general_fitness',
    })));
  }, [profile]);
  const metrics = useMemo(() => calculateBodyMetrics({ weightKg: form.weight_kg, heightCm: form.height_cm, age: form.age, sex: form.sex, waistCm: form.waist_cm, neckCm: form.neck_cm, hipsCm: form.hips_cm, activityLevel: form.activity_level, goal: form.training_goal }), [form]);
  const weighed = useMemo(() => logs.filter(entry => Number(entry.weight_kg) > 0), [logs]);
  const latest = weighed.at(-1)?.weight_kg;
  const prior = weighed.length > 1 ? weighed.at(-2)?.weight_kg : null;
  const chartBounds = useMemo(() => {
    const values = weighed.map(entry => Number(entry.weight_kg)).filter(Number.isFinite);
    const high = Math.max(...values, 1); const low = Math.min(...values, high);
    return { low, range: Math.max(1, high - low) };
  }, [weighed]);
  const update = (field, value) => { seeded.current.dirty = true; setForm(current => ({ ...current, [field]: value })); };
  const save = async event => {
    event.preventDefault(); if (saving) return;
    const field = (key, min, max, label) => {
      const raw = String(form[key] ?? '').trim();
      if (raw === '') return { value: undefined };
      const value = Number(raw);
      if (!Number.isFinite(value) || value < min || value > max) return { error: `${label} must be between ${min} and ${max}.` };
      return { value };
    };
    const checks = { weight_kg: field('weight_kg', 20, 500, 'Weight (kg)'), height_cm: field('height_cm', 80, 260, 'Height (cm)'), waist_cm: field('waist_cm', 20, 300, 'Waist (cm)'), neck_cm: field('neck_cm', 10, 100, 'Neck (cm)'), chest_cm: field('chest_cm', 30, 300, 'Chest (cm)'), hips_cm: field('hips_cm', 30, 300, 'Hips (cm)') };
    const ageRaw = String(form.age ?? '').trim();
    if (ageRaw !== '' && (!/^\d+$/.test(ageRaw) || Number(ageRaw) < 13 || Number(ageRaw) > 100)) { setError('Age must be a whole number between 13 and 100.'); return; }
    const failed = Object.values(checks).find(check => check.error);
    if (failed) { setError(failed.error); return; }
    const entered = Object.entries(checks).filter(([key, check]) => check.value !== undefined && ['weight_kg', 'waist_cm', 'neck_cm', 'chest_cm', 'hips_cm'].includes(key));
    if (!entered.length && checks.height_cm.value === undefined && ageRaw === '') { setError('Enter at least a weight, a measurement, or your height to save.'); return; }
    setSaving(true); setError('');
    // Only keys that are present are written (see save_athlete_metrics): a
    // weight-only entry never wipes height, age or measurements.
    const payload = { logged_at: form.logged_at || today(), sex: form.sex, activity_level: form.activity_level, training_goal: form.training_goal };
    for (const [key, check] of Object.entries(checks)) if (check.value !== undefined) payload[key] = check.value;
    if (ageRaw !== '') payload.age = Number(ageRaw);
    const targets = { target_calories: roundMetric(metrics.targetCalories), target_protein_g: roundMetric(metrics.proteinG), target_carbs_g: roundMetric(metrics.carbsG), target_fat_g: roundMetric(metrics.fatG), target_fiber_g: metrics.fiberG, target_water_ml: metrics.waterMl };
    for (const [key, value] of Object.entries(targets)) if (value !== null && value !== undefined) payload[key] = value;
    const { error: saveError } = await supabase.rpc('save_athlete_metrics', { p_payload: payload });
    setSaving(false);
    if (saveError) { setError(saveError.message || 'Body metrics could not be saved.'); return; }
    seeded.current.dirty = false;
    await Promise.all([load(), refreshProfile()]);
    setNotice('Saved. Estimates stay estimates; edit any input to recalculate.');
  };
  return <main className="experience metrics-experience">
    <section className="metrics-hero"><div><p className="eyebrow">Body metrics</p><h1>Know the inputs.<br />Use the estimates.</h1><p>Targets use established formulas and clearly stay estimates—not clinical measurements.</p></div><div className="metric-orb"><Calculator size={21} /></div></section>
    {state === 'loading' && <div className="history-skeleton"><span /><span /></div>}
    {state === 'error' && <section className="quiet-panel"><h2>Metrics need setup.</h2><p>{error}</p><button type="button" className="secondary-action" onClick={load}>Retry</button></section>}
    {state === 'ready' && <>
      <section className="weight-highlight"><span>Latest bodyweight</span><strong>{latest ? `${Number(latest).toFixed(1)} kg` : '—'}</strong><p>{latest && prior ? `${Number(latest) - Number(prior) >= 0 ? '+' : ''}${(Number(latest) - Number(prior)).toFixed(1)} kg since the prior entry` : 'Add measurements to establish your own baseline.'}</p><div className="weight-chart" aria-label="Bodyweight history">{weighed.length ? weighed.slice(-30).map(entry => <i key={entry.id} style={{ height: `${18 + ((Number(entry.weight_kg) - chartBounds.low) / chartBounds.range) * 72}%` }} title={`${entry.logged_at}: ${entry.weight_kg} kg`} />) : <span>No data yet</span>}</div></section>
      <form className="body-metrics-form" onSubmit={save}>
        <div className="section-heading"><div><p className="eyebrow">Calculator</p><h2>Your current inputs</h2></div></div>
        <div className="metrics-input-grid">{[['weight_kg', 'Weight kg', 'decimal'], ['height_cm', 'Height cm', 'decimal'], ['age', 'Age (whole years)', 'numeric'], ['waist_cm', 'Waist cm', 'decimal'], ['neck_cm', 'Neck cm', 'decimal'], ['chest_cm', 'Chest cm', 'decimal'], ['hips_cm', 'Hips cm', 'decimal']].map(([field, label, mode]) => <label key={field}>{label}<input inputMode={mode} value={form[field]} onChange={event => update(field, event.target.value)} placeholder="—" /></label>)}</div>
        <div className="metrics-select-grid"><label>Sex<select value={form.sex} onChange={event => update('sex', event.target.value)}><option value="unspecified">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option></select></label><label>Activity<select value={form.activity_level} onChange={event => update('activity_level', event.target.value)}><option value="sedentary">Sedentary</option><option value="light">Light</option><option value="moderate">Moderate</option><option value="very_active">Very active</option><option value="athlete">Athlete</option></select></label><label>Goal<select value={form.training_goal} onChange={event => update('training_goal', event.target.value)}><option value="general_fitness">General fitness</option><option value="strength">Strength</option><option value="hypertrophy">Hypertrophy</option><option value="fat_loss">Fat loss</option><option value="maintenance">Maintenance</option></select></label></div>
        {form.sex === 'unspecified' && <p className="metrics-hint">BMR, maintenance and calorie targets need sex because the Mifflin-St Jeor formula uses a different constant for each. Weight, BMI and protein targets still work without it.</p>}
        <input aria-label="Metric log date" type="date" max={today()} value={form.logged_at} onChange={event => { setNotice(''); update('logged_at', event.target.value); }} />
        <button className="primary-action" type="submit" disabled={saving}><Save size={16} />{saving ? 'Saving metrics…' : 'Save metrics and targets'}</button>
      </form>
      {error && <div className="inline-state is-error" role="alert">{error}</div>}{notice && !error && <div className="inline-state" role="status">{notice}</div>}
      <MetricsResults metrics={metrics} />
      <section className="metric-log"><div className="section-heading"><div><p className="eyebrow">Record</p><h2>Recent entries</h2></div></div>{logs.length ? [...logs].reverse().slice(0, 8).map(entry => <article key={entry.id}><span>{localDayStart(entry.logged_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><strong>{entry.weight_kg ? `${Number(entry.weight_kg).toFixed(1)} kg` : 'Measurements'}</strong><small>{entry.waist_cm ? `${entry.waist_cm} cm waist` : 'No circumference logged'}</small></article>) : <div className="empty-state"><p>Your private metrics history will appear here after the first save.</p></div>}</section>
    </>}
  </main>;
}

function MetricsResults({ metrics }) {
  const items = [['BMI', metrics.bmi, ''], ['BMR', metrics.bmr, ' kcal'], ['Maintenance', metrics.tdee, ' kcal'], ['Target calories', metrics.targetCalories, ' kcal'], ['Protein', metrics.proteinG, ' g'], ['Carbs', metrics.carbsG, ' g'], ['Fat', metrics.fatG, ' g'], ['Body fat', metrics.bodyFatPercentage, ' %'], ['Lean mass', metrics.leanMassKg, ' kg'], ['Fat mass', metrics.fatMassKg, ' kg']];
  return <section className="metrics-results"><div className="section-heading"><div><p className="eyebrow">Estimated outputs</p><h2>Use as a starting point.</h2></div></div><div>{items.map(([label, value, unit]) => <article key={label}><span>{label}</span><strong>{value === null ? '—' : `${roundMetric(value, label === 'BMI' || label === 'Body fat' ? 1 : 0)}${unit}`}</strong></article>)}</div>{[metrics.hints.bmi, metrics.hints.bmr, metrics.hints.bodyFat].filter(Boolean).map(hint => <p className="metrics-hint" key={hint}>{hint}</p>)}<p>{metrics.assumptions[0]} {metrics.assumptions.at(-1)}</p></section>;
}
