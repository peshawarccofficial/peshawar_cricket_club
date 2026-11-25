import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { ADMIN_COOKIE, createAdminSessionCookie } from "@/lib/admin-session";

const attempts = new Map<string, { count: number; resetAt: number }>();

function matches(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const attempt = attempts.get(ip);
  if (!attempt || attempt.resetAt <= now) attempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
  else {
    attempt.count += 1;
    if (attempt.count > 10) return NextResponse.json({ error: "Too many login attempts. Try again later." }, { status: 429 });
  }

  const body = await request.json().catch(() => null) as { username?: unknown; password?: unknown } | null;
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const expectedUsername = process.env.ADMIN_USERNAME;
  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedUsername || !expectedPassword) {
    return NextResponse.json({ error: "Admin login is not configured." }, { status: 503 });
  }
  if (!matches(username, expectedUsername) || !matches(password, expectedPassword)) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  const session = createAdminSessionCookie(username);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, session.cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: new Date(session.expires)
  });
  return response;
}
