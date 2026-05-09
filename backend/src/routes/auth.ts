import { Hono } from 'hono';
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

authRouter.post('/login', zValidator('json', loginSchema), async (c) => {
  const { user, password } = c.req.valid('json');
  if (user !== config.user || !bcrypt.compareSync(password, config.passwordHash)) {
    return c.json({ error: 'invalid_credentials' }, 401);
  }
  const token = await signSession(user);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.nodeEnv === 'production',
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
