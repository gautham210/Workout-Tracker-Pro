import { useMemo, useRef, useState } from 'react';
import { Check, FileText, LoaderCircle, Play, RefreshCw, Search, Sparkles, Upload, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authenticatedApiPost } from '../lib/api';
import ExerciseVisual from './ExerciseVisual';
import { matchCatalogExercise } from './coachWorkoutMatch';
import { getExerciseCatalog } from './trainingData';
import { useIncrementalList } from './useExerciseCatalog';
import useDraftHandoff from './useDraftHandoff';
import { blankSet, buildExercise, buildWorkoutGraph, inferTitle, newId, splitDayLabel } from './workoutDraft';
import { enqueuePendingWorkout, isNetworkError } from './pendingSync';
import { sendWorkoutGraph } from './workoutSync';

const normalise = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const sessionDate = (value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00.000Z` : new Date().toISOString());
const validSet = (set) => Number.isFinite(Number(set.weight_kg)) && Number(set.weight_kg ?? 0) >= 0 && Number.isInteger(Number(set.reps)) && Number(set.reps) > 0;

// Server match first (catalogKey/matchedName from the shared catalogue), then alias-aware local matching.
function resolveParsed(exercise, catalog) {
  const row = catalog.find((entry) => entry.slug && entry.slug === exercise.catalogKey) || matchCatalogExercise(exercise.matchedName || exercise.name, catalog) || matchCatalogExercise(exercise.name, catalog);
  return row?.id || null;
}

export default function ImportExperience() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rawText, setRawText] = useState('');
  const [result, setResult] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState(null);
  const graphId = useRef(null);
  const { request, dialog } = useDraftHandoff();

  const byId = useMemo(() => new Map(catalog.map((row) => [row.id, row])), [catalog]);
  const stats = useMemo(() => {
    const exercises = result?.exercises || [];
    const included = exercises.filter((exercise) => exercise.catalogId);
    const sets = included.reduce((sum, exercise) => sum + exercise.sets.length, 0);
    const validSets = included.reduce((sum, exercise) => sum + exercise.sets.filter(validSet).length, 0);
    return { total: exercises.length, included: included.length, excluded: exercises.length - included.length, sets, droppedSets: sets - validSets, validSets };
  }, [result]);

  const parse = async () => {
    const value = rawText.trim();
    if (!value) { setError('Paste a workout log first.'); return; }
    setState('parsing'); setError(''); setResult(null);
    try {
      const parsed = await authenticatedApiPost('/api/parse-workout', { rawText: value });
      if (!Array.isArray(parsed?.exercises)) throw new Error('The parser returned an unreadable workout.');
      const rows = await getExerciseCatalog().catch(() => { throw new Error('The exercise library could not be loaded to check this plan. Try again.'); });
      setCatalog(rows);
      graphId.current = newId();
      setResult({ ...parsed, exercises: parsed.exercises.map((exercise) => ({ ...exercise, sets: Array.isArray(exercise.sets) ? exercise.sets : [], catalogId: resolveParsed(exercise, rows), manual: false })) });
      setState('review');
    } catch (parseError) { setState('idle'); setError(parseError?.message || 'This workout could not be parsed.'); }
  };

  const sessionExercises = () => result.exercises.filter((exercise) => exercise.catalogId && byId.has(exercise.catalogId));
  const prepareDraft = () => {
    if (!result || !user?.id || saving) return;
    setError('');
    const included = sessionExercises();
    if (!included.length) { setError('No movement is matched to your library yet. Map at least one before continuing.'); return; }
    const exercises = included.map((exercise) => ({ ...buildExercise(byId.get(exercise.catalogId), { sets: exercise.sets.length || 3 }), sets: (exercise.sets.length ? exercise.sets : [{}]).map((set) => blankSet({ weight_kg: String(set.weight_kg ?? ''), reps: String(set.reps ?? '') })) }));
    request({ exercises, title: splitDayLabel(result.split !== 'Custom' ? result.split : null, inferTitle(exercises)) });
  };

  const saveHistory = async () => {
    if (!result || saving) return;
    setSaving(true); setError('');
    try {
      const session = sessionExercises().map((exercise) => ({
        exercise: byId.get(exercise.catalogId), plannedRestSeconds: null, notes: '',
        sets: exercise.sets.filter(validSet).map((set) => ({ id: newId(), weight_kg: Number(set.weight_kg), reps: Number(set.reps), completed: true, rpe: '', rir: '', is_warmup: false, notes: '' })),
      }));
      const graph = buildWorkoutGraph({ graphId: graphId.current || newId(), exercises: session, startedAt: Date.parse(sessionDate(result.date)), title: result.split !== 'Custom' ? result.split : null, fallbackTitle: inferTitle(session) });
      if (!graph) throw new Error('The parsed workout has no valid completed sets to import.');
      Object.assign(graph, { split_type: result.split || 'Custom', notes: 'Imported from a workout log', duration_minutes: null });
      const { error: saveError } = await sendWorkoutGraph(graph);
      if (saveError) {
        if (isNetworkError(saveError) && enqueuePendingWorkout(user.id, graph, { error: String(saveError.message || saveError) })) { setState('queued'); return; }
        throw saveError;
      }
      setState('done');
    } catch (cause) { setError(cause?.message || 'The import could not be saved.'); }
    finally { setSaving(false); }
  };

  const updateExercise = (index, patchValue) => setResult((current) => ({ ...current, exercises: current.exercises.map((exercise, row) => (row === index ? { ...exercise, ...patchValue } : exercise)) }));
  const rename = (index, name) => setResult((current) => ({ ...current, exercises: current.exercises.map((exercise, row) => {
    if (row !== index) return exercise;
    const next = { ...exercise, name, matchedName: undefined, catalogKey: undefined };
    return exercise.manual ? next : { ...next, catalogId: resolveParsed(next, catalog) };
  }) }));
  const updateSet = (exerciseIndex, setIndex, field, value) => setResult((current) => ({ ...current, exercises: current.exercises.map((exercise, row) => (row !== exerciseIndex ? exercise : { ...exercise, sets: exercise.sets.map((set, setRow) => (setRow === setIndex ? { ...set, [field]: value } : set)) })) }));
  const startOver = () => { setState('idle'); setResult(null); };

  const finished = state === 'done' || state === 'queued';
  return <main className="experience import-experience">{finished ? <section className="import-done"><div>{state === 'queued' ? <RefreshCw size={30} /> : <Check size={32} />}</div><p className="eyebrow">{state === 'queued' ? 'Not synced yet' : 'Import saved'}</p><h1>{state === 'queued' ? <>Stored on<br />this device.</> : <>Your history<br />just got fuller.</>}</h1><p>{state === 'queued' ? 'You appear to be offline. The workout will sync automatically when you reconnect.' : 'The validated workout graph is now part of your real training history.'}</p><button className="primary-action" type="button" onClick={() => navigate('/history')}>View history</button><button className="text-action" type="button" onClick={() => { setState('idle'); setResult(null); setRawText(''); }}>Import another log</button></section> : <><section className="import-hero"><div className="import-mark"><FileText size={22} /></div><div><p className="eyebrow">AI workout import</p><h1>Turn a log into<br />a real session.</h1><p>Parse first, correct anything uncertain, then either prepare today’s workout or import a completed history record.</p></div></section>{state !== 'review' ? <section className="import-compose"><label htmlFor="workout-log">Paste a workout log</label><textarea id="workout-log" maxLength={12000} value={rawText} onChange={(event) => setRawText(event.target.value)} placeholder={'Push day\nBench press 60kg x 8\nBench press 60kg x 8\nCable fly 20kg x 12'} /><div><span>{rawText.length.toLocaleString()} / 12,000</span><button type="button" className="primary-action" disabled={state === 'parsing'} onClick={parse}>{state === 'parsing' ? <><LoaderCircle className="spin" size={17} /> Parsing…</> : <><Sparkles size={17} /> Parse workout</>}</button></div></section> : <ImportReview result={result} byId={byId} stats={stats} saving={saving} onRename={rename} onUpdateSet={updateSet} onMap={(index) => setPicker(index)} onStart={prepareDraft} onImport={saveHistory} onStartOver={startOver} />}{error && <div className="inline-state is-error">{error}</div>}</>}
    {picker !== null && result?.exercises[picker] && <CatalogPicker catalog={catalog} name={result.exercises[picker].name} close={() => setPicker(null)} pick={(row) => { updateExercise(picker, { catalogId: row.id, manual: true }); setPicker(null); }} />}
    {dialog}
  </main>;
}

function ImportReview({ result, byId, stats, saving, onRename, onUpdateSet, onMap, onStart, onImport, onStartOver }) {
  const none = stats.included === 0;
  return <section className="import-review"><div className="review-head"><div><p className="eyebrow">Review before action</p><h2>{result.split || 'Custom'} workout</h2><span>{stats.included} of {stats.total} movements ready · {stats.sets} sets</span></div><button className="text-action" type="button" onClick={onStartOver}>Edit log</button></div>
    {stats.excluded > 0 && <div className="import-warning" role="alert">{stats.excluded} {stats.excluded === 1 ? 'movement is' : 'movements are'} not matched to your library and will be left out unless you map {stats.excluded === 1 ? 'it' : 'them'} below.</div>}
    {stats.droppedSets > 0 && <div className="import-warning" role="status">{stats.droppedSets} {stats.droppedSets === 1 ? 'set has' : 'sets have'} no valid weight or reps. {stats.droppedSets === 1 ? 'It' : 'They'} will be skipped when importing to history.</div>}
    {result.ambiguous?.length > 0 && <div className="import-warning">The parser flagged ambiguous lines: {result.ambiguous.slice(0, 4).join('; ')}</div>}
    <div className="parsed-exercises">{result.exercises.map((exercise, index) => {
      const row = exercise.catalogId ? byId.get(exercise.catalogId) : null;
      return <article key={`${exercise.name}-${index}`} className={row ? '' : 'is-unmatched'}>
        <div className="import-row-head"><ExerciseVisual exercise={row || { name: exercise.name }} compact /><div>
          <span className={row ? 'confidence high' : 'confidence medium'}>{row ? `Matches ${row.name}` : 'Not in your library'}</span>
          <label>Movement<input value={exercise.name} maxLength={160} onChange={(event) => onRename(index, event.target.value)} /></label>
          <button type="button" className="text-action" onClick={() => onMap(index)}>{row ? 'Change match' : 'Map from library'}</button>
        </div></div>
        <div className="import-set-editor">{exercise.sets.map((set, setIndex) => <div key={setIndex}><label>kg<input inputMode="decimal" value={set.weight_kg ?? ''} onChange={(event) => onUpdateSet(index, setIndex, 'weight_kg', event.target.value)} /></label><label>reps<input inputMode="numeric" value={set.reps ?? ''} onChange={(event) => onUpdateSet(index, setIndex, 'reps', event.target.value)} /></label></div>)}</div>
      </article>;
    })}</div>
    <div className="import-actions"><button className="secondary-action" type="button" disabled={saving || none} onClick={onStart}><Play size={17} /> Prepare today’s workout</button><button className="primary-action import-save" type="button" disabled={saving || none || stats.validSets === 0} onClick={onImport}>{saving ? <><LoaderCircle className="spin" size={17} /> Saving…</> : <><Upload size={17} /> Import completed history</>}</button></div></section>;
}

function CatalogPicker({ catalog, name, close, pick }) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const needle = normalise(query);
    if (!needle) return catalog;
    return catalog.filter((row) => normalise(row.name).includes(needle) || (row.aliases || []).some((alias) => normalise(alias).includes(needle)));
  }, [catalog, query]);
  const { visible, hasMore, more, sentinelRef } = useIncrementalList(matches, 24);
  return <div className="sheet-backdrop" onMouseDown={close}><section className="exercise-sheet" role="dialog" aria-modal="true" aria-label="Map movement to library" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-handle" /><div className="sheet-heading"><div><p className="eyebrow">Map “{name}”</p><h2>Pick the library movement.</h2></div><button className="icon-button" onClick={close} type="button" aria-label="Close"><X size={20} /></button></div><label className="search-field"><Search size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search exercises" aria-label="Search exercises" /></label><div className="exercise-results">{matches.length ? <>{visible.map((row) => <button type="button" className="library-item" key={row.id} onClick={() => pick(row)}><ExerciseVisual exercise={row} compact /><span><strong>{row.name}</strong><small>{row.primary_muscles?.join(' · ') || row.muscle_group || 'Movement'}</small></span></button>)}{hasMore && <div ref={sentinelRef} className="library-more"><button type="button" className="text-action" onClick={more}>Show more</button></div>}</> : <p className="quiet-state">No exercises match that search.</p>}</div></section></div>;
}
