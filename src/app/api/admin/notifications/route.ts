import { NextResponse } from "next/server";
import { getOwnerAdminSession } from "@/lib/admin-session";
import { createAdminServiceClient } from "@/lib/admin-service";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request) {
  if (!(await getOwnerAdminSession())) return NextResponse.json({ error: "Owner access required." }, { status: 401 });
  const supabase = createAdminServiceClient();
  if (!supabase) return NextResponse.json({ error: "Admin database access is not configured." }, { status: 503 });
  let body: { id?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid notification request." }, { status: 400 });
  }
  if (body.action === "mark-all") {
    const { error } = await supabase.from("owner_notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    if (error) return NextResponse.json({ error: "Could not mark owner notifications as read." }, { status: 503 });
    return NextResponse.json({ ok: true });
  }
  if (typeof body.id !== "string" || !uuidPattern.test(body.id)) return NextResponse.json({ error: "Invalid notification id." }, { status: 400 });
  const { error } = await supabase.from("owner_notifications").update({ read_at: new Date().toISOString() }).eq("id", body.id);
  if (error) return NextResponse.json({ error: "Could not update the owner notification." }, { status: 503 });
  return NextResponse.json({ ok: true });
}
