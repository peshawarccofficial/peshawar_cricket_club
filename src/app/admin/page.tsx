import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OwnerDashboard } from "@/components/owner-dashboard";
import { getAdminSession } from "@/lib/admin-session";
import { AdminLogin } from "@/components/admin-login";
import { createAdminServiceClient } from "@/lib/admin-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Private Owner Control Center",
  manifest: "/admin/manifest.webmanifest",
  robots: { index: false, follow: false, nocache: true },
  appleWebApp: { capable: true, title: "PCC Admin", statusBarStyle: "black-translucent" }
};

export default async function AdminPage() {
  const adminSession = await getAdminSession();
  if (!adminSession) return <AdminLogin />;
  if (!adminSession.owner) return <AdminOwnerAccessRequired />;

  const supabase = createAdminServiceClient() || await createClient();
  if (!supabase) redirect("/login");

  const [
    usersResult,
    teamsResult,
    playerResult,
    fixtureResult,
    notificationResult,
    fixturesResult,
    tournamentResult,
    tournamentEntriesResult,
    messageResult
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("teams").select("id,name,slug,area,sport,description,logo_url,status,rejection_reason,created_at,captain_id", { count: "exact" }).is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("players").select("id,team_id,roster_number,full_name,photo_url,playing_role,contact,created_at", { count: "exact" }),
    supabase.from("fixtures").select("id", { count: "exact", head: true }).eq("status", "confirmed"),
    supabase.from("owner_notifications").select("id,title,body,read_at,created_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("fixtures").select("id,home_team_id,away_team_id,match_date,match_time,ground,overs,status,created_at").order("match_date", { ascending: false }).limit(200),
    supabase.from("admin_tournaments").select("id,name,location,start_date,end_date,status,description,format,max_teams,entry_deadline,rules,created_at").order("start_date", { ascending: true }),
    supabase.from("tournament_entries").select("id,tournament_id,team_id,captain_id,status,rejection_reason,created_at").order("created_at", { ascending: false }).limit(300),
    supabase.from("messages").select("id,body,created_at,sender_id,conversation_id").order("created_at", { ascending: false }).limit(50)
  ]);

  const teams = (teamsResult.data ?? []) as TeamRecord[];
  const tournamentNames = new Map((tournamentResult.data ?? []).map(tournament => [tournament.id, tournament.name]));
  const teamNames = new Map(teams.map(team => [team.id, team.name]));
  const tournamentEntries = (tournamentEntriesResult.data ?? []).map(entry => ({
    ...entry,
    tournament_name: tournamentNames.get(entry.tournament_id) || "Tournament",
    team_name: teamNames.get(entry.team_id) || "Team"
  }));
  const playerRows = (playerResult.data ?? []) as Array<{
    id: string;
    team_id: string;
    roster_number: number | null;
    full_name: string;
    photo_url: string | null;
    playing_role: string;
    contact: string | null;
    created_at: string;
  }>;
  const captainIds = [...new Set(teams.map(team => team.captain_id).filter(Boolean))];
  const captainsResult = captainIds.length
    ? await supabase.from("profiles").select("id,display_name,avatar_url,phone,email,role").in("id", captainIds)
    : { data: [] };
  const captains: Record<string, { id: string; display_name: string | null; avatar_url: string | null; phone: string | null; email: string | null; role: string }> = {};
  for (const captain of captainsResult.data ?? []) captains[captain.id] = captain;

  const players: Record<string, Array<{ id: string; team_id: string; roster_number: number | null; full_name: string; photo_url: string | null; playing_role: string; contact: string | null; created_at: string }>> = {};
  for (const player of playerRows) {
    players[player.team_id] = [...(players[player.team_id] ?? []), player];
  }
  for (const roster of Object.values(players)) roster.sort((left, right) => (left.roster_number ?? 0) - (right.roster_number ?? 0));

  const teamById = new Map(teams.map(team => [team.id, team.name]));
  const fixtures = (fixturesResult.data ?? []).map(fixture => ({
    ...fixture,
    home_team: teamById.get(fixture.home_team_id) || "Team",
    away_team: teamById.get(fixture.away_team_id) || "Team"
  }));
  const fixtureIds = fixtures.map(fixture => fixture.id);
  const inningsResult = fixtureIds.length
    ? await supabase.from("innings").select("id,fixture_id,innings_number,batting_team_id,total_runs,wickets,legal_balls,is_completed").in("fixture_id", fixtureIds)
    : { data: [] };

  const senderIds = [...new Set((messageResult.data ?? []).map(message => message.sender_id).filter(Boolean))];
  const sendersResult = senderIds.length
    ? await supabase.from("profiles").select("id,display_name").in("id", senderIds)
    : { data: [] };
  const senderNames = new Map((sendersResult.data ?? []).map(sender => [sender.id, sender.display_name || "Club member"]));
  const conversationsResult = (messageResult.data ?? []).length
    ? await supabase.from("conversations").select("id,team_id,fixture_id").in("id", [...new Set(messageResult.data!.map(message => message.conversation_id))])
    : { data: [] };
  const conversations = new Map((conversationsResult.data ?? []).map(conversation => [
    conversation.id,
    conversation.team_id ? teamById.get(conversation.team_id) || "Team chat" : conversation.fixture_id ? "Match chat" : "Club chat"
  ]));

  const teamsByMonth = Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (5 - index));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return {
      label: date.toLocaleDateString("en", { month: "short" }),
      teams: teams.filter(team => team.created_at.startsWith(key)).length,
      players: playerRows.filter(player => player.created_at.startsWith(key)).length
    };
  });

  const dataWarnings = [
    !process.env.SUPABASE_SERVICE_ROLE_KEY ? "SUPABASE_SERVICE_ROLE_KEY is not configured. Owner-only Supabase row-level policies allow team approvals and roster review, but reports, tournament management, and other private dashboard sections may remain unavailable until this server-only key is configured." : "",
    teamsResult.error?.message ? "Team applications could not be loaded. Confirm the owner account is signed in and apply the owner-control and PCC platform migrations." : "",
    playerResult.error?.message ? "Players could not be loaded." : "",
    notificationResult.error?.message ? "Owner notifications could not be loaded." : "",
    fixturesResult.error?.message ? "Matches could not be loaded." : "",
    fixtureIds.length > 0 && inningsResult.data === null ? "Live score data could not be loaded. Apply the PCC platform migration." : "",
    tournamentResult.error?.message ? "Apply the admin PWA and PCC platform migrations to enable tournaments." : "",
    tournamentEntriesResult.error?.message ? "Tournament applications could not be loaded. Apply the PCC platform migration." : "",
    messageResult.error?.message ? "Messages could not be loaded." : ""
  ].filter(Boolean);

  const counts = {
    users: usersResult.count ?? 0,
    teams: teamsResult.count ?? teams.length,
    pending: teams.filter(team => team.status === "pending_approval" || team.status === "pending").length,
    approved: teams.filter(team => team.status === "approved").length,
    rejected: teams.filter(team => team.status === "rejected").length,
    captains: captainIds.length,
    players: playerResult.count ?? playerRows.length,
    fixtures: fixtureResult.count ?? 0,
    live: fixtures.filter(fixture => fixture.status === "live").length
  };

  return <OwnerDashboard
    teams={teams}
    captains={captains}
    players={players}
    notifications={notificationResult.data ?? []}
    counts={counts}
    fixtures={fixtures}
    innings={inningsResult.data ?? []}
    tournaments={tournamentResult.data ?? []}
    tournamentEntries={tournamentEntries}
    messages={(messageResult.data ?? []).map(message => ({
      ...message,
      sender: senderNames.get(message.sender_id) || "Club member",
      conversation: conversations.get(message.conversation_id) || "Club chat"
    }))}
    teamsByMonth={teamsByMonth}
    dataWarnings={dataWarnings}
  />;
}

