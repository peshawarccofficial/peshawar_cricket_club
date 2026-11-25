import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as webpush from "web-push";

const categories = ["match_request", "fixture_accepted", "match_reminder", "live_score"] as const;
type Category = typeof categories[number];
type PushSubscriptionRow = { user_id: string; endpoint: string; keys: { p256dh: string; auth: string } };
type PushPayload = { category: Category; userIds: string[]; title: string; body: string; url?: string; tag?: string };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function authorized(request: Request, secret: string) {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

function validPayload(value: unknown): value is PushPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return typeof input.category === "string" && (categories as readonly string[]).includes(input.category) &&
    Array.isArray(input.userIds) && input.userIds.length > 0 && input.userIds.length <= 100 &&
    input.userIds.every(id => typeof id === "string" && uuidPattern.test(id)) &&
    typeof input.title === "string" && input.title.length > 0 && input.title.length <= 120 &&
    typeof input.body === "string" && input.body.length <= 500 &&
    (input.url === undefined || typeof input.url === "string" && input.url.startsWith("/") && !input.url.startsWith("//")) &&
    (input.tag === undefined || typeof input.tag === "string" && input.tag.length <= 100);
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Push dispatch is not configured." }, { status: 503 });
  if (!authorized(request, secret)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid push event." }, { status: 400 });
  }
  if (!validPayload(body)) return NextResponse.json({ error: "Invalid push event payload." }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!url || !serviceKey || !publicKey || !privateKey || !subject) {
    return NextResponse.json({ error: "Push delivery credentials are not configured." }, { status: 503 });
  }

  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const [subscriptionsResult, preferencesResult] = await Promise.all([
    supabase.from("push_subscriptions").select("user_id,endpoint,keys").in("user_id", body.userIds),
    supabase.from("push_preferences").select("user_id,preferences").in("user_id", body.userIds)
  ]);
  if (subscriptionsResult.error || preferencesResult.error) {
    return NextResponse.json({ error: "Could not load push subscriptions. Check the push database schema." }, { status: 503 });
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  } catch {
    return NextResponse.json({ error: "The configured Web Push keys are invalid." }, { status: 503 });
  }

  const preferences = new Map<string, Record<string, boolean>>();
  for (const row of preferencesResult.data || []) {
    preferences.set(row.user_id, row.preferences as Record<string, boolean>);
  }
  const rows = (subscriptionsResult.data || []) as PushSubscriptionRow[];
  const eligible = rows.filter(row => preferences.get(row.user_id)?.[body.category] !== false);
  const payload = JSON.stringify({ title: body.title, body: body.body, url: body.url || "/", tag: body.tag || body.category });
  const results = await Promise.all(eligible.map(async row => {
    try {
      await webpush.sendNotification({ endpoint: row.endpoint, keys: row.keys }, payload);
      return { delivered: true, staleEndpoint: false };
    } catch (error) {
      const statusCode = typeof error === "object" && error !== null && "statusCode" in error ? error.statusCode : undefined;
      if (statusCode === 404 || statusCode === 410) {
        const { error: deleteError } = await supabase.from("push_subscriptions").delete().eq("endpoint", row.endpoint);
        if (deleteError) console.error("Could not remove expired push subscription:", deleteError.message);
        return { delivered: false, staleEndpoint: true };
      }
      console.error("Web Push delivery failed:", statusCode || "unknown provider error");
      return { delivered: false, staleEndpoint: false };
    }
  }));
  return NextResponse.json({
    targeted: eligible.length,
    delivered: results.filter(result => result.delivered).length,
    removedExpired: results.filter(result => result.staleEndpoint).length
  });
}
