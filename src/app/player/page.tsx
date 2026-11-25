import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import styles from "./player.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Player Dashboard",
  robots: { index: false, follow: false, nocache: true }
};

type PlayerAccount = {
  public_player_id: string;
  full_name: string;
  photo_url: string | null;
  playing_role: string;
  batting_style: string | null;
  bowling_style: string | null;
  jersey_number: number | null;
  is_captain: boolean;
  is_vice_captain: boolean;
  team_name: string;
  team_slug: string;
};

export default async function PlayerDashboardPage() {
  const supabase = await createClient();
  if (!supabase) return <PlayerDashboardMessage title="Player dashboard unavailable" body="Configure Supabase to use player accounts."/>;
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");

  const { data, error } = await supabase.rpc("get_my_player_account");
  if (error) return <PlayerDashboardMessage title="Player account unavailable" body="Apply the PCC platform migration and sign in again."/>;
  const player = (Array.isArray(data) ? data[0] : null) as PlayerAccount | undefined;
  if (!player) return <PlayerDashboardMessage title="No linked player profile" body="Ask your team captain for a Player ID and one-time access code, then link it to this account."/>;

  const position = player.is_captain ? "Captain" : player.is_vice_captain ? "Vice-captain" : "Player";
  return <main className="page-wrap">
    <header className={styles.heading}>
      <span className="eyebrow">PLAYER DASHBOARD</span>
      <h1>Welcome, {player.full_name}</h1>
      <p>Your private player account and public team profile.</p>
    </header>
    <section className={styles.card}>
      <div className={styles.identity}>
        <span className={styles.photo}>{player.photo_url ? <Image src={player.photo_url} alt={`${player.full_name} profile`} width={92} height={92} unoptimized/> : player.full_name.slice(0, 1).toUpperCase()}</span>
        <div><small>Player ID</small><strong>{player.public_player_id}</strong><span>{position}</span></div>
      </div>
      <div className={styles.details}>
        <div><small>Team</small><strong>{player.team_name}</strong></div>
        <div><small>Cricket role</small><strong>{player.playing_role}</strong></div>
        {player.batting_style && <div><small>Batting style</small><strong>{player.batting_style}</strong></div>}
        {player.bowling_style && <div><small>Bowling style</small><strong>{player.bowling_style}</strong></div>}
        {player.jersey_number !== null && <div><small>Jersey number</small><strong>{player.jersey_number}</strong></div>}
      </div>
      <div className={styles.actions}>
        <Link className="button button-small" href={`/players/${player.public_player_id}`}>View public player profile</Link>
        <Link className="button button-small button-secondary" href={`/teams/${player.team_slug}`}>View team</Link>
        <Link className={styles.settings} href="/settings">Account settings</Link>
      </div>
    </section>
  </main>;
}

function PlayerDashboardMessage({ title, body }: { title: string; body: string }) {
  return <main className="page-wrap narrow">
    <header className={styles.heading}><span className="eyebrow">PLAYER DASHBOARD</span><h1>{title}</h1><p>{body}</p></header>
    <div className={styles.message}><Link href="/player-access">Link a Player ID</Link></div>
  </main>;
}
