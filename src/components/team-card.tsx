import Link from "next/link";
import { MapPin, Users } from "lucide-react";
import type { Team } from "@/lib/demo-data";
export function TeamCard({ team }: { team: Team }) {
  return <article className="team-card">
    <div className={`team-avatar ${team.color}`}>{team.short}</div>
    <div className="team-info"><h3>{team.name}</h3><p><MapPin size={13}/> {team.area}</p><p><Users size={13}/> {team.players}/12 players</p><span className="status-pill">{team.status}</span></div>
    <Link href={team.slug ? `/teams/${team.slug}` : "/teams"} className="text-link">View team →</Link>
  </article>;
}
