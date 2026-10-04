import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Check, ChevronLeft, ChevronRight, Clock3, History, Plus, RefreshCw, Search, Sparkles, TimerReset, Trash2, Upload, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ExerciseVisual from './ExerciseVisual';
import ConfirmSheet from './ConfirmSheet';
import DomainLinks from './DomainLinks';
import HoldButton from './react-bits/HoldButton';
import { kg } from './trainingData';
import { useExerciseCatalog, useIncrementalList } from './useExerciseCatalog';
import { blankSet, buildExercise, buildWorkoutGraph, clearDraft, hasLoggedSets, inferTitle, newId, readDraft, totalVolume, workingSetCount, writeDraft } from './workoutDraft';
import { enqueuePendingWorkout, getPendingWorkouts, isNetworkError, removePendingWorkout } from './pendingSync';
import { sendWorkoutGraph, syncPendingWorkouts } from './workoutSync';

const RPE_VALUES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const RIR_VALUES = ['0', '1', '2', '3', '4', '5'];

function formatClock(seconds) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export default function WorkoutExperience() {
  const { user } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();
  const [phase, setPhase] = useState('build');
  const [exercises, setExercises] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [startedAt, setStartedAt] = useState(null);
  const [graphId, setGraphId] = useState(null);
  const [title, setTitle] = useState(null);
  const [planNotes, setPlanNotes] = useState(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [restEndsAt, setRestEndsAt] = useState(null);
  const [save, setSave] = useState({ status: 'idle', error: '' });
  const [notice, setNotice] = useState('');
  const [summary, setSummary] = useState({ volume: 0, sets: 0 });
  const [detail, setDetail] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [storageFailed, setStorageFailed] = useState(false);
  const loadedFor = useRef(null);

  useEffect(() => {
    if (!userId || loadedFor.current === userId) return;
    loadedFor.current = userId;
    const draft = readDraft(userId);
    if (!draft?.sessionExercises.length) return;
    queueMicrotask(() => {
      setExercises(draft.sessionExercises);
      setPhase(draft.phase);
      setActiveIndex(draft.activeIndex);
      setStartedAt(draft.startedAt);
      setGraphId(draft.graphId);
      setTitle(draft.title);
      setPlanNotes(draft.planNotes);
    });
  }, [userId]);

  // Browser recovery is user-scoped. Phase, start time and the sync graph id are persisted so a
  // reload resumes the same workout and a retried save stays idempotent.
  useEffect(() => {
    if (!userId || !exercises.length || phase === 'complete') return;
    const ok = writeDraft(userId, { phase, activeIndex, startedAt, graphId, title, planNotes, sessionExercises: exercises });
    queueMicrotask(() => setStorageFailed((previous) => (previous === !ok ? previous : !ok)));
  }, [activeIndex, exercises, graphId, phase, planNotes, startedAt, title, userId]);

  const refreshPending = useCallback(() => { if (userId) setPendingCount(getPendingWorkouts(userId).length); }, [userId]);
  useEffect(() => {
    if (!userId) return undefined;
    let alive = true;
    const run = () => syncPendingWorkouts(userId).then(() => { if (alive) refreshPending(); }).catch(() => {});
    queueMicrotask(() => { refreshPending(); if (navigator.onLine !== false) run(); });
    window.addEventListener('online', run);
    return () => { alive = false; window.removeEventListener('online', run); };
  }, [userId, refreshPending]);

  const active = exercises[activeIndex];
  const completedSets = useMemo(() => exercises.reduce((sum, item) => sum + item.sets.filter((set) => set.completed).length, 0), [exercises]);
  const totalSets = useMemo(() => exercises.reduce((sum, item) => sum + item.sets.length, 0), [exercises]);

  const addExercise = (exercise) => {
    setExercises((current) => (current.some((item) => item.exercise.id === exercise.id) ? current : [...current, buildExercise(exercise)]));
  };
  const updateSet = useCallback((exerciseIndex, setIndex, field, value) => {
    setExercises((current) => current.map((item, index) => (index !== exerciseIndex ? item : ({
      ...item, sets: item.sets.map((set, row) => (row !== setIndex ? set : { ...set, [field]: value })),
    }))));
  }, []);
  const updateExercise = useCallback((exerciseIndex, patch) => {
    setExercises((current) => current.map((item, index) => (index === exerciseIndex ? { ...item, ...patch } : item)));
  }, []);
  const addSet = (exerciseIndex) => setExercises((current) => current.map((item, index) => (index === exerciseIndex ? { ...item, sets: [...item.sets, blankSet()] } : item)));
  const removeExercise = (exerciseIndex) => {
    setExercises((current) => current.filter((_, index) => index !== exerciseIndex));
    setActiveIndex((index) => Math.max(0, Math.min(index, exercises.length - 2)));
  };
  const toggleSet = (exerciseIndex, setIndex) => {
    const target = exercises[exerciseIndex]?.sets[setIndex];
    if (!target) return;
    if (!target.completed && (!(Number(target.weight_kg || 0) >= 0) || !(Number(target.reps) >= 1))) {
      setNotice('Add a valid weight and at least one rep before completing this set.');
      return;
    }
    setNotice('');
    updateSet(exerciseIndex, setIndex, 'completed', !target.completed);
    if (!target.completed) setRestEndsAt(Date.now() + Math.max(15, Number(exercises[exerciseIndex]?.plannedRestSeconds) || 90) * 1000);
  };

  const startWorkout = () => {
    if (!exercises.length) return;
    setStartedAt((current) => current || Date.now());
    setGraphId((current) => current || newId());
    setPhase('active');
    setNotice('');
    setSave({ status: 'idle', error: '' });
  };
  // Leaving the workout screen never discards anything; the draft keeps phase and start time.
  const backToBuilder = () => { setPhase('build'); setRestEndsAt(null); };
  const resetWorkout = () => {
    if (userId) clearDraft(userId);
    setExercises([]); setPhase('build'); setRestEndsAt(null); setStartedAt(null); setGraphId(null); setTitle(null); setPlanNotes(null);
    setActiveIndex(0); setNotice(''); setSave({ status: 'idle', error: '' }); setDetail(null); setConfirmClear(false);
  };

  const finishWorkout = async () => {
    if (!userId || save.status === 'saving') return;
    const id = graphId || newId();
    if (!graphId) setGraphId(id);
    const graph = buildWorkoutGraph({ graphId: id, exercises, startedAt, title, fallbackTitle: inferTitle(exercises) });
    if (!graph) { setSave({ status: 'error', error: 'Complete at least one set with one or more reps to finish your workout.', retry: false }); return; }
    setSave({ status: 'saving', error: '' });
    const { error } = await sendWorkoutGraph(graph);
    if (!error) {
      removePendingWorkout(userId, graph.id);
      clearDraft(userId);
      setSummary({ volume: totalVolume(exercises), sets: workingSetCount(exercises) });
      setSave({ status: 'saved', error: '' });
      setPhase('complete');
      return;
    }
    if (isNetworkError(error)) {
      if (enqueuePendingWorkout(userId, graph, { error: String(error.message || error) })) {
        clearDraft(userId);
        refreshPending();
        setSummary({ volume: totalVolume(exercises), sets: workingSetCount(exercises) });
        setSave({ status: 'queued', error: '' });
        setPhase('complete');
        return;
      }
    }
    setSave({ status: 'error', error: error.message || 'Workout could not be saved. Your entries are kept on this device.', retry: true });
  };

  const retryPending = async () => {
    if (!userId) return;
    await syncPendingWorkouts(userId).catch(() => {});
    refreshPending();
    if (!getPendingWorkouts(userId).length) setSave({ status: 'saved', error: '' });
  };

  if (phase === 'complete') {
    return <WorkoutComplete status={save.status} volume={summary.volume} sets={summary.sets} pendingCount={pendingCount} onRetry={retryPending} onHome={() => navigate('/')} onAnother={resetWorkout} />;
  }

  const detailSet = detail ? exercises[detail.exerciseIndex]?.sets[detail.setIndex] : null;
  return (
    <div className={`experience workout-experience ${phase === 'active' ? 'is-active-workout' : ''}`}>
      {phase === 'build' ? (
        <>
          <section className="workout-builder-head"><p className="eyebrow">{title || 'Create a session'}</p><h1>Train with<br />a clear focus.</h1><p>{planNotes || 'Pick your movements, then move through one focused set at a time.'}</p><Link to="/import" className="builder-import">Have a plan already? <span>Import it</span></Link></section>
          {pendingCount > 0 && <div className="inline-state pending-sync-note" role="status"><span>{pendingCount} finished {pendingCount === 1 ? 'workout is' : 'workouts are'} not synced yet.</span><button type="button" className="text-action" onClick={retryPending}><RefreshCw size={14} /> Sync now</button></div>}
          <section className="builder-list">
            {exercises.length === 0 ? <BuilderEmpty /> : exercises.map((item, index) => (
              <article className="builder-exercise" key={item.exercise.id}>
                <ExerciseVisual exercise={item.exercise} compact />
                <div><p>{item.exercise.muscle_group || 'Movement'}</p><h2>{item.exercise.name}</h2><span>{item.sets.length} planned {item.sets.length === 1 ? 'set' : 'sets'}{item.plannedRestSeconds ? ` · ${item.plannedRestSeconds}s rest` : ''}</span></div>
                <button type="button" className="icon-button" onClick={() => removeExercise(index)} aria-label={`Remove ${item.exercise.name}`}><X size={18} /></button>
              </article>
            ))}
          </section>
          <button type="button" className="add-movement" onClick={() => setLibraryOpen(true)}><Plus size={18} /> Add movement</button>
          <div className="workout-dock">
            <span>{exercises.length ? `${exercises.length} ${exercises.length === 1 ? 'movement' : 'movements'} ready` : 'Build your session'}</span>
            <button type="button" className="primary-action" disabled={!exercises.length} onClick={startWorkout}><Sparkles size={17} /> {startedAt ? 'Resume workout' : 'Begin workout'}</button>
          </div>
          {exercises.length > 0 && <button type="button" className="text-action builder-clear" onClick={() => (hasLoggedSets(exercises) ? setConfirmClear(true) : resetWorkout())}><Trash2 size={15} /> Clear session</button>}
          <DomainLinks label="Train" title="More ways to start" items={[
            { to: '/library', icon: BookOpen, title: 'Library', copy: 'Browse movements' },
            { to: '/import', icon: Upload, title: 'Import', copy: 'Parse a plan' },
            { to: '/history', icon: History, title: 'History', copy: 'Review sessions' },
          ]} />
        </>
      ) : (
        <>
          <section className="active-topline"><button className="icon-button" onClick={backToBuilder} type="button" aria-label="Back to workout builder"><ChevronLeft size={21} /></button><span>{completedSets} sets logged</span><HoldButton className="finish-hold" size="sm" holdTime={850} resetAfter={750} disabled={save.status === 'saving'} backgroundColor="rgba(11,36,68,.82)" fillColor="#007aff" onHold={finishWorkout} doneLabel="Saving…" icon={<Check size={14} />}>Hold to finish</HoldButton></section>
          <div className="workout-progress" aria-label={`${completedSets} completed sets`}><span style={{ width: `${Math.min(100, (completedSets / Math.max(1, totalSets)) * 100)}%` }} /></div>
          <p className={`draft-note ${storageFailed ? 'is-warning' : ''}`}>{storageFailed ? 'This device could not store your progress. Finish soon so nothing is lost.' : 'Saved on this device as you go'}</p>
          {restEndsAt && <RestTimer endsAt={restEndsAt} onExtend={() => setRestEndsAt((current) => (current || Date.now()) + 30_000)} onClose={() => setRestEndsAt(null)} />}
          {active && <ActiveExercise key={active.exercise.id} item={active} exerciseIndex={activeIndex} updateSet={updateSet} updateExercise={updateExercise} toggleSet={toggleSet} addSet={addSet} openDetail={(setIndex) => setDetail({ exerciseIndex: activeIndex, setIndex })} />}
          <div className="movement-pager"><button type="button" onClick={() => setActiveIndex((index) => Math.max(0, index - 1))} disabled={activeIndex === 0} aria-label="Previous movement"><ChevronLeft size={20} /></button><span>{activeIndex + 1} / {exercises.length}</span><button type="button" onClick={() => setActiveIndex((index) => Math.min(exercises.length - 1, index + 1))} disabled={activeIndex === exercises.length - 1} aria-label="Next movement"><ChevronRight size={20} /></button></div>
          {notice && <div className="inline-state is-error">{notice}</div>}
          {save.status === 'saving' && <div className="inline-state" role="status">Saving to your account…</div>}
          {save.status === 'error' && <div className="inline-state is-error" role="alert"><span>{save.error}</span>{save.retry !== false && <button type="button" className="text-action" onClick={finishWorkout}><RefreshCw size={14} /> Retry save</button>}</div>}
        </>
      )}
      {libraryOpen && <ExerciseLibrary close={() => setLibraryOpen(false)} add={addExercise} selectedIds={new Set(exercises.map((item) => item.exercise.id))} />}
      {detail && detailSet && <SetDetailSheet set={detailSet} index={detail.setIndex} exerciseName={exercises[detail.exerciseIndex].exercise.name} update={(field, value) => updateSet(detail.exerciseIndex, detail.setIndex, field, value)} close={() => setDetail(null)} />}
      {confirmClear && <ConfirmSheet danger title="Clear this session?" body={`${completedSets} logged ${completedSets === 1 ? 'set' : 'sets'} will be deleted from this device. This cannot be undone.`} confirmLabel="Clear session" onConfirm={resetWorkout} onCancel={() => setConfirmClear(false)} />}
    </div>
  );
}

// Only this component ticks; the rest of the screen does not re-render while resting.
const RestTimer = memo(function RestTimer({ endsAt, onExtend, onClose }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000));
  useEffect(() => { if (endsAt - Date.now() <= 0) onClose(); }, [now, endsAt, onClose]);
  return <div className="rest-glass" role="timer" aria-label="Rest timer"><Clock3 size={16} /><span>Rest</span><strong>{formatClock(remaining)}</strong><button type="button" onClick={onExtend} aria-label="Add 30 seconds to rest"><TimerReset size={15} /> +30</button><button type="button" onClick={onClose}>Skip</button></div>;
});

