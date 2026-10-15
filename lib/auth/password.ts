import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const keyLength = 64;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = await scrypt(password, salt, keyLength) as Buffer;
  return `scrypt$${salt}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, storedValue: string) {
  const [algorithm, salt, encodedHash] = storedValue.split("$");
  if (algorithm !== "scrypt" || !salt || !encodedHash) return false;
  const expected = Buffer.from(encodedHash, "base64url");
  const actual = await scrypt(password, salt, expected.length) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
