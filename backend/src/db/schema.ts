export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#6366f1',
  archived_at INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  archived_at INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);

CREATE TABLE IF NOT EXISTS tracks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  task_id     INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  note        TEXT NOT NULL DEFAULT '',
  started_at  INTEGER NOT NULL,
  ended_at    INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (ended_at IS NULL OR ended_at > started_at)
);
CREATE INDEX IF NOT EXISTS idx_tracks_started ON tracks(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracks_project ON tracks(project_id);
CREATE INDEX IF NOT EXISTS idx_tracks_task ON tracks(task_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tracks_active ON tracks(ended_at) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS api_keys (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  label         TEXT NOT NULL,
  prefix        TEXT NOT NULL,
  hash          TEXT NOT NULL,
  last_used_at  INTEGER,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  revoked_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_apikeys_prefix ON api_keys(prefix);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
