import { NextResponse } from "next/server";
import { getOwnerAdminSession } from "@/lib/admin-session";
import { createAdminServiceClient } from "@/lib/admin-service";

const owner = "owner-control-center";

async function authorized() {
  if (!(await getOwnerAdminSession())) return { error: "Owner access required.", status: 401 as const };
  const supabase = createAdminServiceClient();
  if (!supabase) return { error: "Admin database access is not configured.", status: 503 as const };
  return { supabase };
}

export async function GET() {
  const access = await authorized();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { supabase } = access;
  const { count, error } = await supabase.from("admin_push_subscriptions").select("endpoint", { count: "exact", head: true }).eq("owner_username", owner);
  if (error) return NextResponse.json({ error: "Admin push storage is not ready. Apply the admin PWA migration." }, { status: 503 });
  return NextResponse.json({ subscribed: (count || 0) > 0 });
}

export async function POST(request: Request) {
  const access = await authorized();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { supabase } = access;
  let body: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  }
  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;
  if (typeof endpoint !== "string" || endpoint.length > 2048 || typeof p256dh !== "string" || p256dh.length > 256 || typeof auth !== "string" || auth.length > 256) {
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  }
  try {
    if (new URL(endpoint).protocol !== "https:") throw new Error("Invalid endpoint");
  } catch {
    return NextResponse.json({ error: "Push endpoint must use HTTPS." }, { status: 400 });
  }
  const { error } = await supabase.from("admin_push_subscriptions").upsert({
    owner_username: owner,
    endpoint,
    keys: { p256dh, auth },
    updated_at: new Date().toISOString()
  }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ error: "Could not save this device. Apply the admin PWA migration." }, { status: 503 });
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const access = await authorized();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { supabase } = access;
  let body: { endpoint?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid unsubscribe request." }, { status: 400 });
  }
  if (typeof body.endpoint !== "string" || body.endpoint.length > 2048) return NextResponse.json({ error: "Invalid subscription endpoint." }, { status: 400 });
  const { error } = await supabase.from("admin_push_subscriptions").delete().eq("owner_username", owner).eq("endpoint", body.endpoint);
  if (error) return NextResponse.json({ error: "Could not remove this device subscription." }, { status: 503 });
  return NextResponse.json({ ok: true });
}
