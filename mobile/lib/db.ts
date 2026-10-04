import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';
import { isOfflineError } from './api';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let initPromise: Promise<void> | null = null;

export type LocalExercise = {
  id: string; name: string; muscle_group?: string | null; description?: string | null;
  slug?: string | null; movement_pattern?: string | null;
  equipment?: string[] | string | null; primary_muscles?: string[] | string | null; difficulty?: string | null;
};
export type CachedExercise = {
  id: string; name: string; muscle_group: string | null; description: string | null;
  slug: string | null; movement_pattern: string | null; equipment: string[]; primary_muscles: string[]; difficulty: string | null;
};
export type SessionSyncState = 'local_only' | 'syncing' | 'synced' | 'retrying' | 'failed';
export type LocalSet = {
  id: string; set_number: number; weight_kg: number | null; reps: number | null; completed: number;
  rpe: number | null; rir: number | null; is_warmup: number; notes: string | null;
};
export type LocalSessionExercise = {
  id: string; exercise_id: string; name: string; muscle_group: string | null; order_index: number;
  notes: string | null; rest_seconds: number | null; sets: LocalSet[];
};
export type LocalSession = {
  id: string; user_id: string; date: string; split_type: string | null; split_day: string | null; notes: string | null;
  title: string | null; duration_minutes: number | null; is_finished: number; created_at: string;
  sync_state: SessionSyncState; exercises: LocalSessionExercise[];
};

/** Outbox row ids currently being sent (maintained by sync.ts) so session state can read 'syncing'. */
export const inFlightOutboxIds = new Set<string>();

/** Opens the database. A rejected open is never cached so callers can retry. */
export const getDb = async () => {
  if (!dbPromise) {
    const attempt = (async () => {
      const db = await SQLite.openDatabaseAsync('workout_tracker.db');
      await db.execAsync('PRAGMA foreign_keys = ON;');
      return db;
    })();
    dbPromise = attempt;
    attempt.catch(() => { if (dbPromise === attempt) dbPromise = null; });
  }
  return dbPromise;
};

async function hasColumn(db: SQLite.SQLiteDatabase, table: string, column: string) {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return columns.some((entry) => entry.name === column);
}

