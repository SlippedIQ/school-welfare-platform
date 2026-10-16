/** Scrypt password hashing — no Next.js dependencies, safe for scripts too. */

import { randomBytes, scrypt, timingSafeEqual } from 'crypto';

const SCRYPT_N = 16384;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

/** Stored format: `scrypt$<N>$<salt hex>$<hash hex>`. */
export function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  return derive(password, salt, SCRYPT_N).then(
    (hash) => `scrypt$${SCRYPT_N}$${salt.toString('hex')}$${hash.toString('hex')}`,
  );
}

export function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !saltHex || !hashHex) return Promise.resolve(false);

  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  if (salt.length === 0 || expected.length === 0) return Promise.resolve(false);

  return derive(password, salt, Number(n)).then((actual) => {
    // Length is checked before timingSafeEqual, which throws on mismatch.
    return actual.length === expected.length && timingSafeEqual(expected, actual);
  });
}

function derive(password: string, salt: Buffer, N: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}
