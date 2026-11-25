import { NextResponse, type NextRequest } from "next/server";
import { getOwnerAdminSession } from "@/lib/admin-session";
import { createAdminServiceClient } from "@/lib/admin-service";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedExtras = new Set(["wide", "no_ball", "bye", "leg_bye", "penalty"]);
const allowedDismissals = new Set(["bowled", "caught", "lbw", "run_out", "stumped", "hit_wicket", "other"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const forwardedHost = (request.headers.get("x-forwarded-host") ?? request.headers.get("host"))?.split(",")[0]?.trim();
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const expectedOrigins = new Set([new URL(request.url).origin]);
  if (forwardedHost && forwardedProtocol) expectedOrigins.add(`${forwardedProtocol}://${forwardedHost}`);
  try {
    return expectedOrigins.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

function errorResponse(message: string) {
  const status = /authorized admin|required|admin session/i.test(message) ? 401
    : /not found|select|valid|must be|cannot|already|complete|live|limit|innings/i.test(message) ? 400
      : 500;
  return NextResponse.json({ error: message }, { status });
}

type PushDelivery = { status: "delivered" | "no_subscribers" | "not_configured" | "failed"; targeted: number; delivered: number };

async function dispatchLiveScorePush(
  request: NextRequest,
  supabase: NonNullable<ReturnType<typeof createAdminServiceClient>>,
  inningsId: string,
  eventId: string
): Promise<PushDelivery> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { status: "not_configured", targeted: 0, delivered: 0 };

  const { data: inning, error: inningError } = await supabase.from("innings")
    .select("fixture_id,batting_team_id,total_runs,wickets,legal_balls")
    .eq("id", inningsId)
    .maybeSingle();
  if (inningError || !inning) {
    console.error("Could not load innings for score notification:", inningError?.message || "Innings not found.");
    return { status: "failed", targeted: 0, delivered: 0 };
  }
  const { data: fixture, error: fixtureError } = await supabase.from("fixtures")
    .select("home_team_id,away_team_id")
    .eq("id", inning.fixture_id)
    .maybeSingle();
  if (fixtureError || !fixture) {
    console.error("Could not load fixture for score notification:", fixtureError?.message || "Fixture not found.");
    return { status: "failed", targeted: 0, delivered: 0 };
  }
  const { data: teams, error: teamsError } = await supabase.from("teams")
    .select("id,name,captain_id")
    .in("id", [fixture.home_team_id, fixture.away_team_id]);
  if (teamsError) {
    console.error("Could not load captains for score notification:", teamsError.message);
    return { status: "failed", targeted: 0, delivered: 0 };
  }
  const userIds = [...new Set((teams ?? []).map(team => team.captain_id).filter((id): id is string => Boolean(id)))];
  if (!userIds.length) return { status: "no_subscribers", targeted: 0, delivered: 0 };

  const batting = teams?.find(team => team.id === inning.batting_team_id);
  const opposition = teams?.find(team => team.id !== inning.batting_team_id);
  const overs = `${Math.floor(inning.legal_balls / 6)}.${inning.legal_balls % 6}`;
  try {
    const response = await fetch(new URL("/api/push/send", request.url), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({
        category: "live_score",
        userIds,
        title: "Live score update",
        body: `${batting?.name || "Batting team"} ${inning.total_runs}/${inning.wickets} (${overs} ov) vs ${opposition?.name || "opposition"}.`,
        url: "/live",
        tag: `live-score-${eventId}`
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) {
      console.error("Live score push dispatch failed with status:", response.status);
      return { status: response.status === 503 ? "not_configured" : "failed", targeted: 0, delivered: 0 };
    }
    const result: unknown = await response.json();
    if (!isRecord(result) || typeof result.targeted !== "number" || typeof result.delivered !== "number") {
      console.error("Live score push dispatcher returned an invalid response.");
      return { status: "failed", targeted: 0, delivered: 0 };
    }
    return {
      status: result.delivered > 0 ? "delivered" : "no_subscribers",
      targeted: result.targeted,
      delivered: result.delivered
    };
  } catch (error) {
    console.error("Live score push dispatch could not reach the push endpoint:", error instanceof Error ? error.message : "unknown error");
    return { status: "failed", targeted: 0, delivered: 0 };
  }
}

async function submit(request: NextRequest) {
  if (!validOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await getOwnerAdminSession();
  if (!session) return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  const supabase = createAdminServiceClient();
  if (!supabase) return NextResponse.json({ error: "Admin scoring is not configured. Set the Supabase service role key." }, { status: 503 });

  let input: Record<string, unknown>;
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) return NextResponse.json({ error: "Invalid scoring request." }, { status: 400 });
    input = body;
  } catch {
    return NextResponse.json({ error: "Invalid scoring request." }, { status: 400 });
  }

  const operator = session.username;
  if (input.action === "start_innings") {
    if (typeof input.fixtureId !== "string" || !uuidPattern.test(input.fixtureId) ||
        typeof input.battingTeamId !== "string" || !uuidPattern.test(input.battingTeamId)) {
      return NextResponse.json({ error: "Choose a valid fixture and batting team." }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("start_admin_innings", {
      p_fixture_id: input.fixtureId,
      p_batting_team_id: input.battingTeamId,
      p_admin_username: operator
    });
    if (error) return errorResponse(error.message);
    if (typeof data !== "string" || !uuidPattern.test(data)) {
      console.error("Innings RPC returned an invalid innings id.");
      return NextResponse.json({ error: "The innings started, but its confirmation could not be read." }, { status: 500 });
    }
    return NextResponse.json({ id: data });
  }

  if (input.action === "record_ball") {
    if (typeof input.inningsId !== "string" || !uuidPattern.test(input.inningsId) ||
        typeof input.batterId !== "string" || !uuidPattern.test(input.batterId) ||
        typeof input.bowlerId !== "string" || !uuidPattern.test(input.bowlerId) ||
        typeof input.batterRuns !== "number" || !Number.isInteger(input.batterRuns) || input.batterRuns < 0 || input.batterRuns > 6 ||
        (input.extraType !== null && input.extraType !== "" && (typeof input.extraType !== "string" || !allowedExtras.has(input.extraType))) ||
        typeof input.extraRuns !== "number" || !Number.isInteger(input.extraRuns) || input.extraRuns < 0 || input.extraRuns > 10 ||
        typeof input.isWicket !== "boolean" ||
        (input.isWicket && (typeof input.dismissalType !== "string" || !allowedDismissals.has(input.dismissalType)))) {
      return NextResponse.json({ error: "Provide valid batter, bowler, runs, extras, and wicket details." }, { status: 400 });
    }
    const inningsId = input.inningsId;
    const { data, error } = await supabase.rpc("record_admin_ball_event", {
      p_innings_id: inningsId,
      p_batter_id: input.batterId,
      p_bowler_id: input.bowlerId,
      p_batter_runs: input.batterRuns,
      p_extra_type: typeof input.extraType === "string" && input.extraType ? input.extraType : null,
      p_extra_runs: input.extraRuns,
      p_is_wicket: input.isWicket,
      p_dismissal_type: input.isWicket ? input.dismissalType : null,
      p_admin_username: operator
    });
    if (error) return errorResponse(error.message);
    if (typeof data !== "string" || !uuidPattern.test(data)) {
      console.error("Scoring RPC returned an invalid ball event id.");
      return NextResponse.json({ error: "The ball was recorded, but its confirmation could not be read." }, { status: 500 });
    }
    const pushDelivery = await dispatchLiveScorePush(request, supabase, inningsId, data);
    return NextResponse.json({ id: data, pushDelivery });
  }

  if (input.action === "finish_innings" || input.action === "undo_ball") {
    if (typeof input.inningsId !== "string" || !uuidPattern.test(input.inningsId)) {
      return NextResponse.json({ error: "Choose a valid innings." }, { status: 400 });
    }
    const functionName = input.action === "finish_innings" ? "finish_admin_innings" : "undo_admin_ball_event";
    const { data, error } = await supabase.rpc(functionName, {
      p_innings_id: input.inningsId,
      p_admin_username: operator
    });
    if (error) return errorResponse(error.message);
    return NextResponse.json({ id: data });
  }

  if (input.action === "complete_match") {
    if (typeof input.fixtureId !== "string" || !uuidPattern.test(input.fixtureId)) {
      return NextResponse.json({ error: "Choose a valid fixture." }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("complete_admin_match", {
      p_fixture_id: input.fixtureId,
      p_admin_username: operator
    });
    if (error) return errorResponse(error.message);
    return NextResponse.json({ id: data });
  }

  return NextResponse.json({ error: "Unknown scoring action." }, { status: 400 });
}

export async function POST(request: NextRequest) {
  return submit(request);
}