function BuilderEmpty() {
  return <div className="builder-empty"><ExerciseVisual exercise={{ name: 'Barbell Bench Press' }} /><h2>Start with a movement.</h2><p>Add exercises from the library, or bring in a plan from Coach or Import.</p></div>;
}

function ActiveExercise({ item, exerciseIndex, updateSet, updateExercise, toggleSet, addSet, openDetail }) {
  const currentSet = Math.min(item.sets.findIndex((set) => !set.completed) + 1 || item.sets.length, item.sets.length);
  const rest = Number(item.plannedRestSeconds) || 90;
  return <section className="active-exercise-card">
    <div className="active-exercise-head"><ExerciseVisual exercise={item.exercise} /><div><p className="eyebrow">{item.exercise.muscle_group || 'Movement'} · target set</p><h1>{item.exercise.name}</h1><span>Set {currentSet} of {item.sets.length} · {rest}s rest</span>{item.planNotes && <small className="exercise-instruction">{item.planNotes}</small>}{item.exercise.form_cues?.[0] && <small className="exercise-instruction">Form cue: {item.exercise.form_cues[0]}</small>}</div></div>
    <div className="set-table"><div className="set-label-row"><span>Set</span><span>Weight (kg)</span><span>Reps</span><span>Done</span></div>{item.sets.map((set, setIndex) => <SetRow key={set.id} set={set} index={setIndex} update={(field, value) => updateSet(exerciseIndex, setIndex, field, value)} complete={() => toggleSet(exerciseIndex, setIndex)} openDetail={() => openDetail(setIndex)} />)}</div>
    <button className="add-set-button" type="button" onClick={() => addSet(exerciseIndex)}><Plus size={16} /> Add set</button>
    <div className="exercise-extras"><div className="rest-adjust" role="group" aria-label="Rest between sets"><button type="button" onClick={() => updateExercise(exerciseIndex, { plannedRestSeconds: Math.max(15, rest - 15) })} aria-label="Reduce rest by 15 seconds">−15s</button><span>Rest {rest}s</span><button type="button" onClick={() => updateExercise(exerciseIndex, { plannedRestSeconds: Math.min(600, rest + 15) })} aria-label="Increase rest by 15 seconds">+15s</button></div><input className="exercise-note-input" aria-label={`Notes for ${item.exercise.name}`} maxLength={500} value={item.notes || ''} onChange={(event) => updateExercise(exerciseIndex, { notes: event.target.value })} placeholder="Exercise note (optional)" /></div>
  </section>;
}

