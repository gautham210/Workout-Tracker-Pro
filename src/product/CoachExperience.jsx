import { useEffect, useRef, useState } from 'react';
import { Apple, Bot, ClipboardPlus, ScanLine, Sparkles } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authenticatedApiPost } from '../lib/api';
import { supabase } from '../lib/supabase';
import PromptBar from './react-bits/PromptBar';

const greeting = { role: 'assistant', content: 'I’m here for training, recovery, form, and progression. What would help today?' };
const starters = ['Build a workout from my recent training', 'How should I progress my main lifts?', 'Help me plan recovery after my last session'];

function cleanReply(content) {
  return String(content || '').replace(/```workout-suggested[\s\S]*?```/g, '').trim();
}

function suggestedWorkout(content) {
  const match = String(content || '').match(/```workout-suggested\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    const candidate = JSON.parse(match[1].trim());
    return Array.isArray(candidate?.exercises) ? candidate : null;
  } catch { return null; }
}

export default function CoachExperience() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([greeting]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [applying, setApplying] = useState(false);
  const end = useRef(null);
  const request = useRef(null);

  useEffect(() => {
    if (!user?.id) return;
    try {
      const saved = JSON.parse(localStorage.getItem(`wtp_coach_chat_history_${user.id}`) || 'null');
      queueMicrotask(() => setMessages(Array.isArray(saved) && saved.length ? saved.slice(-24) : [greeting]));
    } catch { queueMicrotask(() => setMessages([greeting])); }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    try { localStorage.setItem(`wtp_coach_chat_history_${user.id}`, JSON.stringify(messages.slice(-24))); } catch { /* cache is non-critical */ }
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, user?.id]);

  const ask = async (value) => {
    const content = String(value || input).trim();
    if (!content || loading) return;
    const outgoing = { role: 'user', content };
    setMessages((previous) => [...previous, outgoing]);
    setInput(''); setError(''); setLoading(true);
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const result = await authenticatedApiPost('/api/ai-chat', { messages: [...messages, outgoing].slice(-12) }, { signal: controller.signal });
      if (!result?.text || typeof result.text !== 'string') throw new Error('The coach returned an unreadable response.');
      setMessages((previous) => [...previous, { role: 'assistant', content: result.text, intent: result.intent }]);
    } catch (requestError) {
      setError(requestError?.name === 'AbortError' ? 'The coach took too long to respond. Try again.' : requestError?.message || 'The coach is temporarily unavailable.');
    } finally { window.clearTimeout(timeout); request.current = null; setLoading(false); }
  };

  const applyWorkout = async (proposal) => {
    if (!proposal || applying || !user?.id) return;
    setApplying(true); setError('');
    try {
      const names = proposal.exercises.map((entry) => typeof entry === 'string' ? entry : entry?.name).filter(Boolean);
      if (!names.length) throw new Error('The suggested workout did not contain usable exercises.');
      const { data: catalog, error: catalogError } = await supabase.from('exercises').select('id,name,muscle_group,description').in('name', names);
      if (catalogError) throw catalogError;
      const indexed = new Map((catalog || []).map((exercise) => [exercise.name.toLocaleLowerCase(), exercise]));
      const sessionExercises = names.map((name) => indexed.get(name.toLocaleLowerCase())).filter(Boolean).map((exercise) => ({
        exercise,
        sets: Array.from({ length: 3 }, () => ({ id: crypto.randomUUID(), weight_kg: '', reps: '', rpe: '', rir: '', completed: false })),
      }));
      if (!sessionExercises.length) throw new Error('None of those suggested movements are in your exercise library.');
      localStorage.setItem(`wtp_workout_draft_v2_${user.id}`, JSON.stringify({ userId: user.id, savedAt: Date.now(), sessionExercises }));
      navigate('/workout');
    } catch (applyError) { setError(applyError?.message || 'The suggested workout could not be prepared.'); }
    finally { setApplying(false); }
  };

  const splitName = Array.isArray(profile?.custom_split) && profile.custom_split.length ? 'Your custom split' : 'Your training context';
  return <main className="experience coach-experience">
    <section className="coach-hero"><div className="coach-mark"><Sparkles size={21} /></div><div><p className="eyebrow">Training intelligence</p><h1>Coach, in your<br />corner.</h1><span>{splitName} is available to the coach.</span></div></section>
    <div className="coach-context-rail"><Link to="/nutrition"><span className="coach-context-icon"><ScanLine size={17} /></span><span><strong>Scan a meal</strong><small>Bring nutrition into the conversation.</small></span><Apple size={16} /></Link></div>
    <section className="coach-thread" aria-live="polite">{messages.map((message, index) => <CoachMessage key={`${message.role}-${index}`} message={message} onApply={applyWorkout} applying={applying} />)}{loading && <div className="coach-message assistant is-thinking"><Bot size={16} /><i /><i /><i /></div>}<div ref={end} /></section>
    {error && <div className="inline-state is-error">{error}</div>}
    {messages.length === 1 && <div className="coach-starters">{starters.map((starter) => <button type="button" key={starter} onClick={() => ask(starter)} disabled={loading}>{starter}</button>)}</div>}
    <PromptBar className="coach-prompt" width="100%" placeholder="Ask about today’s training" sources={[]} commands={[]} models={[{ key: 'coach', name: 'Training Coach', tag: 'secure' }]} defaultModel="coach" efforts={['Guided']} defaultEffort="Guided" busy={loading} background="rgba(13, 38, 72, .92)" color="#f8fbff" menuBackground="#173f73" sparkColor="#76c7ff" onSend={(message) => ask(message)} onStop={() => request.current?.abort()} onDictate={() => dictate(setError)} />
  </main>;
}

function dictate(setError) {
  return new Promise((resolve) => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { setError('Voice input is not supported by this browser.'); resolve(''); return; }
    const recognition = new Recognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => resolve(event.results?.[0]?.[0]?.transcript || '');
    recognition.onerror = () => { setError('Voice input could not be captured.'); resolve(''); };
    recognition.onend = () => resolve('');
    recognition.start();
  });
}

function CoachMessage({ message, onApply, applying }) {
  const proposal = message.role === 'assistant' ? suggestedWorkout(message.content) : null;
  return <article className={`coach-message ${message.role === 'user' ? 'user' : 'assistant'}`}><div className="message-persona">{message.role === 'user' ? 'You' : <><Bot size={13} /> Coach</>}</div><p>{cleanReply(message.content)}</p>{proposal && <button className="coach-workout-proposal" type="button" disabled={applying} onClick={() => onApply(proposal)}><ClipboardPlus size={16} />{applying ? 'Preparing workout…' : 'Use this workout'}</button>}</article>;
}
