// Password hashing with Node's built-in scrypt (no native dependencies).
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;
const SALT_BYTES = 16;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/** Returns `scrypt$<salt>$<hash>` (base64 parts). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(password, salt);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltPart, keyPart] = stored.split('$');
  if (scheme !== 'scrypt' || saltPart === undefined || keyPart === undefined) return false;
  const expected = Buffer.from(keyPart, 'base64');
  const actual = await deriveKey(password, Buffer.from(saltPart, 'base64'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** A hash to verify against when the user does not exist, so both paths take the same time. */
export const DUMMY_PASSWORD_HASH = await hashPassword('dummy-password-for-timing');
