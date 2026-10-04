import { useCallback, useEffect, useRef, useState } from 'react';
import { Apple, Bot, ClipboardPlus, Play, Plus, RotateCcw, ScanLine, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ExerciseVisual from './ExerciseVisual';
import { getExerciseCatalog } from './trainingData';
import { collectUnmatched, resolvePlanExercises } from './coachWorkoutMatch';
import PromptBar from './react-bits/PromptBar';
import { useChatThread } from './useChatThread';
import useDraftHandoff from './useDraftHandoff';
import { buildExercise } from './workoutDraft';

const greeting = { role: 'assistant', greeting: true, content: 'Tell me what you want to achieve. I’ll use your private training, nutrition, and body-metrics context to prepare a reviewable session—not a guess.' };
const starters = [
  'I have 45 minutes for chest and triceps. My shoulder feels a little tired.',
  'Build a workout from my recent training and available equipment.',
  'How should I progress my main lifts after my last session?',
];
const mapReply = (result) => ({ intent: result.intent, workoutPlan: result.workoutPlan || null, unmatchedExercises: Array.isArray(result.unmatchedExercises) ? result.unmatchedExercises : null });

// One SpeechRecognition instance per mount; aborted on unmount; a second tap stops listening.
function useDictation(onError) {
  const instance = useRef(null);
  const pending = useRef(null);
  useEffect(() => () => { pending.current?.(''); pending.current = null; try { instance.current?.abort(); } catch { /* already stopped */ } instance.current = null; }, []);
  return useCallback(() => new Promise((resolve) => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { onError('Voice input is not supported by this browser.'); resolve(''); return; }
    if (pending.current) { try { instance.current?.stop(); } catch { /* ignore */ } resolve(''); return; }
    if (!instance.current) {
      const recognition = new Recognition();
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      const settle = (text) => { const done = pending.current; pending.current = null; done?.(text); };
      recognition.onresult = (event) => settle(event.results?.[0]?.[0]?.transcript || '');
      recognition.onerror = (event) => { if (event?.error !== 'aborted' && event?.error !== 'no-speech') onError('Voice input could not be captured.'); settle(''); };
      recognition.onend = () => settle('');
      instance.current = recognition;
    }
    instance.current.lang = navigator.language || 'en-US';
    pending.current = resolve;
    try { instance.current.start(); } catch { pending.current = null; onError('Voice input could not start.'); resolve(''); }
  }), [onError]);
}

export default function CoachExperience() {
  const { user, profile } = useAuth();
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [partial, setPartial] = useState(null);
  const end = useRef(null);
  const { messages, loading, ask, stop, reset } = useChatThread({ storageKey: user?.id ? `wtp_coach_v1_${user.id}` : null, mapReply, unreadable: 'The coach returned an unreadable response.' });
  const onApplied = useCallback((result) => {
    setToast(`${result.added.length} ${result.added.length === 1 ? 'movement' : 'movements'} added to today’s workout${result.skipped.length ? `; ${result.skipped.length} already there` : ''}.`);
  }, []);
  const { request, dialog } = useDraftHandoff({ onApplied });
  const dictate = useDictation(setError);

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length, loading]);

  const prepare = async (proposal, mode, allowPartial = false) => {
    if (busy || !user?.id) return;
    setBusy(true); setError(''); setToast('');
    try {
      const catalog = await getExerciseCatalog().catch(() => []);
      const { resolved, unmatched } = resolvePlanExercises(proposal.exercises, catalog);
      if (!resolved.length) throw new Error('None of those suggested movements are in your exercise library.');
      if (unmatched.length && !allowPartial) { setPartial({ proposal, mode, unmatched }); return; }
      setPartial(null);
      const exercises = resolved.map(({ entry, exercise }) => buildExercise(exercise, { sets: entry.sets, reps: entry.repsMin, weightKg: entry.weightKg, rir: entry.rir, rpe: entry.rpe, warmup: entry.warmup, restSeconds: entry.restSeconds, notes: entry.notes }));
      request({ exercises, title: proposal.title, notes: proposal.notes || proposal.goal || null, startNow: mode === 'start', stay: mode === 'add' });
    } catch (applyError) { setError(applyError?.message || 'The suggested workout could not be prepared.'); }
    finally { setBusy(false); }
  };

  const send = (value) => { setError(''); setToast(''); setPartial(null); return ask(value); };
  const splitName = Array.isArray(profile?.custom_split) && profile.custom_split.length ? 'Your custom split' : 'Your training context';
  const thread = [greeting, ...messages];
  return <main className="experience coach-experience">
    <section className="coach-hero"><div className="coach-mark"><Sparkles size={21} /></div><div><p className="eyebrow">Athlete intelligence</p><h1>Build the session<br />you need.</h1><span>{splitName}, completed training, body metrics, and nutrition are available as authenticated context.</span></div></section>
    <div className="coach-context-rail"><Link to="/nutrition"><span className="coach-context-icon"><ScanLine size={17} /></span><span><strong>Scan a meal</strong><small>Bring nutrition into the conversation.</small></span><Apple size={16} /></Link>{messages.length > 0 && <button type="button" className="chat-reset" onClick={() => { reset(); setError(''); setToast(''); setPartial(null); }}><RotateCcw size={14} /> New chat</button>}</div>
    <section className="coach-thread" aria-live="polite">{thread.map((message, index) => <CoachMessage key={message.id || `greeting-${index}`} message={message} onApply={prepare} onRetry={(text) => ask(text, { retry: true })} busy={busy} />)}{loading && <div className="coach-message assistant is-thinking"><Bot size={16} /><i /><i /><i /></div>}<div ref={end} /></section>
    {partial && <div className="inline-state is-warning" role="alert"><span>Not in your exercise library, so not added: {partial.unmatched.join(', ')}.</span><button type="button" className="text-action" onClick={() => prepare(partial.proposal, partial.mode, true)}>Continue without them</button><button type="button" className="text-action" onClick={() => setPartial(null)}>Dismiss</button></div>}
    {toast && <div className="inline-state" role="status"><span>{toast}</span><Link className="text-action" to="/workout">Open workout</Link></div>}
    {error && <div className="inline-state is-error">{error}</div>}
    {messages.length === 0 && <div className="coach-starters">{starters.map((starter) => <button type="button" key={starter} onClick={() => send(starter)} disabled={loading}>{starter}</button>)}</div>}
    <PromptBar className="coach-prompt" width="100%" maxRows={2} placeholder="Tell Coach what you want to achieve…" sources={[]} commands={[]} models={[{ key: 'coach', name: 'Training Coach', tag: 'secure' }]} defaultModel="coach" efforts={['Guided']} defaultEffort="Guided" busy={loading} background="rgba(13, 38, 72, .92)" color="#f8fbff" menuBackground="#173f73" sparkColor="#76c7ff" onSend={(message) => send(message)} onStop={stop} onDictate={dictate} />
    {dialog}
  </main>;
}

