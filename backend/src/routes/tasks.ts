import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/index.js';
import type { Task } from '../db/index.js';

export const tasksRouter = new Hono();

const createSchema = z.object({
  project_id: z.number().int().positive(),
  name: z.string().min(1).max(200),
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  archived: z.boolean().optional(),
});

tasksRouter.get('/', (c) => {
  const projectId = c.req.query('project_id');
  const includeArchived = c.req.query('archived') === 'true';
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (projectId) {
    where.push('project_id = ?');
    params.push(Number(projectId));
  }
  if (!includeArchived) where.push('archived_at IS NULL');
  const sql = `SELECT * FROM tasks ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY name`;
  const rows = db.prepare(sql).all(...params) as Task[];
  return c.json(rows);
});

tasksRouter.post('/', zValidator('json', createSchema), (c) => {
  const { project_id, name } = c.req.valid('json');
  const result = db
    .prepare('INSERT INTO tasks (project_id, name) VALUES (?, ?)')
    .run(project_id, name);
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid) as Task;
  return c.json(row, 201);
});

tasksRouter.patch('/:id', zValidator('json', updateSchema), (c) => {
  const id = Number(c.req.param('id'));
  const data = c.req.valid('json');
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;
  if (!existing) return c.json({ error: 'not_found' }, 404);

  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  if (data.name !== undefined) {
    fields.push('name = ?');
    values.push(data.name);
  }
  if (data.archived !== undefined) {
    fields.push('archived_at = ?');
    values.push(data.archived ? Math.floor(Date.now() / 1000) : null);
  }
  if (fields.length === 0) return c.json(existing);
  values.push(id);
  db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task;
  return c.json(row);
});

tasksRouter.delete('/:id', (c) => {
  const id = Number(c.req.param('id'));
  const usage = db.prepare('SELECT COUNT(*) as n FROM tracks WHERE task_id = ?').get(id) as {
    n: number;
  };
  if (usage.n > 0) {
    db.prepare('UPDATE tasks SET archived_at = unixepoch() WHERE id = ?').run(id);
    return c.json({ ok: true, archived: true });
  }
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  return c.json({ ok: true });
});
