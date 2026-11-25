import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const preferenceKeys = ["match_request", "fixture_accepted", "match_reminder", "live_score"] as const;
type Preferences = Record<typeof preferenceKeys[number], boolean>;
const defaults: Preferences = { match_request: true, fixture_accepted: true, match_reminder: true, live_score: true };

async function getUser() {
  const supabase = await createClient();
  if (!supabase) return { error: "Authentication is not configured.", status: 503 as const };
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Sign in to manage push notifications.", status: 401 as const };
  return { supabase, user };
}

function isPreferences(value: unknown): value is Preferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = value as Record<string, unknown>;
  return preferenceKeys.every(key => typeof entries[key] === "boolean") &&
    Object.keys(entries).every(key => (preferenceKeys as readonly string[]).includes(key));
}

export async function GET() {
  const auth = await getUser();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const [preferencesResult, subscriptionsResult] = await Promise.all([
    auth.supabase.from("push_preferences").select("preferences").eq("user_id", auth.user.id).maybeSingle(),
    auth.supabase.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", auth.user.id)
  ]);
  if (preferencesResult.error || subscriptionsResult.error) {
    return NextResponse.json({ error: "Push storage is not ready. Apply the push-notification schema and try again." }, { status: 503 });
  }
  const stored = preferencesResult.data?.preferences;
  const preferences = stored && typeof stored === "object" ? { ...defaults, ...stored as Partial<Preferences> } : defaults;
  return NextResponse.json({ preferences, subscribed: (subscriptionsResult.count || 0) > 0 });
}

export async function POST(request: Request) {
  const auth = await getUser();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let subscription: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  try {
    subscription = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid subscription request." }, { status: 400 });
  }
  const endpoint = subscription.endpoint;
  const p256dh = subscription.keys?.p256dh;
  const keyAuth = subscription.keys?.auth;
  if (typeof endpoint !== "string" || endpoint.length > 2048 || typeof p256dh !== "string" || p256dh.length > 256 || typeof keyAuth !== "string" || keyAuth.length > 256) {
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  }
  try {
    if (new URL(endpoint).protocol !== "https:") throw new Error("Invalid endpoint");
  } catch {
    return NextResponse.json({ error: "Invalid push subscription endpoint." }, { status: 400 });
  }
  const { error } = await auth.supabase.from("push_subscriptions").upsert({
    user_id: auth.user.id,
    endpoint,
    keys: { p256dh, auth: keyAuth },
    updated_at: new Date().toISOString()
  }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ error: "Could not save this device subscription. Check that the push schema is installed." }, { status: 503 });
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function PUT(request: Request) {
  const auth = await getUser();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { preferences?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid preferences request." }, { status: 400 });
  }
  if (!isPreferences(body.preferences)) return NextResponse.json({ error: "Select a value for each notification preference." }, { status: 400 });
  const { error } = await auth.supabase.from("push_preferences").upsert({
    user_id: auth.user.id,
    preferences: body.preferences,
    updated_at: new Date().toISOString()
  }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: "Could not save notification preferences. Check that the push schema is installed." }, { status: 503 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await getUser();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: { endpoint?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid unsubscribe request." }, { status: 400 });
  }
  if (typeof body.endpoint !== "string" || body.endpoint.length > 2048) return NextResponse.json({ error: "Invalid subscription endpoint." }, { status: 400 });
  const { error } = await auth.supabase.from("push_subscriptions").delete().eq("user_id", auth.user.id).eq("endpoint", body.endpoint);
  if (error) return NextResponse.json({ error: "Could not remove this device subscription." }, { status: 503 });
  return NextResponse.json({ ok: true });
}
