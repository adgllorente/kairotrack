import { Bot, InlineKeyboard } from 'grammy';
import { randomBytes } from 'node:crypto';
import { db } from '../db/index.js';
import type { TelegramConfig, TelegramGoal } from '../db/index.js';
import { decryptTelegramToken, hashTelegramLinkCode } from './telegram-crypto.js';

const GOAL_CHECK_INTERVAL_MS = 60_000;
let bot: Bot | null = null;
let goalTimer: NodeJS.Timeout | null = null;

function getConfig(): TelegramConfig | undefined {
  return db.prepare('SELECT * FROM telegram_config WHERE id = 1').get() as
    | TelegramConfig
    | undefined;
}

function localDay(): string {
  const row = db.prepare("SELECT date('now', 'localtime') AS day").get() as { day: string };
  return row.day;
}

function localWeekday(): number {
  const row = db
    .prepare("SELECT CAST(strftime('%w', 'now', 'localtime') AS INTEGER) AS weekday")
    .get() as { weekday: number };
  return (row.weekday + 6) % 7;
}

function dailyWorkLimit(): number | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('work_settings') as
    | { value: string }
    | undefined;
  if (!row) return null;
  try {
    const settings = JSON.parse(row.value) as { daily_limits?: unknown };
    if (!Array.isArray(settings.daily_limits) || settings.daily_limits.length !== 7) return null;
    const value = settings.daily_limits[localWeekday()];
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value * 3600 : null;
  } catch {
    return null;
  }
}

