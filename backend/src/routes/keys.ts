import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/index.js';
import type { ApiKey } from '../db/index.js';
import { generateKey } from '../lib/apikey.js';

export const keysRouter = new Hono();

const createSchema = z.object({
  label: z.string().min(1).max(100),
});

keysRouter.get('/', (c) => {
  const rows = db
    .prepare(
      'SELECT id, label, prefix, last_used_at, created_at, revoked_at FROM api_keys ORDER BY created_at DESC',
    )
    .all() as Omit<ApiKey, 'hash'>[];
  return c.json(rows);
});

keysRouter.post('/', zValidator('json', createSchema), (c) => {
  const { label } = c.req.valid('json');
  const { plain, prefix, hash } = generateKey();
  const result = db
    .prepare('INSERT INTO api_keys (label, prefix, hash) VALUES (?, ?, ?)')
    .run(label, prefix, hash);
  const row = db
    .prepare(
      'SELECT id, label, prefix, last_used_at, created_at, revoked_at FROM api_keys WHERE id = ?',
    )
    .get(result.lastInsertRowid) as Omit<ApiKey, 'hash'>;
  return c.json({ ...row, key: plain }, 201);
});

keysRouter.delete('/:id', (c) => {
  const id = Number(c.req.param('id'));
  db.prepare('UPDATE api_keys SET revoked_at = unixepoch() WHERE id = ?').run(id);
  return c.json({ ok: true });
});
