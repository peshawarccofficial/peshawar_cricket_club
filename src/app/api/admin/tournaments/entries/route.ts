import { NextResponse } from "next/server";
import { getOwnerAdminSession } from "@/lib/admin-session";
import { createAdminServiceClient } from "@/lib/admin-service";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request) {
  const session = await getOwnerAdminSession();
  if (!session) return NextResponse.json({ error: "Owner access required." }, { status: 401 });
  const supabase = createAdminServiceClient();
  if (!supabase) return NextResponse.json({ error: "Admin database access is not configured." }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid tournament entry review." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid tournament entry review." }, { status: 400 });
  }

  if (typeof body.entryId !== "string" || !uuidPattern.test(body.entryId) ||
      (body.status !== "approved" && body.status !== "rejected") ||
      (body.status === "rejected" && (typeof body.reason !== "string" || body.reason.trim().length < 1 || body.reason.trim().length > 1000))) {
    return NextResponse.json({ error: "Choose an entry, approve or reject it, and include a valid rejection reason when rejecting." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("review_tournament_entry", {
    p_entry_id: body.entryId,
    p_status: body.status,
    p_rejection_reason: body.status === "rejected" ? String(body.reason).trim() : null,
    p_operator: session.username
  });
  if (error) {
    const status = /already been reviewed|team limit|not found/i.test(error.message) ? 409 : 503;
    return NextResponse.json({ error: status === 409 ? error.message : "Could not review the tournament entry. Apply the PCC platform migration." }, { status });
  }
  return NextResponse.json({ id: data });
}
