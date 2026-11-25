import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "pcc_admin_session";
const SESSION_SECONDS = 8 * 60 * 60;

type AdminSession = { username: string; expires: number; owner: boolean };

function secret() {
  const value = process.env.ADMIN_SESSION_SECRET;
  if (!value) throw new Error("ADMIN_SESSION_SECRET is not configured");
  return value;
}

function createSessionCookie(username: string, owner: boolean) {
  const expires = Date.now() + SESSION_SECONDS * 1000;
  const payload = Buffer.from(JSON.stringify({ username, expires, owner })).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return { cookie: `${payload}.${signature}`, expires };
}

export function createAdminSessionCookie(username: string) {
  return createSessionCookie(username, false);
}

export function createOwnerAdminSessionCookie(username: string) {
  return createSessionCookie(username, true);
}

export async function getAdminSession() {
  const store = await cookies();
  const value = store.get(ADMIN_COOKIE)?.value;
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) return null;
  try {
    const data: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const session = data as Partial<AdminSession>;
    if (typeof session.username !== "string" || typeof session.expires !== "number" || session.expires <= Date.now()) return null;
    if (session.username !== process.env.ADMIN_USERNAME) return null;
    return { username: session.username, expires: session.expires, owner: session.owner === true };
  } catch {
    return null;
  }
}

export async function getOwnerAdminSession() {
  const session = await getAdminSession();
  return session?.owner ? session : null;
}
