import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export type LocalExercise = { id: string; name: string; muscle_group?: string | null; description?: string | null };

export const getDb = async () => {
  if (!dbPromise) dbPromise = SQLite.openDatabaseAsync('workout_tracker.db');
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

/** Versioned, additive local schema with user-scoped records and outbox rows. */
export const initDb = async () => {
  const db = await getDb();
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = versionRow?.user_version ?? 0;

  if (version < 1) {
    await db.execAsync(`
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
    `);
  }

  // Migrate databases created by the unversioned implementation without loss.
  await addColumnIfMissing(db, 'workout_sessions', 'split_type TEXT');
  await addColumnIfMissing(db, 'workout_sessions', 'split_day TEXT');
  await addColumnIfMissing(db, 'workout_sessions', 'notes TEXT');
  await addColumnIfMissing(db, 'workout_sessions', 'duration_minutes INTEGER');
  await addColumnIfMissing(db, 'workout_sessions', 'created_at TEXT');
  await addColumnIfMissing(db, 'workout_sessions', 'updated_at TEXT');
  if (await hasColumn(db, 'workout_sessions', 'split')) await db.execAsync("UPDATE workout_sessions SET split_day = COALESCE(split_day, split) WHERE split_day IS NULL");
  if (await hasColumn(db, 'workout_sessions', 'duration')) await db.execAsync('UPDATE workout_sessions SET duration_minutes = COALESCE(duration_minutes, duration) WHERE duration_minutes IS NULL');
  await db.execAsync("UPDATE workout_sessions SET created_at = COALESCE(created_at, date, datetime('now')), updated_at = COALESCE(updated_at, date, datetime('now'))");

  await db.execAsync(`CREATE TABLE IF NOT EXISTS exercises (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, muscle_group TEXT, description TEXT, updated_at TEXT NOT NULL
  )`);
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
  await db.execAsync('PRAGMA user_version = 2');
};

export const generateUUID = () => Crypto.randomUUID();

export async function upsertLocalExercises(exercises: LocalExercise[]) {
  const db = await getDb();
  const now = new Date().toISOString();
  for (const exercise of exercises) {
    if (!exercise.id || !exercise.name) continue;
    await db.runAsync(
      `INSERT INTO exercises (id, name, muscle_group, description, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, muscle_group = excluded.muscle_group, description = excluded.description, updated_at = excluded.updated_at`,
      [exercise.id, exercise.name.slice(0, 200), exercise.muscle_group ?? null, exercise.description ?? null, now],
    );
  }
}

/** Deliberate destructive cleanup for just one account, never every device user. */
export async function clearLocalDb(userId?: string) {
  if (!userId) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM sync_outbox WHERE user_id = ?', [userId]);
    await db.runAsync('DELETE FROM workout_sessions WHERE user_id = ?', [userId]);
  });
}
