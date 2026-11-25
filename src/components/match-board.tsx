"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./match-board.module.css";

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

type MatchDraft = { matchDate: string; matchTime: string; venue: string };
type PollCategory = "date" | "time" | "venue";
type MatchPollOption = {
  id: string;
  category: PollCategory;
  label: string;
  value: string;
  vote_count: number;
  my_vote: boolean;
};
export type MatchPoll = {
  invitation_id: string;
  poll_id: string;
  status: "open" | "closed";
  allow_vote_changes: boolean;
  final_date: string | null;
  final_time: string | null;
  final_venue: string | null;
  options: MatchPollOption[];
};
type MatchRequestValue = string | number | boolean | string[] | null;
const pollCategories: Array<{ key: PollCategory; label: string }> = [
  { key: "date", label: "Date" },
  { key: "time", label: "Time" },
  { key: "venue", label: "Venue" }
];

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short", year: "numeric", month: "short", day: "numeric"
  });
}

export function MatchBoard({
  invitations,
  myTeams,
  approvedTeams,
  viewerTeamIds,
  polls,
  setupError
}: {
  invitations: Invitation[];
  myTeams: TeamOption[];
  approvedTeams: TeamOption[];
  viewerTeamIds: string[];
  polls: MatchPoll[];
  setupError?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, MatchDraft>>({});
  const [pollSelections, setPollSelections] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!polls.some(poll => poll.status === "open")) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [polls, router]);

  async function submit(action: string, values: Record<string, MatchRequestValue>) {
    setBusy(action);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: action.split(":")[0], ...values })
      });
      const result: unknown = await response.json();
      if (!response.ok || typeof result !== "object" || result === null || !("id" in result)) {
        const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
          ? result.error : "The match request could not be completed.";
        throw new Error(message);
      }
      const pushDelivery = "pushDelivery" in result && typeof result.pushDelivery === "object" && result.pushDelivery !== null
        ? result.pushDelivery as { status?: unknown; delivered?: unknown }
        : null;
      const pushNote = pushDelivery?.status === "delivered"
        ? " Push notification delivered."
        : pushDelivery?.status === "not_configured"
          ? " Web Push is not configured; the in-app notification is saved."
          : pushDelivery?.status === "failed"
            ? " The in-app notification is saved, but Web Push could not be dispatched."
            : "";
      const actionType = action.split(":")[0];
      const message = actionType === "create"
        ? "Match invitation sent to the opposing captain."
        : actionType === "create-poll"
          ? "Match poll opened and the other captain was notified."
          : actionType === "close-poll"
            ? "Poll closed. Both captains can now confirm the leading arrangements."
            : actionType === "vote"
              ? "Your poll vote was saved."
              : "Match request updated.";
      setNotice(`${message}${pushNote}`);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The match request could not be completed.");
    } finally {
      setBusy("");
    }
  }

  function updateDraft(id: string, patch: Partial<MatchDraft>, invitation: Invitation) {
    const draft = drafts[id] ?? {
      matchDate: invitation.match_date,
      matchTime: invitation.match_time?.slice(0, 5) ?? "",
      venue: invitation.venue
    };
    setDrafts(current => ({ ...current, [id]: { ...draft, ...patch } }));
  }

  function optionLines(value: FormDataEntryValue | null) {
    return typeof value === "string"
      ? value.split(/\r?\n/).map(option => option.trim()).filter(Boolean)
      : [];
  }

  if (setupError) return <div className={styles.error} role="alert">{setupError}</div>;

  return <div className={styles.layout}>
    {myTeams.length > 0 && <section className={styles.create} aria-labelledby="create-match-heading">
      <h2 id="create-match-heading">Invite a team to play</h2>
      <p>Only captains of approved teams can send invitations. Do not include private contact details in public match notes.</p>
      <form onSubmit={event => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void submit("create", {
          requesterTeamId: String(form.get("requesterTeamId") || ""),
          invitedTeamId: String(form.get("invitedTeamId") || ""),
          matchDate: String(form.get("matchDate") || ""),
          matchTime: String(form.get("matchTime") || "") || null,
          venue: String(form.get("venue") || ""),
          overs: Number(form.get("overs")),
          matchFormat: String(form.get("matchFormat") || ""),
          notes: String(form.get("notes") || "").trim() || null
        });
      }} className={styles.form}>
        <label>Your team
          <select name="requesterTeamId" required defaultValue={myTeams[0].id}>
            {myTeams.map(team => <option value={team.id} key={team.id}>{team.name}</option>)}
          </select>
        </label>
        <label>Opponent
          <select name="invitedTeamId" required defaultValue="">
            <option value="" disabled>Select an approved team</option>
            {approvedTeams.filter(team => !viewerTeamIds.includes(team.id)).map(team => <option value={team.id} key={team.id}>{team.name}</option>)}
          </select>
        </label>
        <label>Proposed date<input name="matchDate" type="date" min={new Date().toISOString().slice(0, 10)} required/></label>
        <label>Proposed time<input name="matchTime" type="time"/></label>
        <label>Venue<input name="venue" minLength={2} maxLength={160} required placeholder="Ground or venue"/></label>
        <label>Overs
          <select name="overs" defaultValue="20">{[5, 10, 15, 20, 25, 30, 40, 50].map(overs => <option key={overs} value={overs}>{overs}</option>)}</select>
        </label>
        <label>Format<input name="matchFormat" defaultValue="T20" maxLength={80} required/></label>
        <label className={styles.wide}>Public note (optional)<textarea name="notes" maxLength={1000} rows={2} placeholder="Share match requirements or other public details"/></label>
        <button className="button" type="submit" disabled={Boolean(busy)}>{busy === "create" ? "Sending…" : "Send match invitation"}</button>
      </form>
    </section>}

    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <section className={styles.requests} aria-labelledby="match-requests-heading">
      <div className={styles.sectionHeading}><div><span className="eyebrow">TEAM INVITATIONS</span><h2 id="match-requests-heading">Match requests</h2></div><span className={styles.count}>{invitations.length}</span></div>
      {invitations.length === 0 ? <div className={styles.empty}>There are no open match requests yet.</div> : <div className={styles.list}>
        {invitations.map(invitation => {
          const canRespond = viewerTeamIds.includes(invitation.invited_team_id) && invitation.status === "pending";
          const myRequesterSide = viewerTeamIds.includes(invitation.requester_team_id);
          const myInvitedSide = viewerTeamIds.includes(invitation.invited_team_id);
          const needsConfirmation = invitation.status === "accepted" && (
            (myRequesterSide && !invitation.requester_confirmed) || (myInvitedSide && !invitation.invited_confirmed)
          );
          const draft = drafts[invitation.id] ?? {
            matchDate: invitation.match_date,
            matchTime: invitation.match_time?.slice(0, 5) ?? "",
            venue: invitation.venue
          };
          const invitationPolls = polls.filter(poll => poll.invitation_id === invitation.id);
          const openPoll = invitationPolls.find(poll => poll.status === "open");
          const canCreatePoll = invitation.status === "accepted" &&
            !invitation.requester_confirmed &&
            !invitation.invited_confirmed &&
            (myRequesterSide || myInvitedSide);
          return <article className={styles.card} key={invitation.id}>
            <div className={styles.cardTop}>
              <span className={`status-pill ${invitation.status === "finalized" ? styles.confirmed : ""}`}>{invitation.status === "finalized" ? "Confirmed" : invitation.status === "accepted" ? "Accepted · needs confirmation" : "Awaiting response"}</span>
              <time dateTime={invitation.match_date}>{formatDate(invitation.match_date)}</time>
            </div>
            <h3>{invitation.requester_team_name} <span>vs</span> {invitation.invited_team_name}</h3>
            <p className={styles.details}>{invitation.match_format} · {invitation.overs} overs · {invitation.match_time?.slice(0, 5) || "Time to be agreed"} · {invitation.venue}</p>
            {invitation.notes && <p className={styles.notes}>{invitation.notes}</p>}
            {invitationPolls.map(poll => <section className={styles.poll} key={poll.poll_id} aria-label={`Match arrangement poll ${poll.status}`}>
              <div className={styles.pollHeading}>
                <strong>{poll.status === "open" ? "Arrangement poll · live results" : "Final poll results"}</strong>
                <span>{poll.allow_vote_changes ? "Vote changes allowed" : "Votes are final"}</span>
              </div>
              {poll.status === "closed" && poll.final_date && poll.final_venue && <p className={styles.pollOutcome}>
                Leading choices: {formatDate(poll.final_date)} · {poll.final_time?.slice(0, 5) || "Time to be agreed"} · {poll.final_venue}
              </p>}
              <div className={styles.pollCategories}>
                {pollCategories.map(category => {
                  const options = poll.options.filter(option => option.category === category.key);
                  if (!options.length) return null;
                  const selectionKey = `${poll.poll_id}:${category.key}`;
                  const selectedOption = pollSelections[selectionKey] || options.find(option => option.my_vote)?.id || "";
                  const alreadyVoted = options.some(option => option.my_vote);
                  return <fieldset className={styles.pollCategory} key={category.key}>
                    <legend>{category.label}</legend>
                    {options.map(option => <label className={styles.pollOption} key={option.id}>
                      {poll.status === "open" && <input
                        type="radio"
                        name={selectionKey}
                        value={option.id}
                        checked={selectedOption === option.id}
                        disabled={alreadyVoted && !poll.allow_vote_changes}
                        onChange={() => setPollSelections(current => ({ ...current, [selectionKey]: option.id }))}
                      />}
                      <span>{option.label}</span>
                      <strong>{option.vote_count}</strong>
                    </label>)}
                    {poll.status === "open" && <button
                      type="button"
                      className={styles.pollVote}
                      disabled={Boolean(busy) || !selectedOption || (alreadyVoted && !poll.allow_vote_changes)}
                      onClick={() => void submit(`vote:${poll.poll_id}:${category.key}`, { pollId: poll.poll_id, optionId: selectedOption })}
                    >{busy === `vote:${poll.poll_id}:${category.key}` ? "Saving…" : alreadyVoted ? "Update vote" : "Vote"}</button>}
                  </fieldset>;
                })}
              </div>
              {poll.status === "open" && <button
                type="button"
                className={styles.closePoll}
                disabled={Boolean(busy)}
                onClick={() => void submit(`close-poll:${poll.poll_id}`, { pollId: poll.poll_id })}
              >{busy === `close-poll:${poll.poll_id}` ? "Closing…" : "Close poll and use leading options"}</button>}
            </section>)}
            {canCreatePoll && !openPoll && <details className={styles.createPoll}>
              <summary>Create a date, time and venue poll</summary>
              <form className={styles.pollForm} onSubmit={event => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void submit(`create-poll:${invitation.id}`, {
                  invitationId: invitation.id,
                  dateOptions: optionLines(form.get("dateOptions")),
                  timeOptions: optionLines(form.get("timeOptions")),
                  venueOptions: optionLines(form.get("venueOptions")),
                  allowVoteChanges: form.get("allowVoteChanges") === "on"
                });
              }}>
                <label>Date options (YYYY-MM-DD, one per line)<textarea name="dateOptions" rows={3} required placeholder={"2026-07-12\n2026-07-19"}/></label>
                <label>Time options (HH:MM, one per line)<textarea name="timeOptions" rows={3} required placeholder={"07:00\n08:00"}/></label>
                <label>Venue options (one per line)<textarea name="venueOptions" rows={3} required placeholder={"Ground A\nGround B"}/></label>
                <label className={styles.voteChange}><input name="allowVoteChanges" type="checkbox" defaultChecked/>Allow captains to change their votes</label>
                <button className="button button-small" type="submit" disabled={Boolean(busy)}>{busy === `create-poll:${invitation.id}` ? "Opening poll…" : "Open poll"}</button>
              </form>
            </details>}
            {canRespond && <div className={styles.actions}>
              <button type="button" className="button button-small" disabled={Boolean(busy)} onClick={() => void submit(`respond:${invitation.id}`, { id: invitation.id, response: "accepted" })}>Accept</button>
              <button type="button" className={styles.reject} disabled={Boolean(busy)} onClick={() => void submit(`respond:${invitation.id}`, { id: invitation.id, response: "rejected" })}>Decline</button>
            </div>}
            {needsConfirmation && <form className={styles.confirmForm} onSubmit={event => {
              event.preventDefault();
              void submit(`confirm:${invitation.id}`, {
                id: invitation.id,
                matchDate: draft.matchDate,
                matchTime: draft.matchTime || null,
                venue: draft.venue
              });
            }}>
              <strong>Confirm the final arrangements</strong>
              <div className={styles.confirmFields}>
                <label>Date<input type="date" required min={new Date().toISOString().slice(0, 10)} value={draft.matchDate} onChange={event => updateDraft(invitation.id, { matchDate: event.target.value }, invitation)}/></label>
                <label>Time<input type="time" value={draft.matchTime} onChange={event => updateDraft(invitation.id, { matchTime: event.target.value }, invitation)}/></label>
                <label>Venue<input required minLength={2} maxLength={160} value={draft.venue} onChange={event => updateDraft(invitation.id, { venue: event.target.value }, invitation)}/></label>
              </div>
              <p>{invitation.requester_confirmed || invitation.invited_confirmed ? "The first captain has confirmed; match details must stay the same." : "Both team captains must confirm the same arrangements before a fixture is created."}</p>
              <button className="button button-small" type="submit" disabled={Boolean(busy)}>{busy === `confirm:${invitation.id}` ? "Confirming…" : "Confirm arrangements"}</button>
            </form>}
            {invitation.status === "finalized" && <p className={styles.confirmedText}>Both captains confirmed this match. The fixture is now scheduled.</p>}
          </article>;
        })}
      </div>}
    </section>
  </div>;
}
