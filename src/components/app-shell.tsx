"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { CalendarDays, House, Radio, Users, MessageCircle, Menu, Settings, MoreVertical, UserRound, LogOut, Trophy } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { useEffect, useRef, useState } from "react";
import { InstallBanner, InstallButton, InstallGuide } from "./pwa-controls";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { uploadPendingProfilePhoto } from "@/lib/profile-avatar";
import styles from "./app-shell.module.css";

const links = [
  { href: "/", label: "Home", icon: House },
  { href: "/matches", label: "Matches", icon: CalendarDays },
  { href: "/teams", label: "Teams", icon: Users },
  { href: "/tournaments", label: "Tournaments", icon: Trophy },
  { href: "/live", label: "Live", icon: Radio },
  { href: "/chat", label: "Chat", icon: MessageCircle }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [authError, setAuthError] = useState("");
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const publicPaths = ["/", "/matches", "/teams", "/tournaments", "/live", "/chat", "/login", "/settings", "/offline", "/reset-password", "/about", "/contact", "/privacy-policy", "/terms-and-conditions"];
  const isPublicAppRoute = publicPaths.includes(path) || path.startsWith("/teams/") || path.startsWith("/players/");

  useEffect(() => {
    setAccountMenuOpen(false);
  }, [path]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !accountMenuRef.current?.contains(event.target)) {
        setAccountMenuOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountMenuOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    const client = supabase;
    function syncUser(nextUser: User | null) {
      setUser(nextUser);
      const metadataAvatar = nextUser?.user_metadata?.avatar_url;
      setAvatarUrl(typeof metadataAvatar === "string" ? metadataAvatar : null);
      if (nextUser) {
        void uploadPendingProfilePhoto(client, nextUser).then(uploadedAvatar => {
          if (uploadedAvatar) setAvatarUrl(uploadedAvatar);
        }).catch(error => {
          setAuthError(error instanceof Error ? error.message : "Could not save your profile photo.");
        });
      }
    }
    void supabase.auth.getUser().then(({ data, error }) => {
      if (error && error.name !== "AuthSessionMissingError") {
        console.error("Could not load the signed-in user:", error.message);
      }
      syncUser(data.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => syncUser(session?.user || null));
    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) {
      setAuthError("Could not sign out. Please try again.");
      console.error("Supabase sign out failed:", error.message);
    } else {
      setAuthError("");
      setAvatarUrl(null);
      setMenuOpen(false);
    }
  }

  if (!isPublicAppRoute) {
    return <div>{children}</div>;
  }

  return <div className="app-frame">
    <header className="topbar">
      <Link href="/" className={`brand ${styles.brandLink}`}><Image src="/logo.png" alt="Peshawar Cricket Club shield logo" width={54} height={58} className={styles.brandLogo} priority/><span><b>Peshawar Cricket Club</b><small>PLAY • CONNECT • COMPETE</small></span></Link>
      <nav className="desktop-nav">{links.map(({href,label}) => <Link key={href} className={path === href || path.startsWith(`${href}/`) && href !== "/" ? "nav-link active" : "nav-link"} href={href}>{label}</Link>)}<Link className="nav-link" href="/settings">Settings</Link></nav>
      <div className={`top-actions ${styles.topActions}`}><ThemeToggle/>{user ? <div className={styles.accountMenu} ref={accountMenuRef}>
        <button type="button" className={`icon-button ${styles.accountToggle}`} aria-label="Account menu" aria-haspopup="menu" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen(open => !open)}>
          {avatarUrl ? <Image src={avatarUrl} alt="" width={30} height={30} unoptimized className={styles.toggleAvatar}/> : <UserRound size={18}/>}
          <MoreVertical size={15}/>
        </button>
        {accountMenuOpen && <div className={styles.accountPopover} role="menu">
          <div className={styles.accountSummary}>
            {avatarUrl ? <Image src={avatarUrl} alt="" width={42} height={42} unoptimized className={styles.summaryAvatar}/> : <span className={styles.summaryAvatarFallback}><UserRound size={20}/></span>}
            <div className={styles.accountIdentity}>
              <strong>{typeof user.user_metadata?.display_name === "string" ? user.user_metadata.display_name : typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : user.email || user.phone || "Account"}</strong>
              <span>{user.email || user.phone || "Signed in"}</span>
            </div>
          </div>
          <Link href="/settings" role="menuitem" className={styles.menuItem} onClick={() => setAccountMenuOpen(false)}><Settings size={16}/>App settings</Link>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={() => void signOut()}><LogOut size={16}/>Sign out</button>
        </div>}
      </div> : <Link href="/login" className="button button-small">Sign in</Link>}<button className="icon-button mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu"><Menu size={20}/></button></div>
    </header>
    {authError && <p className="auth-error-banner" role="alert">{authError}</p>}
    {menuOpen && <div className="mobile-drawer">{links.map(({href,label}) => <Link key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</Link>)}<Link href="/settings" onClick={() => setMenuOpen(false)}><Settings size={16}/>Settings</Link>{user ? <button className="text-button" type="button" onClick={() => void signOut()}>Sign out</button> : <Link href="/login" onClick={() => setMenuOpen(false)}>Sign in</Link>}<InstallButton className="button button-small mobile-install-button"/></div>}
    <main>{children}</main>
    <footer className="footer"><div className={styles.footerBrand}><Image src="/logo.png" alt="" width={30} height={34} className={styles.footerLogo}/><span>© {new Date().getFullYear()} Peshawar Cricket Club</span></div><nav className={styles.footerLinks} aria-label="Information"><Link href="/about">About</Link><Link href="/contact">Contact</Link><Link href="/privacy-policy">Privacy</Link><Link href="/terms-and-conditions">Terms</Link></nav><span>Built for the cricket community of Peshawar</span></footer>
    <nav className="bottom-nav">{links.map(({href,label,icon: Icon}) => <Link key={href} href={href} className={path === href ? "bottom-link active" : "bottom-link"}><Icon size={19}/><span>{label}</span></Link>)}</nav>
    <InstallBanner/>
    <InstallGuide/>
  </div>;
}