function SetRow({ set, index, update, complete, openDetail }) {
  const adjust = (field, amount) => {
    const current = Number(set[field]);
    const next = Math.max(0, Math.round(((Number.isFinite(current) ? current : 0) + amount) * 10) / 10);
    update(field, String(next));
  };
  const parts = [set.rpe !== '' && `RPE ${set.rpe}`, set.rir !== '' && `RIR ${set.rir}`, set.is_warmup && 'Warm-up', set.notes && 'Note'].filter(Boolean);
  return <div className={`set-row ${set.completed ? 'is-complete' : ''} ${set.is_warmup ? 'is-warmup' : ''}`}>
    <span className="set-number">{set.is_warmup ? 'W' : index + 1}</span>
    <div className="numeric-control" role="group" aria-label={`Set ${index + 1} weight`}><button type="button" disabled={set.completed} onClick={() => adjust('weight_kg', -2.5)} aria-label={`Reduce set ${index + 1} weight`}>−</button><input aria-label={`Set ${index + 1} weight in kilograms`} disabled={set.completed} value={set.weight_kg} onChange={(event) => update('weight_kg', event.target.value)} inputMode="decimal" placeholder="0" /><button type="button" disabled={set.completed} onClick={() => adjust('weight_kg', 2.5)} aria-label={`Increase set ${index + 1} weight`}>+</button></div>
    <div className="numeric-control" role="group" aria-label={`Set ${index + 1} repetitions`}><button type="button" disabled={set.completed} onClick={() => adjust('reps', -1)} aria-label={`Reduce set ${index + 1} reps`}>−</button><input aria-label={`Set ${index + 1} reps`} disabled={set.completed} value={set.reps} onChange={(event) => update('reps', event.target.value)} inputMode="numeric" placeholder="0" /><button type="button" disabled={set.completed} onClick={() => adjust('reps', 1)} aria-label={`Increase set ${index + 1} reps`}>+</button></div>
    <button type="button" className="complete-set" onClick={complete} aria-label={set.completed ? `Uncomplete set ${index + 1}` : `Complete set ${index + 1}`}>{set.completed ? <Check size={17} /> : <span />}</button>
    <button type="button" className="set-detail-chip" onClick={openDetail} aria-label={`Set ${index + 1} details: RPE, RIR, warm-up and note`}>{parts.length ? parts.join(' · ') : 'RPE · RIR · warm-up · note'}<ChevronRight size={13} /></button>
  </div>;
}

