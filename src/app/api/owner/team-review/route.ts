import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
  const now = Date.now();
  const current = attempts.get(ip);
  if (!current || current.resetAt <= now) attempts.set(ip, { count: 1, resetAt: now + 60_000 });
  else {
    current.count += 1;
    if (current.count > 20) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Authentication unavailable" }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Owner sign-in required" }, { status: 401 });
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("owner_role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) return NextResponse.json({ error: "Owner authorization could not be verified." }, { status: 503 });
  if (profile?.owner_role !== "owner") return NextResponse.json({ error: "Owner access required" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const record = body as Record<string, unknown>;
  if (typeof record.teamId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(record.teamId) || typeof record.status !== "string") {
    return NextResponse.json({ error: "Team ID and status are required" }, { status: 400 });
  }
  if (!["approved", "rejected"].includes(record.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (record.status === "rejected" && (typeof record.reason !== "string" || record.reason.trim().length < 3 || record.reason.trim().length > 1000)) {
    return NextResponse.json({ error: "A rejection reason is required" }, { status: 400 });
  }

  const { error } = await supabase.rpc("owner_review_team", {
    p_team_id: record.teamId,
    p_status: record.status,
    p_rejection_reason: record.status === "rejected" ? String(record.reason).trim() : null
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ ok: true });
}
