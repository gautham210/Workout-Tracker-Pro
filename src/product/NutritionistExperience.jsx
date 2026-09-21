import { useEffect, useRef, useState } from 'react';
import { Apple, Bot, ScanLine } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authenticatedApiPost } from '../lib/api';
import PromptBar from './react-bits/PromptBar';

const welcome = { role: 'assistant', content: 'I can help you think through meals, macros, timing, and the assumptions behind a food scan. What are you working with today?' };
const prompts = ['Help me plan protein around today’s training', 'What should I check after a food scan?', 'How can I make this meal more balanced?'];

export default function NutritionistExperience() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([welcome]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(null);
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages]);
  const ask = async (text) => {
    const clean = String(text || '').trim();
    if (!clean || loading) return;
    const userMessage = { role: 'user', content: clean };
    setMessages((current) => [...current, userMessage]); setLoading(true); setError('');
    const controller = new AbortController(); request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const result = await authenticatedApiPost('/api/ai-chat', { messages: [...messages, { role: 'user', content: `Nutrition question: ${clean}` }].slice(-12) }, { signal: controller.signal });
      if (!result?.text) throw new Error('The nutritionist returned an unreadable response.');
      setMessages((current) => [...current, { role: 'assistant', content: result.text }]);
    } catch (cause) { setError(cause?.name === 'AbortError' ? 'The nutritionist took too long to reply. Try again.' : cause?.message || 'Nutritionist is temporarily unavailable.'); }
    finally { window.clearTimeout(timeout); request.current = null; setLoading(false); }
  };
  return <main className="experience nutritionist-experience">
    <section className="nutritionist-hero"><div className="nutritionist-mark"><Apple size={21} /></div><p className="eyebrow">AI nutritionist</p><h1>Fuel the work.<br />Keep the nuance.</h1><p>Your messages are sent through the authenticated Coach API. Photo estimates remain ranges, not clinical measurements.</p></section>
    <Link to="/nutrition" className="nutrition-scan-bridge"><ScanLine size={18} /><span><strong>Scan a meal first</strong><small>Bring a real visual estimate into this conversation.</small></span></Link>
    <section className="nutritionist-thread" aria-live="polite">{messages.map((message, index) => <article key={`${message.role}-${index}`} className={`nutritionist-message ${message.role}`}><span>{message.role === 'assistant' ? <><Bot size={14} /> Nutritionist</> : 'You'}</span><p>{message.content}</p></article>)}{loading && <article className="nutritionist-message assistant is-thinking"><Bot size={15} /><i /><i /><i /></article>}<div ref={end} /></section>
    {error && <div className="inline-state is-error">{error}</div>}
    {messages.length === 1 && <div className="nutritionist-starters">{prompts.map((prompt) => <button type="button" key={prompt} disabled={loading} onClick={() => ask(prompt)}>{prompt}</button>)}</div>}
    <PromptBar className="nutritionist-prompt" width="100%" placeholder="Ask about this meal or your nutrition rhythm" sources={[]} commands={[]} models={[{ key: 'nutrition', name: 'Nutritionist', tag: 'secure' }]} defaultModel="nutrition" efforts={['Guided']} defaultEffort="Guided" busy={loading} background="rgba(20, 70, 63, .92)" color="#fbfffd" menuBackground="#1d5b52" sparkColor="#93f7d2" onSend={ask} onStop={() => request.current?.abort()} />
    {!user?.id && <div className="inline-state is-error">Sign in is required for nutrition guidance.</div>}
  </main>;
}
