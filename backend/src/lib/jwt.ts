import { SignJWT, jwtVerify } from 'jose';
import { config } from './config.js';

const ALG = 'HS256';
const SESSION_TTL = '7d';

export async function signSession(sub: string): Promise<string> {
  return await new SignJWT({ sub })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(config.sessionSecret);
}

export async function verifySession(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, config.sessionSecret);
    return (payload.sub as string) || null;
  } catch {
    return null;
  }
}
