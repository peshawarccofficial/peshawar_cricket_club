import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import * as webpush from "web-push";
import { createAdminServiceClient } from "@/lib/admin-service";

type SubscriptionRow = { endpoint: string; keys: { p256dh: string; auth: string } };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validSecret(request: Request) {
  const expected = process.env.OWNER_PUSH_SECRET || "";
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length > 0 && expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}

export async function POST(request: Request) {
  if (!validSecret(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  let body: { notificationId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid notification event." }, { status: 400 });
  }
  if (typeof body.notificationId !== "string" || !uuidPattern.test(body.notificationId)) return NextResponse.json({ error: "Invalid notification id." }, { status: 400 });
  const supabase = createAdminServiceClient();
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!supabase || !publicKey || !privateKey || !subject) return NextResponse.json({ error: "Admin Web Push is not configured." }, { status: 503 });
  const { data: notification, error: notificationError } = await supabase.from("owner_notifications").select("id,title,body").eq("id", body.notificationId).maybeSingle();
  if (notificationError || !notification) return NextResponse.json({ error: "Owner notification was not found." }, { status: 404 });
  const { data, error } = await supabase.from("admin_push_subscriptions").select("endpoint,keys").eq("owner_username", "owner-control-center");
  if (error) return NextResponse.json({ error: "Admin push storage is not ready." }, { status: 503 });
  const subscriptions = (data || []) as SubscriptionRow[];
  if (!subscriptions.length) return NextResponse.json({ delivered: 0, targeted: 0 });
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  } catch {
    return NextResponse.json({ error: "Configured Web Push keys are invalid." }, { status: 503 });
  }
  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body || "A new club update is available.",
    url: "/admin?view=notifications",
    tag: `owner-${notification.id}`
  });
  const outcomes = await Promise.all(subscriptions.map(async subscription => {
    try {
      await webpush.sendNotification(subscription, payload);
      return true;
    } catch (sendError) {
      const status = typeof sendError === "object" && sendError !== null && "statusCode" in sendError ? sendError.statusCode : undefined;
      if (status === 404 || status === 410) {
        const { error: deleteError } = await supabase.from("admin_push_subscriptions").delete().eq("endpoint", subscription.endpoint);
        if (deleteError) console.error("Could not remove expired admin push subscription:", deleteError.message);
      }
      return false;
    }
  }));
  const delivered = outcomes.filter(Boolean).length;
  if (delivered) {
    const { error: updateError } = await supabase.from("owner_notifications").update({ push_delivered_at: new Date().toISOString() }).eq("id", notification.id);
    if (updateError) console.error("Could not record admin push delivery:", updateError.message);
  }
  return NextResponse.json({ delivered, targeted: subscriptions.length }, { status: delivered ? 200 : 502 });
}
