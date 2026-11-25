"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import styles from "./player-account-claim.module.css";

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

export function PlayerAccountClaim() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [checking, setChecking] = useState(true);
  const [playerId, setPlayerId] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    if (!supabase) {
      setError("Supabase authentication is not configured.");
      setChecking(false);
      return;
    }
    void supabase.auth.getUser().then(({ data, error: authError }) => {
      if (!active) return;
      if (authError) setError("Could not verify your account. Sign in again and retry.");
      setSignedIn(Boolean(data.user));
      setChecking(false);
    }).catch(() => {
      if (!active) return;
      setError("Could not verify your account. Check your connection and retry.");
      setChecking(false);
    });
    return () => { active = false; };
  }, []);

  async function claimAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedPlayerId = playerId.trim();
    const normalizedCode = inviteCode.trim().toLowerCase();
    if (!/^\d{1,20}$/.test(normalizedPlayerId) || !/^[0-9a-f]{64}$/.test(normalizedCode)) {
      setError("Enter the numeric Player ID and the 64-character access code from your captain.");
      return;
    }
    const supabase = createClient();
    if (!supabase || !globalThis.crypto?.subtle) {
      setError("Secure account claiming is unavailable in this browser.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Sign in before claiming your player account.");
      const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizedCode));
      const tokenHash = bytesToHex(new Uint8Array(digest));
      const { error: claimError } = await supabase.rpc("claim_player_account", {
        p_public_player_id: normalizedPlayerId,
        p_token_hash: tokenHash
      });
      if (claimError) throw new Error("That Player ID and access code do not match an unused, unexpired invite.");
      setNotice("Player account linked. You can now sign in with your Player ID and password.");
      router.replace("/player");
      router.refresh();
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : "Could not link this player account.");
    } finally {
      setBusy(false);
    }
  }

  return <section className={styles.card}>
    <span className={styles.icon}><ShieldCheck size={22}/></span>
    <h2>Link your player account</h2>
    <p>Use the Player ID and one-time code your captain shared. First sign in or create your own account with your email and personal password.</p>
    {checking ? <p className={styles.hint} role="status">Checking your sign-in…</p>
      : !signedIn ? <div className={styles.signInPrompt}>
        <p>You need to be signed in before redeeming an invite. Keep your Player ID and access code; enter them here after signing in.</p>
        <Link className="button button-small" href="/login">Sign in or create account</Link>
      </div>
        : <form className={styles.form} onSubmit={event => void claimAccount(event)}>
          <label htmlFor="claim-player-id">Player ID</label>
          <input id="claim-player-id" type="text" inputMode="numeric" autoComplete="off" value={playerId} onChange={event => setPlayerId(event.target.value)} placeholder="0001" maxLength={20} pattern="[0-9]+" required/>
          <label htmlFor="claim-invite-code">One-time access code</label>
          <input id="claim-invite-code" type="text" autoComplete="one-time-code" value={inviteCode} onChange={event => setInviteCode(event.target.value)} placeholder="Paste the 64-character code" maxLength={64} minLength={64} spellCheck={false} required/>
          <button type="submit" className="button full" disabled={busy}>{busy ? "Linking account…" : "Link player account"}</button>
        </form>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </section>;
}
