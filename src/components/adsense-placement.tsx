import { createClient } from "@/lib/supabase/server";
import { AdsenseSlot } from "./adsense-slot";

const publisherPattern = /^ca-pub-\d{16}$/;
const slotPattern = /^\d{4,20}$/;

export async function AdsensePlacement({ placement }: { placement: "homepage_content" | "public_content" }) {
  const supabase = await createClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("advertisements")
    .select("publisher_id,slot_id")
    .eq("placement", placement)
    .eq("enabled", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(`Could not load AdSense placement ${placement}:`, error.message);
    return null;
  }
  if (!data || !publisherPattern.test(data.publisher_id ?? "") || !slotPattern.test(data.slot_id ?? "")) return null;
  return <AdsenseSlot publisherId={data.publisher_id} slotId={data.slot_id} placement={placement}/>;
}
