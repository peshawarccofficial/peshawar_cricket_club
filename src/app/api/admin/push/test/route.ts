import { NextResponse } from "next/server";
import * as webpush from "web-push";
import { getOwnerAdminSession } from "@/lib/admin-session";
import { createAdminServiceClient } from "@/lib/admin-service";

type SubscriptionRow = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function POST() {
  if (!(await getOwnerAdminSession())) return NextResponse.json({ error: "Owner access required." }, { status: 401 });
  const supabase = createAdminServiceClient();
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!supabase || !publicKey || !privateKey || !subject) {
    return NextResponse.json({ error: "Web Push is not configured. Set the server database and VAPID keys first." }, { status: 503 });
  }
  const { data, error } = await supabase.from("admin_push_subscriptions").select("endpoint,keys").eq("owner_username", "owner-control-center");
  if (error) return NextResponse.json({ error: "Admin push storage is not ready. Apply the admin PWA migration." }, { status: 503 });
  const subscriptions = (data || []) as SubscriptionRow[];
  if (!subscriptions.length) return NextResponse.json({ error: "Enable notifications on this device before sending a test." }, { status: 409 });
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  } catch {
    return NextResponse.json({ error: "The configured Web Push keys are invalid." }, { status: 503 });
  }
  const results = await Promise.all(subscriptions.map(async subscription => {
    try {
      await webpush.sendNotification(subscription, JSON.stringify({
        title: "PCC Admin notifications are ready",
        body: "This device can receive club registration alerts.",
        url: "/admin?view=notifications",
        tag: "pcc-admin-test"
      }));
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
  const delivered = results.filter(Boolean).length;
  return NextResponse.json({ delivered, targeted: subscriptions.length }, { status: delivered ? 200 : 502 });
}