function Choice({ value, current, onPick, label }) {
  const selected = current === value;
  return <button type="button" className={`choice-chip ${selected ? 'is-selected' : ''}`} aria-pressed={selected} aria-label={`${label} ${value}`} onClick={() => onPick(selected ? '' : value)}>{value}</button>;
}

function SetDetailSheet({ set, index, exerciseName, update, close }) {
  return <div className="sheet-backdrop" onMouseDown={close}><section className="more-sheet set-detail-sheet" role="dialog" aria-modal="true" aria-label={`Set ${index + 1} details`} onMouseDown={(event) => event.stopPropagation()}>
    <div className="sheet-handle" />
    <div className="sheet-heading"><div><p className="eyebrow">{exerciseName}</p><h2>Set {index + 1} details</h2></div><button className="icon-button" onClick={close} type="button" aria-label="Close set details"><X size={20} /></button></div>
    <p className="detail-label">RPE (effort, 1–10)</p>
    <div className="choice-grid is-rpe">{RPE_VALUES.map((value) => <Choice key={value} value={value} current={set.rpe} label="RPE" onPick={(next) => update('rpe', next)} />)}</div>
    <p className="detail-label">RIR (reps in reserve)</p>
    <div className="choice-grid is-rir">{RIR_VALUES.map((value) => <Choice key={value} value={value} current={set.rir} label="RIR" onPick={(next) => update('rir', next)} />)}</div>
    <label className="warmup-toggle"><input type="checkbox" checked={set.is_warmup === true} onChange={(event) => update('is_warmup', event.target.checked)} /><span><strong>Warm-up set</strong><small>Saved, but left out of volume and progress.</small></span></label>
    <label className="detail-note">Set note<input maxLength={500} value={set.notes || ''} onChange={(event) => update('notes', event.target.value)} placeholder="Optional" /></label>
    <button type="button" className="primary-action" onClick={close}>Done</button>
  </section></div>;
}

