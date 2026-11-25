import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import styles from "./match.module.css";

type Fixture = {
  id: string; home_team_id: string; away_team_id: string; match_date: string;
  match_time: string|null; ground:string|null; overs:number; status:string;
};

async function loadFixture(id: string) {
  const supabase = await createClient();
  if (!supabase) return { supabase: null, fixture: null };
  const { data, error } = await supabase.from("fixtures").select("id,home_team_id,away_team_id,match_date,match_time,ground,overs,status").eq("id", id).maybeSingle();
  return { supabase, fixture: error ? null : data as Fixture|null, unavailable: Boolean(error) };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { fixture, supabase } = await loadFixture(id);
  if (!fixture || !supabase) return { title: "Cricket match", robots: { index: true, follow: true } };
  const { data: teams } = await supabase.from("public_teams").select("id,name").in("id", [fixture.home_team_id, fixture.away_team_id]);
  const names = new Map((teams ?? []).map(team => [team.id, team.name]));
  const title = `${names.get(fixture.home_team_id) || "Team"} vs ${names.get(fixture.away_team_id) || "Team"}`;
  return { title, description: `Cricket fixture on ${fixture.match_date} at ${fixture.ground || "Peshawar"}.`, alternates: { canonical: `/matches/${fixture.id}` } };
}

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, fixture, unavailable } = await loadFixture(id);
  if (!fixture && !unavailable) notFound();
  if (!supabase || !fixture) return <div className="page-wrap"><div className={styles.empty} role="alert"><h1>Match unavailable</h1><p>Verify the database migration and match public access.</p><Link className="button" href="/matches">Back to matches</Link></div></div>;

  const { data: teams } = await supabase.from("public_teams").select("id,name,slug").in("id", [fixture.home_team_id, fixture.away_team_id]);
  const teamMap = new Map((teams ?? []).map(team => [team.id, team]));
  const home = teamMap.get(fixture.home_team_id);
  const away = teamMap.get(fixture.away_team_id);
  const { data: scoreRows } = await supabase.from("innings").select("innings_number,total_runs,wickets,legal_balls,batting_team_id").eq("fixture_id", fixture.id).order("innings_number");
  const overs = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`;

  return <div className="page-wrap">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
      "@context":"https://schema.org",
      "@type":"SportsEvent",
      name:`${home?.name || "Team"} vs ${away?.name || "Team"}`,
      startDate:`${fixture.match_date}${fixture.match_time ? `T${fixture.match_time}` : "T00:00:00"}+05:00`,
      eventStatus:fixture.status==="cancelled" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
      eventAttendanceMode:"https://schema.org/OfflineEventAttendanceMode",
      location:{ "@type":"Place",name:fixture.ground || "Peshawar",address:{ "@type":"PostalAddress",addressLocality:"Peshawar",addressRegion:"Khyber Pakhtunkhwa",addressCountry:"PK" } },
      organizer:{ "@type":"SportsOrganization",name:"Peshawar Cricket Club",url:process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000" },
      url:`${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/matches/${fixture.id}`
    }).replace(/</g,"\\u003c") }}/>
    <div className={styles.heading}>
      <span className={styles.status}>{fixture.status}</span>
      <span className="eyebrow">PESHAWAR CRICKET CLUB FIXTURE</span>
      <h1>{home?.name || "Home team"} <span>vs</span> {away?.name || "Away team"}</h1>
      <p>{new Date(`${fixture.match_date}T12:00:00`).toLocaleDateString(undefined, { year:"numeric", month:"long", day:"numeric" })}{fixture.match_time ? ` · ${fixture.match_time.slice(0,5)}` : ""} · {fixture.ground || "Ground to be confirmed"} · {fixture.overs} overs</p>
    </div>
    <section className={styles.card}>
      <div className={styles.team}>{home ? <Link href={`/teams/${home.slug}`}>{home.name}</Link> : "Home team"}</div>
      <strong className={styles.vs}>VS</strong>
      <div className={styles.team}>{away ? <Link href={`/teams/${away.slug}`}>{away.name}</Link> : "Away team"}</div>
    </section>
    <section className={styles.scorecard}>
      <h2>Scorecard</h2>
      {(scoreRows ?? []).length ? scoreRows!.map(score => {
        const team = teamMap.get(score.batting_team_id);
        return <article key={`${score.innings_number}-${score.batting_team_id}`}><span>Innings {score.innings_number} · {team?.name || "Batting team"}</span><strong>{score.total_runs}/{score.wickets}</strong><small>{overs(score.legal_balls)} overs</small></article>;
      }) : <p className={styles.emptyScore}>No ball-by-ball score has been published for this fixture.</p>}
    </section>
  </div>;
}
