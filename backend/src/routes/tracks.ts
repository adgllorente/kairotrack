import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/index.js';
import type { Track } from '../db/index.js';

export const tracksRouter = new Hono();

const startSchema = z.object({
  project_id: z.number().int().positive(),
  task_id: z.number().int().positive().nullable().optional(),
  note: z.string().max(1000).optional(),
});

const manualSchema = z.object({
  project_id: z.number().int().positive(),
  task_id: z.number().int().positive().nullable().optional(),
  note: z.string().max(1000).optional(),
  started_at: z.number().int().positive(),
  ended_at: z.number().int().positive(),
});

const updateSchema = z.object({
  project_id: z.number().int().positive().optional(),
  task_id: z.number().int().positive().nullable().optional(),
  note: z.string().max(1000).optional(),
  started_at: z.number().int().positive().optional(),
  ended_at: z.number().int().positive().nullable().optional(),
});

tracksRouter.get('/', (c) => {
  const from = c.req.query('from');
  const to = c.req.query('to');
  const projectId = c.req.query('project_id');
  const taskId = c.req.query('task_id');
  const limit = Math.min(Number(c.req.query('limit') || 500), 5000);

  const where: string[] = [];
  const params: (string | number)[] = [];
  if (from) {
    where.push('started_at >= ?');
    params.push(Number(from));
  }
  if (to) {
    where.push('started_at < ?');
    params.push(Number(to));
  }
  if (projectId) {
    where.push('project_id = ?');
    params.push(Number(projectId));
  }
  if (taskId) {
    where.push('task_id = ?');
    params.push(Number(taskId));
  }
  const sql = `SELECT * FROM tracks ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY started_at DESC LIMIT ?`;
  params.push(limit);
  const rows = db.prepare(sql).all(...params) as Track[];
  return c.json(rows);
});

tracksRouter.get('/active', (c) => {
  const row = db.prepare('SELECT * FROM tracks WHERE ended_at IS NULL').get() as Track | undefined;
  return c.json(row || null);
});

tracksRouter.post('/start', zValidator('json', startSchema), (c) => {
  const { project_id, task_id, note } = c.req.valid('json');
  const now = Math.floor(Date.now() / 1000);
  const tx = db.transaction(() => {
    const active = db.prepare('SELECT id FROM tracks WHERE ended_at IS NULL').get() as
      | { id: number }
      | undefined;
    if (active) {
      db.prepare('UPDATE tracks SET ended_at = ?, updated_at = ? WHERE id = ?').run(
        now,
        now,
        active.id,
      );
    }
    const result = db
      .prepare(
        'INSERT INTO tracks (project_id, task_id, note, started_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(project_id, task_id ?? null, note ?? '', now, now);
    return result.lastInsertRowid;
  });
  const id = tx();
  const row = db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as Track;
  return c.json(row, 201);
});

tracksRouter.post('/stop', (c) => {
  const now = Math.floor(Date.now() / 1000);
  const active = db.prepare('SELECT * FROM tracks WHERE ended_at IS NULL').get() as
    | Track
    | undefined;
  if (!active) return c.json({ error: 'no_active_track' }, 404);
  db.prepare('UPDATE tracks SET ended_at = ?, updated_at = ? WHERE id = ?').run(
    now,
    now,
    active.id,
  );
  const row = db.prepare('SELECT * FROM tracks WHERE id = ?').get(active.id) as Track;
  return c.json(row);
});

tracksRouter.post('/', zValidator('json', manualSchema), (c) => {
  const data = c.req.valid('json');
  if (data.ended_at <= data.started_at) {
    return c.json({ error: 'ended_at must be > started_at' }, 400);
  }
  const now = Math.floor(Date.now() / 1000);
  const result = db
    .prepare(
      'INSERT INTO tracks (project_id, task_id, note, started_at, ended_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(
      data.project_id,
      data.task_id ?? null,
      data.note ?? '',
      data.started_at,
      data.ended_at,
      now,
    );
  const row = db.prepare('SELECT * FROM tracks WHERE id = ?').get(result.lastInsertRowid) as Track;
  return c.json(row, 201);
});

tracksRouter.patch('/:id', zValidator('json', updateSchema), (c) => {
  const id = Number(c.req.param('id'));
  const data = c.req.valid('json');
  const existing = db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as Track | undefined;
  if (!existing) return c.json({ error: 'not_found' }, 404);

  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  for (const k of ['project_id', 'task_id', 'note', 'started_at', 'ended_at'] as const) {
    if (data[k] !== undefined) {
      fields.push(`${k} = ?`);
      values.push(data[k] as string | number | null);
    }
  }
  if (fields.length === 0) return c.json(existing);
  fields.push('updated_at = ?');
  values.push(Math.floor(Date.now() / 1000));
  values.push(id);
  db.prepare(`UPDATE tracks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  const row = db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as Track;
  return c.json(row);
});

tracksRouter.delete('/:id', (c) => {
  const id = Number(c.req.param('id'));
  db.prepare('DELETE FROM tracks WHERE id = ?').run(id);
  return c.json({ ok: true });
});
