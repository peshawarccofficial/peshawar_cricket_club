import { NextResponse } from "next/server";
import { getOwnerAdminSession } from "@/lib/admin-session";
import { createAdminServiceClient } from "@/lib/admin-service";

const key = "seo_settings";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function GET() {
  if (!(await getOwnerAdminSession())) return NextResponse.json({ error: "Owner access required." }, { status: 401 });
  const supabase = createAdminServiceClient();
  if (!supabase) return NextResponse.json({ error: "Admin database access is not configured." }, { status: 503 });
  const { data, error } = await supabase.from("application_settings").select("value").eq("key", key).maybeSingle();
  if (error) return NextResponse.json({ error: "SEO settings are unavailable. Apply the Supabase base migration." }, { status: 503 });
  const value = isRecord(data?.value) ? data.value : {};
  return NextResponse.json({
    settings: {
      title: typeof value.title === "string" ? value.title : "",
      description: typeof value.description === "string" ? value.description : "",
      verification: typeof value.verification === "string" ? value.verification : "",
      canonicalUrl: typeof value.canonicalUrl === "string" ? value.canonicalUrl : ""
    }
  });
}

export async function PUT(request: Request) {
  if (!(await getOwnerAdminSession())) return NextResponse.json({ error: "Owner access required." }, { status: 401 });
  const supabase = createAdminServiceClient();
  if (!supabase) return NextResponse.json({ error: "Admin database access is not configured." }, { status: 503 });
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) throw new Error();
    body = parsed;
  } catch {
    return NextResponse.json({ error: "Invalid SEO settings." }, { status: 400 });
  }
  const { title, description, verification, canonicalUrl } = body;
  if (typeof title !== "string" || title.length > 80 ||
      typeof description !== "string" || description.length > 160 ||
      typeof verification !== "string" || verification.length > 200 ||
      typeof canonicalUrl !== "string" || canonicalUrl.length > 500) {
    return NextResponse.json({ error: "Provide valid title, description, verification, and canonical URL values." }, { status: 400 });
  }
  if (canonicalUrl && (() => { try { const url = new URL(canonicalUrl); return url.protocol !== "https:" && url.protocol !== "http:"; } catch { return true; } })()) {
    return NextResponse.json({ error: "The canonical URL must be a valid absolute HTTP or HTTPS URL." }, { status: 400 });
  }
  const { error } = await supabase.from("application_settings").upsert({
    key,
    value: { title: title.trim(), description: description.trim(), verification: verification.trim(), canonicalUrl: canonicalUrl.trim() },
    updated_at: new Date().toISOString()
  }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: "Could not save SEO settings." }, { status: 503 });
  return NextResponse.json({ ok: true });
}
