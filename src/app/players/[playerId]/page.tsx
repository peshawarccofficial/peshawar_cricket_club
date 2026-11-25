import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import styles from "./player-profile.module.css";

type PlayerProfile = {
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
  team_name: string;
  team_area: string | null;
};

async function loadPlayer(playerId: string): Promise<PlayerProfile | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("public_team_players")
    .select("player_id,full_name,photo_url,playing_role,batting_style,bowling_style,jersey_number,is_captain,is_vice_captain,team_slug,team_name,team_area")
    .eq("player_id", playerId)
    .maybeSingle();
  return error || !data ? null : data as PlayerProfile;
}

export async function generateMetadata({ params }: { params: Promise<{ playerId: string }> }): Promise<Metadata> {
  const { playerId } = await params;
  const player = await loadPlayer(playerId);
  return player ? {
    title: `${player.full_name} | Player ${player.player_id}`,
    description: `${player.full_name} is a ${player.playing_role} for ${player.team_name} in ${player.team_area || "Peshawar"}.`
  } : { title: "Player profile" };
}

export default async function PlayerProfilePage({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  const player = await loadPlayer(playerId);
  if (!player) notFound();
  const designation = player.is_captain ? "Captain" : player.is_vice_captain ? "Vice-captain" : "Player";
  return <div className="page-wrap">
    <div className="page-heading"><span className="eyebrow">PLAYER PROFILE · {player.player_id}</span><h1>{player.full_name}</h1><p>{player.playing_role} · {player.team_area || "Peshawar"}</p></div>
    <article className={styles.profile}>
      {player.photo_url ? <Image className={styles.photo} src={player.photo_url} alt={`${player.full_name} profile`} width={220} height={220} unoptimized/> : <div className={styles.fallback} aria-hidden="true">{player.full_name[0]}</div>}
      <div className={styles.details}>
        <span className={styles.badge}>{designation}</span>
        <h2>{player.full_name}</h2>
        <p>{player.playing_role}</p>
        <dl>
          <div><dt>Player ID</dt><dd>{player.player_id}</dd></div>
          <div><dt>Team</dt><dd><Link href={`/teams/${player.team_slug}`}>{player.team_name}</Link></dd></div>
          {player.jersey_number !== null && <div><dt>Jersey number</dt><dd>{player.jersey_number}</dd></div>}
          {player.batting_style && <div><dt>Batting style</dt><dd>{player.batting_style}</dd></div>}
          {player.bowling_style && <div><dt>Bowling style</dt><dd>{player.bowling_style}</dd></div>}
        </dl>
        <p className={styles.privacy}>Personal contact information is not shown on public player profiles.</p>
      </div>
    </article>
  </div>;
}