function ExerciseLibrary({ close, add, selectedIds }) {
  const [query, setQuery] = useState('');
  const { rows, loading, failed, retry } = useExerciseCatalog(query, true);
  const { visible, hasMore, more, sentinelRef } = useIncrementalList(rows, 24);
  return <div className="sheet-backdrop" onMouseDown={close}><section className="exercise-sheet" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-handle" /><div className="sheet-heading"><div><p className="eyebrow">Exercise library</p><h2>Find your movement.</h2></div><button className="icon-button" onClick={close} type="button" aria-label="Close exercise library"><X size={20} /></button></div><label className="search-field"><Search size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search exercises" aria-label="Search exercises" /></label><div className="exercise-results">{failed ? <p className="quiet-state">The library could not load. <button type="button" className="text-action" onClick={retry}>Try again</button></p> : loading ? <LibrarySkeleton /> : rows.length ? <>{visible.map((exercise) => <button className="library-item" type="button" key={exercise.id} onClick={() => add(exercise)} disabled={selectedIds.has(exercise.id)}><ExerciseVisual exercise={exercise} compact /><span><strong>{exercise.name}</strong><small>{exercise.primary_muscles?.join(' · ') || exercise.muscle_group || 'Movement'} · {exercise.difficulty}</small></span>{selectedIds.has(exercise.id) ? <Check size={18} /> : <Plus size={18} />}</button>)}{hasMore && <div ref={sentinelRef} className="library-more"><button type="button" className="text-action" onClick={more}>Show more</button></div>}</> : <p className="quiet-state">No exercises match that search.</p>}</div></section></div>;
}
function LibrarySkeleton() { return <div className="library-skeleton" aria-label="Loading exercise library"><span /><span /><span /><span /></div>; }

function WorkoutComplete({ status, volume, sets, pendingCount, onRetry, onHome, onAnother }) {
  const queued = status === 'queued';
  return <div className="experience completion-experience"><div className={`completion-burst ${queued ? 'is-pending' : ''}`}>{queued ? <RefreshCw size={36} /> : <Check size={38} />}</div><p className="eyebrow">{queued ? 'Not synced yet' : 'Workout complete'}</p><h1>{queued ? 'Stored on this device.' : 'Strong work.'}</h1><p className="completion-copy" role="status">{queued ? 'You appear to be offline. This workout is kept on this device and will sync automatically when you reconnect.' : 'Saved to your account.'}</p><div className="completion-metrics"><div><strong>{kg(volume)}</strong><span>kg volume</span></div><div><strong>{sets}</strong><span>working sets</span></div></div>{queued && pendingCount > 0 && <button type="button" className="secondary-action" onClick={onRetry}><RefreshCw size={16} /> Try syncing now</button>}<button type="button" className="primary-action" onClick={onAnother}>Build next workout</button><button type="button" className="text-action completion-home" onClick={onHome}>Back home</button></div>;
}
