import { Hono } from 'hono';
import { db } from '../db/index.js';

export const exportRouter = new Hono();

type Row = {
  id: number;
  project_id: number;
  project_name: string;
  task_id: number | null;
  task_name: string | null;
  note: string;
  started_at: number;
  ended_at: number | null;
  seconds: number;
};

function csvEscape(v: string | number | null): string {
  if (v === null) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

exportRouter.get('/', (c) => {
  const format = (c.req.query('format') || 'csv').toLowerCase();
  const from = c.req.query('from');
  const to = c.req.query('to');
  const projectId = c.req.query('project_id');

  const where: string[] = [];
  const params: (string | number)[] = [];
  if (from) {
    where.push('t.started_at >= ?');
    params.push(Number(from));
  }
  if (to) {
    where.push('t.started_at < ?');
    params.push(Number(to));
  }
  if (projectId) {
    where.push('t.project_id = ?');
    params.push(Number(projectId));
  }
  const sql = `
    SELECT t.id, t.project_id, p.name AS project_name,
           t.task_id, tk.name AS task_name,
           t.note, t.started_at, t.ended_at,
           (COALESCE(t.ended_at, unixepoch()) - t.started_at) AS seconds
    FROM tracks t
    JOIN projects p ON p.id = t.project_id
    LEFT JOIN tasks tk ON tk.id = t.task_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY t.started_at DESC
  `;
  const rows = db.prepare(sql).all(...params) as Row[];

  if (format === 'json') {
    c.header('Content-Disposition', 'attachment; filename="kairotrack-export.json"');
    return c.json(rows);
  }

  const header = [
    'id',
    'project_id',
    'project_name',
    'task_id',
    'task_name',
    'note',
    'started_at_iso',
    'ended_at_iso',
    'seconds',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.project_id,
        csvEscape(r.project_name),
        r.task_id,
        csvEscape(r.task_name),
        csvEscape(r.note),
        new Date(r.started_at * 1000).toISOString(),
        r.ended_at ? new Date(r.ended_at * 1000).toISOString() : '',
        r.seconds,
      ]
        .map((v) => (typeof v === 'string' ? v : csvEscape(v as number | null)))
        .join(','),
    );
  }
  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', 'attachment; filename="kairotrack-export.csv"');
  return c.body(lines.join('\n'));
});
