import { NextResponse } from "next/server";
import { getOwnerAdminSession } from "@/lib/admin-session";
import { createAdminServiceClient } from "@/lib/admin-service";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authorized() {
  if (!(await getOwnerAdminSession())) return { error: "Owner access required.", status: 401 as const };
  const supabase = createAdminServiceClient();
  if (!supabase) return { error: "Admin database access is not configured.", status: 503 as const };
  return { supabase };
}

export async function GET(request: Request) {
  const access = await authorized();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const tournamentId = new URL(request.url).searchParams.get("tournamentId");
  if (!tournamentId || !uuidPattern.test(tournamentId)) return NextResponse.json({ error: "Select a valid tournament." }, { status: 400 });
  const { data, error } = await access.supabase.from("tournament_standings").select("tournament_id,team_id,played,won,lost,tied,no_result,points,net_run_rate").eq("tournament_id", tournamentId).order("points", { ascending: false });
  if (error) return NextResponse.json({ error: "Could not load tournament standings. Apply the PCC platform migration." }, { status: 503 });
  return NextResponse.json({ standings: data ?? [] });
}

export async function PUT(request: Request) {
  const access = await authorized();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid standings request." }, { status: 400 });
  }
  const keys = ["tournamentId","teamId","played","won","lost","tied","noResult","points","netRunRate"] as const;
  if (!keys.every(key => key in body)) return NextResponse.json({ error: "Provide the complete standings record." }, { status: 400 });
  const { tournamentId, teamId, played, won, lost, tied, noResult, points, netRunRate } = body;
  const integerFields = [played, won, lost, tied, noResult, points];
  if (typeof tournamentId !== "string" || !uuidPattern.test(tournamentId) ||
      typeof teamId !== "string" || !uuidPattern.test(teamId) ||
      integerFields.some(value => typeof value !== "number" || !Number.isInteger(value) || value < 0) ||
      typeof played !== "number" || typeof won !== "number" || typeof lost !== "number" || typeof tied !== "number" || typeof noResult !== "number" ||
      played !== won + lost + tied + noResult ||
      (typeof netRunRate !== "number" && netRunRate !== null) ||
      (typeof netRunRate === "number" && (!Number.isFinite(netRunRate) || Math.abs(netRunRate) > 99999.999))) {
    return NextResponse.json({ error: "Provide valid tournament, team, counts and points." }, { status: 400 });
  }

  const { data: entry, error: entryError } = await access.supabase.from("tournament_entries")
    .select("team_id").eq("tournament_id", tournamentId).eq("team_id", teamId).eq("status", "approved").maybeSingle();
  if (entryError) return NextResponse.json({ error: "Could not verify the tournament participant." }, { status: 503 });
  if (!entry) return NextResponse.json({ error: "Standings can only be recorded for an approved tournament participant." }, { status: 409 });

  const { error } = await access.supabase.from("tournament_standings").upsert({
    tournament_id: tournamentId,
    team_id: teamId,
    played,
    won,
    lost,
    tied,
    no_result: noResult,
    points,
    net_run_rate: netRunRate,
    updated_at: new Date().toISOString()
  }, { onConflict: "tournament_id,team_id" });
  if (error) return NextResponse.json({ error: "Could not update tournament standings." }, { status: 503 });
  return NextResponse.json({ ok: true });
}
