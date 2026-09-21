import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Check, ChevronLeft, ChevronRight, Clock3, History, Plus, Search, Sparkles, TimerReset, Upload, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import ExerciseVisual from './ExerciseVisual';
import DomainLinks from './DomainLinks';
import HoldButton from './react-bits/HoldButton';
import Stepper, { Step } from './react-bits/Stepper';
import { getExerciseCatalog, kg } from './trainingData';

const blankSet = () => ({ id: crypto.randomUUID(), weight_kg: '', reps: '', rpe: '', rir: '', completed: false });
const buildExercise = (exercise) => ({ exercise, sets: [blankSet(), blankSet(), blankSet()] });
const numberOrNull = (value) => (value === '' || value === null || value === undefined ? null : Number(value));

function formatClock(seconds) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export default function WorkoutExperience() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState('build');
  const [exercises, setExercises] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const [query, setQuery] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [restEndsAt, setRestEndsAt] = useState(null);
  const [now, setNow] = useState(0);
  const [startedAt, setStartedAt] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const draftLoaded = useRef(false);

  useEffect(() => {
    if (!user?.id || draftLoaded.current) return;
    draftLoaded.current = true;
    try {
      const raw = localStorage.getItem(`wtp_workout_draft_v2_${user.id}`);
      const draft = raw ? JSON.parse(raw) : null;
      if (draft?.userId === user.id && Array.isArray(draft.sessionExercises)) {
        const recovered = draft.sessionExercises.filter((item) => item?.exercise?.id).map((item) => ({
          exercise: item.exercise,
          sets: Array.isArray(item.sets) && item.sets.length ? item.sets.map((set) => ({ ...blankSet(), ...set })) : [blankSet(), blankSet(), blankSet()],
        }));
        if (recovered.length) queueMicrotask(() => setExercises(recovered));
      }
    } catch { /* a malformed visual draft never blocks workout creation */ }
  }, [user?.id]);

  useEffect(() => {
    if (!libraryOpen) return undefined;
    const timer = window.setTimeout(async () => {
      setCatalogLoading(true);
      try { setCatalog(await getExerciseCatalog(query)); } catch { setCatalog([]); }
      finally { setCatalogLoading(false); }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [libraryOpen, query]);

  useEffect(() => {
    if (!restEndsAt) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [restEndsAt]);

  const active = exercises[activeIndex];
  const completedSets = useMemo(() => exercises.flatMap((item) => item.sets).filter((set) => set.completed).length, [exercises]);
  const volume = useMemo(() => exercises.flatMap((item) => item.sets).filter((set) => set.completed).reduce((sum, set) => sum + (Number(set.weight_kg) || 0) * (Number(set.reps) || 0), 0), [exercises]);
  const restRemaining = restEndsAt ? Math.max(0, Math.ceil((restEndsAt - now) / 1000)) : 0;

  const addExercise = (exercise) => {
    if (exercises.some((item) => item.exercise.id === exercise.id)) return;
    setExercises((current) => [...current, buildExercise(exercise)]);
  };
  const updateSet = (exerciseIndex, setIndex, field, value) => {
    setExercises((current) => current.map((item, index) => index !== exerciseIndex ? item : ({
      ...item, sets: item.sets.map((set, row) => row !== setIndex ? set : { ...set, [field]: value }),
    })));
  };
  const addSet = (exerciseIndex) => setExercises((current) => current.map((item, index) => index === exerciseIndex ? { ...item, sets: [...item.sets, blankSet()] } : item));
  const removeExercise = (exerciseIndex) => {
    setExercises((current) => current.filter((_, index) => index !== exerciseIndex));
    setActiveIndex((index) => Math.max(0, Math.min(index, exercises.length - 2)));
  };
  const toggleSet = (exerciseIndex, setIndex) => {
    const target = exercises[exerciseIndex]?.sets[setIndex];
    if (!target) return;
    if (!target.completed && (!(Number(target.weight_kg) >= 0) || !(Number(target.reps) >= 1))) {
      setSaveError('Add a valid weight and at least one rep before completing this set.');
      return;
    }
    setSaveError('');
    updateSet(exerciseIndex, setIndex, 'completed', !target.completed);
    if (!target.completed) {
      const end = Date.now() + 90_000;
      setNow(Date.now());
      setRestEndsAt(end);
      window.setTimeout(() => setRestEndsAt((current) => current === end ? null : current), 90_050);
    }
  };
  const startWorkout = () => { if (exercises.length) { setStartedAt(Date.now()); setPhase('active'); setSaveError(''); } };
  const resetWorkout = () => { setPhase('build'); setRestEndsAt(null); setStartedAt(null); setActiveIndex(0); };

  const finishWorkout = async () => {
    if (!user?.id || saving) return;
    const completedExercises = exercises.map((item, orderIndex) => ({
      id: crypto.randomUUID(), exercise_id: item.exercise.id, order_index: orderIndex,
      sets: item.sets.filter((set) => set.completed).map((set, setNumber) => ({
        id: set.id, set_number: setNumber + 1, weight_kg: Number(set.weight_kg), reps: Number(set.reps), completed: true,
        rpe: numberOrNull(set.rpe), rir: numberOrNull(set.rir),
      })),
    })).filter((item) => item.sets.length);
    if (!completedExercises.length) { setSaveError('Complete at least one set to finish your workout.'); return; }
    setSaving(true); setSaveError('');
    const duration = Math.max(1, Math.round((Date.now() - (startedAt || Date.now())) / 60_000));
    const graph = { id: crypto.randomUUID(), date: new Date().toISOString(), split_type: 'custom', split_day: 'Custom', notes: '', duration_minutes: duration, is_finished: true, exercises: completedExercises };
    const { error } = await supabase.rpc('sync_workout_graph', { p_workout: graph });
    setSaving(false);
    if (error) { setSaveError(error.message || 'Workout could not be saved. Your entries are still on screen.'); return; }
    try { localStorage.removeItem(`wtp_workout_draft_v2_${user.id}`); } catch { /* cache cleanup is non-critical */ }
    setPhase('complete');
  };

  if (phase === 'complete') {
    return <WorkoutComplete volume={volume} sets={completedSets} onHome={() => navigate('/')} onAnother={resetWorkout} />;
  }

  return (
    <div className={`experience workout-experience ${phase === 'active' ? 'is-active-workout' : ''}`}>
      {phase === 'build' ? (
        <>
          <section className="workout-builder-head"><p className="eyebrow">Create a session</p><h1>Train with<br />a clear focus.</h1><p>Pick your movements, then move through one focused set at a time.</p><Link to="/import" className="builder-import">Have a plan already? <span>Import it</span></Link></section>
          <DomainLinks label="Train" title="Choose your path" items={[
            { to: '/library', icon: BookOpen, title: 'Library', copy: 'Browse movements' },
            { to: '/import', icon: Upload, title: 'Import', copy: 'Parse a plan' },
            { to: '/history', icon: History, title: 'History', copy: 'Review sessions' },
          ]} />
          <section className="builder-list">
            {exercises.length === 0 ? <BuilderEmpty onOpen={() => setLibraryOpen(true)} /> : exercises.map((item, index) => (
              <article className="builder-exercise" key={item.exercise.id}>
                <ExerciseVisual name={item.exercise.name} muscle={item.exercise.muscle_group} compact />
                <div><p>{item.exercise.muscle_group || 'Movement'}</p><h2>{item.exercise.name}</h2><span>{item.sets.length} planned sets</span></div>
                <button type="button" className="icon-button" onClick={() => removeExercise(index)} aria-label={`Remove ${item.exercise.name}`}><X size={18} /></button>
              </article>
            ))}
          </section>
          {exercises.length > 0 && <BuildJourney exerciseCount={exercises.length} onStart={startWorkout} />}
          <button type="button" className="add-movement" onClick={() => setLibraryOpen(true)}><Plus size={18} /> Add movement</button>
          <div className="workout-dock"><span>{exercises.length ? `${exercises.length} movements ready` : 'Build your session'}</span><button type="button" className="primary-action" disabled={!exercises.length} onClick={startWorkout}><Sparkles size={17} /> Begin workout</button></div>
        </>
      ) : (
        <>
          <section className="active-topline"><button className="icon-button" onClick={resetWorkout} type="button" aria-label="Return to workout builder"><ChevronLeft size={21} /></button><span>{completedSets} sets logged</span><HoldButton className="finish-hold" size="sm" holdTime={850} resetAfter={750} disabled={saving} backgroundColor="rgba(11,36,68,.82)" fillColor="#007aff" onHold={finishWorkout} doneLabel="Saving…" icon={<Check size={14} />}>Hold to finish</HoldButton></section>
          <div className="workout-progress" aria-label={`${completedSets} completed sets`}><span style={{ width: `${Math.min(100, (completedSets / Math.max(1, exercises.flatMap((item) => item.sets).length)) * 100)}%` }} /></div>
          {restEndsAt && <div className="rest-glass"><Clock3 size={16} /><span>Rest</span><strong>{formatClock(restRemaining)}</strong><button type="button" onClick={() => { const next = (restEndsAt || Date.now()) + 30_000; setNow(Date.now()); setRestEndsAt(next); }} aria-label="Add 30 seconds to rest"><TimerReset size={15} /> +30</button><button type="button" onClick={() => setRestEndsAt(null)}>Skip</button></div>}
          {active && <ActiveExercise key={active.exercise.id} item={active} exerciseIndex={activeIndex} updateSet={updateSet} toggleSet={toggleSet} addSet={addSet} />}
          <div className="movement-pager"><button type="button" onClick={() => setActiveIndex((index) => Math.max(0, index - 1))} disabled={activeIndex === 0}><ChevronLeft size={20} /></button><span>{activeIndex + 1} / {exercises.length}</span><button type="button" onClick={() => setActiveIndex((index) => Math.min(exercises.length - 1, index + 1))} disabled={activeIndex === exercises.length - 1}><ChevronRight size={20} /></button></div>
          {saveError && <div className="inline-state is-error">{saveError}</div>}
        </>
      )}
      <ExerciseLibrary open={libraryOpen} close={() => setLibraryOpen(false)} query={query} setQuery={setQuery} catalog={catalog} loading={catalogLoading} add={addExercise} selectedIds={new Set(exercises.map((item) => item.exercise.id))} />
    </div>
  );
}

function BuildJourney({ exerciseCount, onStart }) {
  return <Stepper className="workout-build-journey" onFinalStepCompleted={onStart} nextButtonText="Review" backButtonText="Back">
    <Step><div className="journey-copy"><p className="eyebrow">Step one</p><h2>Choose your movements.</h2><p>{exerciseCount} {exerciseCount === 1 ? 'movement is' : 'movements are'} in this session. Add or remove them before you begin.</p></div></Step>
    <Step><div className="journey-copy"><p className="eyebrow">Step two</p><h2>Log with intention.</h2><p>Weight, reps, RPE and RIR stay editable through the active workout. Your set entries autosave visually until completion.</p></div></Step>
    <Step><div className="journey-copy"><p className="eyebrow">Step three</p><h2>Ready when you are.</h2><p>Finish one completed set or more, then the workout graph is persisted through your authenticated sync RPC.</p></div></Step>
  </Stepper>;
}

function BuilderEmpty({ onOpen }) {
  return <div className="builder-empty"><ExerciseVisual name="Start" /><h2>Start with a movement.</h2><p>Every set is saved through your authenticated workout graph.</p><button className="secondary-action" type="button" onClick={onOpen}>Browse exercise library <ChevronRight size={17} /></button></div>;
}

function ActiveExercise({ item, exerciseIndex, updateSet, toggleSet, addSet }) {
  const currentSet = Math.min(item.sets.findIndex((set) => !set.completed) + 1 || item.sets.length, item.sets.length);
  return <section className="active-exercise-card">
    <div className="active-exercise-head"><ExerciseVisual name={item.exercise.name} muscle={item.exercise.muscle_group} /><div><p className="eyebrow">{item.exercise.muscle_group || 'Movement'} · target set</p><h1>{item.exercise.name}</h1><span>Set {currentSet} of {item.sets.length}</span>{item.exercise.description && <small className="exercise-instruction">{item.exercise.description}</small>}</div></div>
    <div className="set-table"><div className="set-label-row"><span>Set</span><span>Weight</span><span>Reps</span><span>RPE</span><span>RIR</span><span>Done</span></div>{item.sets.map((set, setIndex) => <SetRow key={set.id} set={set} index={setIndex} update={(field, value) => updateSet(exerciseIndex, setIndex, field, value)} complete={() => toggleSet(exerciseIndex, setIndex)} />)}</div>
    <button className="add-set-button" type="button" onClick={() => addSet(exerciseIndex)}><Plus size={16} /> Add set</button>
  </section>;
}

function SetRow({ set, index, update, complete }) {
  const adjust = (field, amount) => {
    const current = Number(set[field]);
    const next = Math.max(0, Math.round(((Number.isFinite(current) ? current : 0) + amount) * 10) / 10);
    update(field, String(next));
  };
  const setRating = (field, value) => update(field, value === '0' ? '' : value);
  return <div className={`set-row ${set.completed ? 'is-complete' : ''}`}>
    <span className="set-number">{index + 1}</span>
    <div className="numeric-control" role="group" aria-label={`Set ${index + 1} weight`}><button type="button" disabled={set.completed} onClick={() => adjust('weight_kg', -2.5)} aria-label={`Reduce set ${index + 1} weight`}>−</button><input aria-label={`Set ${index + 1} weight in kilograms`} disabled={set.completed} value={set.weight_kg} onChange={(event) => update('weight_kg', event.target.value)} inputMode="decimal" placeholder="0" /><button type="button" disabled={set.completed} onClick={() => adjust('weight_kg', 2.5)} aria-label={`Increase set ${index + 1} weight`}>+</button></div>
    <div className="numeric-control" role="group" aria-label={`Set ${index + 1} repetitions`}><button type="button" disabled={set.completed} onClick={() => adjust('reps', -1)} aria-label={`Reduce set ${index + 1} reps`}>−</button><input aria-label={`Set ${index + 1} reps`} disabled={set.completed} value={set.reps} onChange={(event) => update('reps', event.target.value)} inputMode="numeric" placeholder="0" /><button type="button" disabled={set.completed} onClick={() => adjust('reps', 1)} aria-label={`Increase set ${index + 1} reps`}>+</button></div>
    <label className="rating-control"><input aria-label={`Set ${index + 1} RPE`} disabled={set.completed} type="range" min="0" max="10" value={set.rpe === '' ? 0 : set.rpe} onChange={(event) => setRating('rpe', event.target.value)} /><output>{set.rpe || '—'}</output></label>
    <label className="rating-control"><input aria-label={`Set ${index + 1} reps in reserve`} disabled={set.completed} type="range" min="0" max="5" value={set.rir === '' ? 0 : set.rir} onChange={(event) => setRating('rir', event.target.value)} /><output>{set.rir || '—'}</output></label>
    <button type="button" className="complete-set" onClick={complete} aria-label={set.completed ? `Uncomplete set ${index + 1}` : `Complete set ${index + 1}`}>{set.completed ? <Check size={17} /> : <span />}</button>
  </div>;
}

function ExerciseLibrary({ open, close, query, setQuery, catalog, loading, add, selectedIds }) {
  if (!open) return null;
  return <div className="sheet-backdrop" onMouseDown={close}><section className="exercise-sheet" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-handle" /><div className="sheet-heading"><div><p className="eyebrow">Exercise library</p><h2>Find your movement.</h2></div><button className="icon-button" onClick={close} type="button" aria-label="Close exercise library"><X size={20} /></button></div><label className="search-field"><Search size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search exercises" /></label><div className="exercise-results">{loading ? <LibrarySkeleton /> : catalog.length ? catalog.map((exercise) => <button className="library-item" type="button" key={exercise.id} onClick={() => add(exercise)} disabled={selectedIds.has(exercise.id)}><ExerciseVisual name={exercise.name} muscle={exercise.muscle_group} compact /><span><strong>{exercise.name}</strong><small>{exercise.muscle_group || 'Movement'}</small></span>{selectedIds.has(exercise.id) ? <Check size={18} /> : <Plus size={18} />}</button>) : <p className="quiet-state">No exercises match that search.</p>}</div></section></div>;
}
function LibrarySkeleton() { return <div className="library-skeleton" aria-label="Loading exercise library"><span /><span /><span /><span /></div>; }

function WorkoutComplete({ volume, sets, onHome, onAnother }) {
  return <div className="experience completion-experience"><div className="completion-burst"><Check size={38} /></div><p className="eyebrow">Workout complete</p><h1>Strong work.</h1><p className="completion-copy">Your completed workout is recorded through the real workout graph.</p><div className="completion-metrics"><div><strong>{kg(volume)}</strong><span>kg volume</span></div><div><strong>{sets}</strong><span>sets completed</span></div></div><button type="button" className="primary-action" onClick={onAnother}>Build next workout</button><button type="button" className="text-action completion-home" onClick={onHome}>Back home</button></div>;
}