function CoachMessage({ message, onApply, onRetry, busy }) {
  const proposal = message.role === 'assistant' ? message.workoutPlan : null;
  const unmatched = message.role === 'assistant' ? collectUnmatched(proposal, message.unmatchedExercises || []) : [];
  return <article className={`coach-message ${message.role === 'user' ? 'user' : 'assistant'} ${message.error ? 'is-error' : ''}`}><div className="message-persona">{message.role === 'user' ? 'You' : <><Bot size={13} /> Coach</>}</div><p>{message.content}</p>{message.error && message.retryText && <button type="button" className="text-action" onClick={() => onRetry(message.retryText)}><RotateCcw size={13} /> Try again</button>}{proposal && <CoachPlan proposal={proposal} unmatched={unmatched} onApply={onApply} busy={busy} />}{!proposal && unmatched.length > 0 && <p className="plan-unmatched" role="note">Not in your exercise library: {unmatched.join(', ')}.</p>}</article>;
}

function CoachPlan({ proposal, unmatched, onApply, busy }) {
  return <section className="coach-workout-proposal" aria-label={`${proposal.title} workout proposal`}>
    <p className="eyebrow">Today’s workout</p>
    <strong>{proposal.title}</strong>
    {proposal.goal && <p className="plan-goal">{proposal.goal}</p>}
    <div className="coach-plan-metadata"><span>{proposal.estimatedMinutes ? `${proposal.estimatedMinutes} min` : 'Session length adapts'}</span><span>{proposal.target || 'Training focus'}</span><span>{proposal.intensity || 'Guided intensity'}</span></div>
    <ol className="plan-rows">{proposal.exercises.map((exercise, index) => <li key={`${exercise.exerciseId || exercise.name}-${index}`}>
      <ExerciseVisual exercise={exercise} compact />
      <div><span>{exercise.name}{exercise.warmup ? ' · warm-up' : ''}</span><small>{exercise.sets} × {exercise.repsMin}{exercise.repsMax !== exercise.repsMin ? `–${exercise.repsMax}` : ''}{exercise.weightKg ? ` @ ${exercise.weightKg} kg` : ''}{exercise.rir !== null && exercise.rir !== undefined ? ` · ${exercise.rir} RIR` : ''}{exercise.rpe ? ` · RPE ${exercise.rpe}` : ''} · {exercise.restSeconds}s rest</small>{exercise.notes && <em>{exercise.notes}</em>}</div>
    </li>)}</ol>
    {unmatched.length > 0 && <p className="plan-unmatched" role="note">Not in your exercise library, so left out: {unmatched.join(', ')}.</p>}
    {proposal.notes && <p className="plan-notes">{proposal.notes}</p>}
    <div className="plan-actions">
      <button type="button" className="is-primary" disabled={busy} onClick={() => onApply(proposal, 'start')}><Play size={15} />{busy ? 'Preparing…' : 'Start now'}</button>
      <button type="button" disabled={busy} onClick={() => onApply(proposal, 'add')}><Plus size={15} /> Add to today’s workout</button>
      <button type="button" disabled={busy} onClick={() => onApply(proposal, 'builder')}><ClipboardPlus size={15} /> Edit in builder</button>
    </div>
  </section>;
}
