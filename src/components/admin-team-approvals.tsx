"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./teams-workspace.module.css";

type PendingTeam = { id: string; name: string; area: string | null; playerCount: number; created_at: string };

export function AdminTeamApprovals({ teams }: { teams: PendingTeam[] }) {
  const router = useRouter();
  const [busyTeam, setBusyTeam] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function updateStatus(teamId: string, status: "approved" | "rejected") {
    const supabase = createClient();
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }
    setBusyTeam(teamId);
    setError("");
    setMessage("");
    const { data, error: updateError } = await supabase
      .from("teams")
      .update({ status })
      .eq("id", teamId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (updateError) {
      setError(`Could not update this team. Confirm your admin role and database policies. (${updateError.message})`);
    } else if (!data) {
      setError("This registration has already changed. Refresh the page to see its current status.");
    } else {
      setMessage(status === "approved" ? "Team approved and now visible in the directory." : "Team registration rejected.");
      router.refresh();
    }
    setBusyTeam("");
  }

  return <section className={styles.section} aria-labelledby="pending-teams-heading">
    <h2 id="pending-teams-heading">Pending team registrations</h2>
    <p className={styles.description}>Approve only complete squads with 8–12 players. Approved teams become visible in the public directory.</p>
    {!teams.length ? <div className={styles.empty}>There are no pending team registrations.</div> : <div className={styles.adminList}>
      {teams.map(team => <article className={styles.adminCard} key={team.id}>
        <div>
          <h3>{team.name}</h3>
          <p>{team.area || "Peshawar"} · {team.playerCount} players · Submitted {new Date(team.created_at).toLocaleDateString()}</p>
          {(team.playerCount < 8 || team.playerCount > 12) && <p className={styles.error}>Roster must contain 8–12 players before approval.</p>}
        </div>
        <div className={styles.adminActions}>
          <button className={styles.approve} type="button" disabled={busyTeam === team.id || team.playerCount < 8 || team.playerCount > 12} onClick={() => void updateStatus(team.id, "approved")}>{busyTeam === team.id ? "Saving…" : "Approve"}</button>
          <button className={styles.reject} type="button" disabled={busyTeam === team.id} onClick={() => void updateStatus(team.id, "rejected")}>Reject</button>
        </div>
      </article>)}
    </div>}
    {message && <p className={styles.message} role="status">{message}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </section>;
}
