import { findCatalogExercise, normalizeExerciseName } from '../../shared/exerciseCatalog.js';

const normalise = normalizeExerciseName;

// "Presses" -> "press", "Lunges" -> "lunge", "Flies" -> "fly"; "press" and "glass" stay as they are.
const singular = (token) => {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (/(ss|sh|ch|x)es$/.test(token)) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
};

const exerciseTokens = (value) => normalise(value)
  .replace(/\bdumbbells?\b/g, 'db')
  .replace(/\bbarbells?\b/g, 'bb')
  .split(' ').filter(Boolean).map(singular);

const canonicalLabel = (value) => exerciseTokens(value).join(' ');

const aliasList = (exercise) => (Array.isArray(exercise?.aliases) ? exercise.aliases : []);

/**
 * Resolves a suggested/imported exercise name to a single catalog row, or null.
 * Order: exact name, exact alias (the row's own aliases, then the shared catalogue's
 * aliases mapped back to the row), then an unambiguous token-subset match that
 * understands DB/BB shorthand and plurals. Ambiguity returns null.
 */
export function matchCatalogExercise(name, catalog) {
  const target = exerciseTokens(name);
  if (!target.length || !Array.isArray(catalog)) return null;
  const label = target.join(' ');
  const rows = catalog.filter((row) => row && typeof row === 'object');

  const exact = rows.find((row) => normalise(row.name) === normalise(name)) || rows.find((row) => canonicalLabel(row.name) === label);
  if (exact) return exact;

  const own = rows.filter((row) => aliasList(row).some((alias) => canonicalLabel(alias) === label));
  if (own.length === 1) return own[0];

  const shared = findCatalogExercise(name);
  if (shared) {
    const exactLabel = [shared.name, ...shared.aliases].some((value) => canonicalLabel(value) === label);
    if (exactLabel) {
      const byKey = rows.find((row) => row.slug === shared.key || row.catalog_key === shared.key);
      const mapped = byKey || rows.find((row) => canonicalLabel(row.name) === canonicalLabel(shared.name));
      if (mapped) return mapped;
    }
  }

  if (target.length < 2) return null;
  const candidates = rows.filter((row) => {
    const tokens = exerciseTokens(row.name);
    return target.every((token) => tokens.includes(token));
  });
  return candidates.length === 1 ? candidates[0] : null;
}

/**
 * Resolves a coach plan's exercises. `exerciseId` (set by the server) wins, then alias-aware matching.
 * Never drops silently: every entry lands in `resolved` or `unmatched`.
 */
export function resolvePlanExercises(entries, catalog) {
  const resolved = [];
  const unmatched = [];
  const rows = Array.isArray(catalog) ? catalog : [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || typeof entry.name !== 'string' || !entry.name.trim()) continue;
    let exercise = null;
    if (entry.exerciseId) exercise = rows.find((row) => row?.id === entry.exerciseId) || { id: entry.exerciseId, name: entry.name };
    if (!exercise) exercise = matchCatalogExercise(entry.name, rows);
    if (exercise) resolved.push({ entry, exercise });
    else unmatched.push(entry.name.trim());
  }
  return { resolved, unmatched };
}

/** All names the user should be told about: the server's list plus anything unresolved locally. */
export function collectUnmatched(plan, localUnmatched = []) {
  const seen = new Set();
  return [...(Array.isArray(plan?.unmatched) ? plan.unmatched : []), ...(Array.isArray(plan?.unmatchedExercises) ? plan.unmatchedExercises : []), ...localUnmatched]
    .filter((value) => typeof value === 'string' && value.trim())
    .filter((value) => { const key = normalise(value); if (seen.has(key)) return false; seen.add(key); return true; });
}
