"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AdminLiveScoreEditor } from "./admin-live-score-editor";
import { ChatReportManager } from "./chat-report-manager";
import { AdsenseSettings } from "./adsense-settings";
import { PromotionManager } from "./promotion-manager";
import { TournamentFixtureManager } from "./tournament-fixture-manager";
import { SeoSettings } from "./seo-settings";
import {
  Activity, Bell, CalendarDays, Check, ChevronDown, Download, FileText,
  LayoutDashboard, LogOut, Menu, MessageSquare, Moon, Search, Settings,
  ShieldCheck, Sun, Trophy, Users, X
} from "lucide-react";
import styles from "./owner-dashboard.module.css";

type TeamStatus = "pending" | "pending_approval" | "approved" | "rejected";
type View = "dashboard" | "teams" | "approvals" | "matches" | "live" | "tournaments" | "reports" | "notifications" | "messages" | "settings";
type Team = { id: string; name: string; slug: string; area: string | null; sport: string | null; description: string | null; logo_url: string | null; status: TeamStatus; rejection_reason: string | null; created_at: string; captain_id: string };
type Captain = { id: string; display_name: string | null; avatar_url: string | null; phone: string | null; email: string | null; role: string };
type Player = { id: string; team_id: string; roster_number: number | null; full_name: string; photo_url: string | null; playing_role: string; contact: string | null; created_at: string };
type Notification = { id: string; title: string; body: string | null; read_at: string | null; created_at: string };
type Fixture = { id: string; home_team_id: string; away_team_id: string; home_team: string; away_team: string; match_date: string; match_time: string | null; ground: string | null; overs: number; status: string; created_at: string };
type Innings = { id: string; fixture_id: string; innings_number: number; batting_team_id: string; total_runs: number; wickets: number; legal_balls: number; is_completed: boolean };
type Tournament = { id: string; name: string; location: string | null; start_date: string; end_date: string; status: "upcoming" | "live" | "completed" | "cancelled"; description: string | null; format: string; max_teams: number; entry_deadline: string | null; rules: string | null; created_at: string };
type TournamentEntry = { id: string; tournament_id: string; tournament_name: string; team_id: string; team_name: string; captain_id: string; status: "pending" | "approved" | "rejected" | "withdrawn"; rejection_reason: string | null; created_at: string };
type ClubMessage = { id: string; body: string; created_at: string; sender: string; conversation: string };
type SeriesItem = { label: string; teams: number; players: number };
type Props = {
  teams: Team[];
  captains: Record<string, Captain>;
  players: Record<string, Player[]>;
  notifications: Notification[];
  counts: { users: number; teams: number; pending: number; approved: number; rejected: number; captains: number; players: number; fixtures: number; live: number };
  fixtures: Fixture[];
  innings: Innings[];
  tournaments: Tournament[];
  tournamentEntries: TournamentEntry[];
  messages: ClubMessage[];
  teamsByMonth: SeriesItem[];
  dataWarnings: string[];
};

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const navItems: Array<{ id: View; label: string; Icon: typeof LayoutDashboard; badge?: "pending" | "unread" }> = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "teams", label: "Teams", Icon: Users },
  { id: "approvals", label: "Pending approvals", Icon: ShieldCheck, badge: "pending" },
  { id: "matches", label: "Matches", Icon: CalendarDays },
  { id: "live", label: "Live scores", Icon: Activity },
  { id: "tournaments", label: "Tournaments", Icon: Trophy },
  { id: "reports", label: "Reports", Icon: FileText },
  { id: "notifications", label: "Notifications", Icon: Bell, badge: "unread" },
  { id: "messages", label: "Messages", Icon: MessageSquare },
  { id: "settings", label: "Settings", Icon: Settings }
];
const validViews = new Set<View>(navItems.map(item => item.id));
const themes = ["system", "light", "dark"] as const;
type Theme = typeof themes[number];

function playerNumber(index: number) {
  return String(index + 1).padStart(2, "0");
}

