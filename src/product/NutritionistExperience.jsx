import { useEffect, useRef } from 'react';
import { Apple, Bot, RotateCcw, ScanLine } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PromptBar from './react-bits/PromptBar';
import { useChatThread } from './useChatThread';

const welcome = { id: 'welcome', role: 'assistant', content: 'I can help you think through meals, macros, timing, and the assumptions behind a food scan. What are you working with today?' };
const prompts = ['Help me plan protein around today’s training', 'What should I check after a food scan?', 'How can I make this meal more balanced?'];
const extraBody = { isNutritionist: true };

export default function NutritionistExperience() {
  const { user } = useAuth();
  const end = useRef(null);
  const { messages, loading, ask, stop, reset } = useChatThread({ storageKey: user?.id ? `wtp_nutritionist_v1_${user.id}` : null, extraBody, unreadable: 'The nutritionist returned an unreadable response.' });
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length, loading]);
  const thread = [welcome, ...messages];
  return <main className="experience nutritionist-experience">
    <section className="nutritionist-hero"><div className="nutritionist-mark"><Apple size={21} /></div><p className="eyebrow">AI nutritionist</p><h1>Fuel the work.<br />Keep the nuance.</h1><p>Your messages are sent through the authenticated Coach API. Photo estimates remain ranges, not clinical measurements.</p></section>
    <div className="coach-context-rail"><Link to="/nutrition" className="nutrition-scan-bridge"><ScanLine size={18} /><span><strong>Scan a meal first</strong><small>Bring a real visual estimate into this conversation.</small></span></Link>{messages.length > 0 && <button type="button" className="chat-reset" onClick={reset}><RotateCcw size={14} /> New chat</button>}</div>
    <section className="nutritionist-thread" aria-live="polite">{thread.map((message) => <article key={message.id} className={`nutritionist-message ${message.role} ${message.error ? 'is-error' : ''}`}><span>{message.role === 'assistant' ? <><Bot size={14} /> Nutritionist</> : 'You'}</span><p>{message.content}</p>{message.error && message.retryText && <button type="button" className="text-action" onClick={() => ask(message.retryText, { retry: true })}><RotateCcw size={13} /> Try again</button>}</article>)}{loading && <article className="nutritionist-message assistant is-thinking"><Bot size={15} /><i /><i /><i /></article>}<div ref={end} /></section>
    {messages.length === 0 && <div className="nutritionist-starters">{prompts.map((prompt) => <button type="button" key={prompt} disabled={loading} onClick={() => ask(prompt)}>{prompt}</button>)}</div>}
    <PromptBar className="nutritionist-prompt" width="100%" maxRows={2} placeholder="Ask about this meal or your nutrition rhythm" sources={[]} commands={[]} models={[{ key: 'nutrition', name: 'Nutritionist', tag: 'secure' }]} defaultModel="nutrition" efforts={['Guided']} defaultEffort="Guided" busy={loading} background="rgba(20, 70, 63, .92)" color="#fbfffd" menuBackground="#1d5b52" sparkColor="#93f7d2" onSend={ask} onStop={stop} />
    {!user?.id && <div className="inline-state is-error">Sign in is required for nutrition guidance.</div>}
  </main>;
}
