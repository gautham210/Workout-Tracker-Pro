import { useCallback, useEffect, useRef, useState } from 'react';
import { getExerciseCatalog } from './trainingData';

function useDebounced(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Loads the whole catalogue once (so muscle-group chips reflect every row) and runs a debounced
 * server search for non-empty queries. Superseded searches are aborted and their responses ignored.
 */
export function useExerciseCatalog(query, enabled = true) {
  const [all, setAll] = useState(null);
  const [allError, setAllError] = useState(false);
  const [found, setFound] = useState({ q: '', rows: null, failed: false });
  const debounced = useDebounced(query, 250);
  const search = debounced.trim();

  useEffect(() => {
    if (!enabled || all !== null) return undefined;
    const controller = new AbortController();
    getExerciseCatalog('', { signal: controller.signal })
      .then((rows) => { if (!controller.signal.aborted) { setAll(rows); setAllError(false); } })
      .catch(() => { if (!controller.signal.aborted) setAllError(true); });
    return () => controller.abort();
  }, [enabled, all]);

  useEffect(() => {
    if (!enabled || !search) return undefined;
    const controller = new AbortController();
    getExerciseCatalog(search, { signal: controller.signal })
      .then((rows) => { if (!controller.signal.aborted) setFound({ q: search, rows, failed: false }); })
      .catch(() => { if (!controller.signal.aborted) setFound({ q: search, rows: null, failed: true }); });
    return () => controller.abort();
  }, [enabled, search]);

  const searching = Boolean(query.trim());
  const settled = searching && search === query.trim() && found.q === search;
  const rows = !searching ? all : (settled ? found.rows : null);
  const failed = searching ? (settled && found.failed) : allError && all === null;
  const retry = useCallback(() => { setAllError(false); setAll(null); }, []);
  return { all: all || [], rows: rows || [], loading: !failed && rows === null, failed, retry };
}

/** Renders `step` items at a time; attach `sentinelRef` to an element after the list. */
export function useIncrementalList(items, step = 24) {
  const [state, setState] = useState({ items, count: step });
  const count = state.items === items ? state.count : step;
  const observer = useRef(null);
  const more = useCallback(() => setState((current) => ({ items, count: (current.items === items ? current.count : step) + step })), [items, step]);
  const sentinelRef = useCallback((node) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    observer.current = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) more(); }, { rootMargin: '320px' });
    observer.current.observe(node);
  }, [more]);
  useEffect(() => () => observer.current?.disconnect(), []);
  return { visible: items.slice(0, count), hasMore: count < items.length, remaining: Math.max(0, items.length - count), more, sentinelRef };
}
