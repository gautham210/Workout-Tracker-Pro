import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

// Initialize the database asynchronously
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export const getDb = async () => {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('workout_tracker.db');
  }
  return dbPromise;
};

export const initDb = async () => {
  const db = await getDb();
  
  // Enforce foreign keys
  await db.execAsync(`PRAGMA foreign_keys = ON;`);
  
  // Create tables matching Supabase
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS workout_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      date TEXT,
      duration INTEGER,
      split TEXT,
      is_finished BOOLEAN DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS session_exercises (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      exercise_id TEXT,
      FOREIGN KEY(session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sets (
      id TEXT PRIMARY KEY,
      session_exercise_id TEXT,
      weight_kg REAL,
      reps INTEGER,
      completed BOOLEAN DEFAULT 0,
      rpe INTEGER,
      rir INTEGER,
      FOREIGN KEY(session_exercise_id) REFERENCES session_exercises(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS sync_outbox (
      id TEXT PRIMARY KEY,
      table_name TEXT,
      operation TEXT,
      payload TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT
    );
  `);
};

export const generateUUID = () => Crypto.randomUUID();

export const clearLocalDb = async () => {
  const db = await getDb();
  await db.execAsync(`
    DELETE FROM sets;
    DELETE FROM session_exercises;
    DELETE FROM workout_sessions;
    DELETE FROM sync_outbox;
  `);
};
