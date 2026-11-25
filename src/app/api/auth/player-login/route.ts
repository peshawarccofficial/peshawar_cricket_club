import { NextResponse } from "next/server";
import { createAdminServiceClient } from "@/lib/admin-service";
import { createClient } from "@/lib/supabase/server";

const playerIdPattern = /^\d{1,20}$/;
const privateHeaders = { "Cache-Control": "no-store" };
const invalidCredentials = () => NextResponse.json({ error: "Player ID or password is incorrect." }, { status: 401, headers: privateHeaders });

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Enter a valid Player ID and password." }, { status: 400, headers: privateHeaders });
  }

  if (typeof body.playerId !== "string" || !playerIdPattern.test(body.playerId) ||
      typeof body.password !== "string" || body.password.length < 1 || body.password.length > 128) {
    return NextResponse.json({ error: "Enter a valid Player ID and password." }, { status: 400, headers: privateHeaders });
  }

  const supabase = await createClient();
  const admin = createAdminServiceClient();
  if (!supabase || !admin) {
    return NextResponse.json({ error: "Player ID sign-in is unavailable. Configure Supabase and the server-only service role key." }, { status: 503, headers: privateHeaders });
  }

  const publicPlayerId = body.playerId.replace(/^0+(?=\d)/, "");
  const { data: player, error: playerError } = await admin.from("players")
    .select("id,team_id,account_status")
    .eq("public_player_id", publicPlayerId)
    .maybeSingle();
  if (playerError) return NextResponse.json({ error: "Player sign-in is temporarily unavailable." }, { status: 503, headers: privateHeaders });
  if (!player || player.account_status !== "active") return invalidCredentials();

  const [{ data: team, error: teamError }, { data: link, error: linkError }] = await Promise.all([
    admin.from("teams").select("status,deleted_at").eq("id", player.team_id).maybeSingle(),
    admin.from("player_account_links").select("user_id").eq("player_id", player.id).maybeSingle()
  ]);
  if (teamError || linkError) return NextResponse.json({ error: "Player sign-in is temporarily unavailable." }, { status: 503, headers: privateHeaders });
  if (!link || team?.status !== "approved" || team.deleted_at) return invalidCredentials();

  const { data: account, error: accountError } = await admin.auth.admin.getUserById(link.user_id);
  if (accountError) return NextResponse.json({ error: "Player sign-in is temporarily unavailable." }, { status: 503, headers: privateHeaders });
  if (!account.user.email) return invalidCredentials();

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: account.user.email,
    password: body.password
  });
  if (signInError) return invalidCredentials();

  return NextResponse.json({ ok: true }, { headers: privateHeaders });
}
