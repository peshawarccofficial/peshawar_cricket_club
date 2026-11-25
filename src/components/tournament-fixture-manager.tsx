"use client";

import { useEffect, useState, type FormEvent } from "react";
import styles from "./adsense-settings.module.css";

type Option = { id: string; name: string };
type Tournament = Option & { status: string };
type Fixture = {
  id: string; tournament_id: string; home_team_id: string; away_team_id: string;
  match_date: string; match_time: string | null; venue: string | null; stage: string;
  status: "scheduled"|"live"|"completed"|"cancelled"; home_score: string|null; away_score: string|null; result_text: string|null;
};
type Standing = { team_id: string; played:number; won:number; lost:number; tied:number; no_result:number; points:number; net_run_rate:number|null };
type ApprovedEntry = { tournament_id: string; team_id: string };

export function TournamentFixtureManager() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [teams, setTeams] = useState<Option[]>([]);
  const [approvedEntries, setApprovedEntries] = useState<ApprovedEntry[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [form, setForm] = useState({ tournamentId: "", homeTeamId: "", awayTeamId: "", matchDate: "", matchTime: "", venue: "", stage: "group" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/admin/tournament-fixtures");
    const result: unknown = await response.json();
    if (!response.ok) throw new Error(result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "Could not load tournament fixtures.");
    if (result && typeof result === "object" && "tournaments" in result && "teams" in result && "fixtures" in result && "approvedEntries" in result &&
        Array.isArray(result.tournaments) && Array.isArray(result.teams) && Array.isArray(result.fixtures) && Array.isArray(result.approvedEntries)) {
      setTournaments(result.tournaments as Tournament[]);
      setTeams(result.teams as Option[]);
      setFixtures(result.fixtures as Fixture[]);
      setApprovedEntries(result.approvedEntries as ApprovedEntry[]);
    }
  }

  useEffect(() => { void load().catch(error => setMessage(error instanceof Error ? error.message : "Could not load tournament fixtures.")); }, []);

  async function loadStandings(tournamentId: string) {
    setStandings([]);
    if (!tournamentId) return;
    const response = await fetch(`/api/admin/tournament-standings?tournamentId=${encodeURIComponent(tournamentId)}`);
    const result: unknown = await response.json();
    if (!response.ok) throw new Error(result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "Could not load standings.");
    if (result && typeof result === "object" && "standings" in result && Array.isArray(result.standings)) setStandings(result.standings as Standing[]);
  }

  async function saveStanding(teamId: string, standing: Standing) {
    const response = await fetch("/api/admin/tournament-standings", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tournamentId: form.tournamentId,
        teamId,
        played: standing.played,
        won: standing.won,
        lost: standing.lost,
        tied: standing.tied,
        noResult: standing.no_result,
        points: standing.points,
        netRunRate: standing.net_run_rate
      })
    });
    const result: unknown = await response.json();
    if (!response.ok) throw new Error(result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "Could not save standings.");
    setMessage("Tournament standings saved.");
  }

  async function createFixture(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/tournament-fixtures", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "Could not create fixture.");
      setMessage("Tournament fixture created.");
      setForm(current => ({ ...current, venue: "", matchTime: "" }));
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create fixture.");
    } finally {
      setBusy(false);
    }
  }

  async function updateFixture(fixture: Fixture, patch: Partial<Fixture>) {
    const changes: Record<string, string | null> = { id: fixture.id };
    if (patch.status !== undefined) changes.status = patch.status;
    if (patch.home_score !== undefined) changes.homeScore = patch.home_score;
    if (patch.away_score !== undefined) changes.awayScore = patch.away_score;
    if (patch.result_text !== undefined) changes.resultText = patch.result_text;
    const response = await fetch("/api/admin/tournament-fixtures", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes)
    });
    const result: unknown = await response.json();
    if (!response.ok) throw new Error(result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "Could not update fixture.");
    setFixtures(current => current.map(item => item.id === fixture.id ? { ...item, ...patch } : item));
  }

  const tournamentTeams = teams.filter(team => approvedEntries.some(entry => entry.tournament_id === form.tournamentId && entry.team_id === team.id));

  return <section className={styles.panel}>
    <div className={styles.header}><div><h2>Tournament fixtures and results</h2><p>Create fixtures, update status, scores and winner information.</p></div></div>
    <form className={styles.placements} onSubmit={event => void createFixture(event)} style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
      <label className={styles.field}>Tournament<select required value={form.tournamentId} onChange={event => {
        const tournamentId = event.target.value;
        const participants = teams.filter(team => approvedEntries.some(entry => entry.tournament_id === tournamentId && entry.team_id === team.id));
        setForm(current => ({ ...current, tournamentId, homeTeamId: participants[0]?.id || "", awayTeamId: participants[1]?.id || "" }));
        void loadStandings(tournamentId).catch(error => setMessage(error instanceof Error ? error.message : "Could not load standings."));
      }}><option value="">Select tournament</option>{tournaments.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label className={styles.field}>Stage<input required maxLength={30} value={form.stage} onChange={event => setForm(current => ({ ...current, stage: event.target.value }))}/></label>
      <label className={styles.field}>Home team<select required value={form.homeTeamId} onChange={event => {
        const homeTeamId = event.target.value;
        setForm(current => ({
          ...current,
          homeTeamId,
          awayTeamId: current.awayTeamId === homeTeamId ? tournamentTeams.find(team => team.id !== homeTeamId)?.id || "" : current.awayTeamId
        }));
      }}><option value="">Select team</option>{tournamentTeams.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label className={styles.field}>Away team<select required value={form.awayTeamId} onChange={event => setForm(current => ({ ...current, awayTeamId: event.target.value }))}><option value="">Select team</option>{tournamentTeams.filter(item => item.id !== form.homeTeamId).map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label className={styles.field}>Date<input type="date" required value={form.matchDate} onChange={event => setForm(current => ({ ...current, matchDate: event.target.value }))}/></label>
      <label className={styles.field}>Time<input type="time" value={form.matchTime} onChange={event => setForm(current => ({ ...current, matchTime: event.target.value }))}/></label>
      <label className={styles.field}>Venue<input maxLength={120} value={form.venue} onChange={event => setForm(current => ({ ...current, venue: event.target.value }))}/></label>
      <button type="submit" className={styles.save} disabled={busy}>{busy ? "Saving…" : "Create fixture"}</button>
    </form>
    {fixtures.length ? <div className={styles.placements} style={{ gridTemplateColumns: "1fr", marginTop: 12 }}>{fixtures.map(fixture => {
      const tournamentName = tournaments.find(item => item.id === fixture.tournament_id)?.name || "Tournament";
      const homeName = teams.find(item => item.id === fixture.home_team_id)?.name || "Home";
      const awayName = teams.find(item => item.id === fixture.away_team_id)?.name || "Away";
      return <article className={styles.placement} key={fixture.id}>
        <div className={styles.placementHeading}><div><h3>{tournamentName}: {homeName} vs {awayName}</h3><p>{fixture.match_date} · {fixture.stage} · {fixture.venue || "Venue not set"}</p></div><select value={fixture.status} onChange={event => { void updateFixture(fixture, { status: event.target.value as Fixture["status"] }).catch(error => setMessage(error instanceof Error ? error.message : "Could not update fixture.")); }}><option value="scheduled">Scheduled</option><option value="live">Live</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div>
        <label className={styles.field}>Home score<input maxLength={30} value={fixture.home_score ?? ""} onChange={event => setFixtures(current => current.map(item => item.id === fixture.id ? { ...item, home_score: event.target.value } : item))} onBlur={event => void updateFixture(fixture, { home_score: event.target.value }).catch(error => setMessage(error instanceof Error ? error.message : "Could not update fixture."))}/></label>
        <label className={styles.field}>Away score<input maxLength={30} value={fixture.away_score ?? ""} onChange={event => setFixtures(current => current.map(item => item.id === fixture.id ? { ...item, away_score: event.target.value } : item))} onBlur={event => void updateFixture(fixture, { away_score: event.target.value }).catch(error => setMessage(error instanceof Error ? error.message : "Could not update fixture."))}/></label>
        <label className={styles.field}>Result<input maxLength={500} value={fixture.result_text ?? ""} onChange={event => setFixtures(current => current.map(item => item.id === fixture.id ? { ...item, result_text: event.target.value } : item))} onBlur={event => void updateFixture(fixture, { result_text: event.target.value }).catch(error => setMessage(error instanceof Error ? error.message : "Could not update fixture."))}/></label>
      </article>;
    })}</div> : <p className={styles.status}>No tournament fixtures yet.</p>}
    {form.tournamentId && <div style={{ marginTop: 12 }}>
      {tournamentTeams.length < 2 && <p className={styles.status}>At least two teams must have approved entries before you can schedule fixtures or maintain a points table.</p>}
      <div className={styles.header}><div><h2>Points table</h2><p>Maintain team totals for this tournament.</p></div></div>
      {tournamentTeams.map(team => {
        const standing = standings.find(item => item.team_id === team.id) ?? { team_id: team.id, played:0, won:0, lost:0, tied:0, no_result:0, points:0, net_run_rate:null };
        const patch = (field: keyof Omit<Standing,"team_id">, value: number|null) => {
          setStandings(current => {
            const existing = current.find(item => item.team_id === team.id);
            const next = existing ? { ...existing, [field]: value } : { ...standing, [field]: value };
            return existing ? current.map(item => item.team_id === team.id ? next : item) : [...current, next];
          });
        };
        const current = standings.find(item => item.team_id === team.id) ?? standing;
        return <article className={styles.placement} key={team.id} style={{ marginTop: 7 }}>
          <div className={styles.placementHeading}><strong>{team.name}</strong></div>
          <div className={styles.placements} style={{ gridTemplateColumns: "repeat(7,minmax(0,1fr))" }}>
            {([
              ["played","P"],["won","W"],["lost","L"],["tied","T"],["no_result","NR"],["points","Pts"]
            ] as const).map(([field,label]) => <label className={styles.field} key={field}>{label}<input type="number" min={0} value={current[field]} onChange={event => patch(field, Number(event.target.value))}/></label>)}
            <label className={styles.field}>NRR<input type="number" step="0.001" value={current.net_run_rate ?? ""} onChange={event => patch("net_run_rate", event.target.value === "" ? null : Number(event.target.value))}/></label>
          </div>
          <button type="button" className={styles.save} onClick={() => void saveStanding(team.id, current).catch(error => setMessage(error instanceof Error ? error.message : "Could not save standings."))}>Save {team.name}</button>
        </article>;
      })}
    </div>}
    {message && <p className={styles.status} role="status">{message}</p>}
  </section>;
}
