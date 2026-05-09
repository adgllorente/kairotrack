import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { verifySession } from '../lib/jwt.js';
import { parseKey, verifyKey } from '../lib/apikey.js';
import { db } from '../db/index.js';
import type { ApiKey } from '../db/index.js';

export const SESSION_COOKIE = 'tt_session';

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const sub = await verifySession(token);
    if (sub) {
      c.set('auth', { type: 'session', sub });
      return next();
    }
  }

  const header = c.req.header('authorization');
  const apikeyHeader = c.req.header('x-api-key');
  let raw: string | undefined;
  if (apikeyHeader) raw = apikeyHeader;
  else if (header?.startsWith('Bearer ')) raw = header.slice(7);

  if (raw) {
    const parsed = parseKey(raw);
    if (parsed) {
      const row = db
        .prepare('SELECT * FROM api_keys WHERE prefix = ? AND revoked_at IS NULL')
        .get(parsed.prefix) as ApiKey | undefined;
      if (row && verifyKey(raw, row.hash)) {
        db.prepare('UPDATE api_keys SET last_used_at = unixepoch() WHERE id = ?').run(row.id);
        c.set('auth', { type: 'apikey', keyId: row.id });
        return next();
      }
    }
  }

  return c.json({ error: 'unauthorized' }, 401);
};

export type AuthContext = { type: 'session'; sub: string } | { type: 'apikey'; keyId: number };

declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

export function getAuth(c: Context): AuthContext {
  return c.get('auth');
}
