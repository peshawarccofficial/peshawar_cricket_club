"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./admin-login.module.css";

export function AdminLogin() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Login failed.");
      router.replace("/admin");
      router.refresh();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  return <main className={styles.page}>
    <section className={styles.card} aria-labelledby="admin-login-title">
      <div className={styles.brand}>
        <span className={styles.brandMark}>PCC</span>
        <div className={styles.brandText}><strong>Peshawar Cricket Club</strong><span>OWNER CONTROL CENTER</span></div>
      </div>
      <h1 id="admin-login-title">Admin sign in</h1>
      <p>This login opens the dashboard shell. Team approvals and private records require your Supabase Owner account and the private owner route; this password alone does not grant Owner access.</p>
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.field}>
          <label htmlFor="admin-username">Username</label>
          <input id="admin-username" value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required />
        </div>
        <div className={styles.field}>
          <label htmlFor="admin-password">Password</label>
          <input id="admin-password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required />
        </div>
        <button className={styles.submit} type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <p className={styles.error} role="alert">{error}</p>
      </form>
    </section>
  </main>;
}
