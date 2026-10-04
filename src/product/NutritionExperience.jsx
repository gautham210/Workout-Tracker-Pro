import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Apple, Camera, ChevronRight, ClipboardList, ImagePlus, Loader2, RotateCcw, Save, ScanLine, TriangleAlert, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import DomainLinks from './DomainLinks';
import { addLocalDays, groupMealsByDay, localDayKey, localDayStart, sumMeals, todayKey } from './analytics';
import { MAX_SOURCE_BYTES, RETRYABLE, capAnalysis, cappedAssumptions, prepareMealImage, rangeMidpoint, scanErrorCode, scanErrorMessage } from './foodScan';
import './dataExperiences.css';

const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const defaultEntry = { name: '', meal_type: 'snack', calories: '', protein_g: '', carbs_g: '', fat_g: '', fiber_g: '' };
const WINDOW_DAYS = 14;
const targetColumns = 'calories,protein_g,carbs_g,fat_g,fiber_g,water_ml,source';

// Posts to /api/parse-food directly so the stable error `code` survives.
async function requestFoodScan(imageUri) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw Object.assign(new Error(scanErrorMessage('unauthorized')), { code: 'unauthorized' });
  let response;
  try {
    response = await fetch('/api/parse-food', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ imageUri }) });
  } catch { throw Object.assign(new Error(scanErrorMessage('offline')), { code: 'offline' }); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const code = scanErrorCode(response.status, body); throw Object.assign(new Error(scanErrorMessage(code, typeof body.error === 'string' ? body.error : '')), { code }); }
  return body;
}

