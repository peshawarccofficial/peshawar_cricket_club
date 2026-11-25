import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TournamentDirectory } from "@/components/tournament-directory";
import { AdsensePlacement } from "@/components/adsense-placement";

export const metadata: Metadata = {
  title: "Cricket Tournaments",
  description: "Explore upcoming cricket tournaments in Peshawar and apply with your approved team."
};

type Tournament = {
  id: string; slug: string; name: string; location: string | null; start_date: string; end_date: string;
  status: "upcoming" | "live" | "completed"; description: string | null; format: string;
  max_teams: number; entry_deadline: string | null; rules: string | null; approved_teams: number;
};
type TeamOption = { id: string; name: string };
type Entry = { tournament_id: string; team_id: string; status: string; rejection_reason: string | null };

export default async function TournamentsPage() {
  const supabase = await createClient();
  if (!supabase) return <div className="page-wrap">
    <Heading/>
    <TournamentDirectory tournaments={[]} teams={[]} initialEntries={[]} signedIn={false} setupError="Tournament listings are unavailable because Supabase is not configured."/>
  </div>;

  const [{ data: tournamentRows, error: tournamentError }, { data: authData }] = await Promise.all([
    supabase.from("public_tournaments").select("*").order("start_date", { ascending: true }),
    supabase.auth.getUser()
  ]);
  const user = authData.user;
  let teams: TeamOption[] = [];
  let entries: Entry[] = [];
  let accountError = false;
  if (user) {
    const [teamsResult, entriesResult] = await Promise.all([
      supabase.from("teams").select("id,name").eq("captain_id", user.id).eq("status", "approved").is("deleted_at", null),
      supabase.rpc("get_my_tournament_entries")
    ]);
    teams = teamsResult.data ?? [];
    entries = (entriesResult.data ?? []) as Entry[];
    accountError = Boolean(teamsResult.error || entriesResult.error);
  }

  const setupError = tournamentError || accountError
    ? "Tournament applications need supabase/pcc-platform-migration.sql applied after the owner and Admin migrations."
    : undefined;
  return <div className="page-wrap">
    <Heading/>
    <AdsensePlacement placement="public_content"/>
    <TournamentDirectory tournaments={(tournamentRows ?? []) as Tournament[]} teams={teams} initialEntries={entries} signedIn={Boolean(user)} setupError={setupError}/>
    {!user && !setupError && <p className="info-banner">Team entry applications are available to signed-in captains of approved teams. <Link href="/login">Sign in</Link></p>}
  </div>;
}

function Heading() {
  return <div className="page-heading"><span className="eyebrow">LOCAL CRICKET COMPETITION</span><h1>Tournaments</h1><p>Browse club tournaments, review the rules, and apply with an approved team.</p></div>;
}
