import { useMemo, useState } from 'react';
import { Check, FileText, LoaderCircle, Play, Sparkles, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authenticatedApiPost } from '../lib/api';
import { supabase } from '../lib/supabase';
import { getExerciseCatalog } from './trainingData';

const normalise = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const sessionDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00.000Z` : new Date().toISOString();
const blankSet = (set = {}) => ({ id: crypto.randomUUID(), weight_kg: String(set.weight_kg ?? ''), reps: String(set.reps ?? ''), rpe: '', rir: '', completed: false });

export default function ImportExperience() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rawText, setRawText] = useState('');
  const [result, setResult] = useState(null);
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const totalSets = useMemo(() => result?.exercises?.reduce((sum, exercise) => sum + (exercise.sets?.length || 0), 0) || 0, [result]);
  const parse = async () => {
    const value = rawText.trim();
    if (!value) { setError('Paste a workout log first.'); return; }
    setState('parsing'); setError(''); setResult(null);
    try {
      const parsed = await authenticatedApiPost('/api/parse-workout', { rawText: value });
      if (!Array.isArray(parsed?.exercises)) throw new Error('The parser returned an unreadable workout.');
      setResult(parsed); setState('review');
    } catch (parseError) { setState('idle'); setError(parseError?.message || 'This workout could not be parsed.'); }
  };
  const catalogueExercises = async () => {
    const catalogue = await getExerciseCatalog();
    const indexed = new Map(catalogue.map(exercise => [normalise(exercise.name), exercise]));
    const unresolved = result.exercises.filter(exercise => !indexed.has(normalise(exercise.name))).map(exercise => exercise.name);
    if (unresolved.length) throw new Error(`Review these movements before continuing: ${unresolved.join(', ')}.`);
    return indexed;
  };
  const saveDraft = async () => {
    if (!result || !user?.id || saving) return;
    setSaving(true); setError('');
    try {
      const indexed = await catalogueExercises();
      const sessionExercises = result.exercises.map(exercise => ({ exercise: indexed.get(normalise(exercise.name)), sets: exercise.sets.map(blankSet) }));
      localStorage.setItem(`wtp_workout_draft_v2_${user.id}`, JSON.stringify({ userId: user.id, savedAt: Date.now(), title: `${result.split || 'Custom'} workout`, sessionExercises }));
      navigate('/workout');
    } catch (cause) { setError(cause?.message || 'This plan could not be prepared.'); }
    finally { setSaving(false); }
  };
  const saveHistory = async () => {
    if (!result || saving) return;
    setSaving(true); setError('');
    try {
      const indexed = await catalogueExercises();
      const exercises = result.exercises.map((exercise, orderIndex) => ({
        id: crypto.randomUUID(), exercise_id: indexed.get(normalise(exercise.name)).id, order_index: orderIndex,
        sets: exercise.sets.filter(set => Number.isFinite(Number(set.weight_kg)) && Number(set.weight_kg) >= 0 && Number.isInteger(Number(set.reps)) && Number(set.reps) > 0).map((set, setNumber) => ({ id: crypto.randomUUID(), set_number: setNumber + 1, weight_kg: Number(set.weight_kg), reps: Number(set.reps), rpe: null, rir: null, completed: true })),
      })).filter(exercise => exercise.sets.length);
      if (!exercises.length) throw new Error('The parsed workout has no valid completed sets to import.');
      const graph = { id: crypto.randomUUID(), date: sessionDate(result.date), split_type: result.split || 'Custom', split_day: result.split || 'Custom', notes: 'Imported from a workout log', duration_minutes: null, is_finished: true, exercises };
      const { error: saveError } = await supabase.rpc('sync_workout_graph', { p_workout: graph });
      if (saveError) throw saveError;
      setState('done');
    } catch (cause) { setError(cause?.message || 'The import could not be saved.'); }
    finally { setSaving(false); }
  };
  const updateExercise = (index, patchValue) => setResult(current => ({ ...current, exercises: current.exercises.map((exercise, row) => row === index ? { ...exercise, ...patchValue } : exercise) }));
  const updateSet = (exerciseIndex, setIndex, field, value) => setResult(current => ({ ...current, exercises: current.exercises.map((exercise, row) => row !== exerciseIndex ? exercise : { ...exercise, sets: exercise.sets.map((set, setRow) => setRow === setIndex ? { ...set, [field]: value } : set) }) }));
  return <main className="experience import-experience">{state === 'done' ? <section className="import-done"><div><Check size={32} /></div><p className="eyebrow">Import saved</p><h1>Your history<br />just got fuller.</h1><p>The validated workout graph is now part of your real training history.</p><button className="primary-action" type="button" onClick={() => navigate('/history')}>View history</button><button className="text-action" type="button" onClick={() => { setState('idle'); setResult(null); setRawText(''); }}>Import another log</button></section> : <><section className="import-hero"><div className="import-mark"><FileText size={22} /></div><div><p className="eyebrow">AI workout import</p><h1>Turn a log into<br />a real session.</h1><p>Parse first, correct anything uncertain, then either prepare today’s workout or import a completed history record.</p></div></section>{state !== 'review' ? <section className="import-compose"><label htmlFor="workout-log">Paste a workout log</label><textarea id="workout-log" maxLength={12000} value={rawText} onChange={event => setRawText(event.target.value)} placeholder={'Push day\nBench press 60kg x 8\nBench press 60kg x 8\nCable fly 20kg x 12'} /><div><span>{rawText.length.toLocaleString()} / 12,000</span><button type="button" className="primary-action" disabled={state === 'parsing'} onClick={parse}>{state === 'parsing' ? <><LoaderCircle className="spin" size={17} /> Parsing…</> : <><Sparkles size={17} /> Parse workout</>}</button></div></section> : <ImportReview result={result} totalSets={totalSets} saving={saving} onUpdateExercise={updateExercise} onUpdateSet={updateSet} onStart={saveDraft} onImport={saveHistory} onStartOver={() => { setState('idle'); setResult(null); }} />}{error && <div className="inline-state is-error">{error}</div>}</>}</main>;
}

function ImportReview({ result, totalSets, saving, onUpdateExercise, onUpdateSet, onStart, onImport, onStartOver }) {
  return <section className="import-review"><div className="review-head"><div><p className="eyebrow">Review before action</p><h2>{result.split || 'Custom'} workout</h2><span>{result.exercises.length} movements · {totalSets} sets</span></div><button className="text-action" type="button" onClick={onStartOver}>Edit log</button></div>{result.ambiguous?.length > 0 && <div className="import-warning">Some movement names were ambiguous. Correct them below before saving.</div>}<div className="parsed-exercises">{result.exercises.map((exercise, index) => <article key={`${exercise.name}-${index}`}><span className={Number(exercise.confidence) >= .85 ? 'confidence high' : 'confidence medium'}>{Math.round(Number(exercise.confidence || 0) * 100)}% match</span><label>Movement<input value={exercise.name} maxLength={160} onChange={event => onUpdateExercise(index, { name: event.target.value })} /></label><div className="import-set-editor">{exercise.sets.map((set, setIndex) => <div key={setIndex}><label>kg<input inputMode="decimal" value={set.weight_kg} onChange={event => onUpdateSet(index, setIndex, 'weight_kg', event.target.value)} /></label><label>reps<input inputMode="numeric" value={set.reps} onChange={event => onUpdateSet(index, setIndex, 'reps', event.target.value)} /></label></div>)}</div></article>)}</div><div className="import-actions"><button className="secondary-action" type="button" disabled={saving} onClick={onStart}><Play size={17} /> Prepare today’s workout</button><button className="primary-action import-save" type="button" disabled={saving} onClick={onImport}>{saving ? <><LoaderCircle className="spin" size={17} /> Saving…</> : <><Upload size={17} /> Import completed history</>}</button></div></section>;
}
