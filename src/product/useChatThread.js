import { useCallback, useEffect, useRef, useState } from 'react';
import { authenticatedApiPost } from '../lib/api';

const MAX_STORED = 40;
const MAX_SENT = 12;
let counter = 0;
const messageId = () => `m${Date.now().toString(36)}${(counter += 1)}`;

function load(key) {
  if (!key) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && !m.error) : [];
  } catch { return []; }
}

function persist(key, messages) {
  if (!key) return;
  try {
    const keep = messages.filter((m) => !m.error).slice(-MAX_STORED);
    if (keep.length) localStorage.setItem(key, JSON.stringify(keep)); else localStorage.removeItem(key);
  } catch { /* history is a convenience; storage may be full or blocked */ }
}

/**
 * Shared conversation state for Coach and Nutritionist. The greeting is not stored; error bubbles
 * are shown in the thread but never persisted or sent to the model.
 */
export function useChatThread({ storageKey, extraBody, mapReply, timeoutMs = 25_000, unreadable = 'The assistant returned an unreadable response.' }) {
  const [messages, setMessages] = useState(() => load(storageKey));
  const [loading, setLoading] = useState(false);
  const controller = useRef(null);
  const loadedKey = useRef(storageKey);
  const latest = useRef(messages);
  latest.current = messages;

  useEffect(() => {
    if (loadedKey.current === storageKey) return;
    loadedKey.current = storageKey;
    controller.current?.abort();
    queueMicrotask(() => { setMessages(load(storageKey)); setLoading(false); });
  }, [storageKey]);

  useEffect(() => { if (loadedKey.current === storageKey) persist(storageKey, messages); }, [messages, storageKey]);
  useEffect(() => () => controller.current?.abort(), []);

  const ask = useCallback(async (value, { retry = false } = {}) => {
    const content = String(value || '').trim();
    if (!content || controller.current) return false;
    const base = latest.current.filter((m) => !m.error);
    const outgoing = retry ? base : [...base, { id: messageId(), role: 'user', content }];
    setMessages(outgoing);
    setLoading(true);
    const request = new AbortController();
    controller.current = request;
    const timer = window.setTimeout(() => request.abort(), timeoutMs);
    try {
      const payload = outgoing.slice(-MAX_SENT).map(({ role, content: text }) => ({ role, content: text }));
      const result = await authenticatedApiPost('/api/ai-chat', { messages: payload, ...(extraBody || {}) }, { signal: request.signal });
      if (!result?.text || typeof result.text !== 'string') throw new Error(unreadable);
      setMessages((previous) => [...previous.filter((m) => !m.error), { id: messageId(), role: 'assistant', content: result.text, ...(mapReply ? mapReply(result) : {}) }]);
    } catch (error) {
      if (controller.current !== request || request.userStopped) return false;
      const timedOut = error?.name === 'AbortError';
      setMessages((previous) => [...previous.filter((m) => !m.error), { id: messageId(), role: 'assistant', error: true, retryText: content, content: timedOut ? 'That took longer than expected. Nothing was lost; try again.' : (error?.message || 'The assistant is temporarily unavailable.') }]);
    } finally {
      window.clearTimeout(timer);
      if (controller.current === request) { controller.current = null; setLoading(false); }
    }
    return true;
  }, [extraBody, mapReply, timeoutMs, unreadable]);

  const stop = useCallback(() => {
    if (!controller.current) return;
    controller.current.userStopped = true;
    controller.current.abort();
  }, []);
  const reset = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setLoading(false);
    setMessages([]);
  }, []);

  return { messages, loading, ask, stop, reset };
}