async function addColumnIfMissing(db: SQLite.SQLiteDatabase, table: string, definition: string) {
  const column = definition.trim().split(/\s+/)[0];
  if (!(await hasColumn(db, table, column))) await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

const CREATE_V1 = `
  CREATE TABLE IF NOT EXISTS workout_sessions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, date TEXT NOT NULL,
    split_type TEXT, split_day TEXT, notes TEXT, duration_minutes INTEGER,
    is_finished INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS exercises (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, muscle_group TEXT, description TEXT, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS session_exercises (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, exercise_id TEXT NOT NULL, order_index INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT
  );
  CREATE TABLE IF NOT EXISTS sets (
    id TEXT PRIMARY KEY, session_exercise_id TEXT NOT NULL, set_number INTEGER NOT NULL DEFAULT 1,
    weight_kg REAL, reps INTEGER, completed INTEGER NOT NULL DEFAULT 0, rpe INTEGER, rir INTEGER,
    FOREIGN KEY(session_exercise_id) REFERENCES session_exercises(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS sync_outbox (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, operation TEXT NOT NULL, payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT,
    next_attempt_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
`;

async function migrateV2(db: SQLite.SQLiteDatabase) {
  // Upgrade databases created by the unversioned implementation without loss.
  await addColumnIfMissing(db, 'workout_sessions', 'split_type TEXT');
  await addColumnIfMissing(db, 'workout_sessions', 'split_day TEXT');
  await addColumnIfMissing(db, 'workout_sessions', 'notes TEXT');
  await addColumnIfMissing(db, 'workout_sessions', 'duration_minutes INTEGER');
  await addColumnIfMissing(db, 'workout_sessions', 'created_at TEXT');
  await addColumnIfMissing(db, 'workout_sessions', 'updated_at TEXT');
  if (await hasColumn(db, 'workout_sessions', 'split')) await db.execAsync('UPDATE workout_sessions SET split_day = COALESCE(split_day, split) WHERE split_day IS NULL');
  if (await hasColumn(db, 'workout_sessions', 'duration')) await db.execAsync('UPDATE workout_sessions SET duration_minutes = COALESCE(duration_minutes, duration) WHERE duration_minutes IS NULL');
  await db.execAsync("UPDATE workout_sessions SET created_at = COALESCE(created_at, date, datetime('now')), updated_at = COALESCE(updated_at, date, datetime('now'))");
  await addColumnIfMissing(db, 'session_exercises', 'order_index INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'sets', 'set_number INTEGER NOT NULL DEFAULT 1');
  await addColumnIfMissing(db, 'sync_outbox', 'user_id TEXT');
  await addColumnIfMissing(db, 'sync_outbox', 'attempts INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'sync_outbox', 'last_error TEXT');
  await addColumnIfMissing(db, 'sync_outbox', 'next_attempt_at TEXT');
  await addColumnIfMissing(db, 'sync_outbox', 'updated_at TEXT');
  await db.execAsync("UPDATE sync_outbox SET updated_at = COALESCE(updated_at, created_at, datetime('now'))");
  if (await hasColumn(db, 'sync_outbox', 'table_name')) {
    await db.execAsync(`UPDATE sync_outbox
      SET user_id = COALESCE(user_id, (SELECT ws.user_id FROM workout_sessions ws WHERE ws.id = json_extract(payload, '$.id')))
      WHERE user_id IS NULL AND table_name = 'workout_sessions'`);
  }
  await db.execAsync(`CREATE INDEX IF NOT EXISTS workout_sessions_user_state_date_idx ON workout_sessions(user_id, is_finished, date DESC);
    CREATE INDEX IF NOT EXISTS session_exercises_session_order_idx ON session_exercises(session_id, order_index);
    CREATE INDEX IF NOT EXISTS sets_session_exercise_number_idx ON sets(session_exercise_id, set_number);
    CREATE INDEX IF NOT EXISTS sync_outbox_user_status_next_idx ON sync_outbox(user_id, status, next_attempt_at, created_at);`);
}

async function migrateV3(db: SQLite.SQLiteDatabase) {
  await addColumnIfMissing(db, 'sets', 'is_warmup INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'sets', 'notes TEXT');
  await addColumnIfMissing(db, 'session_exercises', 'notes TEXT');
  await addColumnIfMissing(db, 'session_exercises', 'rest_seconds INTEGER');
  await addColumnIfMissing(db, 'workout_sessions', 'title TEXT');
  for (const def of ['slug TEXT', 'movement_pattern TEXT', 'equipment TEXT', 'primary_muscles TEXT', 'difficulty TEXT']) {
    await addColumnIfMissing(db, 'exercises', def);
  }
  await db.execAsync('CREATE INDEX IF NOT EXISTS exercises_name_nocase_idx ON exercises(name COLLATE NOCASE);');
}

const MIGRATIONS: Array<{ version: number; run: (db: SQLite.SQLiteDatabase) => Promise<void> }> = [
  { version: 1, run: (db) => db.execAsync(CREATE_V1) },
  { version: 2, run: migrateV2 },
  { version: 3, run: migrateV3 },
];

/** Versioned local schema. Each migration runs in its own transaction gated by PRAGMA user_version. Safe to call repeatedly. */
export const initDb = (): Promise<void> => {
  if (!initPromise) {
    const attempt = (async () => {
      const db = await getDb();
      const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      let version = row?.user_version ?? 0;
      for (const migration of MIGRATIONS) {
        if (version >= migration.version) continue;
        await db.withTransactionAsync(async () => {
          await migration.run(db);
          await db.execAsync(`PRAGMA user_version = ${migration.version}`);
        });
        version = migration.version;
      }
    })();
    initPromise = attempt;
    attempt.catch(() => { if (initPromise === attempt) initPromise = null; });
  }
  return initPromise;
};

export const generateUUID = () => Crypto.randomUUID();

const toJsonText = (value: string[] | string | null | undefined) =>
  value == null ? null : typeof value === 'string' ? value : JSON.stringify(value);

const parseJsonList = (value: string | null): string[] => {
  if (!value) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; }
};

export async function upsertLocalExercises(exercises: LocalExercise[]) {
  const valid = exercises.filter((exercise) => exercise.id && exercise.name);
  if (!valid.length) return;
  const db = await getDb();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (const exercise of valid) {
      await db.runAsync(
        `INSERT INTO exercises (id, name, muscle_group, description, slug, movement_pattern, equipment, primary_muscles, difficulty, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, muscle_group = excluded.muscle_group, description = excluded.description,
           slug = COALESCE(excluded.slug, exercises.slug), movement_pattern = COALESCE(excluded.movement_pattern, exercises.movement_pattern),
           equipment = COALESCE(excluded.equipment, exercises.equipment), primary_muscles = COALESCE(excluded.primary_muscles, exercises.primary_muscles),
           difficulty = COALESCE(excluded.difficulty, exercises.difficulty), updated_at = excluded.updated_at`,
        [exercise.id, exercise.name.slice(0, 200), exercise.muscle_group ?? null, exercise.description ?? null, exercise.slug ?? null,
          exercise.movement_pattern ?? null, toJsonText(exercise.equipment), toJsonText(exercise.primary_muscles), exercise.difficulty ?? null, now],
      );
    }
  });
}

/** Alias for offline catalog caching. */
export const cacheExercises = upsertLocalExercises;

export async function listCachedExercises(query = '', limit = 200): Promise<CachedExercise[]> {
  const db = await getDb();
  const term = query.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  const like = `%${term}%`;
  const rows = await db.getAllAsync<Record<string, any>>(
    `SELECT id, name, muscle_group, description, slug, movement_pattern, equipment, primary_muscles, difficulty FROM exercises
     WHERE (? = '' OR name LIKE ? ESCAPE '\\' OR muscle_group LIKE ? ESCAPE '\\')
     ORDER BY name COLLATE NOCASE LIMIT ?`,
    [term, like, like, Math.max(1, Math.min(limit, 2000))],
  );
  return rows.map((row) => ({ ...row, equipment: parseJsonList(row.equipment), primary_muscles: parseJsonList(row.primary_muscles) }) as CachedExercise);
}

const FULL_CATALOG_COLUMNS = 'id,name,muscle_group,description,slug,movement_pattern,equipment,primary_muscles,difficulty';
const BASIC_CATALOG_COLUMNS = 'id,name,muscle_group,description';

/** Fetches the full exercise catalog from Supabase and caches it; falls back to the local cache when offline. */
export async function fetchAndCacheCatalog(): Promise<{ exercises: CachedExercise[]; source: 'remote' | 'cache'; error?: string }> {
  try {
    let result: { data: unknown[] | null; error: { message: string } | null } =
      await supabase.from('exercises').select(FULL_CATALOG_COLUMNS).order('name').limit(2000);
    if (result.error && /column|schema cache|does not exist/i.test(result.error.message)) {
      result = await supabase.from('exercises').select(BASIC_CATALOG_COLUMNS).order('name').limit(2000);
    }
    if (result.error) throw result.error;
    await upsertLocalExercises((result.data ?? []) as LocalExercise[]);
    return { exercises: await listCachedExercises('', 2000), source: 'remote' };
  } catch (error) {
    const message = String((error as { message?: string })?.message ?? error);
    const exercises = await listCachedExercises('', 2000);
    if (!isOfflineError(error) && !exercises.length) throw error;
    return { exercises, source: 'cache', error: message };
  }
}

/** Number of workouts for this user not yet confirmed by the server. */
export async function getUnsyncedCount(userId: string): Promise<number> {
  if (!userId) return 0;
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM sync_outbox WHERE user_id = ? AND status != 'synced'", [userId]);
  return row?.n ?? 0;
}

function deriveSyncState(outbox: { status: string; attempts: number } | undefined, id: string): SessionSyncState {
  if (!outbox) return 'local_only';
  if (outbox.status === 'synced') return 'synced';
  if (inFlightOutboxIds.has(id)) return 'syncing';
  if (outbox.status === 'failed') return 'failed';
  return outbox.attempts > 0 ? 'retrying' : 'local_only';
}

const placeholders = (n: number) => Array(n).fill('?').join(',');

async function hydrateSessions(db: SQLite.SQLiteDatabase, userId: string, sessions: Omit<LocalSession, 'sync_state' | 'exercises'>[]): Promise<LocalSession[]> {
  if (!sessions.length) return [];
  const ids = sessions.map((s) => s.id);
  const outboxRows = await db.getAllAsync<{ id: string; status: string; attempts: number }>(
    `SELECT id, status, attempts FROM sync_outbox WHERE user_id = ? AND id IN (${placeholders(ids.length)})`, [userId, ...ids.map((id) => `workout:${id}`)]);
  const outboxById = new Map(outboxRows.map((r) => [r.id, r]));
  const exerciseRows = await db.getAllAsync<any>(
    `SELECT se.id, se.session_id, se.exercise_id, se.order_index, se.notes, se.rest_seconds, e.name, e.muscle_group
     FROM session_exercises se LEFT JOIN exercises e ON e.id = se.exercise_id
     WHERE se.session_id IN (${placeholders(ids.length)}) ORDER BY se.session_id, se.order_index`, ids);
  const seIds = exerciseRows.map((r) => r.id);
  const setRows = seIds.length ? await db.getAllAsync<any>(
    `SELECT id, session_exercise_id, set_number, weight_kg, reps, completed, rpe, rir, COALESCE(is_warmup, 0) AS is_warmup, notes
     FROM sets WHERE session_exercise_id IN (${placeholders(seIds.length)}) ORDER BY session_exercise_id, set_number`, seIds) : [];
  const setsByExercise = new Map<string, LocalSet[]>();
  for (const row of setRows) {
    const { session_exercise_id, ...set } = row;
    if (!setsByExercise.has(session_exercise_id)) setsByExercise.set(session_exercise_id, []);
    setsByExercise.get(session_exercise_id)!.push(set as LocalSet);
  }
  const exercisesBySession = new Map<string, LocalSessionExercise[]>();
  for (const row of exerciseRows) {
    const list = exercisesBySession.get(row.session_id) ?? [];
    list.push({ id: row.id, exercise_id: row.exercise_id, name: row.name ?? 'Unknown exercise', muscle_group: row.muscle_group ?? null,
      order_index: row.order_index, notes: row.notes ?? null, rest_seconds: row.rest_seconds ?? null, sets: setsByExercise.get(row.id) ?? [] });
    exercisesBySession.set(row.session_id, list);
  }
  return sessions.map((s) => ({
    ...s,
    sync_state: deriveSyncState(outboxById.get(`workout:${s.id}`), `workout:${s.id}`),
    exercises: exercisesBySession.get(s.id) ?? [],
  }));
}

const SESSION_COLUMNS = 'id, user_id, date, split_type, split_day, notes, title, duration_minutes, is_finished, created_at';

export async function listLocalFinishedSessions(userId: string, limit = 30, offset = 0): Promise<LocalSession[]> {
  if (!userId) return [];
  const db = await getDb();
  const rows = await db.getAllAsync<Omit<LocalSession, 'sync_state' | 'exercises'>>(
    `SELECT ${SESSION_COLUMNS} FROM workout_sessions WHERE user_id = ? AND is_finished = 1 ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?`,
    [userId, Math.max(1, Math.min(limit, 200)), Math.max(0, offset)]);
  return hydrateSessions(db, userId, rows);
}

export async function getLocalSession(userId: string, id: string): Promise<LocalSession | null> {
  if (!userId || !id) return null;
  const db = await getDb();
  const rows = await db.getAllAsync<Omit<LocalSession, 'sync_state' | 'exercises'>>(
    `SELECT ${SESSION_COLUMNS} FROM workout_sessions WHERE user_id = ? AND id = ?`, [userId, id]);
  return (await hydrateSessions(db, userId, rows))[0] ?? null;
}

/** Deliberate destructive cleanup for just one account (including unfinished sessions), never every device user. */
export async function clearLocalDb(userId?: string) {
  if (!userId) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    // Explicit child deletes also cover legacy tables created without foreign keys.
    await db.runAsync('DELETE FROM sets WHERE session_exercise_id IN (SELECT se.id FROM session_exercises se JOIN workout_sessions ws ON ws.id = se.session_id WHERE ws.user_id = ?)', [userId]);
    await db.runAsync('DELETE FROM session_exercises WHERE session_id IN (SELECT id FROM workout_sessions WHERE user_id = ?)', [userId]);
    await db.runAsync('DELETE FROM workout_sessions WHERE user_id = ?', [userId]);
    await db.runAsync('DELETE FROM sync_outbox WHERE user_id = ?', [userId]);
  });
}
