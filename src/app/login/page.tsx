"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { discardPendingProfilePhoto, preparePendingProfilePhoto, uploadPendingProfilePhoto, type ImageCrop } from "@/lib/profile-avatar";
import { CropImageInput } from "@/components/crop-image-input";
import styles from "./login.module.css";

type AuthMode = "sign-in" | "sign-up";
type OAuthProvider = "google" | "facebook";
const OAUTH_ENABLED = {
  google: process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED === "true",
  facebook: process.env.NEXT_PUBLIC_FACEBOOK_OAUTH_ENABLED === "true"
};

function GoogleMark() {
  return <svg className={styles.providerLogo} viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.75 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
  </svg>;
}

function FacebookMark() {
  return <svg className={styles.providerLogo} viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#0866FF" d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073c0 6.019 4.388 11.023 10.125 11.878v-8.398H7.078v-3.48h3.047V9.42c0-3.017 1.792-4.687 4.533-4.687 1.312 0 2.686.236 2.686.236v2.974h-1.513c-1.491 0-1.956.931-1.956 1.887v2.263h3.328l-.532 3.48h-2.796v8.398C19.612 23.096 24 18.092 24 12.073z"/>
    <path fill="#fff" d="M16.671 15.773l.532-3.48h-3.328V10.03c0-.953.465-1.884 1.956-1.884h1.513V5.172s-1.374-.235-2.686-.235c-2.741 0-4.533 1.67-4.533 4.683v2.673H7.078v3.48h3.047v8.398a12.18 12.18 0 003.75 0v-8.398h2.796z"/>
  </svg>;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [resetMode, setResetMode] = useState(false);
  const [playerIdLogin, setPlayerIdLogin] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [password, setPassword] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoCrop, setPhotoCrop] = useState<ImageCrop>({ zoom: 1, x: 0.5, y: 0.5 });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"error" | "success">("error");
  const unavailableProviders = (["google", "facebook"] as const)
    .filter(provider => !OAUTH_ENABLED[provider])
    .map(provider => provider === "google" ? "Google" : "Facebook");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("error")) {
      showMessage("Sign-in could not be completed. Check your Supabase provider and redirect URL settings.");
    }
  }, []);

  function showMessage(text: string, type: "error" | "success" = "error") {
    setMessage(text);
    setMessageType(type);
  }

  async function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = createClient();
    if (!supabase) {
      showMessage("Authentication is unavailable. Configure the Supabase URL and public anon key.");
      return;
    }

    if (mode === "sign-up" && password.length < 6) {
      showMessage("Choose a password with at least 6 characters.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      if (mode === "sign-up") {
        const normalizedEmail = email.trim().toLowerCase();
        if (photo) await preparePendingProfilePhoto(photo, normalizedEmail, photoCrop);
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: { display_name: name.trim() },
            emailRedirectTo: `${window.location.origin}/auth/callback`
          }
        });
        if (error) {
          discardPendingProfilePhoto();
          throw error;
        }

        if (data.session && data.user) {
          await uploadPendingProfilePhoto(supabase, data.user);
          router.replace("/settings");
          router.refresh();
          return;
        }
        showMessage("Account created. Check your email to confirm it, then sign in. If the photo does not carry over, add it from Account settings.", "success");
      } else {
        if (playerIdLogin) {
          const response = await fetch("/api/auth/player-login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ playerId, password })
          });
          const result: unknown = await response.json();
          const errorMessage = result && typeof result === "object" && "error" in result && typeof result.error === "string"
            ? result.error
            : "Could not sign in with that Player ID and password.";
          if (!response.ok) throw new Error(errorMessage);
          router.replace("/player");
        } else {
          const { error } = await supabase.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password
          });
          if (error) throw error;
          router.replace("/settings");
        }
        router.refresh();
      }
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Could not complete sign-in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signInWith(provider: OAuthProvider) {
    if (!OAUTH_ENABLED[provider]) {
      const providerName = provider === "google" ? "Google" : "Facebook";
      showMessage(`${providerName} sign-in is not configured in Supabase yet. Use email and password for now.`);
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      showMessage("Authentication is unavailable. Configure the Supabase URL and public anon key.");
      return;
    }
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    });
    if (error) {
      setBusy(false);
      showMessage(error.message);
    }
  }

  async function requestPasswordReset() {
    const supabase = createClient();
    if (!supabase) {
      showMessage("Authentication is unavailable. Configure Supabase first.");
      return;
    }
    if (!email.trim()) {
      showMessage("Enter the email address for your account.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/auth/callback?next=%2Freset-password`
      });
      if (error) throw error;
      showMessage("If an account exists for that address, a password-reset link will be sent.", "success");
    } catch (resetError) {
      showMessage(resetError instanceof Error ? resetError.message : "Could not request a password reset.");
    } finally {
      setBusy(false);
    }
  }

  return <div className={`page-wrap narrow ${styles.authPage}`}>
    <div className="page-heading">
      <Image className={styles.logo} src="/icon-192.png" alt="Peshawar Cricket Club logo" width={64} height={64}/>
      <span className="eyebrow">CAPTAIN & PLAYER ACCESS</span>
      <h1>{resetMode ? "Reset your password" : mode === "sign-up" ? "Join the club" : "Welcome back"}</h1>
      <p>{resetMode ? "Enter your account email and we will send a secure reset link if it matches an account." : mode === "sign-up" ? "Create your account with an email and password, or continue with Google or Facebook." : "Sign in with your email, or use your Player ID after your account has been linked by your captain."}</p>
    </div>

    <div className={styles.formCard}>
      <p className={styles.providerSetupNote}>Have a Player ID and one-time code from your captain? <Link href="/player-access">Link it to your account</Link>.</p>
      {!resetMode && unavailableProviders.length > 0 && <p className={styles.providerSetupNote}>{unavailableProviders.join(" and ")} sign-in still needs provider setup in Supabase. Email and password sign-in is available.</p>}
      {!resetMode && <div className={styles.socialButtons}>
        <button type="button" className={styles.socialButton} onClick={() => void signInWith("google")} disabled={busy}>
          <GoogleMark/>Continue with Google
        </button>
        <button type="button" className={styles.socialButton} onClick={() => void signInWith("facebook")} disabled={busy}>
          <FacebookMark/>Continue with Facebook
        </button>
      </div>}

      {!resetMode && <div className={styles.divider}><span>or use email</span></div>}

      <form className={styles.fields} onSubmit={submitPassword}>
        {mode === "sign-up" && <>
          <label htmlFor="display-name">Your name</label>
          <div className="input-wrap"><UserRound size={17}/><input id="display-name" type="text" autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder="Full name" maxLength={80} required/></div>
          <CropImageInput
            id="profile-photo"
            label="Profile picture (optional)"
            shape="circle"
            file={photo}
            crop={photoCrop}
            onFileChange={setPhoto}
            onCropChange={setPhotoCrop}
          />
        </>}

        <label htmlFor={mode === "sign-in" && playerIdLogin && !resetMode ? "player-id" : "email"}>{mode === "sign-in" && playerIdLogin && !resetMode ? "Player ID" : "Email address"}</label>
        <div className="input-wrap">{mode === "sign-in" && playerIdLogin && !resetMode ? <ShieldCheck size={17}/> : <Mail size={17}/>}
          {mode === "sign-in" && playerIdLogin && !resetMode
            ? <input id="player-id" type="text" inputMode="numeric" autoComplete="username" value={playerId} onChange={event => setPlayerId(event.target.value)} placeholder="0001" maxLength={20} pattern="[0-9]+" required/>
            : <input id="email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" required/>}
        </div>
        {mode === "sign-in" && playerIdLogin && !resetMode && <p className={styles.passwordHint}>Player ID sign-in is available after your captain links your account. Password resets use the email address linked to the account.</p>}
        {!resetMode && <>
          <label htmlFor="password">Password</label>
          <div className="input-wrap"><LockKeyhole size={17}/><input id="password" type="password" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === "sign-up" ? "At least 6 characters" : "Your password"} minLength={mode === "sign-up" ? 6 : undefined} required/></div>
          {mode === "sign-up" && <p className={styles.passwordHint}>Use at least 6 characters.</p>}
        </>}
        <button className="button full" type={resetMode ? "button" : "submit"} onClick={resetMode ? () => void requestPasswordReset() : undefined} disabled={busy}>
          {busy ? "Please wait…" : resetMode ? "Send reset link" : mode === "sign-up" ? "Create account" : "Sign in"}
        </button>
      </form>

      {message && <p className={messageType === "success" ? "form-message" : "form-error"} role="status">{message}</p>}
      {mode === "sign-in" && !resetMode && <button type="button" className={styles.modeSwitch} onClick={() => { setPlayerIdLogin(!playerIdLogin); setMessage(""); }}>
        {playerIdLogin ? "Use email instead" : "Sign in with Player ID"}
      </button>}
      {mode === "sign-in" && <button type="button" className={styles.modeSwitch} onClick={() => { setResetMode(!resetMode); setMessage(""); }}>
        {resetMode ? "Back to sign in" : "Forgot your password?"}
      </button>}
      {!resetMode && <button type="button" className={styles.modeSwitch} onClick={() => { setMode(mode === "sign-up" ? "sign-in" : "sign-up"); setPlayerIdLogin(false); setMessage(""); }}>
        {mode === "sign-up" ? "Already have an account? Sign in" : "New to the club? Create an account"}
      </button>}
      <p className={styles.securityNote}><ShieldCheck size={15}/> Your password is handled securely by Supabase Authentication.</p>
    </div>
  </div>;
}
