import type { Metadata } from "next";
import { MatchBoard, type MatchPoll } from "@/components/match-board";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Find Cricket Matches",
  description: "Arrange cricket matches with approved teams in Peshawar."
};

type TeamOption = { id: string; name: string };
type Invitation = {
  id: string;
  requester_team_id: string;
  requester_team_name: string;
  requester_team_logo: string | null;
  invited_team_id: string;
  invited_team_name: string;
  invited_team_logo: string | null;
  match_date: string;
  match_time: string | null;
  venue: string;
  overs: number;
  match_format: string;
  notes: string | null;
  status: "pending" | "accepted" | "finalized";
  fixture_id: string | null;
  requester_confirmed: boolean;
  invited_confirmed: boolean;
  created_at: string;
};

export default async function MatchesPage() {
  const supabase = await createClient();
  if (!supabase) {
    return <div className="page-wrap">
      <div className="page-heading"><span className="eyebrow">FIXTURES & MATCHMAKING</span><h1>Find a match</h1><p>Send and manage match invitations with approved Peshawar teams.</p></div>
      <MatchBoard invitations={[]} myTeams={[]} approvedTeams={[]} viewerTeamIds={[]} polls={[]} setupError="Match booking is unavailable because Supabase is not configured."/>
    </div>;
  }

  const [{ data: authData }, { data: invitationRows, error: invitationError }, { data: approvedRows, error: teamsError }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("public_match_invitations").select("*").order("match_date", { ascending: true }).limit(100),
    supabase.from("public_teams").select("id,name").order("name", { ascending: true })
  ]);
  const user = authData.user;
  let myTeams: TeamOption[] = [];
  let myTeamsError = false;
  let polls: MatchPoll[] = [];
  let pollsError = false;
  if (user) {
    const { data, error } = await supabase.from("teams")
      .select("id,name")
      .eq("captain_id", user.id)
      .eq("status", "approved")
      .is("deleted_at", null)
      .order("name");
    myTeams = data ?? [];
    myTeamsError = Boolean(error);
    const { data: pollRows, error: pollError } = await supabase.rpc("get_my_match_polls");
    polls = (pollRows ?? []) as MatchPoll[];
    pollsError = Boolean(pollError);
  }

  const setupError = invitationError || teamsError || myTeamsError || pollsError
    ? "Match booking is not ready. Apply supabase/pcc-platform-migration.sql after the owner and Admin migrations."
    : undefined;

  return <div className="page-wrap">
    <div className="page-heading">
      <span className="eyebrow">FIXTURES & MATCHMAKING</span>
      <h1>Find a match</h1>
      <p>Captains can invite opponents, respond to requests and confirm a fixture together. Confirmed fixtures appear only after both captains agree.</p>
    </div>
    <MatchBoard
      invitations={(invitationRows ?? []) as Invitation[]}
      myTeams={myTeams}
      approvedTeams={(approvedRows ?? []) as TeamOption[]}
      viewerTeamIds={myTeams.map(team => team.id)}
      polls={polls}
      setupError={setupError}
    />
  </div>;
}
