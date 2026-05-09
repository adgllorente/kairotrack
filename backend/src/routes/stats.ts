import { Hono } from 'hono';
import { db } from '../db/index.js';

export const statsRouter = new Hono();

const GROUP_EXPR: Record<string, string> = {
  day: "date(started_at, 'unixepoch', 'localtime')",
  week: "strftime('%Y-W%W', started_at, 'unixepoch', 'localtime')",
  month: "strftime('%Y-%m', started_at, 'unixepoch', 'localtime')",
  year: "strftime('%Y', started_at, 'unixepoch', 'localtime')",
};

statsRouter.get('/summary', (c) => {
  const groupBy = c.req.query('group_by') || 'day';
  const from = c.req.query('from');
  const to = c.req.query('to');
  const projectId = c.req.query('project_id');
  const taskId = c.req.query('task_id');

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
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const durationExpr = '(COALESCE(ended_at, unixepoch()) - started_at)';

  if (groupBy === 'project') {
    const sql = `
      SELECT p.id as project_id, p.name as project_name, p.color as project_color,
             SUM(${durationExpr}) AS seconds,
             COUNT(*) AS count
      FROM tracks t
      JOIN projects p ON p.id = t.project_id
      ${whereSql}
      GROUP BY p.id
      ORDER BY seconds DESC
    `;
    return c.json(db.prepare(sql).all(...params));
  }

  const expr = GROUP_EXPR[groupBy];
  if (!expr) return c.json({ error: 'invalid group_by' }, 400);

  const sql = `
    SELECT ${expr} AS bucket,
           SUM(${durationExpr}) AS seconds,
           COUNT(*) AS count
    FROM tracks
    ${whereSql}
    GROUP BY bucket
    ORDER BY bucket
  `;
  return c.json(db.prepare(sql).all(...params));
});

statsRouter.get('/heatmap', (c) => {
  const year = Number(c.req.query('year') || new Date().getFullYear());
  const projectId = c.req.query('project_id');
  const where: string[] = [
    "started_at >= unixepoch(? || '-01-01 00:00:00', 'utc')",
    "started_at <  unixepoch(? || '-01-01 00:00:00', 'utc')",
  ];
  const params: (string | number)[] = [String(year), String(year + 1)];
  if (projectId) {
    where.push('project_id = ?');
    params.push(Number(projectId));
  }
  const sql = `
    SELECT date(started_at, 'unixepoch', 'localtime') AS day,
           SUM(COALESCE(ended_at, unixepoch()) - started_at) AS seconds
    FROM tracks
    WHERE ${where.join(' AND ')}
    GROUP BY day
    ORDER BY day
  `;
  return c.json(db.prepare(sql).all(...params));
});

statsRouter.get('/totals', (c) => {
  const from = c.req.query('from');
  const to = c.req.query('to');
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
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const row = db
    .prepare(
      `SELECT
         SUM(COALESCE(ended_at, unixepoch()) - started_at) AS seconds,
         COUNT(*) AS count
       FROM tracks ${whereSql}`,
    )
    .get(...params);
  return c.json(row);
});
