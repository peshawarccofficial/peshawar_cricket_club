"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { compressAndUploadImage, type ImageCrop } from "@/lib/profile-avatar";
import { CaptainTeamManager } from "./captain-team-manager";
import { CropImageInput } from "./crop-image-input";
import styles from "./teams-workspace.module.css";

const roles = ["Batsman", "Bowler", "All-rounder", "Batting All-rounder", "Bowling All-rounder", "Wicketkeeper", "Wicketkeeper-Batsman"] as const;
type PlayingRole = typeof roles[number];
type TeamStatus = "pending" | "pending_approval" | "approved" | "suspended" | "rejected";
const defaultCrop = (): ImageCrop => ({ zoom: 1, x: 0.5, y: 0.5 });
type RosterPlayer = {
  full_name: string;
  playing_role: PlayingRole;
  photo?: File | null;
  photo_url?: string | null;
  crop: ImageCrop;
  contact?: string;
};
type TeamRow = { id: string; name: string; slug: string; logo_url: string | null; area: string | null; status: TeamStatus; created_at: string };
type TeamWithCount = TeamRow & { playerCount: number };
type CaptainTeam = {
  team_id: string;
  name: string;
  slug: string;
  status: TeamStatus;
  area: string | null;
  sport: string | null;
  description: string | null;
  logo_url: string | null;
  rejection_reason: string | null;
};

function getDisplayName(user: { user_metadata: Record<string, unknown> } | null) {
  const metadataName = user?.user_metadata.display_name ?? user?.user_metadata.full_name ?? user?.user_metadata.name;
  return typeof metadataName === "string" ? metadataName : "";
}

function statusLabel(status: TeamStatus) {
  if (status === "pending") return "Awaiting approval";
  if (status === "approved") return "Approved";
  if (status === "pending_approval") return "Awaiting owner approval";
  if (status === "rejected") return "Needs changes";
  return "Suspended";
}

