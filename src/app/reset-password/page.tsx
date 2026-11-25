"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import styles from "@/app/login/login.module.css";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function savePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 6) {
      setMessage("Choose a password with at least 6 characters.");
      return;
    }
    if (password !== confirmation) {
      setMessage("The passwords do not match.");
      return;
    }
    const supabase = createClient();
    if (!supabase) {
      setMessage("Authentication is not configured.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("This password-reset link is invalid or expired. Request a new one.");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      setMessage("Your password has been updated.");
      router.replace("/settings");
      router.refresh();
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "Could not update your password.");
    } finally {
      setBusy(false);
    }
  }

  return <div className={`page-wrap narrow ${styles.authPage}`}>
    <div className="page-heading"><span className="eyebrow">ACCOUNT SECURITY</span><h1>Choose a new password</h1><p>Use at least six characters and keep your password private.</p></div>
    <section className={styles.formCard}>
      <form className={styles.fields} onSubmit={savePassword}>
        <label htmlFor="new-password">New password</label>
        <div className="input-wrap"><LockKeyhole size={17}/><input id="new-password" type="password" autoComplete="new-password" minLength={6} value={password} onChange={event => setPassword(event.target.value)} required/></div>
        <label htmlFor="confirm-password">Confirm new password</label>
        <div className="input-wrap"><LockKeyhole size={17}/><input id="confirm-password" type="password" autoComplete="new-password" minLength={6} value={confirmation} onChange={event => setConfirmation(event.target.value)} required/></div>
        <button className="button full" type="submit" disabled={busy || success}>{busy ? "Updating…" : "Update password"}</button>
      </form>
      {message && <p className={success ? "form-message" : "form-error"} role="status">{message}</p>}
      {!success && <Link className={styles.modeSwitch} href="/login">Back to sign in</Link>}
    </section>
  </div>;
}
