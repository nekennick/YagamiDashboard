export const sessionCookieName = "yagami_session";

export type SessionRole = "ADMIN" | "MEMBER";
export type SessionPayload = { sub: number; username: string; displayName: string; role: SessionRole; exp: number };

const sessionDurationSeconds = 60 * 60 * 12;

export async function createSessionToken(user: Omit<SessionPayload, "exp">) {
  const payload: SessionPayload = { ...user, exp: Math.floor(Date.now() / 1000) + sessionDurationSeconds };
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export async function readSessionToken(token: string | undefined | null) {
  if (!token) return null;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature || !(await secureEqual(signature, await sign(encodedPayload)))) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload))) as SessionPayload;
    if (!payload.sub || !payload.username || !payload.displayName || !["ADMIN", "MEMBER"].includes(payload.role) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.AUTH_COOKIE_SECURE === "true",
  path: "/",
  maxAge: sessionDurationSeconds
};

async function sign(value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(sessionSecret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64UrlEncode(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

async function secureEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}

function sessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SESSION_SECRET phải có ít nhất 32 ký tự.");
  return secret;
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
