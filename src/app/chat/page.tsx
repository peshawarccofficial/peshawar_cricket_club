import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ChatWorkspace } from "@/components/chat-workspace";

export const metadata: Metadata = {
  title: "Team & Match Chat",
  description: "Private, captain-authorized conversations for Peshawar Cricket Club teams and fixtures."
};

type TeamOption = { id: string; name: string };
type FixtureRow = { id: string; home_team_id: string; away_team_id: string; match_date: string };

export default async function ChatPage() {
  const supabase = await createClient();
  if (!supabase) return <div className="page-wrap">
    <Heading/>
    <div className="empty-state"><p>Private chat is unavailable because Supabase is not configured.</p></div>
  </div>;

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError && authError.name !== "AuthSessionMissingError") return <div className="page-wrap"><Heading/><div className="empty-state" role="alert"><p>Your account could not be verified.</p></div></div>;
  if (!user) return <div className="page-wrap">
    <Heading/>
    <div className="empty-state"><h2>Sign in to use private chat</h2><p>Only captains who belong to a conversation can read its messages.</p><Link className="button button-small" href="/login">Sign in</Link></div>
  </div>;

  const [conversationsResult, myTeamsResult, fixtureResult] = await Promise.all([
    supabase.from("public_chat_conversations").select("*").order("latest_message_at", { ascending: false }),
    supabase.from("teams").select("id,name").eq("captain_id", user.id).eq("status", "approved").is("deleted_at", null),
    supabase.from("fixtures").select("id,home_team_id,away_team_id,match_date")
      .in("status", ["confirmed", "live", "completed"])
      .order("match_date", { ascending: false })
      .limit(200)
  ]);
  const myTeams = (myTeamsResult.data ?? []) as TeamOption[];
  const myTeamIds = new Set(myTeams.map(team => team.id));
  const eligibleFixtures = ((fixtureResult.data ?? []) as FixtureRow[])
    .filter(fixture => myTeamIds.has(fixture.home_team_id) || myTeamIds.has(fixture.away_team_id));
  const fixtureTeamIds = [...new Set(eligibleFixtures.flatMap(fixture => [fixture.home_team_id, fixture.away_team_id]))];
  const { data: teamNames, error: teamNamesError } = fixtureTeamIds.length
    ? await supabase.from("public_teams").select("id,name").in("id", fixtureTeamIds)
    : { data: [], error: null };
  const names = new Map(((teamNames ?? []) as TeamOption[]).map(team => [team.id, team.name]));

  const setupError = conversationsResult.error || myTeamsResult.error || fixtureResult.error || teamNamesError
    ? "Chat is not ready. Apply supabase/pcc-platform-migration.sql and verify the conversation permissions."
    : undefined;

  return <div className="page-wrap">
    <Heading/>
    <ChatWorkspace
      initialConversations={(conversationsResult.data ?? []) as Array<{ id: string; title: string; latest_message: string | null; latest_message_at: string | null; team_id: string | null; fixture_id: string | null }>}
      teams={myTeams}
      fixtures={eligibleFixtures.map(fixture => ({
        ...fixture,
        home_team: names.get(fixture.home_team_id) || "Team",
        away_team: names.get(fixture.away_team_id) || "Team"
      }))}
      userId={user.id}
      setupError={setupError}
    />
  </div>;
}

function Heading() {
  return <div className="page-heading"><span className="eyebrow">STAY CONNECTED</span><h1>Messages</h1><p>Coordinate with your approved teams and confirmed match opponents in private, member-only conversations.</p></div>;
}
