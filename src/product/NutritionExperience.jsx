import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Apple, Camera, ChevronRight, ClipboardList, ImagePlus, Loader2, Save, ScanLine, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authenticatedApiPost } from '../lib/api';
import { supabase } from '../lib/supabase';
import DomainLinks from './DomainLinks';

const meals = ['breakfast', 'lunch', 'dinner', 'snack'];
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const rangeMidpoint = value => { const match = String(value || '').match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/); return match ? Math.round((Number(match[1]) + Number(match[2])) / 2) : 0; };
const todayKey = () => new Date().toISOString().slice(0, 10);
const defaultEntry = { name: '', meal_type: 'snack', calories: '', protein_g: '', carbs_g: '', fat_g: '', fiber_g: '' };

export default function NutritionExperience() {
  const { user } = useAuth();
  const fileInput = useRef(null);
  const [entries, setEntries] = useState([]);
  const [targets, setTargets] = useState(null);
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [image, setImage] = useState(null);
  const [imageUri, setImageUri] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [entry, setEntry] = useState(defaultEntry);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    if (!user?.id) return;
    setState('loading'); setError('');
    const [entryResponse, targetResponse] = await Promise.all([
      supabase.from('food_entries').select('id,logged_at,meal_type,name,calories,protein_g,carbs_g,fat_g,fiber_g,source,confidence,assumptions').eq('user_id', user.id).order('logged_at', { ascending: false }).limit(80),
      supabase.from('nutrition_targets').select('calories,protein_g,carbs_g,fat_g,fiber_g,water_ml,source').eq('user_id', user.id).maybeSingle(),
    ]);
    if (entryResponse.error || targetResponse.error) { setError(entryResponse.error?.message || targetResponse.error?.message || 'Nutrition records could not load.'); setState('error'); return; }
    setEntries(entryResponse.data || []); setTargets(targetResponse.data || null); setState('ready');
  }, [user]);
  useEffect(() => { queueMicrotask(load); }, [load]); // auth identity is the complete query scope
  const todayEntries = useMemo(() => entries.filter(item => String(item.logged_at).slice(0, 10) === todayKey()), [entries]);
  const totals = useMemo(() => todayEntries.reduce((sum, item) => ({ calories: sum.calories + numeric(item.calories), protein_g: sum.protein_g + numeric(item.protein_g), carbs_g: sum.carbs_g + numeric(item.carbs_g), fat_g: sum.fat_g + numeric(item.fat_g) }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }), [todayEntries]);
  const choose = async file => {
    if (!file) return;
    setError(''); setAnalysis(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Choose a JPEG, PNG, or WebP image.'); return; }
    if (file.size > 3_500_000) { setError('Choose an image smaller than 3.5 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => { setImage(String(reader.result)); setImageUri(String(reader.result)); };
    reader.onerror = () => setError('That image could not be read.');
    reader.readAsDataURL(file);
  };
  const scan = async () => {
    if (!imageUri || scanning) return;
    setScanning(true); setError(''); setAnalysis(null);
    try {
      const result = await authenticatedApiPost('/api/parse-food', { imageUri });
      const macros = result?.macros;
      if (!macros) throw new Error('The scanner returned an unreadable estimate.');
      setAnalysis(macros);
      setEntry({ name: macros.detectedFoods?.join(', ') || 'Food analysis', meal_type: 'snack', calories: String(rangeMidpoint(macros.caloriesRange)), protein_g: String(rangeMidpoint(macros.proteinRange)), carbs_g: String(rangeMidpoint(macros.carbsRange)), fat_g: String(rangeMidpoint(macros.fatRange)), fiber_g: '' });
    } catch (cause) { setError(cause?.message || 'This meal could not be analyzed.'); }
    finally { setScanning(false); }
  };
  const saveEntry = async event => {
    event?.preventDefault();
    if (!user?.id || saving) return;
    const calories = numeric(entry.calories); const protein = numeric(entry.protein_g); const carbs = numeric(entry.carbs_g); const fat = numeric(entry.fat_g); const fiber = entry.fiber_g === '' ? null : numeric(entry.fiber_g);
    if (!entry.name.trim() || calories < 0 || calories > 10000 || protein < 0 || carbs < 0 || fat < 0 || (fiber !== null && fiber < 0)) { setError('Enter a meal name and realistic, non-negative macro values.'); return; }
    setSaving(true); setError('');
    const record = { user_id: user.id, logged_at: new Date().toISOString(), meal_type: entry.meal_type, name: entry.name.trim(), calories, protein_g: protein, carbs_g: carbs, fat_g: fat, fiber_g: fiber, source: analysis ? 'scan' : 'manual', confidence: analysis?.confidence || null, assumptions: analysis?.assumptions || [], analysis: analysis || null };
    const { error: saveError } = await supabase.from('food_entries').insert(record);
    setSaving(false);
    if (saveError) { setError(saveError.message || 'The meal could not be saved.'); return; }
    setEntry(defaultEntry); setAnalysis(null); setImage(null); setImageUri(null); await load();
  };
  const remove = async id => { const { error: removeError } = await supabase.from('food_entries').delete().eq('id', id).eq('user_id', user.id); if (removeError) { setError(removeError.message); return; } await load(); };
  return <main className="experience nutrition-experience"><section className="nutrition-hero"><p className="eyebrow">Nutrition</p><h1>Fuel the work.<br />Keep the nuance.</h1><p>Meals are private account records. Photo results are editable estimates, never measurements.</p></section><DomainLinks label="Nutrition" title="Keep meals in context" items={[{ onSelect: () => fileInput.current?.click(), icon: Camera, title: 'Food scanner', copy: 'Analyze a meal photo' }, { to: '/nutritionist', icon: Apple, title: 'Nutritionist', copy: 'Ask real AI guidance' }, { href: '#meal-log', icon: ClipboardList, title: 'Meal history', copy: `${entries.length} logged meals` }]} />{state === 'loading' && <NutritionSkeleton />}{state === 'error' && <section className="quiet-panel"><h2>Nutrition storage needs attention.</h2><p>{error}</p><button className="secondary-action" type="button" onClick={load}>Retry</button></section>}{state === 'ready' && <><section className="nutrition-summary"><div><p className="eyebrow">Today</p><strong>{Math.round(totals.calories)}<small> kcal</small></strong><span>{targets?.calories ? `${Math.max(0, Number(targets.calories) - totals.calories).toFixed(0)} kcal remaining` : 'Set a target in Body metrics'}</span></div><MacroRing label="Protein" value={totals.protein_g} target={targets?.protein_g} /><MacroRing label="Carbs" value={totals.carbs_g} target={targets?.carbs_g} /><MacroRing label="Fat" value={totals.fat_g} target={targets?.fat_g} /></section><section className={`scanner-stage ${image ? 'has-image' : ''} ${scanning ? 'is-scanning' : ''}`}><div className="scanner-lens">{image ? <img src={image} alt="Selected meal for nutrition analysis" /> : <div className="scanner-empty"><span className="scanner-reticle"><ScanLine size={33} /></span><h2>Point. Scan. Understand.</h2><p>Select a food photo for an authenticated visual estimate.</p></div>}<span className="scan-corner top-left" /><span className="scan-corner top-right" /><span className="scan-corner bottom-left" /><span className="scan-corner bottom-right" />{scanning && <><span className="scan-beam" /><div className="scan-processing"><Loader2 className="animate-spin" size={16} /> Reading the plate…</div></>}</div>{image && <button type="button" className="scan-remove" onClick={() => { setImage(null); setImageUri(null); setAnalysis(null); }} aria-label="Remove selected meal photo"><X size={18} /></button>}</section><div className="scan-actions"><button type="button" className="secondary-action" onClick={() => fileInput.current?.click()}><ImagePlus size={17} /> {image ? 'Choose another photo' : 'Choose meal photo'}</button><button type="button" className="primary-action" disabled={!image || scanning} onClick={scan}>{scanning ? <><Loader2 className="animate-spin" size={17} /> Analyzing…</> : <><Camera size={17} /> Scan meal</>}</button></div><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => choose(event.target.files?.[0])} />{analysis && <FoodEstimate analysis={analysis} />}{error && <div className="inline-state is-error">{error}</div>}<MealEditor entry={entry} setEntry={setEntry} analysis={analysis} saving={saving} onSave={saveEntry} /><section id="meal-log" className="meal-journal"><div className="section-heading"><div><p className="eyebrow">Meal history</p><h2>Your logged meals</h2></div><Link to="/nutritionist">Ask Nutritionist <ChevronRight size={14} /></Link></div>{entries.length ? entries.map(item => <article key={item.id}><span>{item.meal_type}</span><div><strong>{item.name}</strong><small>{new Date(item.logged_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {Math.round(item.calories)} kcal · P {Math.round(item.protein_g)}g</small></div><button type="button" onClick={() => remove(item.id)} aria-label={`Delete ${item.name}`}><X size={15} /></button></article>) : <p className="quiet-state">Log a meal or save a food scan to begin your private nutrition history.</p>}</section></>}</main>;
}

function MacroRing({ label, value, target }) { const percent = target ? Math.min(100, Math.round((value / Number(target)) * 100)) : 0; return <div className="nutrition-macro"><span style={{ '--macro-progress': `${percent}%` }}><i>{Math.round(value)}g</i></span><strong>{label}</strong><small>{target ? `${Math.max(0, Number(target) - value).toFixed(0)}g left` : 'No target'}</small></div>; }
function FoodEstimate({ analysis }) { return <section className="food-result"><div className="food-result-head"><div><p className="eyebrow">Visual estimate</p><h2>{analysis.detectedFoods?.join(', ') || 'Meal analysis'}</h2></div><span className={`confidence ${String(analysis.confidence || '').toLowerCase()}`}>{analysis.confidence || 'Unknown'} confidence</span></div><div className="macro-grid">{[['Calories', analysis.caloriesRange, 'kcal'], ['Protein', analysis.proteinRange, 'g'], ['Carbs', analysis.carbsRange, 'g'], ['Fat', analysis.fatRange, 'g']].map(([label, value, unit]) => <div key={label}><span>{label}</span><strong>{value}<small> {unit}</small></strong></div>)}</div>{analysis.assumptions?.length ? <div className="assumptions"><strong>Assumptions</strong><p>{analysis.assumptions.join(' · ')}</p></div> : null}{analysis.followUpQuestion && <div className="follow-up"><ScanLine size={16} /><span>{analysis.followUpQuestion}</span></div>}<p className="scanner-disclosure">Correct the values below before saving; the corrected meal—not the image—is stored in your history.</p></section>; }
function MealEditor({ entry, setEntry, analysis, saving, onSave }) { const update = (field, value) => setEntry(current => ({ ...current, [field]: value })); return <form className="meal-editor" onSubmit={onSave}><div className="section-heading"><div><p className="eyebrow">{analysis ? 'Correct before save' : 'Manual meal'}</p><h2>{analysis ? 'Make the estimate yours.' : 'Log what you ate.'}</h2></div></div><label>Meal name<input required maxLength={200} value={entry.name} onChange={event => update('name', event.target.value)} placeholder="e.g. Greek yogurt bowl" /></label><label>Meal type<select value={entry.meal_type} onChange={event => update('meal_type', event.target.value)}>{meals.map(value => <option value={value} key={value}>{value}</option>)}</select></label><div className="meal-macro-inputs">{[['calories', 'Calories'], ['protein_g', 'Protein g'], ['carbs_g', 'Carbs g'], ['fat_g', 'Fat g'], ['fiber_g', 'Fiber g']].map(([field, label]) => <label key={field}>{label}<input inputMode="decimal" value={entry[field]} onChange={event => update(field, event.target.value)} placeholder="0" /></label>)}</div><button className="primary-action" type="submit" disabled={saving}><Save size={16} />{saving ? 'Saving meal…' : analysis ? 'Save corrected meal' : 'Save meal'}</button></form>; }
function NutritionSkeleton() { return <div className="skeleton-stack" aria-label="Loading nutrition records"><div className="skeleton hero" /><div className="skeleton short" /><div className="skeleton row" /></div>; }
