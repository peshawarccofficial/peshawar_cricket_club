import { NextResponse } from "next/server";
import { getOwnerAdminSession } from "@/lib/admin-session";
import { createAdminServiceClient } from "@/lib/admin-service";

const placements = ["homepage_content", "public_content"] as const;
type Placement = typeof placements[number];
const publisherPattern = /^ca-pub-\d{16}$/;
const slotPattern = /^\d{4,20}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function GET() {
  if (!(await getOwnerAdminSession())) return NextResponse.json({ error: "Owner access required." }, { status: 401 });
  const supabase = createAdminServiceClient();
  if (!supabase) return NextResponse.json({ error: "Admin database access is not configured." }, { status: 503 });

  const { data, error } = await supabase.from("advertisements").select("placement,enabled,publisher_id,slot_id").in("placement", placements);
  if (error) return NextResponse.json({ error: "Advertisement settings are not available. Apply the PCC platform migration." }, { status: 503 });

  const settings = placements.map(placement => {
    const row = data?.find(item => item.placement === placement);
    return {
      placement,
      enabled: row?.enabled === true,
      publisherId: row?.publisher_id ?? "",
      slotId: row?.slot_id ?? ""
    };
  });
  return NextResponse.json({ settings });
}

export async function PATCH(request: Request) {
  if (!validOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (!(await getOwnerAdminSession())) return NextResponse.json({ error: "Owner access required." }, { status: 401 });
  const supabase = createAdminServiceClient();
  if (!supabase) return NextResponse.json({ error: "Admin database access is not configured." }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) return NextResponse.json({ error: "Invalid advertisement settings." }, { status: 400 });
    body = parsed;
  } catch {
    return NextResponse.json({ error: "Invalid advertisement settings." }, { status: 400 });
  }

  const { placement, enabled, publisherId, slotId } = body;
  if (typeof placement !== "string" || !(placements as readonly string[]).includes(placement) ||
      typeof enabled !== "boolean" ||
      typeof publisherId !== "string" || publisherId.length > 32 ||
      typeof slotId !== "string" || slotId.length > 20) {
    return NextResponse.json({ error: "Provide a valid placement, publisher ID, slot ID, and enabled state." }, { status: 400 });
  }
  if ((publisherId && !publisherPattern.test(publisherId)) || (slotId && !slotPattern.test(slotId)) ||
      (enabled && (!publisherPattern.test(publisherId) || !slotPattern.test(slotId)))) {
    return NextResponse.json({ error: "Use the approved ca-pub- publisher ID and numeric AdSense slot ID. Ads cannot be enabled until both are valid." }, { status: 400 });
  }

  const { error } = await supabase.rpc("save_advertisement_setting", {
    p_placement: placement as Placement,
    p_enabled: enabled,
    p_publisher_id: publisherId || null,
    p_slot_id: slotId || null
  });
  if (error) return NextResponse.json({ error: "Could not save advertisement settings. Apply the PCC platform migration." }, { status: 503 });
  return NextResponse.json({ ok: true });
}
