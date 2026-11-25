import Link from "next/link";
import Image from "next/image";
import { ArrowRight, CalendarDays, CircleDot, MapPin, Trophy, Users, Zap } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { TeamCard } from "@/components/team-card";
import { AdsensePlacement } from "@/components/adsense-placement";
import { PublicPromotions } from "@/components/public-promotions";
import { createClient } from "@/lib/supabase/server";
import type { Team } from "@/lib/demo-data";

export const dynamic = "force-dynamic";

type TeamRow = { id: string; name: string; slug: string; area: string | null };
type FixtureRow = {
  id: string;
  home_team_id: string;
  away_team_id: string;
  match_date: string;
  match_time: string | null;
  ground: string | null;
  status: string;
};

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PK", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatTime(value: string | null) {
  if (!value) return "Time to be confirmed";
  const [hourPart, minute = "00"] = value.split(":");
  const hour = Number(hourPart);
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? "PM" : "AM"}`;
}

async function loadClubData() {
  const supabase = await createClient();
  if (!supabase) {
    return { teams: [] as Team[], fixtures: [], playerCount: 0, liveCount: 0, banners: [], announcements: [], dataError: "Club data is not connected yet." };
  }

  const { data: teamRows, error: teamsError } = await supabase
    .from("public_teams")
    .select("id,name,slug,area")
    .order("created_at", { ascending: false });
  if (teamsError) {
    console.error("Could not load approved teams for the home page:", teamsError.message);
    return { teams: [] as Team[], fixtures: [], playerCount: 0, liveCount: 0, banners: [], announcements: [], dataError: "Club teams are temporarily unavailable." };
  }

  const approvedTeams = (teamRows ?? []) as TeamRow[];
  const playerCounts = new Map<string, number>();
  if (approvedTeams.length) {
    const { data: players, error: playersError } = await supabase
      .from("public_team_players")
      .select("team_id")
      .in("team_id", approvedTeams.map(team => team.id));
    if (playersError) {
      console.error("Could not load approved team rosters for the home page:", playersError.message);
      return { teams: [] as Team[], fixtures: [], playerCount: 0, liveCount: 0, banners: [], announcements: [], dataError: "Club teams are temporarily unavailable." };
    }
    for (const player of players ?? []) {
      playerCounts.set(player.team_id, (playerCounts.get(player.team_id) ?? 0) + 1);
    }
  }

  const { data: fixtureRows, error: fixturesError } = await supabase
    .from("fixtures")
    .select("id,home_team_id,away_team_id,match_date,match_time,ground,status")
    .order("match_date", { ascending: true });
  if (fixturesError) {
    console.error("Could not load fixtures for the home page:", fixturesError.message);
    return { teams: [] as Team[], fixtures: [], playerCount: 0, liveCount: 0, banners: [], announcements: [], dataError: "Club fixtures are temporarily unavailable." };
  }

  const teamById = new Map(approvedTeams.map(team => [team.id, team.name]));
  const allFixtures = (fixtureRows ?? []) as FixtureRow[];
  const todayInPeshawar = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
  const fixtures = allFixtures
    .filter(fixture => fixture.status === "confirmed" && fixture.match_date >= todayInPeshawar)
    .filter(fixture => teamById.has(fixture.home_team_id) && teamById.has(fixture.away_team_id))
    .slice(0, 2)
    .map(fixture => ({
      id: fixture.id,
      home: teamById.get(fixture.home_team_id) ?? "Team",
      away: teamById.get(fixture.away_team_id) ?? "Team",
      date: formatDate(fixture.match_date),
      time: formatTime(fixture.match_time),
      ground: fixture.ground || "Ground to be confirmed",
      state: "Confirmed"
    }));

  const colors = ["blue", "gold", "green", "purple"];
  const teams: Team[] = approvedTeams.map((team, index) => ({
    id: team.id,
    name: team.name,
    slug: team.slug,
    short: initials(team.name),
    area: team.area || "Peshawar",
    players: playerCounts.get(team.id) ?? 0,
    status: "Approved",
    color: colors[index % colors.length]
  }));
  const playerCount = Array.from(playerCounts.values()).reduce((sum, count) => sum + count, 0);
  const liveCount = allFixtures.filter(fixture => fixture.status === "live").length;
  const [{ data: bannerRows }, { data: announcementRows }] = await Promise.all([
    supabase.from("pcc_banners").select("id,title,description,image_url,destination_url").eq("visible", true).order("sort_order", { ascending: true }).order("created_at", { ascending: false }).limit(3),
    supabase.from("pcc_announcements").select("id,title,body,destination_url").eq("visible", true).order("publish_at", { ascending: false }).limit(3)
  ]);
  return { teams, fixtures, playerCount, liveCount, banners: bannerRows ?? [], announcements: announcementRows ?? [], dataError: "" };
}

export default async function HomePage() {
  const { teams, fixtures, playerCount, liveCount, banners, announcements, dataError } = await loadClubData();
  return <div className="page-wrap">
    <section className="hero">
      <div className="hero-copy"><span className="eyebrow"><span className="live-dot"/> THE CRICKET COMMUNITY OF PESHAWAR</span>
        <h1>Find your next<br/><em>cricket match.</em></h1>
        <p>Connect with local teams, arrange fixtures, manage your squad and follow every ball live.</p>
        <div className="hero-actions"><Link className="button" href="/teams">Register your team <ArrowRight size={17}/></Link><Link className="button button-outline" href="/matches">Find a match</Link></div>
        <div className="hero-note"><MapPin size={15}/> Peshawar, Khyber Pakhtunkhwa</div>
      </div>
      <div className="hero-art"><Image className="hero-crest" src="/logo.png" alt="" width={670} height={722} priority/><div className="hero-score"><small>YOUR CLUB NETWORK</small><b>{teams.length} APPROVED TEAMS</b><small>Build your squad and request approval</small></div><div className="art-glow"/></div>
    </section>
    <PublicPromotions banners={banners} announcements={announcements}/>
    <section className="stats-grid">
      <StatCard label="Registered teams" value={String(teams.length).padStart(2, "0")} icon={<Users size={20}/>}/>
      <StatCard label="Players in squads" value={String(playerCount)} icon={<Trophy size={20}/>}/>
      <StatCard label="Upcoming fixtures" value={String(fixtures.length)} icon={<CalendarDays size={20}/>}/>
      <StatCard label="Live matches" value={String(liveCount)} icon={<CircleDot size={20}/>}/>
    </section>
    {dataError && <div className="info-banner" role="status">{dataError}</div>}
    <section className="section-block">
      <div className="section-heading"><div><span className="eyebrow">THIS WEEK</span><h2>Upcoming fixtures</h2></div><Link href="/matches" className="text-link">All fixtures <ArrowRight size={15}/></Link></div>
      {fixtures.length ? <div className="fixture-grid">{fixtures.map(f => <article className="fixture-card" key={f.id}><div className="fixture-top"><span className="status-pill">{f.state}</span><small>{f.date}</small></div><div className="versus"><b>{f.home}</b><span>VS</span><b>{f.away}</b></div><div className="fixture-meta"><span><CalendarDays size={14}/>{f.time}</span><span><MapPin size={14}/>{f.ground}</span></div></article>)}</div> : <div className="empty-state compact"><h2>No fixtures are published yet</h2><p>Confirmed club fixtures will appear here as soon as teams arrange them.</p></div>}
    </section>
    <AdsensePlacement placement="homepage_content"/>
    <section className="section-block"><div className="section-heading"><div><span className="eyebrow">MEET THE COMMUNITY</span><h2>Teams around Peshawar</h2></div><Link href="/teams" className="text-link">Browse teams <ArrowRight size={15}/></Link></div>{teams.length ? <div className="team-grid">{teams.slice(0,3).map(team => <TeamCard key={team.id} team={team}/>)}</div> : <div className="empty-state compact"><h2>Be the first club team</h2><p>Create your roster and submit it for administrator approval to join the Peshawar cricket network.</p><Link className="button button-small" href="/teams">Register your team</Link></div>}</section>
    <section className="callout"><div><Zap size={22}/><div><h2>Your team. Your next match.</h2><p>Register a squad of 8–12 players and connect with captains across Peshawar.</p></div></div><Link href="/teams" className="button">Create a team <ArrowRight size={16}/></Link></section>
  </div>;
}
