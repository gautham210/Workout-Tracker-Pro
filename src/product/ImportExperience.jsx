import { useMemo, useState } from 'react';
import { Check, FileText, LoaderCircle, Sparkles, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { authenticatedApiPost } from '../lib/api';
import { supabase } from '../lib/supabase';

function sessionDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00.000Z` : new Date().toISOString();
}

export default function ImportExperience() {
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
  const save = async () => {
    if (!result || saving) return;
    setSaving(true); setError('');
    try {
      const names = result.exercises.map((exercise) => exercise.name).filter(Boolean);
      const { data: catalog, error: catalogError } = await supabase.from('exercises').select('id,name').in('name', names);
      if (catalogError) throw catalogError;
      const byName = new Map((catalog || []).map((exercise) => [exercise.name.toLocaleLowerCase(), exercise.id]));
      const missing = names.filter((name) => !byName.has(name.toLocaleLowerCase()));
      if (missing.length) throw new Error(`Review these movements before importing: ${missing.join(', ')}.`);
      const exerciseGraph = result.exercises.map((exercise, orderIndex) => ({
        id: crypto.randomUUID(), exercise_id: byName.get(exercise.name.toLocaleLowerCase()), order_index: orderIndex,
        sets: (exercise.sets || []).filter((set) => Number.isFinite(Number(set.weight_kg)) && Number(set.weight_kg) >= 0 && Number.isInteger(Number(set.reps)) && Number(set.reps) > 0).map((set, setNumber) => ({ id: crypto.randomUUID(), set_number: setNumber + 1, weight_kg: Number(set.weight_kg), reps: Number(set.reps), rpe: null, rir: null, completed: true })),
      })).filter((exercise) => exercise.sets.length);
      if (!exerciseGraph.length) throw new Error('The parsed workout has no valid completed sets to import.');
      const graph = { id: crypto.randomUUID(), date: sessionDate(result.date), split_type: result.split || 'Custom', split_day: result.split || 'Custom', notes: 'Imported from a workout log', duration_minutes: null, is_finished: true, exercises: exerciseGraph };
      const { error: saveError } = await supabase.rpc('sync_workout_graph', { p_workout: graph });
      if (saveError) throw saveError;
      setState('done');
    } catch (saveError) { setError(saveError?.message || 'The import could not be saved.'); }
    finally { setSaving(false); }
  };
  return <main className="experience import-experience">{state === 'done' ? <section className="import-done"><div><Check size={32} /></div><p className="eyebrow">Import saved</p><h1>Your history<br />just got fuller.</h1><p>The validated workout graph is now part of your real training history.</p><button className="primary-action" type="button" onClick={() => navigate('/history')}>View history</button><button className="text-action" type="button" onClick={() => { setState('idle'); setResult(null); setRawText(''); }}>Import another log</button></section> : <><section className="import-hero"><div className="import-mark"><FileText size={22} /></div><div><p className="eyebrow">AI workout import</p><h1>Turn a log into<br />a real session.</h1><p>We will show the structured result before it is saved. Low-confidence movement names need your review.</p></div></section>{state !== 'review' ? <section className="import-compose"><label htmlFor="workout-log">Paste a workout log</label><textarea id="workout-log" maxLength={12000} value={rawText} onChange={(event) => setRawText(event.target.value)} placeholder={'Push day\nBench press 60kg x 8\nBench press 60kg x 8\nCable fly 20kg x 12'} /><div><span>{rawText.length.toLocaleString()} / 12,000</span><button type="button" className="primary-action" disabled={state === 'parsing'} onClick={parse}>{state === 'parsing' ? <><LoaderCircle className="spin" size={17} /> Parsing…</> : <><Sparkles size={17} /> Parse workout</>}</button></div></section> : <ImportReview result={result} totalSets={totalSets} save={save} saving={saving} onStartOver={() => { setState('idle'); setResult(null); }} />}{error && <div className="inline-state is-error">{error}</div>}</>}</main>;
}

function ImportReview({ result, totalSets, save, saving, onStartOver }) {
  return <section className="import-review"><div className="review-head"><div><p className="eyebrow">Review before save</p><h2>{result.split || 'Custom'} workout</h2><span>{result.exercises.length} movements · {totalSets} sets</span></div><button className="text-action" type="button" onClick={onStartOver}>Edit log</button></div>{result.ambiguous?.length > 0 && <div className="import-warning">Some movement names were ambiguous. Review the names below before saving.</div>}<div className="parsed-exercises">{result.exercises.map((exercise, index) => <article key={`${exercise.name}-${index}`}><span className={Number(exercise.confidence) >= .85 ? 'confidence high' : 'confidence medium'}>{Math.round(Number(exercise.confidence || 0) * 100)}% match</span><h3>{exercise.name}</h3><p>{(exercise.sets || []).map((set) => `${set.weight_kg} kg × ${set.reps}`).join('  ·  ') || 'No valid sets'}</p></article>)}</div><button className="primary-action import-save" type="button" disabled={saving} onClick={save}>{saving ? <><LoaderCircle className="spin" size={17} /> Saving…</> : <><Upload size={17} /> Import verified workout</>}</button></section>;
}
