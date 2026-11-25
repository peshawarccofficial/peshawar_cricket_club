import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import styles from "./tournament.module.css";

type Tournament = {
  id: string; slug: string | null; name: string; location: string | null;
  start_date: string; end_date: string; status: "upcoming"|"live"|"completed"|"cancelled";
  description: string | null; format: string; max_teams: number;
  entry_deadline: string | null; rules: string | null; approved_teams: number;
};

function dateLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

async function loadTournament(slug: string) {
  const supabase = await createClient();
  if (!supabase) return { supabase: null, tournament: null };
  let result = await supabase.from("public_tournaments").select("*").eq("slug", slug).maybeSingle();
  if (result.error || !result.data) result = await supabase.from("public_tournaments").select("*").eq("id", slug).maybeSingle();
  if (result.error) return { supabase, tournament: null, unavailable: true };
  return { supabase, tournament: (result.data ?? null) as Tournament | null, unavailable: false };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { tournament } = await loadTournament(slug);
  if (!tournament) return { title: "Tournament" };
  return {
    title: `${tournament.name} tournament`,
    description: `${tournament.name} in ${tournament.location || "Peshawar"} from ${dateLabel(tournament.start_date)} to ${dateLabel(tournament.end_date)}.`,
    alternates: tournament.slug ? { canonical: `/tournaments/${tournament.slug}` } : undefined,
    openGraph: { title: tournament.name, description: tournament.description || `${tournament.format} cricket tournament in Peshawar.` }
  };
}

export default async function TournamentDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, tournament, unavailable } = await loadTournament(slug);
  if (!tournament && !unavailable) notFound();
  if (!supabase || unavailable || !tournament) return <div className="page-wrap"><div className={styles.empty} role="alert"><h1>Tournament details unavailable</h1><p>Apply the PCC platform migration and verify tournament public access.</p><Link className="button" href="/tournaments">Back to tournaments</Link></div></div>;

  const [{ data: fixtureRows, error: fixturesError }, { data: standingRows, error: standingsError }, { data: entryRows }] = await Promise.all([
    supabase.from("tournament_fixtures").select("id,home_team_id,away_team_id,match_date,match_time,venue,stage,status,home_score,away_score,result_text").eq("tournament_id", tournament.id).order("match_date").order("match_time"),
    supabase.from("tournament_standings").select("team_id,played,won,lost,tied,no_result,points,net_run_rate").eq("tournament_id", tournament.id).order("points", { ascending: false }).order("net_run_rate", { ascending: false }),
    supabase.from("tournament_entries").select("team_id,status").eq("tournament_id", tournament.id).eq("status", "approved")
  ]);

  const teamIds = [...new Set([
    ...(fixtureRows ?? []).flatMap(row => [row.home_team_id, row.away_team_id]),
    ...(standingRows ?? []).map(row => row.team_id),
    ...(entryRows ?? []).map(row => row.team_id)
  ])];
  const { data: teamRows } = teamIds.length
    ? await supabase.from("public_teams").select("id,name,slug").in("id", teamIds)
    : { data: [] };
  const teams = new Map((teamRows ?? []).map(team => [team.id, team]));

  return <div className="page-wrap">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      name: tournament.name,
      startDate: tournament.start_date,
      endDate: tournament.end_date,
      eventStatus: tournament.status === "cancelled" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      location: { "@type": "Place", name: tournament.location || "Peshawar", address: { "@type": "PostalAddress", addressLocality:"Peshawar", addressRegion:"Khyber Pakhtunkhwa", addressCountry:"PK" } },
      organizer: { "@type":"SportsOrganization", name:"Peshawar Cricket Club", url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000" },
      description: tournament.description || `${tournament.format} cricket tournament in Peshawar.`,
      url: `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/tournaments/${tournament.slug || tournament.id}`
    }).replace(/</g,"\\u003c") }}/>
    <div className={styles.heading}>
      <span className={styles.status}>{tournament.status === "live" ? "In progress" : tournament.status}</span>
      <span className="eyebrow">PESHAWAR CRICKET TOURNAMENT</span>
      <h1>{tournament.name}</h1>
      <p>{tournament.location || "Peshawar"} · {dateLabel(tournament.start_date)} – {dateLabel(tournament.end_date)}</p>
    </div>
    <section className={styles.summary}>
      <div><small>Format</small><strong>{tournament.format}</strong></div>
      <div><small>Teams</small><strong>{tournament.approved_teams} / {tournament.max_teams}</strong></div>
      <div><small>Entry deadline</small><strong>{tournament.entry_deadline ? dateLabel(tournament.entry_deadline) : "Closed or not set"}</strong></div>
    </section>
    {tournament.description && <p className={styles.description}>{tournament.description}</p>}
    {tournament.rules && <details className={styles.rules}><summary>Tournament rules</summary><p>{tournament.rules}</p></details>}

    <section className={styles.section}>
      <div className={styles.sectionHeading}><h2>Fixtures & results</h2></div>
      {(fixturesError || !(fixtureRows?.length)) ? <div className={styles.empty}>{fixturesError ? "Fixture data could not be loaded." : "No fixtures have been published."}</div> :
        <div className={styles.fixtures}>{fixtureRows.map(fixture => {
          const home = teams.get(fixture.home_team_id);
          const away = teams.get(fixture.away_team_id);
          return <article className={styles.fixture} key={fixture.id}>
            <div><small>{fixture.stage} · {dateLabel(fixture.match_date)}{fixture.match_time ? ` · ${fixture.match_time.slice(0,5)}` : ""}</small><strong>{home?.name || "Team"} <span>vs</span> {away?.name || "Team"}</strong><small>{fixture.venue || "Venue to be confirmed"}</small></div>
            <div className={styles.result}><span>{fixture.status}</span>{fixture.status === "completed" && <strong>{fixture.home_score || "-"} / {fixture.away_score || "-"}</strong>}<p>{fixture.result_text || ""}</p></div>
          </article>;
        })}</div>}
    </section>

    <section className={styles.section}>
      <div className={styles.sectionHeading}><h2>Points table</h2></div>
      {standingsError ? <div className={styles.empty}>Standings could not be loaded.</div> : !(standingRows?.length) ? <div className={styles.empty}>Standings are not published yet.</div> :
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Team</th><th>P</th><th>W</th><th>L</th><th>T</th><th>NR</th><th>Pts</th><th>NRR</th></tr></thead><tbody>{standingRows.map(row => {
          const team = teams.get(row.team_id);
          return <tr key={row.team_id}><td>{team ? <Link href={`/teams/${team.slug}`}>{team.name}</Link> : "Team"}</td><td>{row.played}</td><td>{row.won}</td><td>{row.lost}</td><td>{row.tied}</td><td>{row.no_result}</td><td><strong>{row.points}</strong></td><td>{row.net_run_rate ?? "-"}</td></tr>;
        })}</tbody></table></div>}
    </section>
  </div>;
}
