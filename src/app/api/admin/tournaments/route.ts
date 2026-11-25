import { NextResponse } from "next/server";
import { getOwnerAdminSession } from "@/lib/admin-session";
import { createAdminServiceClient } from "@/lib/admin-service";

const statuses = ["upcoming", "live", "completed", "cancelled"] as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getDatabase() {
  if (!(await getOwnerAdminSession())) return { error: "Owner access required.", status: 401 as const };
  const supabase = createAdminServiceClient();
  if (!supabase) return { error: "Admin database access is not configured.", status: 503 as const };
  return { supabase };
}

export async function POST(request: Request) {
  const access = await getDatabase();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  let body: {
    name?: unknown; location?: unknown; start_date?: unknown; end_date?: unknown;
    description?: unknown; format?: unknown; max_teams?: unknown; entry_deadline?: unknown; rules?: unknown
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid tournament request." }, { status: 400 });
  }
  const {
    name, location, start_date: startDate, end_date: endDate, description,
    format, max_teams: maxTeams, entry_deadline: entryDeadline, rules
  } = body;
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const validDate = (value: string) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if (typeof name !== "string" || name.trim().length < 3 || name.trim().length > 100 ||
      typeof startDate !== "string" || !datePattern.test(startDate) || !validDate(startDate) ||
      typeof endDate !== "string" || !datePattern.test(endDate) || !validDate(endDate) || endDate < startDate ||
      (location !== undefined && location !== "" && (typeof location !== "string" || location.length > 120)) ||
      (description !== undefined && description !== "" && (typeof description !== "string" || description.length > 2000)) ||
      (format !== undefined && (typeof format !== "string" || format.trim().length < 1 || format.trim().length > 60)) ||
      (maxTeams !== undefined && (typeof maxTeams !== "number" || !Number.isInteger(maxTeams) || maxTeams < 2 || maxTeams > 64)) ||
      (entryDeadline !== undefined && entryDeadline !== "" && (typeof entryDeadline !== "string" || !datePattern.test(entryDeadline) || !validDate(entryDeadline) || entryDeadline > startDate)) ||
      (rules !== undefined && rules !== "" && (typeof rules !== "string" || rules.length > 4000))) {
    return NextResponse.json({ error: "Provide a valid tournament name, date range, and entry details." }, { status: 400 });
  }
  const { data, error } = await access.supabase.from("admin_tournaments").insert({
    name: name.trim(),
    location: typeof location === "string" ? location.trim() || null : null,
    start_date: startDate,
    end_date: endDate,
    description: typeof description === "string" ? description.trim() || null : null,
    format: typeof format === "string" ? format.trim() : "T20",
    max_teams: typeof maxTeams === "number" ? maxTeams : 16,
    entry_deadline: typeof entryDeadline === "string" && entryDeadline ? entryDeadline : null,
    rules: typeof rules === "string" ? rules.trim() || null : null
  }).select("id,name,location,start_date,end_date,status,description,format,max_teams,entry_deadline,rules,created_at").single();
  if (error || !data) return NextResponse.json({ error: "Could not create tournament. Apply the Admin and PCC platform migrations and check database access." }, { status: 503 });
  return NextResponse.json({ tournament: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const access = await getDatabase();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  let body: { id?: unknown; status?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid tournament request." }, { status: 400 });
  }
  if (typeof body.id !== "string" || !uuidPattern.test(body.id) || typeof body.status !== "string" || !(statuses as readonly string[]).includes(body.status)) {
    return NextResponse.json({ error: "Select a valid tournament and status." }, { status: 400 });
  }
  const { error } = await access.supabase.from("admin_tournaments").update({ status: body.status }).eq("id", body.id);
  if (error) return NextResponse.json({ error: "Could not update tournament. Check that the migration is applied." }, { status: 503 });
  return NextResponse.json({ ok: true });
}
