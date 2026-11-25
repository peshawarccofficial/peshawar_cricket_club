import type { Metadata } from "next";
import { Activity, Radio } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { LiveScoreUpdates } from "@/components/live-score-updates";
import styles from "./live.module.css";

export const metadata: Metadata = {
  title: "Live Cricket Scores",
  description: "Follow verified live match scores from Peshawar Cricket Club."
};

type Fixture = { id: string; home_team_id: string; away_team_id: string; match_date: string; match_time: string | null; ground: string | null };
type Innings = { id: string; fixture_id: string; innings_number: number; batting_team_id: string; total_runs: number; wickets: number; legal_balls: number };
type TeamOption = { id: string; name: string };

function overs(legalBalls: number) {
  return `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;
}

function formatMatchDate(date: string, time: string | null) {
  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return `${dateLabel}${time ? ` · ${time.slice(0, 5)}` : ""}`;
}

export default async function LivePage() {
  const supabase = await createClient();
  if (!supabase) return <LiveUnavailable message="Live score data is unavailable because Supabase is not configured."/>;

  const { data: fixtures, error: fixtureError } = await supabase.from("fixtures")
    .select("id,home_team_id,away_team_id,match_date,match_time,ground")
    .eq("status", "live")
    .order("match_date", { ascending: true });

  if (fixtureError) return <LiveUnavailable message="Live match data could not be loaded. Check the Supabase database setup and public score access."/>;
  const fixtureRows = (fixtures ?? []) as Fixture[];
  if (!fixtureRows.length) return <div className="page-wrap">
    <PageHeading/>
    <LiveScoreUpdates/>
    <div className={styles.empty}><Radio size={28}/><h2>No live matches right now</h2><p>When a scorer starts an approved fixture, its verified score will appear here.</p></div>
  </div>;

  const fixtureIds = fixtureRows.map(fixture => fixture.id);
  const teamIds = [...new Set(fixtureRows.flatMap(fixture => [fixture.home_team_id, fixture.away_team_id]))];
  const [{ data: teams, error: teamsError }, { data: innings, error: inningsError }] = await Promise.all([
    supabase.from("public_teams").select("id,name").in("id", teamIds),
    supabase.from("innings").select("id,fixture_id,innings_number,batting_team_id,total_runs,wickets,legal_balls").in("fixture_id", fixtureIds).order("innings_number")
  ]);
  if (teamsError || inningsError) return <LiveUnavailable message="Live scorecards could not be loaded. Check score table permissions and apply the platform migration."/>;

  const teamNames = new Map(((teams ?? []) as TeamOption[]).map(team => [team.id, team.name]));
  const inningsByFixture = new Map<string, Innings[]>();
  for (const inningsRow of (innings ?? []) as Innings[]) {
    inningsByFixture.set(inningsRow.fixture_id, [...(inningsByFixture.get(inningsRow.fixture_id) ?? []), inningsRow]);
  }
  const visibleFixtures = fixtureRows.filter(fixture => teamNames.has(fixture.home_team_id) && teamNames.has(fixture.away_team_id));

  return <div className="page-wrap">
    <PageHeading/>
    <LiveScoreUpdates/>
    <section className={styles.list} aria-label="Live cricket matches">
      {visibleFixtures.map(fixture => {
        const scorecards = inningsByFixture.get(fixture.id) ?? [];
        return <article className={styles.card} key={fixture.id}>
          <div className={styles.cardHeader}><span><i/> LIVE</span><time dateTime={`${fixture.match_date}${fixture.match_time ? `T${fixture.match_time}` : ""}`}>{formatMatchDate(fixture.match_date, fixture.match_time)}</time></div>
          <div className={styles.teams}>
            <div><h2>{teamNames.get(fixture.home_team_id)}</h2><p>Home</p></div>
            <span className={styles.vs}>VS</span>
            <div><h2>{teamNames.get(fixture.away_team_id)}</h2><p>Away</p></div>
          </div>
          <div className={styles.scores}>
            {scorecards.length ? scorecards.map(score => <div className={styles.score} key={score.id}>
              <span>{teamNames.get(score.batting_team_id) || "Batting team"}</span>
              <strong>{score.total_runs}/{score.wickets}</strong>
              <small>{overs(score.legal_balls)} overs</small>
            </div>) : <p className={styles.waiting}>The scorer has not started an innings yet.</p>}
          </div>
          <p className={styles.ground}>{fixture.ground || "Ground to be confirmed"}</p>
        </article>;
      })}
    </section>
  </div>;
}

function PageHeading() {
  return <div className="page-heading"><span className="eyebrow">BALL BY BALL</span><h1>Live centre</h1><p>Verified scorecards from active Peshawar Cricket Club fixtures.</p></div>;
}

function LiveUnavailable({ message }: { message: string }) {
  return <div className="page-wrap"><PageHeading/><div className={styles.empty} role="alert"><Activity size={26}/><p>{message}</p></div></div>;
}
