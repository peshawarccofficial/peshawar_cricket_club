import { NextResponse } from "next/server";
import { getOwnerAdminSession } from "@/lib/admin-session";
import { createAdminServiceClient } from "@/lib/admin-service";

function validUrl(value: unknown) {
  if (value === null || value === undefined || value === "") return true;
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    const url = new URL(value, "https://peshawarcricketclub.com");
    return ["http:", "https:", "/"].includes(url.protocol);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!(await getOwnerAdminSession())) return NextResponse.json({ error: "Owner access required." }, { status: 401 });
  const supabase = createAdminServiceClient();
  if (!supabase) return NextResponse.json({ error: "Admin database access is not configured." }, { status: 503 });
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid promotion request." }, { status: 400 });
  }
  const kind = body.kind;
  if (kind === "banner") {
    if (typeof body.title !== "string" || body.title.trim().length < 1 || body.title.trim().length > 120 ||
        typeof body.visible !== "boolean" || !validUrl(body.imageUrl) || !validUrl(body.destinationUrl)) {
      return NextResponse.json({ error: "Provide a valid banner title and URLs." }, { status: 400 });
    }
    const { data, error } = await supabase.from("pcc_banners").insert({
      title: body.title.trim(),
      description: typeof body.description === "string" ? body.description.trim().slice(0, 500) || null : null,
      image_url: typeof body.imageUrl === "string" && body.imageUrl ? body.imageUrl : null,
      destination_url: typeof body.destinationUrl === "string" && body.destinationUrl ? body.destinationUrl : null,
      visible: body.visible
    }).select("id,title,description,image_url,destination_url,visible,created_at").single();
    if (error) return NextResponse.json({ error: "Could not create banner. Apply the PCC platform migration." }, { status: 503 });
    return NextResponse.json({ item: data }, { status: 201 });
  }
  if (kind === "announcement") {
    if (typeof body.title !== "string" || body.title.trim().length < 1 || body.title.trim().length > 160 ||
        typeof body.body !== "string" || body.body.trim().length < 1 || body.body.trim().length > 2000 ||
        typeof body.visible !== "boolean" || !validUrl(body.destinationUrl)) {
      return NextResponse.json({ error: "Provide a valid announcement title and body." }, { status: 400 });
    }
    const { data, error } = await supabase.from("pcc_announcements").insert({
      title: body.title.trim(),
      body: body.body.trim(),
      destination_url: typeof body.destinationUrl === "string" && body.destinationUrl ? body.destinationUrl : null,
      visible: body.visible
    }).select("id,title,body,destination_url,visible,publish_at,created_at").single();
    if (error) return NextResponse.json({ error: "Could not create announcement. Apply the PCC platform migration." }, { status: 503 });
    return NextResponse.json({ item: data }, { status: 201 });
  }
  return NextResponse.json({ error: "Choose banner or announcement." }, { status: 400 });
}
