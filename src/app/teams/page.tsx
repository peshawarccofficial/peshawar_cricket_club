import type { Metadata } from "next";
import { TeamsWorkspace } from "@/components/teams-workspace";

export const metadata: Metadata = { title: "Teams in Peshawar", description: "Explore cricket teams and squads in Peshawar." };

export default function TeamsPage() {
  return <div className="page-wrap">
    <div className="page-heading">
      <span className="eyebrow">LOCAL CRICKET NETWORK</span>
      <h1>Teams in Peshawar</h1>
      <p>Discover approved teams, register your squad and request approval to join the local cricket network.</p>
    </div>
    <TeamsWorkspace/>
    <div className="info-banner">Team registrations require 8–12 players and administrator approval. Pending teams remain private until approved.</div>
  </div>;
}
