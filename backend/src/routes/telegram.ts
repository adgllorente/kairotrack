import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/index.js';
import type { TelegramGoal } from '../db/index.js';
import { encryptTelegramToken } from '../lib/telegram-crypto.js';
import {
  generateTelegramLinkCode,
  restartTelegram,
  stopTelegram,
  telegramStatus,
  testTelegramToken,
} from '../lib/telegram.js';

export const telegramRouter = new Hono();

const configureSchema = z.object({ token: z.string().trim().min(20).max(200) });
const dailyTargetSchema = z
  .array(
    z
      .number()
      .int()
      .positive()
      .max(24 * 60)
      .nullable(),
  )
  .length(7);
const goalSchema = z.object({
  project_id: z.number().int().positive().nullable().optional(),
  target_minutes: z
    .number()
    .int()
    .positive()
    .max(24 * 60),
  target_minutes_by_day: dailyTargetSchema.optional(),
  enabled: z.boolean().optional(),
});
const goalUpdateSchema = z.object({
  target_minutes: z
    .number()
    .int()
    .positive()
    .max(24 * 60)
    .optional(),
  target_minutes_by_day: dailyTargetSchema.optional(),
  enabled: z.boolean().optional(),
});

function readDailyTargets(): (number | null)[] | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('telegram_daily_limits') as
    | { value: string }
    | undefined;
  if (!row) return null;
  try {
    return dailyTargetSchema.parse(JSON.parse(row.value));
  } catch {
    return null;
  }
}

function writeDailyTargets(targets: (number | null)[]): void {
  db.prepare(
    `INSERT INTO meta (key, value) VALUES ('telegram_daily_limits', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(JSON.stringify(targets));
}

function goalResponse(goal: TelegramGoal) {
  const dailyTargets = goal.project_id === null ? readDailyTargets() : null;
  return {
    ...goal,
    enabled: Boolean(goal.enabled),
    target_minutes: Math.ceil(goal.target_seconds / 60),
    ...(goal.project_id === null
      ? {
          target_minutes_by_day: dailyTargets ?? Array(7).fill(Math.ceil(goal.target_seconds / 60)),
        }
      : {}),
  };
}

telegramRouter.get('/status', (c) => c.json(telegramStatus()));

telegramRouter.post('/test', zValidator('json', configureSchema), async (c) => {
  try {
    const result = await testTelegramToken(c.req.valid('json').token);
    return c.json({ ok: true, username: result.username });
  } catch {
    return c.json({ error: 'telegram_connection_failed' }, 400);
  }
});

telegramRouter.post('/configure', zValidator('json', configureSchema), async (c) => {
  const { token } = c.req.valid('json');
  try {
    const result = await testTelegramToken(token);
    db.prepare(
      `INSERT INTO telegram_config (id, token_encrypted, chat_id, bot_username, enabled, updated_at)
      VALUES (1, ?, NULL, ?, 1, unixepoch())
      ON CONFLICT(id) DO UPDATE SET token_encrypted = excluded.token_encrypted,
        chat_id = NULL, bot_username = excluded.bot_username, enabled = 1, updated_at = unixepoch()`,
    ).run(encryptTelegramToken(token), result.username);
    await restartTelegram();
    return c.json({ ok: true, username: result.username });
  } catch {
    return c.json({ error: 'telegram_connection_failed' }, 400);
  }
});

telegramRouter.delete('/config', async (c) => {
  await stopTelegram();
  db.prepare('DELETE FROM telegram_config').run();
  db.prepare('DELETE FROM telegram_link_codes').run();
  return c.json({ ok: true });
});

telegramRouter.post('/link-code', (c) => c.json(generateTelegramLinkCode(), 201));

telegramRouter.get('/goals', (c) => {
  const rows = db
    .prepare('SELECT * FROM telegram_goals ORDER BY project_id IS NOT NULL, project_id')
    .all() as TelegramGoal[];
  return c.json(rows.map(goalResponse));
});

telegramRouter.post('/goals', zValidator('json', goalSchema), (c) => {
  const data = c.req.valid('json');
  if (data.project_id !== null && data.project_id !== undefined) {
    const project = db
      .prepare('SELECT id FROM projects WHERE id = ? AND archived_at IS NULL')
      .get(data.project_id);
    if (!project) return c.json({ error: 'project_not_found' }, 404);
  }
  try {
    const result = db
      .prepare(
        `INSERT INTO telegram_goals (project_id, target_seconds, enabled, updated_at)
       VALUES (?, ?, ?, unixepoch())`,
      )
      .run(data.project_id ?? null, data.target_minutes * 60, data.enabled === false ? 0 : 1);
    if (data.project_id === null || data.project_id === undefined) {
      writeDailyTargets(data.target_minutes_by_day ?? Array(7).fill(data.target_minutes));
    }
    const row = db
      .prepare('SELECT * FROM telegram_goals WHERE id = ?')
      .get(result.lastInsertRowid) as TelegramGoal;
    return c.json(goalResponse(row), 201);
  } catch {
    return c.json({ error: 'goal_already_exists' }, 409);
  }
});

telegramRouter.patch('/goals/:id', zValidator('json', goalUpdateSchema), (c) => {
  const id = Number(c.req.param('id'));
  const data = c.req.valid('json');
  const fields: string[] = [];
  const values: (number | string)[] = [];
  if (data.target_minutes !== undefined) {
    fields.push('target_seconds = ?');
    values.push(data.target_minutes * 60);
    fields.push('last_notified_day = NULL');
  }
  if (data.target_minutes_by_day !== undefined) {
    fields.push('last_notified_day = NULL');
  }
  if (data.enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(data.enabled ? 1 : 0);
  }
  if (fields.length === 0) return c.json({ error: 'no_changes' }, 400);
  fields.push('updated_at = unixepoch()');
  values.push(id);
  const result = db
    .prepare(`UPDATE telegram_goals SET ${fields.join(', ')} WHERE id = ?`)
    .run(...values);
  if (result.changes === 0) return c.json({ error: 'not_found' }, 404);
  const row = db.prepare('SELECT * FROM telegram_goals WHERE id = ?').get(id) as TelegramGoal;
  if (row.project_id === null && data.target_minutes_by_day !== undefined) {
    writeDailyTargets(data.target_minutes_by_day);
  }
  return c.json(goalResponse(row));
});

telegramRouter.delete('/goals/:id', (c) => {
  const goal = db
    .prepare('SELECT project_id FROM telegram_goals WHERE id = ?')
    .get(Number(c.req.param('id'))) as { project_id: number | null } | undefined;
  const result = db
    .prepare('DELETE FROM telegram_goals WHERE id = ?')
    .run(Number(c.req.param('id')));
  if (result.changes === 0) return c.json({ error: 'not_found' }, 404);
  if (goal?.project_id === null)
    db.prepare('DELETE FROM meta WHERE key = ?').run('telegram_daily_limits');
  return c.json({ ok: true });
});
