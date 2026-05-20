import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { logger } from 'hono/logger';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './lib/config.js';
import { authRouter } from './routes/auth.js';
import { projectsRouter } from './routes/projects.js';
import { tasksRouter } from './routes/tasks.js';
import { tracksRouter } from './routes/tracks.js';
import { statsRouter } from './routes/stats.js';
import { exportRouter } from './routes/export.js';
import { importRouter } from './routes/import.js';
import { keysRouter } from './routes/keys.js';
import { requireAuth } from './middleware/auth.js';

const app = new Hono();
app.use('*', logger());

app.get('/api/health', (c) => c.json({ ok: true }));

app.route('/api/auth', authRouter);

const api = new Hono();
api.use('*', requireAuth);
api.route('/projects', projectsRouter);
api.route('/tasks', tasksRouter);
api.route('/tracks', tracksRouter);
api.route('/stats', statsRouter);
api.route('/export', exportRouter);
api.route('/import', importRouter);
api.route('/keys', keysRouter);
app.route('/api', api);

const FRONTEND_DIR = process.env.FRONTEND_DIR || join(process.cwd(), 'frontend/dist');
const indexHtmlPath = join(FRONTEND_DIR, 'index.html');
const hasFrontend = existsSync(indexHtmlPath);

if (hasFrontend) {
  app.use(
    '/*',
    serveStatic({
      root: FRONTEND_DIR,
      rewriteRequestPath: (path) => (path === '/' ? '/index.html' : path),
    }),
  );
  const indexHtml = readFileSync(indexHtmlPath, 'utf8');
  app.get('*', (c) => c.html(indexHtml));
} else {
  app.get('/', (c) => c.text('kairotrack API. Frontend not built yet.'));
}

serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' }, (info) => {
  console.log(`kairotrack listening on http://${info.address}:${info.port} (TZ=${config.tz})`);
});