export default function NutritionExperience() {
  const { user } = useAuth();
  const userId = user?.id;
  const fileInput = useRef(null);
  const [entries, setEntries] = useState([]);
  const [targets, setTargets] = useState(null);
  const [days, setDays] = useState(WINDOW_DAYS);
  const [hasOlder, setHasOlder] = useState(false);
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [image, setImage] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [result, setResult] = useState(null);
  const [entry, setEntry] = useState(defaultEntry);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (windowDays = days) => {
    if (!userId) return;
    setError('');
    const since = addLocalDays(localDayStart(new Date()), -(windowDays - 1)).toISOString();
    const [entryResponse, targetResponse, olderResponse] = await Promise.all([
      supabase.from('food_entries').select('id,logged_at,meal_type,name,calories,protein_g,carbs_g,fat_g,fiber_g,source,confidence,assumptions').eq('user_id', userId).gte('logged_at', since).order('logged_at', { ascending: false }).limit(1000),
      supabase.from('nutrition_targets').select(targetColumns).eq('user_id', userId).maybeSingle(),
      supabase.from('food_entries').select('id', { count: 'exact', head: true }).eq('user_id', userId).lt('logged_at', since),
    ]);
    if (entryResponse.error || targetResponse.error) { setError(entryResponse.error?.message || targetResponse.error?.message || 'Nutrition records could not load.'); setState('error'); return; }
    setEntries(entryResponse.data || []); setTargets(targetResponse.data || null); setHasOlder((olderResponse.count || 0) > 0); setState('ready');
  }, [userId, days]);
  useEffect(() => { queueMicrotask(() => load(days)); }, [load, days]);

  const groups = useMemo(() => groupMealsByDay(entries), [entries]);
  const today = todayKey();
  const todayEntries = useMemo(() => entries.filter(item => localDayKey(item.logged_at) === today), [entries, today]);
  const totals = useMemo(() => sumMeals(todayEntries), [todayEntries]);

  const choose = async file => {
    if (!file) return;
    setError(''); setScanError(null); setResult(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setScanError({ code: 'invalid_format', message: scanErrorMessage('invalid_format') }); return; }
    if (file.size > MAX_SOURCE_BYTES) { setScanError({ code: 'image_too_large', message: scanErrorMessage('image_too_large') }); return; }
    setPreparing(true);
    try { const prepared = await prepareMealImage(file); setImage(prepared.dataUri); }
    catch (cause) { const code = cause?.code === 'image_too_large' ? 'image_too_large' : 'image_corrupt'; setScanError({ code, message: scanErrorMessage(code) }); }
    finally { setPreparing(false); }
  };
  const clearImage = () => { setImage(null); setResult(null); setScanError(null); };
  const scan = async () => {
    if (!image || scanning) return;
    setScanning(true); setScanError(null); setResult(null);
    try {
      const response = await requestFoodScan(image);
      const macros = response?.macros;
      if (!macros) throw Object.assign(new Error(scanErrorMessage('provider_malformed')), { code: 'provider_malformed' });
      setResult({ macros, lowConfidence: Boolean(response.lowConfidence) || macros.confidence === 'Low' });
      setEntry({ name: (macros.detectedFoods || []).join(', ').slice(0, 200) || 'Scanned meal', meal_type: 'snack', calories: String(rangeMidpoint(macros.caloriesRange)), protein_g: String(rangeMidpoint(macros.proteinRange)), carbs_g: String(rangeMidpoint(macros.carbsRange)), fat_g: String(rangeMidpoint(macros.fatRange)), fiber_g: macros.fiberRange ? String(rangeMidpoint(macros.fiberRange)) : '' });
    } catch (cause) { setScanError({ code: cause?.code || 'provider_error', message: cause?.message || scanErrorMessage('provider_error') }); }
    finally { setScanning(false); }
  };
  const saveEntry = async event => {
    event?.preventDefault();
    if (!user?.id || saving) return;
    const calories = numeric(entry.calories); const protein = numeric(entry.protein_g); const carbs = numeric(entry.carbs_g); const fat = numeric(entry.fat_g); const fiber = String(entry.fiber_g).trim() === '' ? null : numeric(entry.fiber_g);
    if (!entry.name.trim() || calories < 0 || calories > 10000 || protein < 0 || protein > 1000 || carbs < 0 || carbs > 2000 || fat < 0 || fat > 1000 || (fiber !== null && (fiber < 0 || fiber > 200))) { setError('Enter a meal name and realistic, non-negative macro values.'); return; }
    setSaving(true); setError('');
    const analysis = result ? capAnalysis(result.macros) : null;
    const record = { user_id: user.id, logged_at: new Date().toISOString(), meal_type: entry.meal_type, name: entry.name.trim().slice(0, 200), calories, protein_g: protein, carbs_g: carbs, fat_g: fat, fiber_g: fiber, source: analysis ? 'scan' : 'manual', confidence: analysis?.confidence || null, assumptions: analysis ? cappedAssumptions(analysis.assumptions) : [], analysis };
    const { error: saveError } = await supabase.from('food_entries').insert(record);
    setSaving(false);
    if (saveError) { setError(saveError.message || 'The meal could not be saved.'); return; }
    setEntry(defaultEntry); setResult(null); setImage(null); setScanError(null); await load();
  };
  const remove = async id => { const { error: removeError } = await supabase.from('food_entries').delete().eq('id', id).eq('user_id', user.id); if (removeError) { setError(removeError.message); return; } await load(); };
  const retryable = scanError && RETRYABLE.has(scanError.code) && image;

  return <main className="experience nutrition-experience"><section className="nutrition-hero"><p className="eyebrow">Nutrition</p><h1>Fuel the work.<br />Keep the nuance.</h1><p>Meals are private account records. Photo results are editable estimates, never measurements.</p></section><DomainLinks label="Nutrition" title="Keep meals in context" items={[{ onSelect: () => fileInput.current?.click(), icon: Camera, title: 'Food scanner', copy: 'Analyze a meal photo' }, { to: '/nutritionist', icon: Apple, title: 'Nutritionist', copy: 'Ask real AI guidance' }, { href: '#meal-log', icon: ClipboardList, title: 'Meal history', copy: `${entries.length} meals in the last ${days} days` }]} />{state === 'loading' && <NutritionSkeleton />}{state === 'error' && <section className="quiet-panel"><h2>Nutrition storage needs attention.</h2><p>{error}</p><button className="secondary-action" type="button" onClick={() => { setState('loading'); load(); }}>Retry</button></section>}{state === 'ready' && <>
    <section className="nutrition-summary"><div><p className="eyebrow">Today</p>{todayEntries.length ? <><strong>{Math.round(totals.calories)}<small> kcal</small></strong><span>{targets?.calories > 0 ? `${Math.max(0, Math.round(Number(targets.calories) - totals.calories))} kcal remaining` : 'Set a target in Body metrics'}</span></> : <><strong className="is-empty">No meals logged today</strong><span>{targets?.calories > 0 ? `Target ${Math.round(targets.calories)} kcal` : 'Set a target in Body metrics'}</span></>}</div><MacroRing label="Protein" value={totals.protein_g} target={targets?.protein_g} /><MacroRing label="Carbs" value={totals.carbs_g} target={targets?.carbs_g} /><MacroRing label="Fat" value={totals.fat_g} target={targets?.fat_g} /></section>
    <section className={`scanner-stage ${image ? 'has-image' : ''} ${scanning ? 'is-scanning' : ''}`}><div className="scanner-lens">{image ? <img src={image} alt="Selected meal for nutrition analysis" /> : <div className="scanner-empty"><span className="scanner-reticle"><ScanLine size={33} /></span><h2>Point. Scan. Understand.</h2><p>{preparing ? 'Preparing photo…' : 'Select a food photo for an authenticated visual estimate.'}</p></div>}<span className="scan-corner top-left" /><span className="scan-corner top-right" /><span className="scan-corner bottom-left" /><span className="scan-corner bottom-right" />{scanning && <><span className="scan-beam" /><div className="scan-processing"><Loader2 className="animate-spin" size={16} /> Reading the plate…</div></>}</div>{image && <button type="button" className="scan-remove" onClick={clearImage} aria-label="Remove selected meal photo"><X size={18} /></button>}</section>
    <div className="scan-actions"><button type="button" className="secondary-action" onClick={() => fileInput.current?.click()} disabled={preparing}><ImagePlus size={17} /> {image ? 'Choose another photo' : 'Choose meal photo'}</button><button type="button" className="primary-action" disabled={!image || scanning || preparing} onClick={scan}>{scanning ? <><Loader2 className="animate-spin" size={17} /> Analyzing…</> : <><Camera size={17} /> Scan meal</>}</button></div>
    <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => { choose(event.target.files?.[0]); event.target.value = ''; }} />
    {scanError && <div className="inline-state is-error scan-error" role="alert"><span>{scanError.message}</span>{retryable && <button type="button" className="text-action" onClick={scan} disabled={scanning}><RotateCcw size={14} /> Try again</button>}</div>}
    {result && <FoodEstimate analysis={result.macros} lowConfidence={result.lowConfidence} />}
    {error && <div className="inline-state is-error" role="alert">{error}</div>}
    <MealEditor entry={entry} setEntry={setEntry} analysis={result?.macros} saving={saving} onSave={saveEntry} />
    <section id="meal-log" className="meal-journal"><div className="section-heading"><div><p className="eyebrow">Meal history</p><h2>Your logged meals</h2></div><Link to="/nutritionist">Ask Nutritionist <ChevronRight size={14} /></Link></div>
      {groups.length ? groups.map(group => <div className="journal-day" key={group.day}><header><strong>{group.day === today ? 'Today' : localDayStart(group.day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</strong><DayTotals totals={group.totals} targets={targets} /></header>{group.meals.map(item => <article key={item.id}><span>{item.meal_type}</span><div><strong>{item.name}</strong><small>{new Date(item.logged_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · {Math.round(item.calories)} kcal · P {Math.round(item.protein_g)}g · C {Math.round(item.carbs_g)}g · F {Math.round(item.fat_g)}g{item.source === 'scan' ? ` · scan estimate${item.confidence ? ` (${item.confidence.toLowerCase()} confidence)` : ''}` : ''}</small></div><button type="button" onClick={() => remove(item.id)} aria-label={`Delete ${item.name}`}><X size={15} /></button></article>)}</div>) : <p className="quiet-state">No meals in the last {days} days. Log a meal or save a food scan to begin your private nutrition history.</p>}
      {hasOlder && <button type="button" className="secondary-action journal-more" onClick={() => setDays(current => current + WINDOW_DAYS)}>Show earlier days</button>}</section></>}</main>;
}

function DayTotals({ totals, targets }) {
  const cell = (label, value, target, unit) => <span key={label}>{label} {Math.round(value)}{target > 0 ? `/${Math.round(target)}` : ''}{unit}</span>;
  return <small className="day-totals">{cell('kcal', totals.calories, targets?.calories, '')}{cell('P', totals.protein_g, targets?.protein_g, 'g')}{cell('C', totals.carbs_g, targets?.carbs_g, 'g')}{cell('F', totals.fat_g, targets?.fat_g, 'g')}{(totals.fiber_g > 0 || targets?.fiber_g > 0) && cell('Fiber', totals.fiber_g, targets?.fiber_g, 'g')}</small>;
}
function MacroRing({ label, value, target }) { const percent = target ? Math.min(100, Math.round((value / Number(target)) * 100)) : 0; return <div className="nutrition-macro"><span style={{ '--macro-progress': `${percent}%` }}><i>{Math.round(value)}g</i></span><strong>{label}</strong><small>{target ? `${Math.max(0, Number(target) - value).toFixed(0)}g left` : 'No target'}</small></div>; }
function FoodEstimate({ analysis, lowConfidence }) { return <section className="food-result"><div className="food-result-head"><div><p className="eyebrow">Visual estimate</p><h2>{analysis.detectedFoods?.join(', ') || 'Meal analysis'}</h2></div><span className={`confidence ${String(analysis.confidence || '').toLowerCase()}`}>{analysis.confidence || 'Unknown'} confidence</span></div>{lowConfidence && <div className="low-confidence" role="alert"><TriangleAlert size={16} /><span>Low confidence: this photo was hard to read. Treat the ranges as a rough guess and correct every value before saving.</span></div>}{analysis.items?.length ? <div className="food-item-breakdown" aria-label="Estimated food portions">{analysis.items.map((item, index) => <article key={`${item.name}-${index}`}><div><strong>{item.name}</strong><small>Estimated {item.estimatedPortion}</small></div><span>~{item.caloriesRange} kcal</span></article>)}</div> : null}<div className="macro-grid">{[['Calories', analysis.caloriesRange, 'kcal'], ['Protein', analysis.proteinRange, 'g'], ['Carbs', analysis.carbsRange, 'g'], ['Fat', analysis.fatRange, 'g']].map(([label, value, unit]) => <div key={label}><span>{label} (estimate)</span><strong>{value}<small> {unit}</small></strong></div>)}</div>{analysis.assumptions?.length ? <div className="assumptions"><strong>Assumptions</strong><p>{analysis.assumptions.join(' · ')}</p></div> : null}{analysis.followUpQuestion && <div className="follow-up"><ScanLine size={16} /><span>{analysis.followUpQuestion}</span></div>}<p className="scanner-disclosure">These are estimated ranges, not measurements. The form below is prefilled with each range&apos;s midpoint. Nothing counts toward today&apos;s totals until you save it, and the photo itself is never stored.</p></section>; }
function MealEditor({ entry, setEntry, analysis, saving, onSave }) { const update = (field, value) => setEntry(current => ({ ...current, [field]: value })); return <form className="meal-editor" onSubmit={onSave}><div className="section-heading"><div><p className="eyebrow">{analysis ? 'Review before saving' : 'Manual meal'}</p><h2>{analysis ? 'Make the estimate yours.' : 'Log what you ate.'}</h2></div></div><div className="meal-editor-top"><label>Meal name<input required maxLength={200} value={entry.name} onChange={event => update('name', event.target.value)} placeholder="e.g. Greek yogurt bowl" /></label><label>Meal type<select value={entry.meal_type} onChange={event => update('meal_type', event.target.value)}>{mealTypes.map(value => <option value={value} key={value}>{value}</option>)}</select></label></div><div className="meal-macro-inputs">{[['calories', 'Calories'], ['protein_g', 'Protein g'], ['carbs_g', 'Carbs g'], ['fat_g', 'Fat g'], ['fiber_g', 'Fiber g (optional)']].map(([field, label]) => <label key={field}>{label}<input inputMode="decimal" value={entry[field]} onChange={event => update(field, event.target.value)} placeholder={field === 'fiber_g' ? '—' : '0'} /></label>)}</div><div className="meal-save-bar"><button className="primary-action" type="submit" disabled={saving}><Save size={16} />{saving ? 'Saving meal…' : analysis ? 'Save corrected meal' : 'Save meal'}</button></div></form>; }
function NutritionSkeleton() { return <div className="skeleton-stack" aria-label="Loading nutrition records"><div className="skeleton hero" /><div className="skeleton short" /><div className="skeleton row" /></div>; }
