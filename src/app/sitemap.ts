import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const routes = [
    { path: "", priority: 1 },
    { path: "/teams", priority: 0.8 },
    { path: "/matches", priority: 0.8 },
    { path: "/live", priority: 0.8 },
    { path: "/tournaments", priority: 0.8 },
    { path: "/about", priority: 0.5 },
    { path: "/contact", priority: 0.5 },
    { path: "/privacy-policy", priority: 0.3 },
    { path: "/terms-and-conditions", priority: 0.3 }
  ];
  const entries: MetadataRoute.Sitemap = routes.map(({ path, priority }) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority
  }));
  const supabase = await createClient();
  if (!supabase) return entries;

  const [{ data: teams }, { data: tournaments }, { data: fixtures }, { data: players }] = await Promise.all([
    supabase.from("public_teams").select("slug"),
    supabase.from("public_tournaments").select("slug"),
    supabase.from("fixtures").select("id").in("status", ["confirmed","live","completed"]),
    supabase.from("public_team_players").select("player_id")
  ]);
  for (const team of teams ?? []) if (team.slug) entries.push({ url:`${base}/teams/${team.slug}`, changeFrequency:"weekly", priority:.7 });
  for (const tournament of tournaments ?? []) if (tournament.slug) entries.push({ url:`${base}/tournaments/${tournament.slug}`, changeFrequency:"daily", priority:.7 });
  for (const fixture of fixtures ?? []) entries.push({ url:`${base}/matches/${fixture.id}`, changeFrequency:"daily", priority:.6 });
  for (const player of players ?? []) if (player.player_id) entries.push({ url:`${base}/players/${player.player_id}`, changeFrequency:"monthly", priority:.5 });
  return entries;
}
