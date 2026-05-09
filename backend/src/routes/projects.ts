import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/index.js';
import type { Project } from '../db/index.js';

export const projectsRouter = new Hono();

const createSchema = z.object({
  name: z.string().min(1).max(100),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  archived: z.boolean().optional(),
});

projectsRouter.get('/', (c) => {
  const includeArchived = c.req.query('archived') === 'true';
  const rows = db
    .prepare(
      `SELECT * FROM projects ${includeArchived ? '' : 'WHERE archived_at IS NULL'} ORDER BY name`,
    )
    .all() as Project[];
  return c.json(rows);
});

projectsRouter.post('/', zValidator('json', createSchema), (c) => {
  const { name, color } = c.req.valid('json');
  const result = db
    .prepare('INSERT INTO projects (name, color) VALUES (?, ?)')
    .run(name, color || '#6366f1');
  const row = db
    .prepare('SELECT * FROM projects WHERE id = ?')
    .get(result.lastInsertRowid) as Project;
  return c.json(row, 201);
});

projectsRouter.patch('/:id', zValidator('json', updateSchema), (c) => {
  const id = Number(c.req.param('id'));
  const data = c.req.valid('json');
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined;
  if (!existing) return c.json({ error: 'not_found' }, 404);

  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  if (data.name !== undefined) {
    fields.push('name = ?');
    values.push(data.name);
  }
  if (data.color !== undefined) {
    fields.push('color = ?');
    values.push(data.color);
  }
  if (data.archived !== undefined) {
    fields.push('archived_at = ?');
    values.push(data.archived ? Math.floor(Date.now() / 1000) : null);
  }
  if (fields.length === 0) return c.json(existing);
  values.push(id);
  db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project;
  return c.json(row);
});

projectsRouter.delete('/:id', (c) => {
  const id = Number(c.req.param('id'));
  const usage = db.prepare('SELECT COUNT(*) as n FROM tracks WHERE project_id = ?').get(id) as {
    n: number;
  };
  if (usage.n > 0) {
    db.prepare('UPDATE projects SET archived_at = unixepoch() WHERE id = ?').run(id);
    return c.json({ ok: true, archived: true });
  }
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  return c.json({ ok: true });
});
