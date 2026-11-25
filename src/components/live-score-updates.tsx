"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./live-score-updates.module.css";

export function LiveScoreUpdates() {
  const router = useRouter();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    const channel = supabase.channel("pcc-live-scores")
      .on("postgres_changes", { event: "*", schema: "public", table: "fixtures" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "innings" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "ball_events" }, () => router.refresh())
      .subscribe(status => setConnected(status === "SUBSCRIBED"));
    return () => { void supabase.removeChannel(channel); };
  }, [router]);

  return <p className={styles.status} aria-live="polite">
    <span className={connected ? styles.connected : styles.offline} aria-hidden="true"/>
    {connected ? "Live score updates connected" : "Live updates reconnect automatically"}
  </p>;
}
