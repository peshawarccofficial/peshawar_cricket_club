import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameOrigin(request: NextRequest) {
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

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !datePattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function databaseError(message: string) {
  if (/already has an open poll/i.test(message)) {
    return NextResponse.json({ error: "This match already has an open poll." }, { status: 409 });
  }
  if (/already answered|already been answered|duplicate key|unique constraint/i.test(message)) {
    return NextResponse.json({ error: "This match request has already been handled or a matching request is open." }, { status: 409 });
  }
  if (/sign in/i.test(message)) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  if (/only the|only one of|only an approved|only a participating|not an approved/i.test(message)) {
    return NextResponse.json({ error: message }, { status: 403 });
  }
  return NextResponse.json({ error: message }, { status: 400 });
}

type PushDelivery = {
  status: "delivered" | "no_subscribers" | "not_configured" | "failed";
  targeted: number;
  delivered: number;
};

async function dispatchMatchPush(
  request: NextRequest,
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  invitationId: string,
  event: "request_created" | "response_accepted" | "response_declined" | "match_confirmed"
): Promise<PushDelivery> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { status: "not_configured", targeted: 0, delivered: 0 };

  const { data: recipients, error: recipientsError } = await supabase.rpc("get_match_push_recipients", {
    p_invitation_id: invitationId,
    p_event: event
  });
  if (recipientsError) {
    console.error("Could not resolve match notification recipients:", recipientsError.message);
    return { status: "failed", targeted: 0, delivered: 0 };
  }
  const userIds = [...new Set((recipients ?? []).map((recipient: { user_id: string }) => recipient.user_id))];
  if (!userIds.length) return { status: "no_subscribers", targeted: 0, delivered: 0 };

  const { data: invitation } = await supabase.from("public_match_invitations")
    .select("requester_team_name,invited_team_name,match_date,venue")
    .eq("id", invitationId)
    .maybeSingle();
  const title = event === "request_created"
    ? "New match invitation"
    : event === "response_declined"
      ? "Match invitation declined"
      : event === "response_accepted"
        ? "Match invitation accepted"
        : "Match confirmed";
  const teamName = event === "request_created"
    ? invitation?.requester_team_name
    : invitation?.invited_team_name;
  const body = event === "request_created"
    ? `${teamName || "A Peshawar team"} invited your team to play on ${invitation?.match_date || "a proposed date"}.`
    : event === "response_declined"
      ? "The invited team declined your match request."
      : event === "response_accepted"
        ? `${teamName || "The invited team"} accepted your match request.`
        : `Both captains confirmed the match on ${invitation?.match_date || "the scheduled date"}.`;

  try {
    const response = await fetch(new URL("/api/push/send", request.url), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({
        category: event === "request_created" || event === "response_declined" ? "match_request" : "fixture_accepted",
        userIds,
        title,
        body,
        url: event === "match_confirmed" ? "/live" : "/matches",
        tag: `match-${invitationId}`
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(6000)
    });
    if (!response.ok) {
      if (response.status === 503) return { status: "not_configured", targeted: 0, delivered: 0 };
      console.error("Match push dispatch failed with status:", response.status);
      return { status: "failed", targeted: 0, delivered: 0 };
    }
    const result: unknown = await response.json();
    if (!isRecord(result) || typeof result.targeted !== "number" || typeof result.delivered !== "number") {
      console.error("Match push dispatcher returned an invalid response.");
      return { status: "failed", targeted: 0, delivered: 0 };
    }
    return {
      status: result.delivered > 0 ? "delivered" : "no_subscribers",
      targeted: result.targeted,
      delivered: result.delivered
    };
  } catch (error) {
    console.error("Match push dispatch could not reach the push endpoint:", error instanceof Error ? error.message : "unknown error");
    return { status: "failed", targeted: 0, delivered: 0 };
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Match booking is not configured." }, { status: 503 });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!isRecord(parsed)) return NextResponse.json({ error: "Invalid match request." }, { status: 400 });
    body = parsed;
  } catch {
    return NextResponse.json({ error: "Invalid match request." }, { status: 400 });
  }

  if (body.action === "create") {
    const {
      requesterTeamId, invitedTeamId, matchDate, matchTime, venue, overs, matchFormat, notes
    } = body;
    if (typeof requesterTeamId !== "string" || !uuidPattern.test(requesterTeamId) ||
        typeof invitedTeamId !== "string" || !uuidPattern.test(invitedTeamId) ||
        !validDate(matchDate) ||
        (matchTime !== null && matchTime !== undefined && (typeof matchTime !== "string" || !timePattern.test(matchTime))) ||
        typeof venue !== "string" || venue.trim().length < 2 || venue.trim().length > 160 ||
        typeof overs !== "number" || !Number.isInteger(overs) || overs < 1 || overs > 50 ||
        typeof matchFormat !== "string" || matchFormat.trim().length < 1 || matchFormat.trim().length > 80 ||
        (notes !== undefined && notes !== null && (typeof notes !== "string" || notes.trim().length > 1000))) {
      return NextResponse.json({ error: "Provide two approved teams, a valid date, venue, match format, and 1–50 overs." }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("create_match_invitation", {
      p_requester_team_id: requesterTeamId,
      p_invited_team_id: invitedTeamId,
      p_match_date: matchDate,
      p_match_time: typeof matchTime === "string" ? matchTime : null,
      p_venue: venue.trim(),
      p_overs: overs,
      p_match_format: matchFormat.trim(),
      p_notes: typeof notes === "string" ? notes.trim() || null : null
    });
    if (error) return databaseError(error.message);
    const pushDelivery = await dispatchMatchPush(request, supabase, data, "request_created");
    return NextResponse.json({ id: data, pushDelivery }, { status: 201 });
  }

  if (body.action === "respond") {
    if (typeof body.id !== "string" || !uuidPattern.test(body.id) ||
        (body.response !== "accepted" && body.response !== "rejected")) {
      return NextResponse.json({ error: "Select a valid invitation and response." }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("respond_match_invitation", {
      p_invitation_id: body.id,
      p_response: body.response
    });
    if (error) return databaseError(error.message);
    const pushDelivery = await dispatchMatchPush(
      request,
      supabase,
      body.id,
      body.response === "accepted" ? "response_accepted" : "response_declined"
    );
    return NextResponse.json({ id: data, pushDelivery });
  }

  if (body.action === "confirm") {
    if (typeof body.id !== "string" || !uuidPattern.test(body.id) ||
        !validDate(body.matchDate) ||
        (body.matchTime !== null && body.matchTime !== undefined && (typeof body.matchTime !== "string" || !timePattern.test(body.matchTime))) ||
        typeof body.venue !== "string" || body.venue.trim().length < 2 || body.venue.trim().length > 160) {
      return NextResponse.json({ error: "Provide a valid match date, time, and venue." }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("confirm_match_arrangement", {
      p_invitation_id: body.id,
      p_match_date: body.matchDate,
      p_match_time: typeof body.matchTime === "string" ? body.matchTime : null,
      p_venue: body.venue.trim()
    });
    if (error) return databaseError(error.message);
    const { data: invitation, error: invitationError } = await supabase.from("public_match_invitations")
      .select("status")
      .eq("id", body.id)
      .maybeSingle();
    const pushDelivery = invitationError || invitation?.status !== "finalized"
      ? null
      : await dispatchMatchPush(request, supabase, body.id, "match_confirmed");
    return NextResponse.json({ id: data, pushDelivery });
  }

  if (body.action === "create-poll") {
    const { invitationId, dateOptions, timeOptions, venueOptions, allowVoteChanges } = body;
    const validOptions = (value: unknown, validate: (item: string) => boolean): value is string[] =>
      Array.isArray(value) &&
      value.length >= 2 &&
      value.length <= 8 &&
      value.every(item => typeof item === "string" && item.trim() === item && validate(item));
    if (
      typeof invitationId !== "string" ||
      !uuidPattern.test(invitationId) ||
      !validOptions(dateOptions, validDate) ||
      !validOptions(timeOptions, item => timePattern.test(item)) ||
      !validOptions(venueOptions, item => item.length >= 2 && item.length <= 160) ||
      (allowVoteChanges !== undefined && typeof allowVoteChanges !== "boolean")
    ) {
      return NextResponse.json({ error: "Provide 2–8 valid date, time, and venue options." }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("create_match_poll", {
      p_invitation_id: invitationId,
      p_date_options: dateOptions,
      p_time_options: timeOptions,
      p_venue_options: venueOptions,
      p_allow_vote_changes: allowVoteChanges ?? true
    });
    if (error) return databaseError(error.message);
    return NextResponse.json({ id: data }, { status: 201 });
  }

  if (body.action === "vote") {
    if (
      typeof body.pollId !== "string" ||
      !uuidPattern.test(body.pollId) ||
      typeof body.optionId !== "string" ||
      !uuidPattern.test(body.optionId)
    ) {
      return NextResponse.json({ error: "Choose a valid poll option." }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("cast_match_poll_vote", {
      p_poll_id: body.pollId,
      p_option_id: body.optionId
    });
    if (error) return databaseError(error.message);
    return NextResponse.json({ id: data });
  }

  if (body.action === "close-poll") {
    if (typeof body.pollId !== "string" || !uuidPattern.test(body.pollId)) {
      return NextResponse.json({ error: "Choose a valid poll." }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("close_match_poll", { p_poll_id: body.pollId });
    if (error) return databaseError(error.message);
    return NextResponse.json({ id: data });
  }

  return NextResponse.json({ error: "Unknown match action." }, { status: 400 });
}
