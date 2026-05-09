import bcrypt from 'bcryptjs';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDotEnv() {
  const candidates = [
    process.env.ENV_FILE,
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../.env'),
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    const content = readFileSync(p, 'utf8');
    for (const raw of content.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
    break;
  }
}
loadDotEnv();

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

function parseCookieSecure(v: string | undefined): boolean | 'auto' {
  if (v === undefined || v === '' || v === 'auto') return 'auto';
  const lower = v.toLowerCase();
  if (lower === 'true' || lower === '1') return true;
  if (lower === 'false' || lower === '0') return false;
  return 'auto';
}

export const config = {
  user: required('AUTH_USER'),
  passwordHash: bcrypt.hashSync(required('AUTH_PASSWORD'), 10),
  sessionSecret: new TextEncoder().encode(required('SESSION_SECRET')),
  port: Number(process.env.PORT || 3000),
  tz: process.env.TZ || 'UTC',
  nodeEnv: process.env.NODE_ENV || 'development',
  cookieSecure: parseCookieSecure(process.env.COOKIE_SECURE),
};
