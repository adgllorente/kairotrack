import { Hono, type Context } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { config } from '../lib/config.js';
import { signSession, verifySession } from '../lib/jwt.js';
import { SESSION_COOKIE } from '../middleware/auth.js';

const loginSchema = z.object({
  user: z.string().min(1),
  password: z.string().min(1),
});

export const authRouter = new Hono();

function isRequestSecure(c: Context): boolean {
  const xfProto = c.req.header('x-forwarded-proto');
  if (xfProto) return xfProto.split(',')[0].trim().toLowerCase() === 'https';
  try {
    return new URL(c.req.url).protocol === 'https:';
  } catch {
    return false;
  }
}

function resolveCookieSecure(c: Context): boolean {
  if (config.cookieSecure === 'auto') return isRequestSecure(c);
  return config.cookieSecure;
}

authRouter.post('/login', zValidator('json', loginSchema), async (c) => {
  const { user, password } = c.req.valid('json');
  if (user !== config.user || !bcrypt.compareSync(password, config.passwordHash)) {
    return c.json({ error: 'invalid_credentials' }, 401);
  }
  const token = await signSession(user);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: resolveCookieSecure(c),
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return c.json({ ok: true, user });
});

authRouter.post('/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

authRouter.get('/me', async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return c.json({ user: null });
  const sub = await verifySession(token);
  return c.json({ user: sub });
});
