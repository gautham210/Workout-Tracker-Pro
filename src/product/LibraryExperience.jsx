import { useMemo, useState } from 'react';
import { ArrowUpRight, ChevronRight, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import ExerciseVisual from './ExerciseVisual';
import { useExerciseCatalog, useIncrementalList } from './useExerciseCatalog';
import useDraftHandoff from './useDraftHandoff';
import { buildExercise } from './workoutDraft';
import { exercisePatterns } from './exerciseMetadata';

const normalise = (value) => String(value || '').trim().toLowerCase();

export default function LibraryExperience() {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('All');
  const [pattern, setPattern] = useState('All');
  const [selected, setSelected] = useState(null);
  const { all, rows, loading, failed, retry } = useExerciseCatalog(query, true);
  const { request, dialog } = useDraftHandoff();

  const groups = useMemo(() => ['All', ...Array.from(new Set(all.map((exercise) => exercise.muscle_group).filter(Boolean))).sort()], [all]);
  const visible = useMemo(() => rows.filter((exercise) => (group === 'All' || normalise(exercise.muscle_group) === normalise(group)) && (pattern === 'All' || exercise.movement_pattern === pattern)), [rows, group, pattern]);
  const { visible: shown, hasMore, remaining, more, sentinelRef } = useIncrementalList(visible, 24);
  const addToDraft = (exercise) => request({ exercises: [buildExercise(exercise)], title: null });

  return <main className="experience library-experience">
    <section className="library-hero"><p className="eyebrow">Exercise library</p><h1>Choose the movement.<br />Own the work.</h1><p>Browse the shared exercise catalogue, then add a real movement to your private workout draft.</p></section>
    <label className="library-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search movements" aria-label="Search exercise library" /></label>
    <div className="library-filter-row" aria-label="Exercise muscle groups"><SlidersHorizontal size={15} />{groups.map((item) => <button type="button" key={item} className={group === item ? 'is-active' : ''} onClick={() => setGroup(item)}>{item}</button>)}</div>
    <div className="library-filter-row is-secondary" aria-label="Exercise movement patterns">{exercisePatterns.map(item => <button type="button" key={item} className={pattern === item ? 'is-active' : ''} onClick={() => setPattern(item)}>{item === 'All' ? 'Any movement' : item.replace(/_/g, ' ')}</button>)}</div>
    {loading && <div className="library-grid is-loading" aria-label="Loading exercise catalogue"><span /><span /><span /><span /></div>}
    {failed && <div className="quiet-panel"><h2>Library unavailable.</h2><p>The exercise library could not be refreshed.</p><button type="button" className="secondary-action" onClick={retry}>Try again</button></div>}
    {!loading && !failed && visible.length === 0 && <div className="empty-state library-empty"><ExerciseVisual name="Movement" muscle={group} /><h2>No movement matched that search.</h2><p>Try a broader movement or muscle-group name.</p></div>}
    {!loading && !failed && visible.length > 0 && <><p className="library-count" aria-live="polite">{visible.length} {visible.length === 1 ? 'movement' : 'movements'}</p><section className="library-grid" aria-label="Exercise catalogue">{shown.map((exercise) => <article key={exercise.id} className="library-card"><button type="button" className="library-inspect" onClick={() => setSelected(exercise)} aria-label={`Inspect ${exercise.name}`}><ExerciseVisual exercise={exercise} /><div><p>{exercise.primary_muscles?.join(' · ') || exercise.muscle_group || 'Movement'}</p><h2>{exercise.name}</h2><span>{exercise.equipment?.join(' · ') || exercise.description || 'Movement details'}</span></div></button><button type="button" onClick={() => addToDraft(exercise)} aria-label={`Add ${exercise.name} to workout`}><Plus size={17} /></button></article>)}</section>{hasMore && <div ref={sentinelRef} className="library-more"><button type="button" className="secondary-action" onClick={more}>Show more ({remaining} left)</button></div>}</>}
    <Link className="library-import-link" to="/import"><span><strong>Already have a written plan?</strong><small>Let the authenticated AI parser turn it into a reviewable workout.</small></span><ArrowUpRight size={18} /></Link>
    {selected && <ExerciseDetail exercise={selected} close={() => setSelected(null)} add={() => { addToDraft(selected); setSelected(null); }} />}
    {dialog}
  </main>;
}

function ExerciseDetail({ exercise, close, add }) {
  return <div className="sheet-backdrop" onMouseDown={close}><section className="exercise-sheet exercise-detail-sheet" onMouseDown={event => event.stopPropagation()}><div className="sheet-handle" /><button type="button" className="icon-button detail-close" onClick={close} aria-label="Close exercise detail"><X size={19} /></button><ExerciseVisual exercise={exercise} /><p className="eyebrow">{exercise.movement_pattern?.replace(/_/g, ' ') || 'Movement'} · {exercise.difficulty}</p><h2>{exercise.name}</h2><p>{exercise.description || 'Use the cues below to set up the movement deliberately.'}</p><div className="exercise-detail-meta"><span>{exercise.primary_muscles?.join(' · ')}</span><span>{exercise.equipment?.join(' · ') || 'Equipment not specified'}</span></div>{exercise.form_cues?.length ? <section><h3>Form cues</h3><ul>{exercise.form_cues.map(cue => <li key={cue}>{cue}</li>)}</ul></section> : null}{exercise.common_mistakes?.length ? <section><h3>Watch for</h3><ul>{exercise.common_mistakes.map(cue => <li key={cue}>{cue}</li>)}</ul></section> : null}<button type="button" className="primary-action" onClick={add}>Add to today’s workout <ChevronRight size={17} /></button></section></div>;
}
