import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const PREFIX_LEN = 8;
const SECRET_LEN = 32;

export function generateKey(): { plain: string; prefix: string; hash: string } {
  const prefix = randomBytes(PREFIX_LEN).toString('hex').slice(0, 8);
  const secret = randomBytes(SECRET_LEN).toString('base64url');
  const plain = `kt_${prefix}_${secret}`;
  const hash = bcrypt.hashSync(plain, 10);
  return { plain, prefix, hash };
}

// Accepts kt_ (new) and tt_ (legacy) prefixes so existing keys keep working.
export function parseKey(raw: string): { prefix: string } | null {
  const m = raw.match(/^(?:kt|tt)_([a-f0-9]{8})_/);
  if (!m) return null;
  return { prefix: m[1] };
}

export function verifyKey(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}
