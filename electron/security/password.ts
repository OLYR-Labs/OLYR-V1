import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SALT_BYTES = 16;
const KEY_LENGTH = 64;

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(password, salt, KEY_LENGTH);

  return {
    hash: hash.toString("hex"),
    salt: salt.toString("hex"),
  };
}

export function verifyPassword(password: string, storedHash: string, storedSalt: string): boolean {
  try {
    const salt = Buffer.from(storedSalt, "hex");
    const expected = Buffer.from(storedHash, "hex");
    const actual = scryptSync(password, salt, expected.length);

    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
