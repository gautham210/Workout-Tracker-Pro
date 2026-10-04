// Pure, dependency-free training analytics. Nothing here touches the network so
// it can be unit tested under node:test. Data loading lives in analyticsData.js.

const DAY_MS = 86_400_000;
const finite = (value) => Number.isFinite(Number(value)) && value !== null && value !== '' && value !== undefined;

// ---------------------------------------------------------------- local days
const pad = (value) => String(value).padStart(2, '0');

/** YYYY-MM-DD in the viewer's local timezone (never UTC). */
export function localDayKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const todayKey = (now = new Date()) => localDayKey(now);

/** Local midnight Date for a YYYY-MM-DD key (or for a Date/timestamp). */
export function localDayStart(value = new Date()) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function addLocalDays(value, days) {
  const start = localDayStart(value);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + days, 0, 0, 0, 0);
}

/** ISO instants bounding a local calendar day: [startISO, endISO) . */
export function localDayBounds(value = new Date()) {
  const start = localDayStart(value);
  return { start: start.toISOString(), end: addLocalDays(start, 1).toISOString() };
}

/** Local day keys, newest first, covering `count` days ending at `now`. */
export function lastDayKeys(count, now = new Date()) {
  return Array.from({ length: count }, (_, index) => localDayKey(addLocalDays(now, -index)));
}

export const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const weekdayName = (value) => dayNames[localDayStart(value).getDay()];

// --------------------------------------------------------------------- sets
/** A set counts toward volume/PRs only when explicitly completed and not a warm-up. */
export const isWorkingSet = (set) => Boolean(set) && set.completed === true && !set.is_warmup && Number(set.reps) > 0 && Number(set.weight_kg) >= 0;

/** Brzycki up to 10 effective reps, Epley beyond (matches mobile/lib/progression.ts). */
export function calculateE1RM(weight, reps, rir) {
  const w = Number(weight); const r = Number(reps);
  if (!Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r <= 0) return 0;
  const rirValue = finite(rir) ? Math.max(0, Math.min(10, Number(rir))) : 0;
  const effective = Math.min(50, r + rirValue);
  const result = effective <= 10 ? w * (36 / (37 - effective)) : w * (1 + effective / 30);
  return Number.isFinite(result) && result >= 0 ? result : 0;
}

export const setVolume = (set) => (isWorkingSet(set) ? (Number(set.weight_kg) || 0) * (Number(set.reps) || 0) : 0);

export const sessionVolume = (session) => (session?.session_exercises || []).reduce(
  (total, item) => total + (item.sets || []).reduce((sum, set) => sum + setVolume(set), 0), 0,
);

export const sessionWorkingSetCount = (session) => (session?.session_exercises || []).reduce(
  (total, item) => total + (item.sets || []).filter(isWorkingSet).length, 0,
);

/** Volume of sessions that fall in the last 7 local days including today. */
export function volumeLastDays(sessions = [], days = 7, now = new Date()) {
  const keys = new Set(lastDayKeys(days, now));
  return sessions.filter((session) => keys.has(localDayKey(session.date))).reduce((total, session) => total + sessionVolume(session), 0);
}

// ------------------------------------------------------------------- streak
function normalizeRestDays(restDays) {
  return new Set((Array.isArray(restDays) ? restDays : []).map((day) => String(day).trim().toLowerCase()).flatMap((day) => {
    const full = dayNames.find((name) => name.toLowerCase() === day || name.slice(0, 3).toLowerCase() === day);
    return full ? [full.toLowerCase()] : [];
  }));
}

/**
 * Consecutive training days ending today (or yesterday: today is not "broken"
 * until it ends). A planned rest day with no workout neither breaks nor extends
 * the streak. `sessions` only needs a `date` (and optionally `is_finished`).
 */
export function computeStreak(sessions = [], { restDays = [], includeRestDays = false, now = new Date() } = {}) {
  const trained = new Set(sessions.filter((session) => session.is_finished !== false).map((session) => localDayKey(session.date)));
  if (!trained.size) return 0;
  const rest = includeRestDays ? normalizeRestDays(restDays) : new Set();
  let cursor = localDayStart(now);
  let streak = 0;
  for (let index = 0; index < 800; index += 1) {
    const key = localDayKey(cursor);
    if (trained.has(key)) streak += 1;
    else if (index === 0) { /* today still open */ }
    else if (!rest.has(dayNames[cursor.getDay()].toLowerCase())) break;
    cursor = addLocalDays(cursor, -1);
  }
  return streak;
}

export const streakOptionsFromProfile = (profile) => ({ restDays: profile?.rest_days || [], includeRestDays: Boolean(profile?.include_rest_days) });

// --------------------------------------------------------- exercise history
function exerciseEntries(sessions) {
  const entries = [];
  for (const session of sessions) {
    for (const item of session.session_exercises || []) {
      const name = item.exercises?.name;
      if (!name) continue;
      for (const set of item.sets || []) {
        if (!isWorkingSet(set) || !(Number(set.weight_kg) > 0)) continue;
        entries.push({ name, muscle: item.exercises?.muscle_group, sessionId: session.id, date: session.date, weight: Number(set.weight_kg), reps: Number(set.reps), rir: set.rir, e1rm: calculateE1RM(set.weight_kg, set.reps, set.rir) });
      }
    }
  }
  return entries;
}

