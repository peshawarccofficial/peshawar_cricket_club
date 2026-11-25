"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import styles from "./tournament-directory.module.css";

type Tournament = {
  id: string;
  slug: string;
  name: string;
  location: string | null;
  start_date: string;
  end_date: string;
  status: "upcoming" | "live" | "completed";
  description: string | null;
  format: string;
  max_teams: number;
  entry_deadline: string | null;
  rules: string | null;
  approved_teams: number;
};
type TeamOption = { id: string; name: string };
type Entry = { tournament_id: string; team_id: string; status: string; rejection_reason: string | null };

function dateLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function TournamentDirectory({
  tournaments,
  teams,
  initialEntries,
  signedIn,
  setupError
}: {
  tournaments: Tournament[];
  teams: TeamOption[];
  initialEntries: Entry[];
  signedIn: boolean;
  setupError?: string;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [selectedTeams, setSelectedTeams] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function apply(tournamentId: string) {
    const teamId = selectedTeams[tournamentId] || teams[0]?.id;
    if (!teamId) {
      setError("Only a captain of an approved team can apply.");
      return;
    }
    const supabase = createClient();
    if (!supabase) {
      setError("Tournament applications are not configured.");
      return;
    }
    setBusy(tournamentId);
    setError("");
    setNotice("");
    const { data, error: applyError } = await supabase.rpc("apply_for_tournament", {
      p_tournament_id: tournamentId,
      p_team_id: teamId
    });
    if (applyError) setError(applyError.message);
    else {
      setEntries(current => [...current, { tournament_id: tournamentId, team_id: teamId, status: "pending", rejection_reason: null }]);
      setNotice("Tournament application sent. The club owner will review it.");
      router.refresh();
      if (typeof data !== "string") setError("The application was saved, but its confirmation could not be read.");
    }
    setBusy("");
  }

  if (setupError) return <p className={styles.error} role="alert">{setupError}</p>;
  if (!tournaments.length) return <div className={styles.empty}>There are no published tournaments at the moment.</div>;

  return <div className={styles.directory}>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.grid}>
      {tournaments.map(tournament => {
        const existingEntry = entries.find(entry => entry.tournament_id === tournament.id);
        const entryClosed = tournament.status !== "upcoming" ||
          tournament.start_date < new Date().toISOString().slice(0, 10) ||
          Boolean(tournament.entry_deadline && tournament.entry_deadline < new Date().toISOString().slice(0, 10));
        return <article className={styles.card} key={tournament.id}>
          <div className={styles.cardHeader}><span className={styles.status}>{tournament.status === "live" ? "In progress" : tournament.status}</span><span>{tournament.format}</span></div>
          <h2><Link href={`/tournaments/${tournament.slug || tournament.id}`}>{tournament.name}</Link></h2>
          <p className={styles.location}>{tournament.location || "Peshawar"} · {dateLabel(tournament.start_date)} – {dateLabel(tournament.end_date)}</p>
          {tournament.description && <p className={styles.description}>{tournament.description}</p>}
          <div className={styles.meta}><span>{tournament.approved_teams} / {tournament.max_teams} teams</span>{tournament.entry_deadline && <span>Apply by {dateLabel(tournament.entry_deadline)}</span>}</div>
          {tournament.rules && <details><summary>Tournament rules</summary><p>{tournament.rules}</p></details>}
          {existingEntry ? <p className={styles.entryStatus}>Your team application: <strong>{existingEntry.status}</strong>{existingEntry.rejection_reason && ` · ${existingEntry.rejection_reason}`}</p>
            : !signedIn ? <Link className="button button-small" href="/login">Sign in to apply</Link>
              : teams.length && !entryClosed ? <div className={styles.apply}>
                <label htmlFor={`team-${tournament.id}`}>Applying team
                  <select id={`team-${tournament.id}`} value={selectedTeams[tournament.id] || teams[0].id} onChange={event => setSelectedTeams(current => ({ ...current, [tournament.id]: event.target.value }))}>
                    {teams.map(team => <option value={team.id} key={team.id}>{team.name}</option>)}
                  </select>
                </label>
                <button className="button button-small" type="button" disabled={busy === tournament.id} onClick={() => void apply(tournament.id)}>{busy === tournament.id ? "Applying…" : "Apply for entry"}</button>
              </div> : <p className={styles.closed}>{entryClosed ? "Applications are closed." : "An approved team captain can apply for entry."}</p>}
        </article>;
      })}
    </div>
  </div>;
}