export function TeamsWorkspace() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [signedInName, setSignedInName] = useState("");
  const [teams, setTeams] = useState<TeamWithCount[]>([]);
  const [captainTeams, setCaptainTeams] = useState<CaptainTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [teamName, setTeamName] = useState("");
  const [area, setArea] = useState("");
  const [sport, setSport] = useState("Cricket");
  const [description, setDescription] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [logoCrop, setLogoCrop] = useState<ImageCrop>(defaultCrop());
  const [existingLogoUrl, setExistingLogoUrl] = useState<string | null>(null);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [players, setPlayers] = useState<RosterPlayer[]>(Array.from({ length: 8 }, (_, index) => ({
    full_name: "",
    playing_role: index === 0 ? "All-rounder" : "Batsman",
    crop: defaultCrop()
  })));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [directorySearch, setDirectorySearch] = useState("");
  const [directoryArea, setDirectoryArea] = useState("all");

  const refreshTeams = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) {
      setLoadError("Team registration is not connected yet. Supabase public URL and key must be configured.");
      setLoading(false);
      return;
    }

    const [{ data: teamRows, error: teamError }, { data: authData, error: authError }] = await Promise.all([
      supabase.from("teams").select("id,name,slug,logo_url,area,status,created_at").is("deleted_at", null).order("created_at", { ascending: false }),
      supabase.auth.getUser()
    ]);

    if (teamError) {
      setLoadError(`Could not load teams. Apply the Supabase database setup and try again. (${teamError.message})`);
      setLoading(false);
      return;
    }
    if (authError && authError.name !== "AuthSessionMissingError") {
      setLoadError(`Could not verify your account. (${authError.message})`);
      setLoading(false);
      return;
    }

    const user = authData.user;
    setUserId(user?.id ?? null);
    setSignedInName(getDisplayName(user));
    const rows = (teamRows ?? []) as TeamRow[];
    let counts = new Map<string, number>();
    if (rows.length) {
      const { data: playerRows, error: playersError } = await supabase
        .from("public_team_players")
        .select("team_id")
        .in("team_id", rows.map(team => team.id));
      if (playersError) {
        setLoadError(`Could not load team squads. (${playersError.message})`);
        setLoading(false);
        return;
      }
      counts = new Map<string, number>();
      for (const player of playerRows ?? []) {
        counts.set(player.team_id, (counts.get(player.team_id) ?? 0) + 1);
      }
      if (user) {
        const [{ data: ownCounts, error: ownCountsError }, { data: ownedRows, error: ownedTeamsError }] = await Promise.all([
          supabase.rpc("get_my_team_roster_counts"),
          supabase.rpc("get_my_captain_teams")
        ]);
        if (ownCountsError || ownedTeamsError) {
          setLoadError(`Could not load your captain dashboard. Apply supabase/pcc-platform-migration.sql. (${ownCountsError?.message || ownedTeamsError?.message})`);
          setLoading(false);
          return;
        }
        for (const team of ownCounts ?? []) counts.set(team.team_id, team.player_count);
        setCaptainTeams((ownedRows ?? []) as CaptainTeam[]);
      }
    } else if (user) {
      const { data: ownedRows, error: ownedTeamsError } = await supabase.rpc("get_my_captain_teams");
      if (ownedTeamsError) {
        setLoadError(`Could not load your captain dashboard. Apply supabase/pcc-platform-migration.sql. (${ownedTeamsError.message})`);
        setLoading(false);
        return;
      }
      setCaptainTeams((ownedRows ?? []) as CaptainTeam[]);
    } else {
      setCaptainTeams([]);
    }
    setTeams(rows.map(team => ({ ...team, playerCount: counts.get(team.id) ?? 0 })));
    setLoadError("");
    setLoading(false);
  }, []);

  useEffect(() => {
    void refreshTeams();
  }, [refreshTeams]);

  function updatePlayer(index: number, patch: Partial<RosterPlayer>) {
    setPlayers(current => current.map((player, playerIndex) => playerIndex === index ? { ...player, ...patch } : player));
  }

  function addPlayer() {
    setPlayers(current => current.length >= 12 ? current : [...current, { full_name: "", playing_role: "All-rounder", crop: defaultCrop() }]);
  }

  async function editRejectedApplication(team: CaptainTeam) {
    const supabase = createClient();
    if (!supabase) {
      setError("Team registration is unavailable because Supabase is not configured.");
      return;
    }

    setError("");
    const { data, error: rosterError } = await supabase.rpc("get_my_team_roster", { p_team_id: team.team_id });
    if (rosterError) {
      setError(`Could not load this application for editing. (${rosterError.message})`);
      return;
    }
    const roster = (data ?? []) as Array<{
      full_name: string;
      playing_role: string;
      photo_url: string | null;
      contact: string | null;
    }>;
    if (roster.length < 8 || roster.length > 12) {
      setError("This application does not have a valid 8–12 player roster. Contact the club owner.");
      return;
    }

    setEditingTeamId(team.team_id);
    setTeamName(team.name);
    setArea(team.area || "");
    setSport(team.sport || "Cricket");
    setDescription(team.description || "");
    setExistingLogoUrl(team.logo_url);
    setLogo(null);
    setLogoCrop(defaultCrop());
    setPlayers(roster.map(player => ({
      full_name: player.full_name,
      playing_role: player.playing_role as PlayingRole,
      photo_url: player.photo_url,
      contact: player.contact || "",
      crop: defaultCrop()
    })));
    setMessage("");
    document.getElementById("register-team-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submitTeam(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    const supabase = createClient();
    if (!supabase) {
      setError("Team registration is unavailable because Supabase is not configured.");
      return;
    }
    if (!userId) {
      setError("Sign in before submitting a team registration.");
      return;
    }
    if (players.length < 8 || players.length > 12 || players.some(player => player.full_name.trim().length < 2)) {
      setError("Enter names for 8 to 12 players. The first player is registered as captain.");
      return;
    }
    if (teamName.trim().length < 3 || teamName.trim().length > 60 || area.trim().length < 2 || area.trim().length > 80) {
      setError("Enter a team name (3–60 characters) and area (2–80 characters).");
      return;
    }

    setSaving(true);
    try {
      const normalizedPlayers: Array<{ full_name: string; playing_role: PlayingRole; photo_url?: string; contact?: string }> = [];
      for (let index = 0; index < players.length; index += 1) {
        const player = players[index];
        const photoUrl = player.photo
          ? await compressAndUploadImage(supabase, { id: userId }, player.photo, `player-${index + 1}`, player.crop)
          : undefined;
        normalizedPlayers.push({
          full_name: player.full_name.trim(),
          playing_role: player.playing_role,
          ...(photoUrl ? { photo_url: photoUrl } : {}),
          ...(!photoUrl && player.photo_url ? { photo_url: player.photo_url } : {}),
          ...(player.contact?.trim() ? { contact: player.contact.trim() } : {})
        });
      }
      let logoUrl: string | undefined;
      if (logo) {
        logoUrl = await compressAndUploadImage(supabase, { id: userId }, logo, "team-logo", logoCrop);
      }
      const savedLogoUrl = logoUrl ?? (existingLogoUrl || null);
      if (editingTeamId) {
        const { error: resubmissionError } = await supabase.rpc("resubmit_my_team", {
          p_team_id: editingTeamId,
          p_name: teamName.trim(),
          p_area: area.trim(),
          p_players: normalizedPlayers,
          p_logo_url: savedLogoUrl,
          p_sport: sport.trim() || "Cricket",
          p_description: description.trim() || null
        });
        if (resubmissionError) {
          if (resubmissionError.message.includes("resubmit_my_team")) {
            throw new Error("Team resubmission is not configured. Apply supabase/pcc-platform-migration.sql.");
          }
          throw resubmissionError;
        }
      } else {
        const { error: registrationError } = await supabase.rpc("register_team", {
          p_name: teamName.trim(),
          p_area: area.trim(),
          p_players: normalizedPlayers,
          p_logo_url: savedLogoUrl,
          p_sport: sport.trim() || "Cricket",
          p_description: description.trim() || null
        });
        if (registrationError) {
          if (registrationError.message.includes("register_team")) {
            throw new Error("The team workflow is not configured. Apply the documented Supabase migrations, including supabase/pcc-platform-migration.sql.");
          }
          throw registrationError;
        }
      }
      const wasResubmission = Boolean(editingTeamId);
      setTeamName("");
      setArea("");
      setSport("Cricket");
      setDescription("");
      setLogo(null);
      setLogoCrop(defaultCrop());
      setExistingLogoUrl(null);
      setEditingTeamId(null);
      setPlayers(Array.from({ length: 8 }, (_, index) => ({ full_name: index === 0 ? signedInName : "", playing_role: index === 0 ? "All-rounder" : "Batsman", crop: defaultCrop() })));
      setMessage(wasResubmission
        ? "Your corrected team application has been resubmitted for owner review."
        : "Team registration submitted. It will appear publicly after the club owner approves it.");
      await refreshTeams();
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not submit the team registration.");
    } finally {
      setSaving(false);
    }
  }

  const visibleTeams = teams.filter(team => {
    const query = directorySearch.trim().toLowerCase();
    const location = team.area || "Peshawar";
    return (!query || `${team.name} ${location}`.toLowerCase().includes(query)) &&
      (directoryArea === "all" || location === directoryArea);
  });

  return <div className={styles.layout}>
    <section className={styles.section} aria-labelledby="team-directory-heading">
      <h2 id="team-directory-heading">Team directory</h2>
      <p className={styles.description}>Approved teams are visible to everyone. Your pending registrations are visible only to you and the club owner.</p>
      <div className={styles.directoryFilters}>
        <label htmlFor="team-directory-search">Search teams
          <input id="team-directory-search" type="search" value={directorySearch} onChange={event => setDirectorySearch(event.target.value)} placeholder="Name or location"/>
        </label>
        <label htmlFor="team-directory-area">Location
          <select id="team-directory-area" value={directoryArea} onChange={event => setDirectoryArea(event.target.value)}>
            <option value="all">All locations</option>
            {[...new Set(teams.map(team => team.area || "Peshawar"))].sort().map(areaName => <option value={areaName} key={areaName}>{areaName}</option>)}
          </select>
        </label>
      </div>
      {loading ? <p className={styles.loading}>Loading teams…</p> : loadError ? <p className={styles.error} role="alert">{loadError}</p> : teams.length ? visibleTeams.length ? <div className={styles.teamList}>
        {visibleTeams.map(team => <article className={styles.teamCard} key={team.id} id={team.id}>
          <div className={styles.teamTitle}>
            <h3>{team.status === "approved" ? <Link href={`/teams/${team.slug}`}>{team.name}</Link> : team.name}</h3>
            <span className={`status-pill ${team.status === "approved" ? styles.approved : team.status === "pending" || team.status === "pending_approval" ? styles.pending : team.status === "rejected" ? styles.rejected : styles.suspended}`}>{statusLabel(team.status)}</span>
          </div>
          <p className={styles.teamMeta}>{team.area || "Peshawar"} · {team.playerCount} / 12 players</p>
          {team.status === "pending" && <p className={styles.teamMeta}>Submitted {new Date(team.created_at).toLocaleDateString()}</p>}
        </article>)}
      </div> : <div className={styles.empty}>No teams match your search and location filters.</div> : <div className={styles.empty}>No registered teams yet. Be the first to register your squad.</div>}
    </section>

    {userId && captainTeams.some(team => team.status !== "approved") && <section className={styles.section} aria-labelledby="team-applications-heading">
      <h2 id="team-applications-heading">Your team applications</h2>
      <div className={styles.applicationList}>
        {captainTeams.filter(team => team.status !== "approved").map(team => <article className={styles.applicationCard} key={team.team_id}>
          <div className={styles.teamTitle}>
            <h3>{team.name}</h3>
            <span className={`status-pill ${team.status === "rejected" ? styles.rejected : styles.pending}`}>{statusLabel(team.status)}</span>
          </div>
          {team.rejection_reason && <p className={styles.rejectionReason}><strong>Owner feedback:</strong> {team.rejection_reason}</p>}
          {team.status === "rejected" && <button className={styles.secondary} type="button" onClick={() => void editRejectedApplication(team)}>Correct and resubmit</button>}
        </article>)}
      </div>
    </section>}

    <section className={styles.section} aria-labelledby="register-team-heading">
      <h2 id="register-team-heading">{editingTeamId ? "Correct team application" : "Register your team"}</h2>
      <p className={styles.description}>{editingTeamId ? "Update the requested details and resubmit your rejected application for owner review." : "Sign in and add a team name, area, and 8–12 players. Your first listed player will be the captain."}</p>
      {!userId && !loading && <div className={styles.signin}><span>Sign in to register and manage your team.</span><Link href="/login">Sign in</Link></div>}
      {userId && <form className={styles.form} onSubmit={submitTeam}>
        <div className={styles.field}>
          <label htmlFor="team-name">Team name</label>
          <input id="team-name" value={teamName} onChange={event => setTeamName(event.target.value)} minLength={3} maxLength={60} required placeholder="e.g. Peshawar XI"/>
        </div>
        <div className={styles.field}>
          <label htmlFor="team-area">Area</label>
          <input id="team-area" value={area} onChange={event => setArea(event.target.value)} minLength={2} maxLength={80} required placeholder="e.g. Hayatabad"/>
        </div>
        <div className={styles.field}>
          <label htmlFor="team-sport">Sport type</label>
          <input id="team-sport" value={sport} onChange={event => setSport(event.target.value)} minLength={2} maxLength={40} required/>
        </div>
        <div className={styles.field}>
          <label htmlFor="team-description">Team description</label>
          <textarea id="team-description" value={description} onChange={event => setDescription(event.target.value)} maxLength={2000} placeholder="Club history, playing level, or availability"/>
        </div>
        <CropImageInput id="team-logo" label="Team logo (optional)" shape="square" file={logo} crop={logoCrop} onFileChange={setLogo} onCropChange={setLogoCrop}/>
        {existingLogoUrl && !logo && <div className={styles.currentImage}><span>Current team logo</span><Image src={existingLogoUrl} alt="Current team logo" width={48} height={48} unoptimized/></div>}
        <div className={styles.playerHeader}><label>Squad players</label><span>{players.length} / 12 · first is captain</span></div>
        <div className={styles.players}>
          {players.map((player, index) => <div className={styles.player} key={index}>
            <span className={styles.playerNumber}>{index === 0 ? "Captain" : `Player ${index + 1}`}</span>
            <div className={styles.field}>
              <label className="sr-only" htmlFor={`player-name-${index}`}>{index === 0 ? "Captain name" : `Player ${index + 1} name`}</label>
              <input id={`player-name-${index}`} value={player.full_name} onChange={event => updatePlayer(index, { full_name: event.target.value })} minLength={2} maxLength={80} required placeholder="Full name"/>
            </div>
            <div className={styles.field}>
              <label className="sr-only" htmlFor={`player-role-${index}`}>Playing role for {index === 0 ? "captain" : `player ${index + 1}`}</label>
              <select id={`player-role-${index}`} value={player.playing_role} onChange={event => updatePlayer(index, { playing_role: event.target.value as PlayingRole })}>
                {roles.map(role => <option key={role} value={role}>{role}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor={`player-contact-${index}`}>Contact (optional)</label>
              <input id={`player-contact-${index}`} value={player.contact || ""} onChange={event => updatePlayer(index, { contact: event.target.value })} maxLength={30} placeholder="Phone or WhatsApp"/>
            </div>
            <CropImageInput
              id={`player-photo-${index}`}
              label="Photo (optional)"
              shape="circle"
              file={player.photo ?? null}
              crop={player.crop}
              onFileChange={photo => updatePlayer(index, { photo })}
              onCropChange={crop => updatePlayer(index, { crop })}
            />
            {player.photo_url && !player.photo && <div className={styles.currentImage}><span>Current photo</span><Image className={styles.currentPlayerPhoto} src={player.photo_url} alt={`Current photo of ${player.full_name}`} width={48} height={48} unoptimized/></div>}
          </div>)}
        </div>
        <div className={styles.playerActions}>
          <button type="button" className={styles.secondary} onClick={addPlayer} disabled={players.length >= 12}>Add player</button>
          {players.length > 8 && <button type="button" className={styles.secondary} onClick={() => setPlayers(current => current.slice(0, -1))}>Remove last player</button>}
        </div>
        <button className="button full" type="submit" disabled={saving || Boolean(loadError)}>{saving ? "Submitting…" : editingTeamId ? "Resubmit for approval" : "Submit for approval"}</button>
        {editingTeamId && <button className={styles.secondary} type="button" disabled={saving} onClick={() => {
          setEditingTeamId(null);
          setExistingLogoUrl(null);
          setTeamName("");
          setArea("");
          setSport("Cricket");
          setDescription("");
          setLogo(null);
          setPlayers(Array.from({ length: 8 }, (_, index) => ({ full_name: index === 0 ? signedInName : "", playing_role: index === 0 ? "All-rounder" : "Batsman", crop: defaultCrop() })));
        }}>Cancel editing</button>}
        {message && <p className={styles.message} role="status">{message}</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </form>}
    </section>

    {userId && captainTeams.some(team => team.status === "approved") && <section className={`${styles.section} ${styles.managerSection}`} aria-labelledby="captain-dashboard-heading">
      <h2 id="captain-dashboard-heading">Captain dashboard</h2>
      <p className={styles.description}>Manage the roster, player profiles, public visibility and vice-captain assignment for your approved team. Changes are checked by the database against your captain account.</p>
      <div className={styles.captainManagers}>
        {captainTeams.filter(team => team.status === "approved").map(team => <CaptainTeamManager key={team.team_id} teamId={team.team_id} teamName={team.name}/>)}
      </div>
    </section>}
  </div>;
}