function formatDate(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatTime(value: string) {
  const [hours = "00", minutes = "00"] = value.split(":");
  return new Date(2000, 0, 1, Number(hours), Number(minutes)).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function decodeVapidKey(value: string) {
  const padded = value + "=".repeat((4 - value.length % 4) % 4);
  const raw = window.atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}

function StatCard({ label, value, tone, Icon }: { label: string; value: number; tone: string; Icon: typeof Users }) {
  return <article className={styles.stat}>
    <span className={`${styles.statIcon} ${styles[tone]}`}><Icon size={20}/></span>
    <div><p>{label}</p><strong>{value.toLocaleString()}</strong></div>
  </article>;
}

function TeamCard({ team, captain, roster, canReview, busy, rejectionReason, onReasonChange, onReview, onPlayerClick }: {
  team: Team;
  captain?: Captain;
  roster: Player[];
  canReview: boolean;
  busy: boolean;
  rejectionReason: string;
  onReasonChange: (value: string) => void;
  onReview: (status: "approved" | "rejected") => void;
  onPlayerClick: (player: Player, number: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return <article className={styles.teamCard}>
    <button className={styles.teamHeading} type="button" onClick={() => setExpanded(current => !current)} aria-expanded={expanded}>
      <span className={styles.teamLogo}>{team.logo_url ? <Image src={team.logo_url} alt="" width={46} height={46} unoptimized/> : team.name.slice(0, 2).toUpperCase()}</span>
      <span className={styles.teamTitle}><strong>{team.name}</strong><small>{team.area || "Location not provided"} · {team.sport || "Cricket"} · {new Date(team.created_at).toLocaleDateString()}</small></span>
      <span className={`${styles.status} ${styles[team.status]}`}>{team.status === "pending_approval" ? "Pending" : team.status}</span>
      <ChevronDown className={expanded ? styles.rotated : ""} size={17}/>
    </button>
    {expanded && <div className={styles.teamDetail}>
      <div className={styles.detailGrid}>
        <div className={styles.captainDetail}><small>Captain</small><span>{captain?.avatar_url ? <Image src={captain.avatar_url} alt="" width={28} height={28} unoptimized/> : <Users size={14}/>}<strong>{captain?.display_name || "Not provided"}</strong></span></div>
        <div><small>Captain email</small><strong>{captain?.email || "Not provided"}</strong></div>
        <div><small>Contact</small><strong>{captain?.phone || "Not provided"}</strong></div>
        <div><small>Registered</small><strong>{new Date(team.created_at).toLocaleString()}</strong></div>
        <div className={styles.fullDetail}><small>Description</small><strong>{team.description || "No description provided."}</strong></div>
        {team.rejection_reason && <div className={styles.fullDetail}><small>Rejection reason</small><strong>{team.rejection_reason}</strong></div>}
      </div>
      <div className={styles.rosterHeader}><h3>Players</h3><span>{roster.length} registered</span></div>
      {roster.length ? <div className={styles.rosterList}>{roster.map((player, index) => {
        const number = player.roster_number ? String(player.roster_number).padStart(2, "0") : playerNumber(index);
        return <button className={styles.rosterPlayer} key={player.id} type="button" onClick={() => onPlayerClick(player, number)}>
        <span className={styles.jersey}>{number}</span>
        <span className={styles.playerPhoto}>{player.photo_url ? <Image src={player.photo_url} alt="" width={38} height={38} unoptimized/> : <Users size={16}/>}</span>
        <span className={styles.playerInfo}><strong>{player.full_name}</strong><small>{player.playing_role}</small></span>
        <ChevronDown className={styles.playerChevron} size={15}/>
      </button>})}</div> : <p className={styles.muted}>No players listed for this team.</p>}
      {canReview && <div className={styles.reviewBox}>
        <label>Rejection reason (only needed to reject)<textarea value={rejectionReason} onChange={event => onReasonChange(event.target.value)} placeholder="Explain why this team cannot be approved"/></label>
        <div className={styles.actionRow}>
          <button type="button" className={styles.primaryAction} disabled={busy} onClick={() => onReview("approved")}>{busy ? "Saving…" : "Approve team"}</button>
          <button type="button" className={styles.dangerAction} disabled={busy} onClick={() => onReview("rejected")}>Reject</button>
        </div>
      </div>}
    </div>}
  </article>;
}

export function OwnerDashboard(props: Props) {
  const { teams: initialTeams, captains, players, notifications: initialNotifications, counts, fixtures, innings, tournaments: initialTournaments, tournamentEntries: initialTournamentEntries, messages, teamsByMonth, dataWarnings } = props;
  const [view, setView] = useState<View>("dashboard");
  const [teams, setTeams] = useState(initialTeams);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [tournaments, setTournaments] = useState(initialTournaments);
  const [tournamentEntries, setTournamentEntries] = useState(initialTournamentEntries);
  const [busy, setBusy] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("system");
  const [selectedPlayer, setSelectedPlayer] = useState<{ player: Player; number: string } | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [iosInstall, setIosInstall] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [tournamentForm, setTournamentForm] = useState({ name: "", location: "", start_date: "", end_date: "", description: "", format: "T20", max_teams: "16", entry_deadline: "", rules: "" });
  const [tournamentReasons, setTournamentReasons] = useState<Record<string, string>>({});
  const router = useRouter();

  const unreadCount = notifications.filter(item => !item.read_at).length;
  const seriesMax = Math.max(1, ...teamsByMonth.flatMap(item => [item.teams, item.players]));
  const visibleTeams = useMemo(() => {
    const source = view === "approvals" ? teams.filter(team => team.status === "pending_approval" || team.status === "pending") : teams;
    const needle = search.trim().toLowerCase();
    return needle ? source.filter(team => [team.name, team.area, team.sport].some(value => value?.toLowerCase().includes(needle))) : source;
  }, [teams, search, view]);

  const navigate = useCallback((next: View) => {
    setView(next);
    setSidebarOpen(false);
    if (typeof window !== "undefined") window.history.replaceState(null, "", `/admin?view=${next}`);
  }, []);

  useEffect(() => {
    setTeams(initialTeams);
    setNotifications(initialNotifications);
    setTournaments(initialTournaments);
    setTournamentEntries(initialTournamentEntries);
  }, [initialTeams, initialNotifications, initialTournaments, initialTournamentEntries]);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("view") as View | null;
    if (raw && validViews.has(raw)) setView(raw);
    const onPopState = () => {
      const current = new URLSearchParams(window.location.search).get("view") as View | null;
      if (current && validViews.has(current)) setView(current);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("pcc-admin-theme");
    if (savedTheme && themes.includes(savedTheme as Theme)) setTheme(savedTheme as Theme);
    const installedQuery = window.matchMedia("(display-mode: standalone)");
    const detectInstalled = () => setInstalled(installedQuery.matches || ("standalone" in navigator && navigator.standalone === true));
    detectInstalled();
    installedQuery.addEventListener("change", detectInstalled);
    const userAgent = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIosInstall(ios && /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent));
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    const onInstalled = () => { setInstalled(true); setInstallPrompt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    let active = true;
    const refresh = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 20_000);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/admin/sw.js", { scope: "/admin" }).then(() => {
        if (active) setPushSupported("PushManager" in window && "Notification" in window);
        return fetch("/api/admin/push/subscriptions");
      }).then(async response => {
        if (response.ok) {
          const result = await response.json() as { subscribed?: boolean };
          if (active) setPushEnabled(Boolean(result.subscribed));
        } else if (active) {
          const result = await response.json().catch(() => ({})) as { error?: string };
          setPushMessage(result.error || "Admin push settings could not be loaded.");
        }
      }).catch(() => {
        if (active) setPushMessage("Admin app notifications could not be initialized.");
      });
    } else {
      setPushSupported(false);
    }
    return () => {
      active = false;
      installedQuery.removeEventListener("change", detectInstalled);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.clearInterval(refresh);
    };
  }, [router]);

  useEffect(() => {
    window.localStorage.setItem("pcc-admin-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!selectedPlayer) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setSelectedPlayer(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedPlayer]);

  async function signOut() {
    try {
      const response = await fetch("/api/admin/logout", { method: "POST" });
      if (!response.ok) throw new Error("The admin session could not be closed. Try again.");
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "The admin session could not be closed.");
      return;
    }
    window.location.assign("/");
  }

  async function reviewTeam(teamId: string, status: "approved" | "rejected") {
    setBusy(teamId);
    setNotice("");
    setError("");
    if (status === "rejected" && (reasons[teamId]?.trim().length ?? 0) < 3) {
      setError("Enter a rejection reason of at least 3 characters.");
      setBusy("");
      return;
    }
    try {
      const response = await fetch("/api/owner/team-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, status, reason: status === "rejected" ? reasons[teamId].trim() : undefined })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not review the team.");
      setTeams(current => current.map(team => team.id === teamId ? { ...team, status, rejection_reason: status === "rejected" ? reasons[teamId].trim() : null } : team));
      setNotice(status === "approved" ? "Team approved. It can now appear in public discovery." : "Team rejected and kept out of public discovery.");
      router.refresh();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Could not review the team.");
    } finally {
      setBusy("");
    }
  }

  async function markNotificationRead(id: string) {
    setError("");
    try {
      const response = await fetch("/api/admin/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not mark notification as read.");
      const readAt = new Date().toISOString();
      setNotifications(current => current.map(item => item.id === id ? { ...item, read_at: readAt } : item));
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : "Could not mark notification as read.");
    }
  }

  async function markAllNotificationsRead() {
    setError("");
    try {
      const response = await fetch("/api/admin/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark-all" })
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not mark notifications as read.");
      const readAt = new Date().toISOString();
      setNotifications(current => current.map(item => ({ ...item, read_at: item.read_at || readAt })));
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : "Could not mark notifications as read.");
    }
  }

  async function installAdminApp() {
    if (installed) return;
    if (installPrompt) {
      try {
        await installPrompt.prompt();
        await installPrompt.userChoice;
        setInstallPrompt(null);
      } catch {
        setNotice("The browser could not start installation. Use the browser menu to install the admin app.");
      }
      return;
    }
    setNotice(iosInstall ? "In Safari, tap Share → Add to Home Screen → Add." : "Open your browser menu and choose Install app or Add to Home screen.");
  }

  async function togglePush() {
    setPushBusy(true);
    setPushMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (pushEnabled && existing) {
        const response = await fetch("/api/admin/push/subscriptions", {
          method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: existing.endpoint })
        });
        const result = await response.json().catch(() => ({})) as { error?: string };
        if (!response.ok) throw new Error(result.error || "Could not remove notification subscription.");
        await existing.unsubscribe();
        setPushEnabled(false);
        setPushMessage("Push notifications are off on this device.");
        return;
      }
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) throw new Error("Push keys are not configured on the server yet.");
      if (iosInstall && !installed) throw new Error("On iPhone/iPad, first install PCC Admin from Safari using Share → Add to Home Screen, then open the installed app.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error(permission === "denied" ? "Notifications are blocked in browser settings." : "Notification permission was not granted.");
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(vapidKey) as BufferSource
      });
      const response = await fetch("/api/admin/push/subscriptions", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription)
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        if (!existing) await subscription.unsubscribe();
        throw new Error(result.error || "Could not save this device subscription.");
      }
      setPushEnabled(true);
      setPushMessage("Notifications are enabled on this device.");
    } catch (pushError) {
      setPushMessage(pushError instanceof Error ? pushError.message : "Could not update notification settings.");
    } finally {
      setPushBusy(false);
    }
  }

  async function sendTestPush() {
    setPushBusy(true);
    setPushMessage("");
    try {
      const response = await fetch("/api/admin/push/test", { method: "POST" });
      const result = await response.json() as { error?: string; delivered?: number; targeted?: number };
      if (!response.ok) throw new Error(result.error || "Test notification was not delivered.");
      setPushMessage(`Test notification delivered to ${result.delivered} of ${result.targeted} device(s).`);
    } catch (pushError) {
      setPushMessage(pushError instanceof Error ? pushError.message : "Could not send test notification.");
    } finally {
      setPushBusy(false);
    }
  }

  async function createTournament(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy("tournament");
    try {
      const response = await fetch("/api/admin/tournaments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...tournamentForm, max_teams: Number(tournamentForm.max_teams) })
      });
      const result = await response.json() as { tournament?: Tournament; error?: string };
      if (!response.ok || !result.tournament) throw new Error(result.error || "Could not create tournament.");
      setTournaments(current => [...current, result.tournament!].sort((a, b) => a.start_date.localeCompare(b.start_date)));
      setTournamentForm({ name: "", location: "", start_date: "", end_date: "", description: "", format: "T20", max_teams: "16", entry_deadline: "", rules: "" });
      setNotice("Tournament created.");
    } catch (tournamentError) {
      setError(tournamentError instanceof Error ? tournamentError.message : "Could not create tournament.");
    } finally {
      setBusy("");
    }
  }

  async function updateTournament(id: string, status: Tournament["status"]) {
    setError("");
    try {
      const response = await fetch("/api/admin/tournaments", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not update tournament.");
      setTournaments(current => current.map(item => item.id === id ? { ...item, status } : item));
    } catch (tournamentError) {
      setError(tournamentError instanceof Error ? tournamentError.message : "Could not update tournament.");
    }
  }

  async function reviewTournamentEntry(entry: TournamentEntry, status: "approved" | "rejected") {
    const reason = tournamentReasons[entry.id]?.trim() || "";
    if (status === "rejected" && !reason) {
      setError("Enter a rejection reason for this tournament entry.");
      return;
    }
    setBusy(entry.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/tournaments/entries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId: entry.id, status, reason })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not review this entry.");
      setTournamentEntries(current => current.map(item => item.id === entry.id
        ? { ...item, status, rejection_reason: status === "rejected" ? reason : null }
        : item));
      setNotice(status === "approved" ? `${entry.team_name} is entered in ${entry.tournament_name}.` : `${entry.team_name}'s entry was rejected.`);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Could not review this tournament entry.");
    } finally {
      setBusy("");
    }
  }

  function downloadReport() {
    const rows = [
      ["Report", "Value"],
      ["Registered users", counts.users],
      ["Registered teams", counts.teams],
      ["Approved teams", counts.approved],
      ["Pending approvals", counts.pending],
      ["Rejected teams", counts.rejected],
      ["Players", counts.players],
      ["Confirmed matches", counts.fixtures],
      ["Live matches", counts.live],
      ...teams.map(team => [`Team: ${team.name}`, team.status])
    ];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `pcc-admin-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const inningsByFixture = useMemo(() => {
    const grouped: Record<string, Innings[]> = {};
    for (const inning of innings) grouped[inning.fixture_id] = [...(grouped[inning.fixture_id] || []), inning];
    return grouped;
  }, [innings]);

  function renderTeamList() {
    if (!visibleTeams.length) return <div className={styles.empty}>{view === "approvals" ? "No teams are awaiting approval." : "No teams match your search."}</div>;
    return <div className={styles.teamList}>{visibleTeams.map(team => <TeamCard
      key={team.id}
      team={team}
      captain={captains[team.captain_id]}
      roster={players[team.id] || []}
      canReview={view === "approvals" && (team.status === "pending_approval" || team.status === "pending")}
      busy={busy === team.id}
      rejectionReason={reasons[team.id] || ""}
      onReasonChange={value => setReasons(current => ({ ...current, [team.id]: value }))}
      onReview={status => void reviewTeam(team.id, status)}
      onPlayerClick={(player, number) => setSelectedPlayer({ player, number })}
    />)}</div>;
  }

  const pageTitle = navItems.find(item => item.id === view)?.label || "Dashboard";
  return <div className={styles.page} data-theme={theme}>
    <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
      <div className={styles.brand}><span className={styles.brandMark}>PCC</span><div><strong>Peshawar</strong><b>Admin</b></div><button type="button" className={styles.closeSidebar} onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={18}/></button></div>
      <nav className={styles.nav} aria-label="Admin navigation">
        {navItems.map(({ id, label, Icon, badge }) => <button type="button" key={id} className={`${styles.navItem} ${view === id ? styles.navActive : ""}`} onClick={() => navigate(id)}>
          <Icon size={17}/>{label}{badge === "pending" && counts.pending > 0 && <span className={styles.navBadge}>{counts.pending}</span>}{badge === "unread" && unreadCount > 0 && <span className={styles.navBadge}>{unreadCount}</span>}
        </button>)}
      </nav>
      <div className={styles.sidebarFooter}><ShieldCheck size={16}/><span>Private owner access</span></div>
    </aside>
    {sidebarOpen && <button type="button" className={styles.overlay} aria-label="Close menu" onClick={() => setSidebarOpen(false)}/>}
    <section className={styles.workspace}>
      <header className={styles.topbar}>
        <button type="button" className={styles.menuButton} onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu size={19}/></button>
        <label className={styles.search}><Search size={16}/><input aria-label="Search teams" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search teams..."/><kbd>Search</kbd></label>
        <div className={styles.topActions}>
          <button type="button" className={styles.themeButton} aria-label={`Current theme: ${theme}. Cycle theme`} onClick={() => setTheme(current => themes[(themes.indexOf(current) + 1) % themes.length])}>{theme === "dark" ? <Moon size={16}/> : <Sun size={16}/>}</button>
          <button type="button" className={styles.topBell} aria-label={`${unreadCount} unread notifications`} onClick={() => navigate("notifications")}><Bell size={16}/>{unreadCount > 0 && <span>{unreadCount}</span>}</button>
          <button type="button" className={styles.profile} onClick={() => void signOut()}><span>O</span><div><strong>Owner</strong><small>Sign out</small></div><LogOut size={14}/></button>
        </div>
      </header>
      <main className={styles.main}>
        <div className={styles.heading}>
          <div><span className={styles.welcomeIcon}>PCC</span><div><h1>{view === "dashboard" ? "Welcome back, Owner!" : pageTitle}</h1><p>{view === "dashboard" ? "Live club overview and administration." : `Manage ${pageTitle.toLowerCase()} for Peshawar Cricket Club.`}</p></div></div>
          <div className={styles.headingActions}>
            <button type="button" className={styles.outlineAction} onClick={() => router.refresh()} aria-label="Refresh dashboard data">Refresh</button>
            {view === "reports" && <button type="button" className={styles.outlineAction} onClick={downloadReport}><Download size={15}/>Export CSV</button>}
          </div>
        </div>
        {dataWarnings.length > 0 && <div className={styles.warning} role="status">{dataWarnings.map(item => <p key={item}>{item}</p>)}</div>}
        {notice && <p className={styles.notice} role="status">{notice}</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}

        {view === "dashboard" && <>
          <section className={styles.stats} aria-label="Application totals">
            <StatCard label="Registered users" value={counts.users} Icon={Users} tone="blue"/>
            <StatCard label="Registered teams" value={counts.teams} Icon={ShieldCheck} tone="green"/>
            <StatCard label="Pending approvals" value={counts.pending} Icon={CalendarDays} tone="gold"/>
            <StatCard label="Confirmed matches" value={counts.fixtures} Icon={Activity} tone="purple"/>
          </section>
          <section className={styles.analyticsGrid}>
            <article className={styles.panel}>
              <div className={styles.panelHeader}><div><h2><Activity size={17}/>Club registrations</h2><p>Real team and player registrations by month</p></div></div>
              <div className={styles.chartLegend}><span><i className={styles.blueDot}/>Teams</span><span><i className={styles.purpleDot}/>Players</span></div>
              <div className={styles.barChart} role="img" aria-label="Monthly team and player registrations">
                {teamsByMonth.map(item => <div className={styles.barGroup} key={item.label}>
                <div className={styles.bars}><span className={styles.teamBar} style={{ height: `${Math.max(3, item.teams / seriesMax * 100)}%` }} title={`${item.teams} teams`}/><span className={styles.playerBar} style={{ height: `${Math.max(3, item.players / seriesMax * 100)}%` }} title={`${item.players} players`}/></div>
                  <small>{item.label}</small>
                </div>)}
              </div>
              <p className={styles.chartFootnote}>Bars use the actual registrations recorded for each month.</p>
            </article>
            <article className={styles.panel}>
              <div className={styles.panelHeader}><div><h2><ShieldCheck size={17}/>Team approvals</h2><p>Current registration status</p></div></div>
                <div className={styles.donutArea}>
                <div className={styles.donut} style={{ background: counts.teams ? `conic-gradient(#21a879 0 ${counts.approved / counts.teams * 100}%, #e6aa38 0 ${(counts.approved + counts.pending) / counts.teams * 100}%, #df6571 0 100%)` : "#dce2eb" }}><div><strong>{counts.teams}</strong><span>Teams</span></div></div>
              </div>
              <div className={styles.legendList}><span><i className={styles.greenDot}/>Approved <b>{counts.approved}</b></span><span><i className={styles.goldDot}/>Pending <b>{counts.pending}</b></span><span><i className={styles.redDot}/>Rejected <b>{counts.rejected}</b></span></div>
            </article>
          </section>
          <section className={styles.dashboardLower}>
            <article className={styles.panel}><div className={styles.panelHeader}><div><h2><Users size={17}/>Recent teams</h2><p>Latest club registrations</p></div><button type="button" className={styles.textAction} onClick={() => navigate("teams")}>All teams</button></div>{renderCompactTeams(teams.slice(0, 5), captains)}</article>
            <article className={styles.panel}><div className={styles.panelHeader}><div><h2><Bell size={17}/>Recent notifications</h2><p>{unreadCount} unread</p></div><button type="button" className={styles.textAction} onClick={() => navigate("notifications")}>View all</button></div>{renderNotifications(notifications.slice(0, 5), markNotificationRead)}</article>
          </section>
        </>}

        {(view === "teams" || view === "approvals") && <section className={styles.panel}>
          <div className={styles.panelHeader}><div><h2>{view === "teams" ? "All registered teams" : "Team approval queue"}</h2><p>{view === "teams" ? `${teams.length} teams, including pending and rejected registrations` : `${counts.pending} team(s) need owner review`}</p></div>
            {view === "teams" && <select className={styles.filterSelect} aria-label="Filter teams" onChange={event => setTeams(current => [...current].sort((a, b) => event.target.value === "newest" ? b.created_at.localeCompare(a.created_at) : a.name.localeCompare(b.name)))}><option value="newest">Newest first</option><option value="name">Name A–Z</option></select>}
          </div>{renderTeamList()}</section>}

        {view === "matches" && <section className={styles.panel}>
          <div className={styles.panelHeader}><div><h2>Matches</h2><p>{fixtures.length} fixtures recorded in the club database</p></div></div>
          {fixtures.length ? <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Match</th><th>Date & time</th><th>Ground</th><th>Overs</th><th>Status</th></tr></thead><tbody>{fixtures.map(fixture => <tr key={fixture.id}><td><strong>{fixture.home_team}</strong><small>vs {fixture.away_team}</small></td><td>{formatDate(fixture.match_date)}{fixture.match_time && <small>{formatTime(fixture.match_time)}</small>}</td><td>{fixture.ground || "Not set"}</td><td>{fixture.overs}</td><td><span className={`${styles.status} ${styles[fixture.status]}`}>{fixture.status}</span></td></tr>)}</tbody></table></div> : <div className={styles.empty}>No matches are recorded yet.</div>}
        </section>}

        {view === "live" && <section className={styles.panel}>
          <div className={styles.panelHeader}><div><h2><Activity size={17}/>Live score center</h2><p>Start fixtures, score ball-by-ball, and undo the latest delivery.</p></div><span className={styles.liveCount}>{counts.live} live</span></div>
          {fixtures.filter(fixture => fixture.status === "live" || fixture.status === "confirmed").length ? <div className={styles.liveGrid}>{fixtures.filter(fixture => fixture.status === "live" || fixture.status === "confirmed").map(fixture => <article className={styles.liveCard} key={fixture.id}>
            <span className={fixture.status === "live" ? styles.liveTag : styles.readyTag}>{fixture.status === "live" ? <><i/>LIVE</> : "READY TO SCORE"}</span><h3>{fixture.home_team} <small>vs</small> {fixture.away_team}</h3>
            <p>{fixture.ground || "Ground not set"} · {fixture.overs} overs</p>
            <AdminLiveScoreEditor
              fixture={fixture}
              initialInnings={inningsByFixture[fixture.id] || []}
              homePlayers={players[fixture.home_team_id] || []}
              awayPlayers={players[fixture.away_team_id] || []}
            />
          </article>)}</div> : <div className={styles.empty}>There are no live matches in the database right now.</div>}
        </section>}

        {view === "tournaments" && <div className={styles.tournamentLayout}>
          <section className={styles.panel}><div className={styles.panelHeader}><div><h2>Create a tournament</h2><p>Tournament records are stored in the application database.</p></div></div>
            <form className={styles.tournamentForm} onSubmit={event => void createTournament(event)}>
              <label>Tournament name<input required minLength={3} maxLength={100} value={tournamentForm.name} onChange={event => setTournamentForm(current => ({ ...current, name: event.target.value }))}/></label>
              <label>Location<input maxLength={120} value={tournamentForm.location} onChange={event => setTournamentForm(current => ({ ...current, location: event.target.value }))}/></label>
              <div className={styles.dateFields}><label>Start date<input type="date" required value={tournamentForm.start_date} onChange={event => setTournamentForm(current => ({ ...current, start_date: event.target.value }))}/></label><label>End date<input type="date" required value={tournamentForm.end_date} onChange={event => setTournamentForm(current => ({ ...current, end_date: event.target.value }))}/></label></div>
              <div className={styles.dateFields}><label>Entry deadline<input type="date" value={tournamentForm.entry_deadline} onChange={event => setTournamentForm(current => ({ ...current, entry_deadline: event.target.value }))}/></label><label>Maximum teams<input type="number" min={2} max={64} required value={tournamentForm.max_teams} onChange={event => setTournamentForm(current => ({ ...current, max_teams: event.target.value }))}/></label></div>
              <label>Match format<input required maxLength={60} value={tournamentForm.format} onChange={event => setTournamentForm(current => ({ ...current, format: event.target.value }))} placeholder="T20, T10, One-day"/></label>
              <label>Description<textarea maxLength={2000} value={tournamentForm.description} onChange={event => setTournamentForm(current => ({ ...current, description: event.target.value }))}/></label>
              <label>Tournament rules<textarea maxLength={4000} value={tournamentForm.rules} onChange={event => setTournamentForm(current => ({ ...current, rules: event.target.value }))}/></label>
              <button type="submit" className={styles.primaryAction} disabled={busy === "tournament"}>{busy === "tournament" ? "Creating…" : "Create tournament"}</button>
            </form>
          </section>
          <section className={styles.panel}><div className={styles.panelHeader}><div><h2>Tournaments</h2><p>{tournaments.length} saved tournament(s)</p></div></div>
            {tournaments.length ? <div className={styles.tournamentList}>{tournaments.map(item => <article className={styles.tournamentCard} key={item.id}><div><h3>{item.name}</h3><p>{item.location || "Location not set"} · {formatDate(item.start_date)} – {formatDate(item.end_date)}</p><small>{item.format} · Up to {item.max_teams} teams{item.entry_deadline ? ` · Entries close ${formatDate(item.entry_deadline)}` : ""}</small>{item.description && <small>{item.description}</small>}</div><select aria-label={`Status for ${item.name}`} value={item.status} onChange={event => void updateTournament(item.id, event.target.value as Tournament["status"])}><option value="upcoming">Upcoming</option><option value="live">Live</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></article>)}</div> : <div className={styles.empty}>No tournaments yet. Create one to begin.</div>}
          </section>
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><h2>Tournament entries</h2><p>{tournamentEntries.filter(entry => entry.status === "pending").length} awaiting review · {tournamentEntries.length} total</p></div></div>
            {tournamentEntries.length ? <div className={styles.tournamentList}>{tournamentEntries.map(entry => <article className={styles.entryCard} key={entry.id}>
              <div className={styles.entryInfo}><h3>{entry.team_name} <small>for</small> {entry.tournament_name}</h3><p>Applied {new Date(entry.created_at).toLocaleDateString()} · {entry.status}</p>{entry.rejection_reason && <small>Reason: {entry.rejection_reason}</small>}</div>
              {entry.status === "pending" && <div className={styles.entryActions}>
                <label className="sr-only" htmlFor={`entry-reason-${entry.id}`}>Rejection reason for {entry.team_name}</label>
                <input id={`entry-reason-${entry.id}`} maxLength={1000} value={tournamentReasons[entry.id] || ""} onChange={event => setTournamentReasons(current => ({ ...current, [entry.id]: event.target.value }))} placeholder="Reason if rejecting"/>
                <button className={styles.primaryAction} type="button" disabled={Boolean(busy)} onClick={() => void reviewTournamentEntry(entry,"approved")}>{busy === entry.id ? "Saving…" : "Approve"}</button>
                <button className={styles.dangerAction} type="button" disabled={Boolean(busy)} onClick={() => void reviewTournamentEntry(entry,"rejected")}>Reject</button>
              </div>}
            </article>)}</div> : <div className={styles.empty}>No tournament applications have been received.</div>}
          </section>
          <TournamentFixtureManager/>
        </div>}

        {view === "reports" && <section className={styles.panel}>
          <div className={styles.panelHeader}><div><h2>Club reports</h2><p>Current database totals and registration statuses</p></div><button type="button" className={styles.outlineAction} onClick={downloadReport}><Download size={15}/>Download CSV</button></div>
          <section className={styles.reportStats}><StatCard label="Users" value={counts.users} Icon={Users} tone="blue"/><StatCard label="Captains" value={counts.captains} Icon={ShieldCheck} tone="green"/><StatCard label="Players" value={counts.players} Icon={Users} tone="purple"/><StatCard label="Live matches" value={counts.live} Icon={Activity} tone="gold"/></section>
          <div className={styles.reportRows}><div><span>Approved teams</span><strong>{counts.approved}</strong></div><div><span>Awaiting approval</span><strong>{counts.pending}</strong></div><div><span>Rejected teams</span><strong>{counts.rejected}</strong></div><div><span>Confirmed matches</span><strong>{counts.fixtures}</strong></div><div><span>Tournaments</span><strong>{tournaments.length}</strong></div></div>
          <p className={styles.chartFootnote}>Export contains the totals shown here and the current team roster/status list.</p>
        </section>}

        {view === "notifications" && <section className={styles.panel}>
          <div className={styles.panelHeader}><div><h2>Owner notifications</h2><p>Persistent database notifications · {unreadCount} unread</p></div>{unreadCount > 0 && <button type="button" className={styles.outlineAction} onClick={() => void markAllNotificationsRead()}><Check size={15}/>Mark all read</button>}</div>
          {notifications.length ? renderNotifications(notifications, markNotificationRead) : <div className={styles.empty}>No owner notifications have been recorded.</div>}
        </section>}

        {view === "messages" && <>
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><h2>Club messages</h2><p>Latest messages from existing team and match conversations. Owner view is read-only.</p></div></div>
            {messages.length ? <div className={styles.messageList}>{messages.map(message => <article className={styles.messageCard} key={message.id}><div><strong>{message.sender}</strong><small>{message.conversation} · {new Date(message.created_at).toLocaleString()}</small></div><p>{message.body}</p></article>)}</div> : <div className={styles.empty}>No club messages are available.</div>}
          </section>
          <ChatReportManager/>
        </>}

        {view === "settings" && <section className={styles.settingsGrid}>
          <article className={styles.panel}><div className={styles.panelHeader}><div><h2>Appearance</h2><p>Choose the admin app color theme.</p></div></div>
            <div className={styles.themeChoices}>{themes.map(item => <button type="button" key={item} className={`${styles.themeChoice} ${theme === item ? styles.themeChoiceActive : ""}`} onClick={() => setTheme(item)}>{item === "dark" ? <Moon size={18}/> : item === "light" ? <Sun size={18}/> : <Settings size={18}/>}<span>{item[0].toUpperCase() + item.slice(1)}</span>{theme === item && <Check size={16}/>}</button>)}</div>
          </article>
          <article className={styles.panel}><div className={styles.panelHeader}><div><h2>Install PCC Admin</h2><p>Install this private dashboard as a separate mobile app.</p></div></div>
            <div className={styles.installSetting}><span className={styles.installIcon}><Image src="/icon-192.png" alt="" width={48} height={48}/></span><div><strong>Peshawar Cricket Club Admin</strong><small>Separate app shortcut · secure sign-in required</small></div></div>
            <button type="button" className={styles.primaryAction} disabled={installed} onClick={() => void installAdminApp()}>{installed ? <><Check size={16}/>Installed</> : <><Download size={16}/>Install Admin App</>}</button>
            {iosInstall && <p className={styles.helpText}>iPhone/iPad: in Safari tap Share → Add to Home Screen → Add.</p>}
          </article>
          <article className={styles.panel}><div className={styles.panelHeader}><div><h2>Mobile push notifications</h2><p>Opt in on this device, then send a test to verify delivery.</p></div><Bell size={18}/></div>
            {!pushSupported && <p className={styles.helpText}>This browser does not support Web Push. On iPhone/iPad, first add the admin app to the Home Screen and open it there.</p>}
            <div className={styles.pushActions}><button type="button" className={styles.primaryAction} disabled={!pushSupported || pushBusy} onClick={() => void togglePush()}>{pushBusy ? "Please wait…" : pushEnabled ? "Turn off notifications" : "Enable notifications"}</button>{pushEnabled && <button type="button" className={styles.outlineAction} disabled={pushBusy} onClick={() => void sendTestPush()}>Send test</button>}</div>
            {pushMessage && <p className={styles.helpText} role="status">{pushMessage}</p>}
            <p className={styles.helpText}>Permission is requested only after you choose Enable. Background delivery also requires configured VAPID keys and the Supabase admin-push migration.</p>
          </article>
          <AdsenseSettings/>
          <PromotionManager/>
          <SeoSettings/>
          <article className={styles.panel}><div className={styles.panelHeader}><div><h2>Admin session</h2><p>The private admin session expires automatically.</p></div></div><button className={styles.dangerAction} type="button" onClick={() => void signOut()}><LogOut size={15}/>Sign out</button></article>
        </section>}
      </main>
    </section>
    {selectedPlayer && <div className={styles.modalBackdrop} role="presentation" onClick={() => setSelectedPlayer(null)}>
      <section className={styles.playerDialog} role="dialog" aria-modal="true" aria-labelledby="player-dialog-title" onClick={event => event.stopPropagation()}>
        <button type="button" className={styles.dialogClose} aria-label="Close player details" onClick={() => setSelectedPlayer(null)}><X size={18}/></button>
        <span className={styles.dialogJersey}>{selectedPlayer.number}</span>
        <span className={styles.dialogPhoto}>{selectedPlayer.player.photo_url ? <Image src={selectedPlayer.player.photo_url} alt={`${selectedPlayer.player.full_name} profile`} width={128} height={128} unoptimized/> : <Users size={42}/>}</span>
        <h2 id="player-dialog-title">{selectedPlayer.player.full_name}</h2>
        <p>{selectedPlayer.player.playing_role}</p>
        {selectedPlayer.player.contact && <a href={`tel:${selectedPlayer.player.contact}`}>{selectedPlayer.player.contact}</a>}
      </section>
    </div>}
  </div>;
}

