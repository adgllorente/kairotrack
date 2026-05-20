import { Hono } from 'hono';
import { db } from '../db/index.js';

export const importRouter = new Hono();

type ImportRow = {
  project_name?: unknown;
  project_color?: unknown;
  task_name?: unknown;
  note?: unknown;
  started_at?: unknown;
  ended_at?: unknown;
  started_at_iso?: unknown;
  ended_at_iso?: unknown;
};

function toSeconds(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.floor(v);
  if (typeof v === 'string' && v.trim()) {
    const ms = Date.parse(v);
    if (!Number.isNaN(ms)) return Math.floor(ms / 1000);
  }
  return null;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

importRouter.post('/', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }
  const rows: ImportRow[] = Array.isArray(body)
    ? (body as ImportRow[])
    : Array.isArray((body as { tracks?: unknown })?.tracks)
      ? ((body as { tracks: ImportRow[] }).tracks)
      : [];
  if (rows.length === 0) return c.json({ error: 'no_tracks' }, 400);

  const getProject = db.prepare('SELECT id FROM projects WHERE name = ?');
  const insertProject = db.prepare('INSERT INTO projects (name, color) VALUES (?, ?)');
  const getTask = db.prepare('SELECT id FROM tasks WHERE project_id = ? AND name = ?');
  const insertTask = db.prepare('INSERT INTO tasks (project_id, name) VALUES (?, ?)');
  const dupTrack = db.prepare(
    'SELECT 1 FROM tracks WHERE project_id = ? AND started_at = ? AND COALESCE(ended_at, -1) = COALESCE(?, -1)',
  );
  const insertTrack = db.prepare(
    'INSERT INTO tracks (project_id, task_id, note, started_at, ended_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  );

  let imported = 0;
  let skipped = 0;
  let projectsCreated = 0;
  let tasksCreated = 0;
  const errors: string[] = [];

  const tx = db.transaction(() => {
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const projectName = asString(r.project_name).trim();
      if (!projectName) {
        skipped++;
        if (errors.length < 5) errors.push(`row ${i}: missing project_name`);
        continue;
      }
      const started = toSeconds(r.started_at) ?? toSeconds(r.started_at_iso);
      const ended = toSeconds(r.ended_at) ?? toSeconds(r.ended_at_iso);
      if (!started || !ended) {
        skipped++;
        if (errors.length < 5) errors.push(`row ${i}: missing or invalid times`);
        continue;
      }
      if (ended <= started) {
        skipped++;
        if (errors.length < 5) errors.push(`row ${i}: ended_at <= started_at`);
        continue;
      }

      let proj = getProject.get(projectName) as { id: number } | undefined;
      if (!proj) {
        const color = asString(r.project_color) || '#6366f1';
        const res = insertProject.run(projectName, color);
        proj = { id: Number(res.lastInsertRowid) };
        projectsCreated++;
      }

      let taskId: number | null = null;
      const taskName = asString(r.task_name).trim();
      if (taskName) {
        const t = getTask.get(proj.id, taskName) as { id: number } | undefined;
        if (t) {
          taskId = t.id;
        } else {
          const res = insertTask.run(proj.id, taskName);
          taskId = Number(res.lastInsertRowid);
          tasksCreated++;
        }
      }

      if (dupTrack.get(proj.id, started, ended)) {
        skipped++;
        continue;
      }

      insertTrack.run(proj.id, taskId, asString(r.note), started, ended, now);
      imported++;
    }
  });

  try {
    tx();
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'import_failed' }, 400);
  }

  return c.json({
    imported,
    skipped,
    projects_created: projectsCreated,
    tasks_created: tasksCreated,
    errors,
  });
});
