import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SCHEMA_SQL } from './schema.js';

const dbPath = process.env.DB_PATH || './data/kairotrack.db';
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');
db.exec(SCHEMA_SQL);

export type Project = {
  id: number;
  name: string;
  color: string;
  archived_at: number | null;
  created_at: number;
};

export type Task = {
  id: number;
  project_id: number;
  name: string;
  archived_at: number | null;
  created_at: number;
};

export type Track = {
  id: number;
  project_id: number;
  task_id: number | null;
  note: string;
  started_at: number;
  ended_at: number | null;
  created_at: number;
  updated_at: number;
};

export type ApiKey = {
  id: number;
  label: string;
  prefix: string;
  hash: string;
  last_used_at: number | null;
  created_at: number;
  revoked_at: number | null;
};
