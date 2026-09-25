import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/index.js';

export const settingsRouter = new Hono();

const DAYS = 7;
const defaultSettings = { daily_limits: Array<number | null>(DAYS).fill(null) };
const dailyLimitsSchema = z.object({
  daily_limits: z.array(z.number().finite().min(0).max(24).nullable()).length(DAYS),
});

function readSettings() {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('work_settings') as
    | { value: string }
    | undefined;
  if (!row) return defaultSettings;
  try {
    return dailyLimitsSchema.parse(JSON.parse(row.value));
  } catch {
    return defaultSettings;
  }
}

settingsRouter.get('/work', (c) => c.json(readSettings()));

settingsRouter.put('/work', zValidator('json', dailyLimitsSchema), (c) => {
  const settings = c.req.valid('json');
  db.prepare(
    `INSERT INTO meta (key, value) VALUES ('work_settings', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(JSON.stringify(settings));
  return c.json(settings);
});
