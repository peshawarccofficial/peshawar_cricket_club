import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.redirect(new URL("/login?error=auth_not_configured", request.url));
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/login?error=auth_callback", request.url));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/login?error=auth_callback", request.url));
  }

  const requestedPath = request.nextUrl.searchParams.get("next");
  const nextPath = requestedPath === "/reset-password" ? requestedPath : "/settings";
  return NextResponse.redirect(new URL(nextPath, request.url));
}
