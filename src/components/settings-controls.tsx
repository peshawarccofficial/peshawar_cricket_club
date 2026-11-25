"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useTheme } from "next-themes";
import { LogOut, Monitor, Moon, Save, Sun, UserRound } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { preparePendingProfilePhoto, uploadPendingProfilePhoto, type ImageCrop } from "@/lib/profile-avatar";
import { CropImageInput } from "@/components/crop-image-input";
import styles from "./settings-controls.module.css";

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  return <section className="settings-card">
    <div className="settings-card-heading"><Monitor size={20}/><div><h2>Appearance</h2><p>Choose how the club app looks on this device.</p></div></div>
    <div className="appearance-options" role="group" aria-label="Color theme">
      <button className={theme === "light" ? "appearance-option selected" : "appearance-option"} onClick={() => setTheme("light")} type="button" aria-pressed={theme === "light"}><Sun size={16}/>Light</button>
      <button className={theme === "dark" ? "appearance-option selected" : "appearance-option"} onClick={() => setTheme("dark")} type="button" aria-pressed={theme === "dark"}><Moon size={16}/>Dark</button>
      <button className={theme === "system" ? "appearance-option selected" : "appearance-option"} onClick={() => setTheme("system")} type="button" aria-pressed={theme === "system"}><Monitor size={16}/>System</button>
    </div>
  </section>;
}

export function AccountSettings() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"error" | "success">("error");
  const [profile, setProfile] = useState<{ display_name: string | null; avatar_url: string | null; phone: string | null } | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoCrop, setPhotoCrop] = useState<ImageCrop>({ zoom: 1, x: 0.5, y: 0.5 });

  useEffect(() => {
    if (!photo) {
      setPhotoPreview("");
      return;
    }
    const preview = URL.createObjectURL(photo);
    setPhotoPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [photo]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setLoading(false);
      return;
    }
    void (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error && error.name !== "AuthSessionMissingError") setMessage("Could not load account information.");
      setUser(data.user);
      if (data.user) {
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("display_name,avatar_url,phone")
          .eq("id", data.user.id)
          .maybeSingle();
        if (profileError) setMessage("Could not load your profile details.");
        setProfile(profileData);
        const metadataName = data.user.user_metadata?.display_name ?? data.user.user_metadata?.full_name ?? data.user.user_metadata?.name;
        setDisplayName(profileData?.display_name || (typeof metadataName === "string" ? metadataName : ""));
      }
      setLoading(false);
    })();
  }, []);

  async function saveProfile() {
    const supabase = createClient();
    const trimmedName = displayName.trim();
    if (!supabase || !user) {
      setMessage("Sign in to update your profile.");
      return;
    }
    if (!trimmedName || trimmedName.length > 80) {
      setMessage("Enter a name between 1 and 80 characters.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const { error: profileError } = await supabase.from("profiles").update({ display_name: trimmedName }).eq("id", user.id);
      if (profileError) throw profileError;

      let avatarUrl = profile?.avatar_url ?? (typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null);
      if (photo) {
        if (!user.email) throw new Error("An email address is required to save a profile photo.");
        await preparePendingProfilePhoto(photo, user.email, photoCrop);
        avatarUrl = await uploadPendingProfilePhoto(supabase, user);
      }

      const { data, error } = await supabase.auth.updateUser({
        data: { display_name: trimmedName, ...(avatarUrl ? { avatar_url: avatarUrl } : {}) }
      });
      if (error) throw error;
      if (data.user) setUser(data.user);
      setProfile(current => current ? { ...current, display_name: trimmedName, avatar_url: avatarUrl } : current);
      setPhoto(null);
      setMessageType("success");
      setMessage("Profile updated.");
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "Could not update your profile.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    const supabase = createClient();
    if (!supabase) {
      setMessageType("error");
      setMessage("Authentication is not configured.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signOut();
    setBusy(false);
    if (error) {
      setMessageType("error");
      setMessage("Could not sign out. Please try again.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  const metadataAvatar = typeof user?.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null;
  const profileAvatar = photoPreview || profile?.avatar_url || metadataAvatar;

  return <section className="settings-card">
    <div className="settings-card-heading"><UserRound size={20}/><div><h2>Account</h2><p>Manage your verified sign-in details.</p></div></div>
    {loading ? <p className="muted">Loading account…</p> : user ? <>
      <div className={styles.profileFields}>
        <div className={styles.profilePhotoRow}>
          {profileAvatar ? <Image src={profileAvatar} alt="Your profile picture" width={64} height={64} unoptimized className={styles.profileAvatar}/> : <span className={styles.profileAvatarFallback}><UserRound size={24}/></span>}
          <div><strong>{displayName || "Your profile"}</strong><span>Profile picture</span></div>
        </div>
        <label htmlFor="account-name">Name</label>
        <div className="input-wrap"><UserRound size={17}/><input id="account-name" type="text" autoComplete="name" maxLength={80} value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="Your name"/></div>
        <CropImageInput id="account-photo" label="Profile picture" shape="circle" file={photo} crop={photoCrop} onFileChange={setPhoto} onCropChange={setPhotoCrop}/>
        <div className={styles.accountDetails}>
          <p className="account-detail"><span>Email</span><strong>{user.email || "Not available"}</strong></p>
          {user.phone && <p className="account-detail"><span>Mobile number</span><strong>{profile?.phone || user.phone}</strong></p>}
        </div>
        <div className={styles.accountActions}>
          <button className="button button-small" type="button" onClick={() => void saveProfile()} disabled={busy}>{busy ? "Saving…" : <><Save size={15}/>Save profile</>}</button>
          <button className={styles.signOutButton} type="button" onClick={() => void signOut()} disabled={busy}><LogOut size={15}/>Sign out</button>
        </div>
      </div>
    </> : <><p className="muted">You are not signed in.</p><Link className="button button-small" href="/login">Sign in</Link></>}
    {message && <p className={messageType === "success" ? "form-message" : "form-error"} role="status">{message}</p>}
  </section>;
}
