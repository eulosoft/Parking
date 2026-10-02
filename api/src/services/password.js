import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const SALT_LENGTH = 16;
const KEY_LENGTH = 64;
const PASSWORD_HASH_PATTERN = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/;

export async function hashPassword(password) {
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = await scrypt(password, salt, KEY_LENGTH, {
    maxmem: 64 * 1024 * 1024,
  });

  return `scrypt$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password, storedHash) {
  const match = PASSWORD_HASH_PATTERN.exec(storedHash);
  if (!match) {
    return false;
  }

  const salt = Buffer.from(match[1], 'hex');
  const expectedKey = Buffer.from(match[2], 'hex');
  const actualKey = await scrypt(password, salt, KEY_LENGTH, {
    maxmem: 64 * 1024 * 1024,
  });

  return timingSafeEqual(expectedKey, actualKey);
}

export function isPasswordHash(value) {
  return PASSWORD_HASH_PATTERN.test(value);
}
