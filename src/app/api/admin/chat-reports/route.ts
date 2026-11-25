import { NextResponse } from "next/server";
import { getOwnerAdminSession } from "@/lib/admin-session";
import { createAdminServiceClient } from "@/lib/admin-service";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET() {
  if (!(await getOwnerAdminSession())) return NextResponse.json({ error: "Owner access required." }, { status: 401 });
  const supabase = createAdminServiceClient();
  if (!supabase) return NextResponse.json({ error: "Admin database access is not configured." }, { status: 503 });

  const { data: reports, error: reportsError } = await supabase.from("chat_message_reports")
    .select("id,message_id,reporter_id,reason,status,review_note,reviewed_by,reviewed_at,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (reportsError) return NextResponse.json({ error: "Could not load chat reports. Apply the PCC platform migration." }, { status: 503 });
  if (!reports?.length) return NextResponse.json({ reports: [] });

  const messageIds = [...new Set(reports.map(report => report.message_id))];
  const userIds = [...new Set(reports.map(report => report.reporter_id))];
  const [{ data: messages, error: messagesError }, { data: reporters, error: reportersError }] = await Promise.all([
    supabase.from("messages").select("id,conversation_id,sender_id,body,created_at").in("id", messageIds),
    supabase.from("profiles").select("id,display_name").in("id", userIds)
  ]);
  if (messagesError || reportersError) return NextResponse.json({ error: "Could not load reported message details." }, { status: 503 });

  const senderIds = [...new Set((messages ?? []).map(message => message.sender_id))];
  const { data: senders, error: sendersError } = senderIds.length
    ? await supabase.from("profiles").select("id,display_name").in("id", senderIds)
    : { data: [], error: null };
  if (sendersError) return NextResponse.json({ error: "Could not load reported message authors." }, { status: 503 });

  const messageById = new Map((messages ?? []).map(message => [message.id, message]));
  const profileById = new Map([...(reporters ?? []), ...(senders ?? [])].map(profile => [profile.id, profile.display_name || "Club member"]));
  return NextResponse.json({
    reports: reports.map(report => {
      const message = messageById.get(report.message_id);
      return {
        ...report,
        reporter_name: profileById.get(report.reporter_id) || "Club member",
        message_body: message?.body || "[Message no longer available]",
        message_sender: message ? profileById.get(message.sender_id) || "Club member" : "Unknown sender",
        conversation_id: message?.conversation_id || null,
        message_created_at: message?.created_at || null
      };
    })
  });
}

export async function PATCH(request: Request) {
  const session = await getOwnerAdminSession();
  if (!session) return NextResponse.json({ error: "Owner access required." }, { status: 401 });
  const supabase = createAdminServiceClient();
  if (!supabase) return NextResponse.json({ error: "Admin database access is not configured." }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid chat report review." }, { status: 400 });
  }
  if (typeof body.id !== "string" || !uuidPattern.test(body.id) ||
      (body.status !== "resolved" && body.status !== "dismissed") ||
      (body.reviewNote !== undefined && body.reviewNote !== null &&
        (typeof body.reviewNote !== "string" || body.reviewNote.trim().length > 1000))) {
    return NextResponse.json({ error: "Choose a report status and provide a review note of at most 1000 characters." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("review_chat_message_report", {
    p_report_id: body.id,
    p_status: body.status,
    p_review_note: typeof body.reviewNote === "string" ? body.reviewNote.trim() || null : null,
    p_operator: session.username
  });
  if (error) {
    const conflict = /not found/i.test(error.message);
    return NextResponse.json({ error: conflict ? error.message : "Could not review the chat report. Apply the PCC platform migration." }, { status: conflict ? 409 : 503 });
  }
  return NextResponse.json({ id: data });
}
