import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_COOKIE, createOwnerAdminSessionCookie } from "@/lib/admin-session";

const privateRoutePattern = /^[A-Za-z0-9_-]{32,128}$/;

export async function GET(request: NextRequest, { params }: { params: Promise<{ ownerRoute: string }> }) {
  const { ownerRoute } = await params;
  const configuredRoute = process.env.OWNER_CONTROL_ROUTE;
  if (!configuredRoute || !privateRoutePattern.test(configuredRoute) || ownerRoute !== configuredRoute) {
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.redirect(new URL("/login?error=owner-auth", request.url));
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.redirect(new URL("/login?error=owner-auth", request.url));

  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("owner_role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) return NextResponse.json({ error: "Owner authorization could not be verified." }, { status: 503 });
  if (profile?.owner_role !== "owner") return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });

  const username = process.env.ADMIN_USERNAME;
  if (!username || !process.env.ADMIN_SESSION_SECRET) {
    return NextResponse.json({ error: "Owner dashboard session is not configured." }, { status: 503 });
  }
  const session = createOwnerAdminSessionCookie(username);
  const response = NextResponse.redirect(new URL("/admin", request.url), { status: 303 });
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(ADMIN_COOKIE, session.cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: new Date(session.expires)
  });
  return response;
}
