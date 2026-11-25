import { NextResponse } from "next/server";
import { getOwnerAdminSession } from "@/lib/admin-session";
import { createAdminServiceClient } from "@/lib/admin-service";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses = ["scheduled", "live", "completed", "cancelled"] as const;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function isValidDate(value: string) {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export async function GET() {
  if (!(await getOwnerAdminSession())) return NextResponse.json({ error: "Owner access required." }, { status: 401 });
  const supabase = createAdminServiceClient();
  if (!supabase) return NextResponse.json({ error: "Admin database access is not configured." }, { status: 503 });
  const [{ data: tournaments, error: tournamentError }, { data: teams, error: teamError }, { data: fixtures, error: fixtureError }, { data: approvedEntries, error: entriesError }] = await Promise.all([
    supabase.from("admin_tournaments").select("id,name,status").order("start_date", { ascending: true }),
    supabase.from("teams").select("id,name").eq("status", "approved").is("deleted_at", null).order("name"),
    supabase.from("tournament_fixtures").select("id,tournament_id,home_team_id,away_team_id,match_date,match_time,venue,stage,status,home_score,away_score,result_text").order("match_date", { ascending: true }),
    supabase.from("tournament_entries").select("tournament_id,team_id").eq("status", "approved")
  ]);
  if (tournamentError || teamError || fixtureError || entriesError) return NextResponse.json({ error: "Tournament fixtures are unavailable. Apply the PCC platform migration." }, { status: 503 });
  return NextResponse.json({ tournaments: tournaments ?? [], teams: teams ?? [], fixtures: fixtures ?? [], approvedEntries: approvedEntries ?? [] });
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
    return NextResponse.json({ error: "Invalid tournament fixture." }, { status: 400 });
  }
  const { tournamentId, homeTeamId, awayTeamId, matchDate, matchTime, venue, stage } = body;
  if (typeof tournamentId !== "string" || !uuidPattern.test(tournamentId) ||
      typeof homeTeamId !== "string" || !uuidPattern.test(homeTeamId) ||
      typeof awayTeamId !== "string" || !uuidPattern.test(awayTeamId) || homeTeamId === awayTeamId ||
      typeof matchDate !== "string" || !isValidDate(matchDate) ||
      (matchTime !== undefined && matchTime !== null && (typeof matchTime !== "string" || !timePattern.test(matchTime))) ||
      (venue !== undefined && venue !== null && (typeof venue !== "string" || venue.trim().length > 120)) ||
      (typeof stage !== "string" || stage.trim().length < 1 || stage.trim().length > 30)) {
    return NextResponse.json({ error: "Choose a tournament, two different teams, and a valid match date." }, { status: 400 });
  }

  const { data: tournament, error: tournamentError } = await supabase.from("admin_tournaments")
    .select("id,status,start_date,end_date").eq("id", tournamentId).maybeSingle();
  if (tournamentError) return NextResponse.json({ error: "Could not verify the tournament." }, { status: 503 });
  if (!tournament) return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  if (tournament.status === "cancelled" || tournament.status === "completed") {
    return NextResponse.json({ error: "Fixtures cannot be added to a completed or cancelled tournament." }, { status: 409 });
  }
  if (matchDate < tournament.start_date || matchDate > tournament.end_date) {
    return NextResponse.json({ error: "The fixture date must be within the tournament dates." }, { status: 400 });
  }

  const { data: entries, error: entriesError } = await supabase.from("tournament_entries")
    .select("team_id").eq("tournament_id", tournamentId).in("team_id", [homeTeamId, awayTeamId]).eq("status", "approved");
  if (entriesError) return NextResponse.json({ error: "Could not verify tournament participants." }, { status: 503 });
  if (new Set((entries ?? []).map(entry => entry.team_id)).size !== 2) {
    return NextResponse.json({ error: "Both teams must have approved entries in this tournament." }, { status: 409 });
  }

  const { data, error } = await supabase.from("tournament_fixtures").insert({
    tournament_id: tournamentId,
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    match_date: matchDate,
    match_time: typeof matchTime === "string" && matchTime ? matchTime : null,
    venue: typeof venue === "string" && venue.trim() ? venue.trim() : null,
    stage: stage.trim()
  }).select("id,tournament_id,home_team_id,away_team_id,match_date,match_time,venue,stage,status,home_score,away_score,result_text").single();
  if (error) return NextResponse.json({ error: "Could not create tournament fixture. Check team approval and migration setup." }, { status: 503 });
  return NextResponse.json({ fixture: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!(await getOwnerAdminSession())) return NextResponse.json({ error: "Owner access required." }, { status: 401 });
  const supabase = createAdminServiceClient();
  if (!supabase) return NextResponse.json({ error: "Admin database access is not configured." }, { status: 503 });
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid tournament result." }, { status: 400 });
  }
  const { id, status, homeScore, awayScore, resultText } = body;
  if (typeof id !== "string" || !uuidPattern.test(id) ||
      (status !== undefined && (typeof status !== "string" || !(statuses as readonly string[]).includes(status))) ||
      (homeScore !== undefined && homeScore !== null && (typeof homeScore !== "string" || homeScore.trim().length > 30)) ||
      (awayScore !== undefined && awayScore !== null && (typeof awayScore !== "string" || awayScore.trim().length > 30)) ||
      (resultText !== undefined && resultText !== null && (typeof resultText !== "string" || resultText.trim().length > 500)) ||
      (status === undefined && homeScore === undefined && awayScore === undefined && resultText === undefined)) {
    return NextResponse.json({ error: "Select a valid fixture and status." }, { status: 400 });
  }

  const { data: existing, error: existingError } = await supabase.from("tournament_fixtures")
    .select("status,home_score,away_score").eq("id", id).maybeSingle();
  if (existingError) return NextResponse.json({ error: "Could not load the tournament fixture." }, { status: 503 });
  if (!existing) return NextResponse.json({ error: "Tournament fixture not found." }, { status: 404 });
  const nextStatus = typeof status === "string" ? status : existing.status;
  const nextHomeScore = homeScore === undefined ? existing.home_score : typeof homeScore === "string" ? homeScore.trim() || null : null;
  const nextAwayScore = awayScore === undefined ? existing.away_score : typeof awayScore === "string" ? awayScore.trim() || null : null;
  if (nextStatus === "completed" && (!nextHomeScore || !nextAwayScore)) {
    return NextResponse.json({ error: "Enter both team scores before completing the fixture." }, { status: 400 });
  }

  const changes: Record<string, string | null> = {
    updated_at: new Date().toISOString()
  };
  if (typeof status === "string") changes.status = status;
  if (homeScore !== undefined) changes.home_score = nextHomeScore;
  if (awayScore !== undefined) changes.away_score = nextAwayScore;
  if (resultText !== undefined) changes.result_text = typeof resultText === "string" ? resultText.trim() || null : null;

  const { data: updated, error } = await supabase.from("tournament_fixtures").update(changes).eq("id", id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not update tournament fixture." }, { status: 503 });
  if (!updated) return NextResponse.json({ error: "Tournament fixture not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