function getMeta(key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function setMeta(key: string, value: string): void {
  db.prepare(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

function formatDuration(seconds: number): string {
  const totalMinutes = Math.max(0, Math.floor(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return minutes + ' min';
  return hours + ' h ' + minutes.toString().padStart(2, '0') + ' min';
}

function authorizedChatId(chatId: number): boolean {
  const row = getConfig();
  return Boolean(row?.enabled && row.chat_id && row.chat_id === String(chatId));
}

async function requireAuthorized(ctx: {
  chat?: { id: number };
  reply: (text: string) => Promise<unknown>;
}): Promise<boolean> {
  if (ctx.chat && authorizedChatId(ctx.chat.id)) return true;
  await ctx.reply(
    'Este chat no está vinculado a Kairotrack. Genera un código desde Settings y envíalo con /link <código>.',
  );
  return false;
}

function startKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const projects = db
    .prepare('SELECT id, name FROM projects WHERE archived_at IS NULL ORDER BY name')
    .all() as Array<{ id: number; name: string }>;
  for (const project of projects) keyboard.text(project.name, 'tg:project:' + project.id).row();
  return keyboard;
}

async function showStartMenu(ctx: {
  reply: (text: string, options?: { reply_markup?: InlineKeyboard }) => Promise<unknown>;
}) {
  const projects = db
    .prepare('SELECT COUNT(*) AS count FROM projects WHERE archived_at IS NULL')
    .get() as { count: number };
  if (projects.count === 0) {
    await ctx.reply('No hay proyectos activos configurados.');
    return;
  }
  await ctx.reply('Elige un proyecto para iniciar el track:', { reply_markup: startKeyboard() });
}

function startTrack(
  projectId: number,
  taskId: number | null,
): { projectName: string; taskName: string | null } | null {
  const now = Math.floor(Date.now() / 1000);
  const project = db
    .prepare('SELECT id, name FROM projects WHERE id = ? AND archived_at IS NULL')
    .get(projectId) as { id: number; name: string } | undefined;
  if (!project) return null;
  if (taskId !== null) {
    const task = db
      .prepare('SELECT id FROM tasks WHERE id = ? AND project_id = ? AND archived_at IS NULL')
      .get(taskId, projectId) as { id: number } | undefined;
    if (!task) return null;
  }
  db.transaction(() => {
    const active = db.prepare('SELECT id FROM tracks WHERE ended_at IS NULL').get() as
      | { id: number }
      | undefined;
    if (active)
      db.prepare('UPDATE tracks SET ended_at = ?, updated_at = ? WHERE id = ?').run(
        now,
        now,
        active.id,
      );
    db.prepare(
      "INSERT INTO tracks (project_id, task_id, note, started_at, updated_at) VALUES (?, ?, '', ?, ?)",
    ).run(projectId, taskId, now, now);
  })();
  const taskName =
    taskId === null
      ? null
      : (db.prepare('SELECT name FROM tasks WHERE id = ?').get(taskId) as { name: string }).name;
  return { projectName: project.name, taskName };
}

async function sendActive(ctx: { reply: (text: string) => Promise<unknown> }) {
  const row = db
    .prepare(
      `SELECT t.started_at, p.name AS project_name, tk.name AS task_name
       FROM tracks t JOIN projects p ON p.id = t.project_id
       LEFT JOIN tasks tk ON tk.id = t.task_id
       WHERE t.ended_at IS NULL`,
    )
    .get() as { started_at: number; project_name: string; task_name: string | null } | undefined;
  if (!row) {
    await ctx.reply('No hay ningún track activo.');
    return;
  }
  const label = row.project_name + (row.task_name ? ' · ' + row.task_name : '');
  await ctx.reply(
    'Track activo: ' +
      label +
      '\nTiempo: ' +
      formatDuration(Math.floor(Date.now() / 1000) - row.started_at),
  );
}

async function sendSummary(ctx: { reply: (text: string) => Promise<unknown> }, week: boolean) {
  const condition = week
    ? "strftime('%Y-W%W', t.started_at, 'unixepoch', 'localtime') = strftime('%Y-W%W', 'now', 'localtime')"
    : "date(t.started_at, 'unixepoch', 'localtime') = date('now', 'localtime')";
  const rows = db
    .prepare(
      `SELECT p.name AS project_name,
              SUM(COALESCE(t.ended_at, unixepoch()) - t.started_at) AS seconds
       FROM tracks t JOIN projects p ON p.id = t.project_id
       WHERE ${condition}
       GROUP BY p.id
       ORDER BY seconds DESC`,
    )
    .all() as Array<{ project_name: string; seconds: number }>;
  const total = rows.reduce((sum, row) => sum + row.seconds, 0);
  const title = week ? 'Resumen de esta semana' : 'Resumen de hoy';
  if (rows.length === 0) {
    await ctx.reply(title + ': 0 min.');
    return;
  }
  const details = rows
    .map((row) => '• ' + row.project_name + ': ' + formatDuration(row.seconds))
    .join('\n');
  await ctx.reply(title + ': ' + formatDuration(total) + '\n\n' + details);
}

async function checkGoals() {
  const currentBot = bot;
  const row = getConfig();
  if (!currentBot || !row?.enabled || !row.chat_id) return;
  const day = localDay();
  const dailyLimit = dailyWorkLimit();
  if (dailyLimit !== null && getMeta('work_daily_last_notified') !== day) {
    const total = db
      .prepare(
        `SELECT COALESCE(SUM(COALESCE(t.ended_at, unixepoch()) - t.started_at), 0) AS seconds
         FROM tracks t
         WHERE date(t.started_at, 'unixepoch', 'localtime') = ?`,
      )
      .get(day) as { seconds: number };
    if (total.seconds >= dailyLimit) {
      try {
        const dayNames = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
        await currentBot.api.sendMessage(
          row.chat_id,
          'Límite diario alcanzado: ' +
            formatDuration(dailyLimit) +
            ' (' +
            dayNames[localWeekday()] +
            '). Tiempo acumulado: ' +
            formatDuration(total.seconds) +
            '.',
        );
        setMeta('work_daily_last_notified', day);
      } catch (error) {
        console.error('Telegram daily limit notification failed:', error);
      }
    }
  }
  const goals = db
    .prepare('SELECT * FROM telegram_goals WHERE enabled = 1')
    .all() as TelegramGoal[];
  for (const goal of goals) {
    if (goal.project_id === null && dailyLimit !== null) continue;
    if (goal.last_notified_day === day) continue;
    const params: (string | number)[] = [day];
    let projectSql = '';
    if (goal.project_id !== null) {
      projectSql = ' AND t.project_id = ?';
      params.push(goal.project_id);
    }
    const total = db
      .prepare(
        `SELECT COALESCE(SUM(COALESCE(t.ended_at, unixepoch()) - t.started_at), 0) AS seconds
         FROM tracks t
         WHERE date(t.started_at, 'unixepoch', 'localtime') = ?${projectSql}`,
      )
      .get(...params) as { seconds: number };
    if (total.seconds < goal.target_seconds) continue;
    const scope =
      goal.project_id === null
        ? 'el total del día'
        : ((
            db.prepare('SELECT name FROM projects WHERE id = ?').get(goal.project_id) as
              | { name: string }
              | undefined
          )?.name ?? 'el proyecto');
    try {
      await currentBot.api.sendMessage(
        row.chat_id,
        'Objetivo alcanzado: ' +
          formatDuration(goal.target_seconds) +
          ' en ' +
          scope +
          '. Tiempo acumulado: ' +
          formatDuration(total.seconds) +
          '.',
      );
      db.prepare(
        'UPDATE telegram_goals SET last_notified_day = ?, updated_at = unixepoch() WHERE id = ?',
      ).run(day, goal.id);
    } catch (error) {
      console.error('Telegram goal notification failed:', error);
    }
  }
}

function registerHandlers(currentBot: Bot) {
  currentBot.command('start', async (ctx) => {
    if (await requireAuthorized(ctx)) await showStartMenu(ctx);
  });

  currentBot.command('link', async (ctx) => {
    const match = typeof ctx.match === 'string' ? ctx.match.trim() : '';
    const link = match
      ? (db
          .prepare(
            'SELECT id FROM telegram_link_codes WHERE code_hash = ? AND used_at IS NULL AND expires_at > unixepoch()',
          )
          .get(hashTelegramLinkCode(match)) as { id: number } | undefined)
      : undefined;
    if (!link) {
      await ctx.reply('El código no es válido o ha caducado. Genera uno nuevo desde Settings.');
      return;
    }
    db.prepare('UPDATE telegram_config SET chat_id = ?, updated_at = unixepoch() WHERE id = 1').run(
      String(ctx.chat.id),
    );
    db.prepare('UPDATE telegram_link_codes SET used_at = unixepoch() WHERE id = ?').run(link.id);
    await ctx.reply('Chat vinculado correctamente. Usa /start para iniciar un track.');
  });

  currentBot.command('active', async (ctx) => {
    if (await requireAuthorized(ctx)) await sendActive(ctx);
  });

  currentBot.command('stop', async (ctx) => {
    if (!(await requireAuthorized(ctx))) return;
    const active = db.prepare('SELECT id FROM tracks WHERE ended_at IS NULL').get() as
      | { id: number }
      | undefined;
    if (!active) {
      await ctx.reply('No hay ningún track activo.');
      return;
    }
    db.prepare(
      'UPDATE tracks SET ended_at = unixepoch(), updated_at = unixepoch() WHERE id = ?',
    ).run(active.id);
    await ctx.reply('Track detenido.');
  });

  currentBot.command('today', async (ctx) => {
    if (await requireAuthorized(ctx)) await sendSummary(ctx, false);
  });
  currentBot.command('week', async (ctx) => {
    if (await requireAuthorized(ctx)) await sendSummary(ctx, true);
  });
  currentBot.command('help', async (ctx) => {
    if (await requireAuthorized(ctx))
      await ctx.reply(
        'Comandos disponibles:\n/start — iniciar un track\n/link CÓDIGO — vincular este chat\n/active — ver el track activo\n/stop — detenerlo\n/today — resumen de hoy\n/week — resumen de la semana\n/help — mostrar esta ayuda',
      );
  });

  currentBot.on('callback_query:data', async (ctx) => {
    if (!ctx.chat || !authorizedChatId(ctx.chat.id)) {
      await ctx.answerCallbackQuery({ text: 'Chat no autorizado', show_alert: true });
      return;
    }
    const parts = ctx.callbackQuery.data.split(':');
    if (parts[0] !== 'tg') return;
    const kind = parts[1];
    const projectId = Number(parts[2]);
    if (kind === 'project') {
      const project = db
        .prepare('SELECT name FROM projects WHERE id = ? AND archived_at IS NULL')
        .get(projectId) as { name: string } | undefined;
      if (!project) {
        await ctx.answerCallbackQuery({ text: 'Proyecto no encontrado', show_alert: true });
        return;
      }
      const keyboard = new InlineKeyboard();
      const tasks = db
        .prepare(
          'SELECT id, name FROM tasks WHERE project_id = ? AND archived_at IS NULL ORDER BY name',
        )
        .all(projectId) as Array<{ id: number; name: string }>;
      for (const task of tasks)
        keyboard.text(task.name, 'tg:task:' + projectId + ':' + task.id).row();
      keyboard.text('Sin tarea', 'tg:none:' + projectId);
      await ctx.answerCallbackQuery();
      await ctx.editMessageText('Proyecto: ' + project.name + '\nElige una tarea:', {
        reply_markup: keyboard,
      });
      return;
    }
    if (kind === 'task' || kind === 'none') {
      const taskId = kind === 'task' ? Number(parts[3]) : null;
      const started = startTrack(projectId, taskId);
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        started
          ? 'Track iniciado: ' +
              started.projectName +
              (started.taskName ? ' · ' + started.taskName : '') +
              '.'
          : 'No se ha podido iniciar el track.',
      );
    }
  });
}

export async function testTelegramToken(token: string): Promise<{ username: string }> {
  const testBot = new Bot(token);
  const me = await testBot.api.getMe();
  return { username: me.username };
}

export async function stopTelegram(): Promise<void> {
  if (goalTimer) clearInterval(goalTimer);
  goalTimer = null;
  if (bot) {
    await bot.stop();
    bot = null;
  }
}

export async function restartTelegram(): Promise<{ username: string } | null> {
  await stopTelegram();
  const row = getConfig();
  if (!row?.enabled) return null;
  const token = decryptTelegramToken(row.token_encrypted);
  const nextBot = new Bot(token);
  const me = await nextBot.api.getMe();
  await nextBot.api.setMyCommands([
    { command: 'start', description: 'Iniciar un track' },
    { command: 'link', description: 'Vincular este chat' },
    { command: 'active', description: 'Ver el track activo' },
    { command: 'stop', description: 'Detener el track' },
    { command: 'today', description: 'Resumen de hoy' },
    { command: 'week', description: 'Resumen de la semana' },
    { command: 'help', description: 'Mostrar ayuda' },
  ]);
  db.prepare(
    'UPDATE telegram_config SET bot_username = ?, updated_at = unixepoch() WHERE id = 1',
  ).run(me.username);
  bot = nextBot;
  registerHandlers(nextBot);
  goalTimer = setInterval(() => void checkGoals(), GOAL_CHECK_INTERVAL_MS);
  void checkGoals();
  void nextBot
    .start({
      drop_pending_updates: true,
      onStart: () => console.log('Telegram bot @' + me.username + ' started'),
    })
    .catch((error) => {
      console.error('Telegram bot stopped:', error);
      bot = null;
    });
  return { username: me.username };
}

export function telegramStatus(): {
  configured: boolean;
  enabled: boolean;
  linked: boolean;
  username: string | null;
  running: boolean;
} {
  const row = getConfig();
  return {
    configured: Boolean(row),
    enabled: Boolean(row?.enabled),
    linked: Boolean(row?.chat_id),
    username: row?.bot_username ?? null,
    running: bot !== null,
  };
}

export function generateTelegramLinkCode(): { code: string; expires_at: number } {
  const code = randomBytes(4).toString('hex').toUpperCase();
  const expiresAt = Math.floor(Date.now() / 1000) + 600;
  db.prepare(
    'DELETE FROM telegram_link_codes WHERE expires_at <= unixepoch() OR used_at IS NOT NULL',
  ).run();
  db.prepare('INSERT INTO telegram_link_codes (code_hash, expires_at) VALUES (?, ?)').run(
    hashTelegramLinkCode(code),
    expiresAt,
  );
  return { code, expires_at: expiresAt };
}
