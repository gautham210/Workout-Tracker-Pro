const normalise = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const exerciseTokens = value => normalise(value)
  .replace(/\bdumbbell\b/g, 'db')
  .replace(/\bbarbell\b/g, 'bb')
  .split(' ').filter(Boolean);

// Coach responses are proposals, never direct commands. This resolves only a
// single unambiguous catalog match, including common DB/BB shorthand.
export function matchCatalogExercise(name, catalog) {
  const target = exerciseTokens(name);
  if (!target.length || !Array.isArray(catalog)) return null;
  const exact = catalog.find((exercise) => normalise(exercise?.name) === normalise(name));
  if (exact) return exact;
  const candidates = catalog.filter((exercise) => {
    const tokens = exerciseTokens(exercise?.name);
    return target.length >= 2 && target.every((token) => tokens.includes(token));
  });
  return candidates.length === 1 ? candidates[0] : null;
}
