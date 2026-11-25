"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { compressAndUploadImage, type ImageCrop } from "@/lib/profile-avatar";
import { CropImageInput } from "@/components/crop-image-input";
import styles from "./captain-team-manager.module.css";

const roles = [
  "Batsman",
  "Bowler",
  "All-rounder",
  "Batting All-rounder",
  "Bowling All-rounder",
  "Wicketkeeper",
  "Wicketkeeper-Batsman"
] as const;
type PlayerRole = typeof roles[number];
type Player = {
  id: string;
  public_player_id: number | string;
  roster_number: number;
  full_name: string;
  photo_url: string | null;
  playing_role: PlayerRole;
  contact: string | null;
  batting_style: string | null;
  bowling_style: string | null;
  jersey_number: number | null;
  is_public: boolean;
  is_captain: boolean;
  is_vice_captain: boolean;
  account_status: string;
};
const defaultCrop = (): ImageCrop => ({ zoom: 1, x: 0.5, y: 0.5 });

function publicPlayerId(value: number | string) {
  return String(value).padStart(4, "0");
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

export function CaptainTeamManager({
  teamId,
  teamName
}: {
  teamId: string;
  teamName: string;
}) {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [viceCaptainId, setViceCaptainId] = useState("");
  const [pendingPhotos, setPendingPhotos] = useState<Record<string, File | null>>({});
  const [photoCrops, setPhotoCrops] = useState<Record<string, ImageCrop>>({});
  const [playerInvites, setPlayerInvites] = useState<Record<string, { code: string; expiresAt: string }>>({});
  const [newPhoto, setNewPhoto] = useState<File | null>(null);
  const [newPhotoCrop, setNewPhotoCrop] = useState<ImageCrop>(defaultCrop());
  const [newPlayer, setNewPlayer] = useState({
    fullName: "",
    role: "Batsman" as PlayerRole,
    contact: "",
    battingStyle: "",
    bowlingStyle: "",
    jerseyNumber: "",
    photo: null as File | null
  });

  const loadRoster = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) {
      setError("Roster management is unavailable because Supabase is not configured.");
      setLoading(false);
      return;
    }
    const { data, error: rosterError } = await supabase.rpc("get_my_team_roster", { p_team_id: teamId });
    if (rosterError) {
      setError(`Could not load this roster. Apply the PCC platform migration. (${rosterError.message})`);
      setLoading(false);
      return;
    }
    const roster = (data ?? []) as Player[];
    setPlayers(roster);
    setViceCaptainId(roster.find(player => player.is_vice_captain)?.id || "");
    setError("");
    setLoading(false);
  }, [teamId]);

  useEffect(() => { void loadRoster(); }, [loadRoster]);

  async function runAction(action: string, operation: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(action);
    setError("");
    setNotice("");
    try {
      const { error: actionError } = await operation();
      if (actionError) throw new Error(actionError.message);
      setNotice("Team roster updated.");
      await loadRoster();
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "The roster update could not be saved.");
    } finally {
      setBusy("");
    }
  }

  async function savePlayer(player: Player, form: HTMLFormElement) {
    const supabase = createClient();
    if (!supabase) {
      setError("Roster management is unavailable because Supabase is not configured.");
      return;
    }
    const fields = new FormData(form);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setError("Sign in again before managing your team.");
      return;
    }
    const photo = pendingPhotos[player.id];
    let photoUrl = player.photo_url;
    try {
      if (photo instanceof File && photo.size) {
        photoUrl = await compressAndUploadImage(
          supabase,
          { id: user.id },
          photo,
          `team-${teamId}-player-${player.id}`,
          photoCrops[player.id] ?? defaultCrop()
        );
      }
      await runAction(`player-${player.id}`, () => supabase.rpc("update_my_team_player", {
        p_player_id: player.id,
        p_full_name: String(fields.get("fullName") || ""),
        p_playing_role: String(fields.get("playingRole") || ""),
        p_photo_url: photoUrl,
        p_contact: String(fields.get("contact") || "").trim() || null,
        p_batting_style: String(fields.get("battingStyle") || "").trim() || null,
        p_bowling_style: String(fields.get("bowlingStyle") || "").trim() || null,
        p_jersey_number: String(fields.get("jerseyNumber") || "").trim() ? Number(fields.get("jerseyNumber")) : null,
        p_is_public: fields.get("isPublic") === "on"
      }));
      setPendingPhotos(current => ({ ...current, [player.id]: null }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The player photo could not be uploaded.");
    }
  }

  async function addPlayer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = createClient();
    if (!supabase) {
      setError("Roster management is unavailable because Supabase is not configured.");
      return;
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setError("Sign in again before managing your team.");
      return;
    }
    setBusy("add-player");
    setError("");
    setNotice("");
    try {
      const photoUrl = newPlayer.photo
        ? await compressAndUploadImage(supabase, { id: user.id }, newPlayer.photo, `team-${teamId}-new-player`, newPhotoCrop)
        : null;
      const { error: addError } = await supabase.rpc("add_my_team_player", {
        p_team_id: teamId,
        p_full_name: newPlayer.fullName.trim(),
        p_playing_role: newPlayer.role,
        p_photo_url: photoUrl,
        p_contact: newPlayer.contact.trim() || null,
        p_batting_style: newPlayer.battingStyle.trim() || null,
        p_bowling_style: newPlayer.bowlingStyle.trim() || null,
        p_jersey_number: newPlayer.jerseyNumber ? Number(newPlayer.jerseyNumber) : null,
        p_is_public: true
      });
      if (addError) throw new Error(addError.message);
      setNewPlayer({ fullName: "", role: "Batsman", contact: "", battingStyle: "", bowlingStyle: "", jerseyNumber: "", photo: null });
      setNewPhoto(null);
      setNewPhotoCrop(defaultCrop());
      setNotice("Player added. Their permanent Player ID has been assigned.");
      await loadRoster();
      router.refresh();
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Could not add this player.");
    } finally {
      setBusy("");
    }
  }

  async function changeViceCaptain(playerId: string) {
    const supabase = createClient();
    if (!supabase) return setError("Roster management is unavailable because Supabase is not configured.");
    const next = playerId || null;
    await runAction("vice-captain", () => supabase.rpc("set_my_team_vice_captain", {
      p_team_id: teamId,
      p_player_id: next
    }));
    setViceCaptainId(playerId);
  }

  async function createPlayerInvite(player: Player) {
    const supabase = createClient();
    if (!supabase) {
      setError("Player access is unavailable because Supabase is not configured.");
      return;
    }
    if (!globalThis.crypto?.subtle) {
      setError("Secure player invites require a modern browser with Web Crypto support.");
      return;
    }

    setBusy(`invite-${player.id}`);
    setError("");
    setNotice("");
    try {
      const code = bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(32)));
      const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
      const tokenHash = bytesToHex(new Uint8Array(digest));
      const { data, error: inviteError } = await supabase.rpc("create_player_account_invite", {
        p_player_id: player.id,
        p_token_hash: tokenHash
      });
      if (inviteError) throw new Error(inviteError.message);
      if (typeof data !== "string") throw new Error("The player invite was created, but its expiry could not be read.");
      setPlayerInvites(current => ({ ...current, [player.id]: { code, expiresAt: data } }));
      setNotice(`A single-use access code was created for Player ${publicPlayerId(player.public_player_id)}.`);
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "Could not create a player invite.");
    } finally {
      setBusy("");
    }
  }

  async function copyPlayerInvite(playerId: string) {
    const code = playerInvites[playerId]?.code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setNotice("Player access code copied. Share it privately with the player.");
    } catch {
      setError("Could not copy the code. Select and copy it manually.");
    }
  }

  return <section className={styles.manager} aria-labelledby={`manage-${teamId}`}>
    <header className={styles.heading}>
      <div><span className="eyebrow">CAPTAIN DASHBOARD</span><h3 id={`manage-${teamId}`}>{teamName}</h3><p>Manage your approved roster and assign one vice-captain.</p></div>
      <span className={styles.count}>{players.length} / 12 players</span>
    </header>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {loading ? <p className={styles.empty}>Loading your roster…</p> : <>
      <label className={styles.viceCaptain}>Vice-captain
        <select value={viceCaptainId} onChange={event => void changeViceCaptain(event.target.value)} disabled={Boolean(busy)}>
          <option value="">Not assigned</option>
          {players.filter(player => !player.is_captain).map(player => <option value={player.id} key={player.id}>{player.full_name}</option>)}
        </select>
      </label>
      <div className={styles.playerList}>
        {players.map(player => <form className={styles.playerCard} key={player.id} onSubmit={event => { event.preventDefault(); void savePlayer(player, event.currentTarget); }}>
          <div className={styles.playerTitle}>
            <strong>Player ID {publicPlayerId(player.public_player_id)}</strong>
            <span>{player.is_captain ? "Captain" : player.is_vice_captain ? "Vice-captain" : `Roster ${String(player.roster_number).padStart(2, "0")}`}</span>
          </div>
          {!player.is_captain && <div className={styles.accountAccess}>
            {player.account_status === "active" ? <p className={styles.accountActive}>Player account linked</p>
              : player.account_status === "suspended" ? <p className={styles.accountSuspended}>Player access is suspended. Contact the Club Owner.</p>
                : <>
                  <button type="button" className={styles.inviteButton} disabled={Boolean(busy)} onClick={() => void createPlayerInvite(player)}>
                    {busy === `invite-${player.id}` ? "Creating secure code…" : playerInvites[player.id] ? "Replace invite code" : "Create player access code"}
                  </button>
                  {playerInvites[player.id] && <div className={styles.inviteDetails}>
                    <code>{playerInvites[player.id].code}</code>
                    <button type="button" onClick={() => void copyPlayerInvite(player.id)}>Copy code</button>
                    <small>Expires {new Date(playerInvites[player.id].expiresAt).toLocaleString()}. Share the code and Player ID privately. The player must create or sign in to their own account, then redeem at /player-access. Replacing the code invalidates this one.</small>
                  </div>}
                </>}
          </div>}
          <div className={styles.fields}>
            <label>Full name<input name="fullName" defaultValue={player.full_name} minLength={2} maxLength={80} required/></label>
            <label>Cricket role<select name="playingRole" defaultValue={player.playing_role}>{roles.map(role => <option value={role} key={role}>{role}</option>)}</select></label>
            <label>Batting style<input name="battingStyle" defaultValue={player.batting_style || ""} maxLength={80}/></label>
            <label>Bowling style<input name="bowlingStyle" defaultValue={player.bowling_style || ""} maxLength={80}/></label>
            <label>Jersey number<input name="jerseyNumber" type="number" min={0} max={999} defaultValue={player.jersey_number ?? ""}/></label>
            <label>Private contact<input name="contact" defaultValue={player.contact || ""} maxLength={30}/></label>
            <CropImageInput
              id={`captain-player-photo-${player.id}`}
              label="Replace photo"
              shape="circle"
              file={pendingPhotos[player.id] ?? null}
              crop={photoCrops[player.id] ?? defaultCrop()}
              onFileChange={file => setPendingPhotos(current => ({ ...current, [player.id]: file }))}
              onCropChange={crop => setPhotoCrops(current => ({ ...current, [player.id]: crop }))}
            />
            <label className={styles.visibility}><input name="isPublic" type="checkbox" defaultChecked={player.is_public}/>Show on public profile</label>
          </div>
          <div className={styles.actions}>
            <button type="submit" className={styles.save} disabled={Boolean(busy)}>{busy === `player-${player.id}` ? "Saving…" : "Save player"}</button>
            {!player.is_captain && <button type="button" className={styles.remove} disabled={Boolean(busy) || players.length <= 8} onClick={() => {
              if (!window.confirm(`Remove ${player.full_name} from this team? Their global Player ID will not be reused.`)) return;
              const supabase = createClient();
              if (supabase) void runAction(`remove-${player.id}`, () => supabase.rpc("remove_my_team_player", { p_player_id: player.id }));
            }}>Remove player</button>}
          </div>
        </form>)}
      </div>
      {players.length < 12 && <form className={styles.addForm} onSubmit={event => void addPlayer(event)}>
        <h4>Add player</h4>
        <div className={styles.fields}>
          <label>Full name<input value={newPlayer.fullName} onChange={event => setNewPlayer(current => ({ ...current, fullName: event.target.value }))} minLength={2} maxLength={80} required/></label>
          <label>Cricket role<select value={newPlayer.role} onChange={event => setNewPlayer(current => ({ ...current, role: event.target.value as PlayerRole }))}>{roles.map(role => <option value={role} key={role}>{role}</option>)}</select></label>
          <label>Batting style<input value={newPlayer.battingStyle} onChange={event => setNewPlayer(current => ({ ...current, battingStyle: event.target.value }))} maxLength={80}/></label>
          <label>Bowling style<input value={newPlayer.bowlingStyle} onChange={event => setNewPlayer(current => ({ ...current, bowlingStyle: event.target.value }))} maxLength={80}/></label>
          <label>Jersey number<input type="number" min={0} max={999} value={newPlayer.jerseyNumber} onChange={event => setNewPlayer(current => ({ ...current, jerseyNumber: event.target.value }))}/></label>
          <label>Private contact<input value={newPlayer.contact} onChange={event => setNewPlayer(current => ({ ...current, contact: event.target.value }))} maxLength={30}/></label>
          <CropImageInput
            id={`captain-new-player-photo-${teamId}`}
            label="Player photo"
            shape="circle"
            file={newPhoto}
            crop={newPhotoCrop}
            onFileChange={file => { setNewPhoto(file); setNewPlayer(current => ({ ...current, photo: file })); }}
            onCropChange={setNewPhotoCrop}
          />
        </div>
        <button className={styles.save} type="submit" disabled={Boolean(busy)}>{busy === "add-player" ? "Adding…" : "Add player"}</button>
      </form>}
    </>}
  </section>;
}