/** True all-time best per exercise (by e1RM), ranked. `sessions` must be full history. */
export function computePersonalBests(sessions = [], limit = Infinity) {
  const best = new Map();
  for (const entry of exerciseEntries(sessions)) {
    const current = best.get(entry.name);
    if (!current || entry.e1rm > current.e1rm || (entry.e1rm === current.e1rm && Date.parse(entry.date) < Date.parse(current.date))) best.set(entry.name, entry);
  }
  return [...best.values()].sort((a, b) => b.e1rm - a.e1rm || a.name.localeCompare(b.name)).slice(0, limit);
}

/** Per exercise: best e1RM of each session, oldest first. */
function sessionBests(entries) {
  const byExercise = new Map();
  for (const entry of entries) {
    const sessions = byExercise.get(entry.name) || new Map();
    const key = entry.sessionId || entry.date;
    const previous = sessions.get(key);
    if (!previous || entry.e1rm > previous.best) sessions.set(key, { time: Date.parse(entry.date), best: entry.e1rm });
    byExercise.set(entry.name, sessions);
  }
  return byExercise;
}

/**
 * Same conservative heuristic as mobile: >= 4 sessions spanning >= 21 days with
 * < 2% e1RM gain between the first and last pair is a plateau; >= 2% is
 * progressing. Everything else is "insufficient" (never guessed).
 */
export function exerciseSignals(sessions = []) {
  const signals = [];
  for (const [name, perSession] of sessionBests(exerciseEntries(sessions))) {
    const ordered = [...perSession.values()].filter((item) => Number.isFinite(item.time)).sort((a, b) => a.time - b.time);
    if (ordered.length < 4) { signals.push({ name, status: 'insufficient', sessions: ordered.length }); continue; }
    const lastFour = ordered.slice(-4);
    if (lastFour[3].time - lastFour[0].time < 21 * DAY_MS) { signals.push({ name, status: 'insufficient', sessions: ordered.length }); continue; }
    const oldBest = Math.max(lastFour[0].best, lastFour[1].best);
    const recentBest = Math.max(lastFour[2].best, lastFour[3].best);
    const change = oldBest > 0 ? (recentBest - oldBest) / oldBest : 0;
    signals.push({ name, status: recentBest < oldBest * 1.02 ? 'plateau' : 'progressing', change, from: oldBest, to: recentBest, sessions: ordered.length });
  }
  return signals.sort((a, b) => a.name.localeCompare(b.name));
}

export const isPlateauing = (sessions, name) => exerciseSignals(sessions).some((signal) => signal.name === name && signal.status === 'plateau');

// ------------------------------------------------------------ weekly buckets
const mondayOf = (value) => { const day = localDayStart(value); return addLocalDays(day, -((day.getDay() + 6) % 7)); };

/** Monday-start local weeks, oldest first, always `weeks` buckets ending with the current week. */
export function weeklyBuckets(sessions = [], weeks = 8, now = new Date()) {
  const thisWeek = mondayOf(now);
  const buckets = Array.from({ length: weeks }, (_, index) => {
    const start = addLocalDays(thisWeek, -7 * (weeks - 1 - index));
    return { key: localDayKey(start), start, volume: 0, sessions: 0 };
  });
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  for (const session of sessions) {
    const bucket = byKey.get(localDayKey(mondayOf(session.date)));
    if (!bucket) continue;
    bucket.volume += sessionVolume(session); bucket.sessions += 1;
  }
  return buckets;
}

// --------------------------------------------------------------- split focus
const norm = (value) => String(value || '').trim().toLowerCase();

/**
 * Next day in the user's split after the last completed split_day. Matches
 * case-insensitively, tolerates "Day 2 - Push" style values stored by older
 * builds, and falls back to the first day when the last one is unknown.
 */
export function nextSplitDay(split, lastDay) {
  const loop = Array.isArray(split) ? split.filter(Boolean) : [];
  if (!loop.length) return null;
  const last = norm(lastDay);
  if (!last) return { title: loop[0], known: false };
  let index = loop.findIndex((day) => norm(day) === last);
  if (index < 0) index = loop.findIndex((day) => last.includes(norm(day)) || norm(day).includes(last));
  if (index < 0) return { title: loop[0], known: false };
  return { title: loop[(index + 1) % loop.length], known: true };
}

/** The most useful exercise to illustrate a session: first ordered row with a name. */
export function leadExercise(session) {
  const rows = [...(session?.session_exercises || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const row = rows.find((item) => item.exercises?.name);
  return row ? { name: row.exercises.name, muscle: row.exercises.muscle_group } : null;
}

// ---------------------------------------------------------- nutrition totals
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export function sumMeals(entries = []) {
  return entries.reduce((sum, item) => ({
    calories: sum.calories + num(item.calories), protein_g: sum.protein_g + num(item.protein_g),
    carbs_g: sum.carbs_g + num(item.carbs_g), fat_g: sum.fat_g + num(item.fat_g), fiber_g: sum.fiber_g + num(item.fiber_g),
  }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });
}

/** Group meals by local day (newest day first) with daily totals. */
export function groupMealsByDay(entries = []) {
  const days = new Map();
  for (const entry of entries) {
    const key = localDayKey(entry.logged_at);
    if (!key) continue;
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(entry);
  }
  return [...days.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([day, meals]) => ({ day, meals, totals: sumMeals(meals) }));
}

export const hasTargets = (targets) => Boolean(targets) && ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g'].some((key) => Number(targets[key]) > 0);

// ------------------------------------------------------------ profile age
/** Canonical age: explicit integer age, else derived from birth_year. */
export function profileAge(profile, now = new Date()) {
  const age = Number(profile?.age);
  if (Number.isInteger(age) && age > 0) return age;
  const birth = Number(profile?.birth_year);
  return Number.isInteger(birth) && birth > 1900 ? now.getFullYear() - birth : null;
}