function renderCompactTeams(teams: Team[], captains: Record<string, Captain>) {
  return teams.length ? <div className={styles.compactList}>{teams.map(team => <div className={styles.compactTeam} key={team.id}><span className={styles.compactLogo}>{team.logo_url ? <Image src={team.logo_url} alt="" width={34} height={34} unoptimized/> : team.name.slice(0, 2).toUpperCase()}</span><div><strong>{team.name}</strong><small>{captains[team.captain_id]?.display_name || "Captain not listed"} · {new Date(team.created_at).toLocaleDateString()}</small></div><span className={`${styles.status} ${styles[team.status]}`}>{team.status === "pending_approval" ? "Pending" : team.status}</span></div>)}</div> : <div className={styles.empty}>No teams yet.</div>;
}

function renderNotifications(notifications: Notification[], markRead: (id: string) => Promise<void>) {
  return <div className={styles.notificationList}>{notifications.map(item => <article className={`${styles.notification} ${!item.read_at ? styles.unread : ""}`} key={item.id}>
    <span className={styles.notificationIcon}><Bell size={15}/></span><div className={styles.notificationBody}><strong>{item.title}</strong><p>{item.body || "Registration update"}</p><small>{new Date(item.created_at).toLocaleString()}</small></div>
    {!item.read_at && <button type="button" className={styles.markRead} onClick={() => void markRead(item.id)}>Mark read</button>}
  </article>)}</div>;
}
