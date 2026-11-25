import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminServiceClient } from "@/lib/admin-service";

type Reminder = {
  fixture_id: string;
  home_team: string;
  away_team: string;
  match_date: string;
  match_time: string;
  ground: string | null;
  home_captain_id: string | null;
  away_captain_id: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAuthorized(request: Request, secret: string) {
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const expectedBuffer = Buffer.from(secret);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length > 0 &&
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Match reminder scheduling is not configured." }, { status: 503 });
  if (!isAuthorized(request, secret)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const supabase = createAdminServiceClient();
  if (!supabase) return NextResponse.json({ error: "Match reminder storage is not configured." }, { status: 503 });

  const { data, error } = await supabase.rpc("dispatch_due_match_reminders");
  if (error) {
    console.error("Could not claim due match reminders:", error.message);
    return NextResponse.json({ error: "Match reminder processing failed. Check the PCC platform migration." }, { status: 503 });
  }

  const reminders = (data || []) as Reminder[];
  const dispatches = await Promise.all(reminders.map(async reminder => {
    const userIds = [...new Set([reminder.home_captain_id, reminder.away_captain_id].filter((id): id is string => Boolean(id)))];
    if (!userIds.length) return { status: "no_captains", targeted: 0, delivered: 0 };
    try {
      const response = await fetch(new URL("/api/push/send", request.url), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
        body: JSON.stringify({
          category: "match_reminder",
          userIds,
          title: "Match reminder",
          body: `${reminder.home_team} vs ${reminder.away_team} starts soon at ${reminder.ground || "the scheduled ground"}.`,
          url: "/matches",
          tag: `match-reminder-${reminder.fixture_id}`
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(6000)
      });
      if (!response.ok) {
        console.error("Match reminder push dispatch failed with status:", response.status);
        return { status: response.status === 503 ? "not_configured" : "failed", targeted: 0, delivered: 0 };
      }
      const result: unknown = await response.json();
      if (!isRecord(result) ||
          typeof result.targeted !== "number" || typeof result.delivered !== "number") {
        console.error("Match reminder dispatcher returned an invalid response.");
        return { status: "failed", targeted: 0, delivered: 0 };
      }
      return {
        status: result.delivered > 0 ? "delivered" : "no_subscribers",
        targeted: result.targeted,
        delivered: result.delivered
      };
    } catch (dispatchError) {
      console.error("Could not dispatch match reminder:", dispatchError instanceof Error ? dispatchError.message : "unknown error");
      return { status: "failed", targeted: 0, delivered: 0 };
    }
  }));

  return NextResponse.json({
    processed: reminders.length,
    delivered: dispatches.reduce((count, result) => count + result.delivered, 0),
    targeted: dispatches.reduce((count, result) => count + result.targeted, 0),
    failed: dispatches.filter(result => result.status === "failed").length,
    pushNotConfigured: dispatches.filter(result => result.status === "not_configured").length
  });
}
