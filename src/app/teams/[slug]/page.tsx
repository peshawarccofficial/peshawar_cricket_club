import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import styles from "./team-details.module.css";

type TeamProfile = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  area: string | null;
  sport: string | null;
  description: string | null;
  captain_name: string | null;
  captain_photo_url: string | null;
  player_count: number;
  vice_captain_name: string | null;
  vice_captain_photo_url: string | null;
};
type PlayerProfile = {
  id: string;
  team_id: string;
  roster_number: number;
  player_id: string;
  full_name: string;
  photo_url: string | null;
  playing_role: string;
  batting_style: string | null;
  bowling_style: string | null;
  jersey_number: number | null;
  is_captain: boolean;
  is_vice_captain: boolean;
  team_slug: string;
};

async function loadTeam(slug: string): Promise<{ team: TeamProfile | null; players: PlayerProfile[]; error: boolean }> {
  const supabase = await createClient();
  if (!supabase) return { team: null, players: [], error: true };
  const { data: team, error: teamError } = await supabase.from("public_teams").select("*").eq("slug", slug).maybeSingle();
  if (teamError) return { team: null, players: [], error: true };
  if (!team) return { team: null, players: [], error: false };
  const { data: players, error: playersError } = await supabase.from("public_team_players")
    .select("id,team_id,roster_number,player_id,full_name,photo_url,playing_role,batting_style,bowling_style,jersey_number,is_captain,is_vice_captain,team_slug")
    .eq("team_id", team.id)
    .order("roster_number", { ascending: true });
  if (playersError) return { team: team as TeamProfile, players: [], error: true };
  return { team: team as TeamProfile, players: (players ?? []) as PlayerProfile[], error: false };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { team } = await loadTeam(slug);
  if (!team) return { title: "Team profile" };
  return {
    title: `${team.name} team`,
    description: `${team.name} cricket team from ${team.area || "Peshawar"}, with ${team.player_count} registered players.`,
    openGraph: { title: `${team.name} | Peshawar Cricket Club`, description: team.description || `${team.name} cricket team in ${team.area || "Peshawar"}.` }
  };
}

export default async function TeamDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { team, players, error } = await loadTeam(slug);
  if (!team && !error) notFound();

  if (error || !team) return <div className="page-wrap">
    <div className="page-heading"><span className="eyebrow">TEAM PROFILE</span><h1>Team details unavailable</h1><p>Public team profiles require the approved database migration and current backend connection.</p></div>
    <Link className="button" href="/teams">Back to teams</Link>
  </div>;

  return <div className="page-wrap">
    <div className="page-heading"><span className="eyebrow">APPROVED CLUB TEAM</span><h1>{team.name}</h1><p>{team.area || "Peshawar"} · {team.sport || "Cricket"} · {team.player_count} players</p></div>
    <section className={styles.profile} aria-label={`${team.name} profile`}>
      <div className={styles.teamHeader}>
        {team.logo_url ? <Image className={styles.teamLogo} src={team.logo_url} alt={`${team.name} logo`} width={96} height={96} unoptimized/> : <div className={styles.logoFallback} aria-hidden="true">{team.name.split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase()}</div>}
        <div><h2>{team.name}</h2><p>{team.area || "Peshawar"} · {team.sport || "Cricket"}</p>{team.description && <p className={styles.description}>{team.description}</p>}</div>
      </div>
      <div className={styles.captains}>
        {team.captain_name && <div className={styles.captain}>
          {team.captain_photo_url ? <Image src={team.captain_photo_url} alt="" width={48} height={48} unoptimized/> : <span aria-hidden="true">{team.captain_name[0]}</span>}
          <div><small>Captain</small><strong>{team.captain_name}</strong></div>
        </div>}
        {team.vice_captain_name && <div className={styles.captain}>
          {team.vice_captain_photo_url ? <Image src={team.vice_captain_photo_url} alt="" width={48} height={48} unoptimized/> : <span aria-hidden="true">{team.vice_captain_name[0]}</span>}
          <div><small>Vice-captain</small><strong>{team.vice_captain_name}</strong></div>
        </div>}
      </div>
      <div className={styles.rosterHeading}><div><span className="eyebrow">SQUAD</span><h2>Players</h2></div><span>{players.length} / 12</span></div>
      {error ? <p className={styles.error} role="alert">Player profiles could not be loaded. Please try again later.</p> : players.length ? <div className={styles.roster}>
        {players.map(player => <Link className={styles.player} href={`/players/${player.player_id}`} key={player.id}>
          {player.photo_url ? <Image className={styles.playerPhoto} src={player.photo_url} alt="" width={72} height={72} unoptimized/> : <span className={styles.playerFallback} aria-hidden="true">{player.full_name[0]}</span>}
          <span className={styles.playerDetails}><strong>{player.full_name}</strong><span>{player.playing_role}</span><small>Player ID {player.player_id}{player.jersey_number === null ? "" : ` · Jersey ${player.jersey_number}`}</small></span>
          <span className={styles.role}>{player.is_captain ? "Captain" : player.is_vice_captain ? "Vice-captain" : "Player"}</span>
        </Link>)}
      </div> : <div className={styles.empty}>This approved team has no public player profiles.</div>}
    </section>
  </div>;
}