function AdminOwnerAccessRequired() {
  return <main style={{ minHeight:"100vh", display:"grid", placeItems:"center", padding:24, background:"#f4f7fb", color:"#172033", fontFamily:"Arial,sans-serif" }}>
    <section style={{ width:"min(520px,100%)", padding:28, border:"1px solid #e3e8ef", borderRadius:16, background:"#fff" }}>
      <p style={{ color:"#b17a08", fontSize:12, fontWeight:800, letterSpacing:".08em" }}>PCC OWNER CONTROL CENTER</p>
      <h1 style={{ margin:"8px 0", fontSize:24 }}>Owner access is required</h1>
      <p style={{ color:"#586579", fontSize:14, lineHeight:1.6 }}>
        The Admin username and password sign in to the dashboard shell, but do not grant Owner privileges. Team approvals require signing in with the Supabase account that has <code>owner_role = &apos;owner&apos;</code>, then opening the private owner route configured on the server.
      </p>
      <Link href="/login" style={{ display:"inline-block", marginTop:8, padding:"10px 14px", borderRadius:8, background:"#071b36", color:"#fff", textDecoration:"none", fontWeight:700 }}>Sign in to PCC</Link>
    </section>
  </main>;
}

type TeamRecord = {
    id: string;
    name: string;
    slug: string;
    area: string | null;
    sport: string | null;
    description: string | null;
    logo_url: string | null;
    status: "pending" | "pending_approval" | "approved" | "rejected";
    rejection_reason: string | null;
    created_at: string;
    captain_id: string;
};
