"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./owner-dashboard.module.css";

type Player = { id: string; full_name: string; playing_role: string };
type Innings = {
  id: string;
  innings_number: number;
  batting_team_id: string;
  total_runs: number;
  wickets: number;
  legal_balls: number;
  is_completed: boolean;
};
type Fixture = {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_team: string;
  away_team: string;
  ground: string | null;
  overs: number;
  status: string;
};

export function AdminLiveScoreEditor({
  fixture,
  initialInnings,
  homePlayers,
  awayPlayers
}: {
  fixture: Fixture;
  initialInnings: Innings[];
  homePlayers: Player[];
  awayPlayers: Player[];
}) {
  const router = useRouter();
  const [battingTeamId, setBattingTeamId] = useState(fixture.home_team_id);
  const [batterId, setBatterId] = useState("");
  const [bowlerId, setBowlerId] = useState("");
  const [batterRuns, setBatterRuns] = useState("0");
  const [extraType, setExtraType] = useState("");
  const [extraRuns, setExtraRuns] = useState("0");
  const [isWicket, setIsWicket] = useState(false);
  const [dismissalType, setDismissalType] = useState("bowled");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const sortedInnings = [...initialInnings].sort((a, b) => a.innings_number - b.innings_number);
  const currentInnings = sortedInnings.find(item => !item.is_completed) || sortedInnings[sortedInnings.length - 1];
  const battingPlayers = currentInnings?.batting_team_id === fixture.home_team_id ? homePlayers : awayPlayers;
  const bowlingPlayers = currentInnings?.batting_team_id === fixture.home_team_id ? awayPlayers : homePlayers;
  const nextInningsNumber = sortedInnings.length + 1;

  async function send(action: string, values: Record<string, unknown> = {}) {
    setBusy(action);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/live-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...values })
      });
      const result = await response.json() as { error?: string; pushDelivery?: { delivered?: number; targeted?: number; status?: string } };
      if (!response.ok) throw new Error(result.error || "The scoring change could not be saved.");
      if (action === "record_ball" && result.pushDelivery) {
        const delivery = result.pushDelivery;
        setNotice(delivery.delivered
          ? `Ball recorded. Live score sent to ${delivery.delivered} device(s).`
          : delivery.status === "not_configured"
            ? "Ball recorded. Web Push is not configured on the server."
            : delivery.status === "failed"
              ? "Ball recorded, but the live score push could not be delivered."
              : "Ball recorded. No opted-in devices received a push update.");
      } else {
        setNotice("Score update saved.");
      }
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The scoring change could not be saved.");
    } finally {
      setBusy("");
    }
  }

  const currentRuns = Number(batterRuns);
  const currentExtras = Number(extraRuns);
  const nextTeamId = nextInningsNumber === 2
    ? sortedInnings[0]?.batting_team_id === fixture.home_team_id ? fixture.away_team_id : fixture.home_team_id
    : battingTeamId;

  return <div className={styles.scoreEditor}>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {sortedInnings.map(inning => {
      const team = inning.batting_team_id === fixture.home_team_id ? fixture.home_team : fixture.away_team;
      return <div className={styles.scoreLine} key={inning.id}>
        <span>{team} · Innings {inning.innings_number}{inning.is_completed ? " · Complete" : ""}</span>
        <strong>{inning.total_runs}/{inning.wickets}<small> ({Math.floor(inning.legal_balls / 6)}.{inning.legal_balls % 6} ov)</small></strong>
      </div>;
    })}

    {fixture.status !== "completed" && sortedInnings.length === 0 && <div className={styles.scoreControls}>
      <label>First innings batting team
        <select value={battingTeamId} onChange={event => setBattingTeamId(event.target.value)}>
          <option value={fixture.home_team_id}>{fixture.home_team}</option>
          <option value={fixture.away_team_id}>{fixture.away_team}</option>
        </select>
      </label>
      <button type="button" className={styles.primaryAction} disabled={Boolean(busy)} onClick={() => void send("start_innings", { fixtureId: fixture.id, battingTeamId })}>
        {busy === "start_innings" ? "Starting…" : "Start match & first innings"}
      </button>
    </div>}

    {fixture.status === "live" && sortedInnings.length < 2 && sortedInnings[0]?.is_completed && <button
      type="button"
      className={styles.primaryAction}
      disabled={Boolean(busy)}
      onClick={() => void send("start_innings", { fixtureId: fixture.id, battingTeamId: nextTeamId })}
    >
      {busy === "start_innings" ? "Starting…" : `Start second innings · ${nextTeamId === fixture.home_team_id ? fixture.home_team : fixture.away_team}`}
    </button>}

    {fixture.status === "live" && currentInnings && !currentInnings.is_completed && <>
      {battingPlayers.length && bowlingPlayers.length ? <div className={styles.scoreControls}>
        <label>Batter
          <select value={batterId || battingPlayers[0].id} onChange={event => setBatterId(event.target.value)}>
            {battingPlayers.map(player => <option value={player.id} key={player.id}>{player.full_name} · {player.playing_role}</option>)}
          </select>
        </label>
        <label>Bowler
          <select value={bowlerId || bowlingPlayers[0].id} onChange={event => setBowlerId(event.target.value)}>
            {bowlingPlayers.map(player => <option value={player.id} key={player.id}>{player.full_name} · {player.playing_role}</option>)}
          </select>
        </label>
        <label>Batter runs
          <select value={batterRuns} onChange={event => setBatterRuns(event.target.value)}>
            {[0, 1, 2, 3, 4, 5, 6].map(value => <option value={value} key={value}>{value}</option>)}
          </select>
        </label>
        <label>Extra type
          <select value={extraType} onChange={event => setExtraType(event.target.value)}>
            <option value="">None</option><option value="wide">Wide</option><option value="no_ball">No ball</option>
            <option value="bye">Bye</option><option value="leg_bye">Leg bye</option><option value="penalty">Penalty</option>
          </select>
        </label>
        <label>Extra runs
          <input type="number" min={0} max={10} value={extraRuns} onChange={event => setExtraRuns(event.target.value)}/>
        </label>
        <label className={styles.wicketToggle}><input type="checkbox" checked={isWicket} onChange={event => setIsWicket(event.target.checked)}/>Wicket</label>
        {isWicket && <label>Dismissal
          <select value={dismissalType} onChange={event => setDismissalType(event.target.value)}>
            <option value="bowled">Bowled</option><option value="caught">Caught</option><option value="lbw">LBW</option>
            <option value="run_out">Run out</option><option value="stumped">Stumped</option><option value="hit_wicket">Hit wicket</option><option value="other">Other</option>
          </select>
        </label>}
        <button type="button" className={styles.primaryAction} disabled={Boolean(busy) || !Number.isInteger(currentRuns) || !Number.isInteger(currentExtras)} onClick={() => void send("record_ball", {
          inningsId: currentInnings.id,
          batterId: batterId || battingPlayers[0].id,
          bowlerId: bowlerId || bowlingPlayers[0].id,
          batterRuns: currentRuns,
          extraType: extraType || null,
          extraRuns: currentExtras,
          isWicket,
          dismissalType: isWicket ? dismissalType : null
        })}>
          {busy === "record_ball" ? "Saving…" : "Record ball"}
        </button>
      </div> : <p className={styles.warning}>Both teams need registered players before this innings can be scored.</p>}
      <div className={styles.actionRow}>
        <button type="button" className={styles.outlineAction} disabled={Boolean(busy)} onClick={() => void send("undo_ball", { inningsId: currentInnings.id })}>Undo last ball</button>
        <button type="button" className={styles.outlineAction} disabled={Boolean(busy)} onClick={() => {
          if (window.confirm("Complete this innings? You can start the second innings afterward.")) {
            void send("finish_innings", { inningsId: currentInnings.id });
          }
        }}>Finish innings</button>
      </div>
    </>}

    {fixture.status === "live" && sortedInnings.length === 2 && sortedInnings.every(inning => inning.is_completed) &&
      <div className={styles.scoreControls}>
        <p className={styles.notice}>Both innings are complete. Complete the match to close live scoring.</p>
        <button type="button" className={styles.primaryAction} disabled={Boolean(busy)} onClick={() => void send("complete_match", { fixtureId: fixture.id })}>
          {busy === "complete_match" ? "Completing…" : "Complete match"}
        </button>
      </div>}
  </div>;
}
