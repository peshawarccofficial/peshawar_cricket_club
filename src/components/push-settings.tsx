"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, ShieldCheck } from "lucide-react";

const categories = [
  ["match_request", "New match requests"],
  ["fixture_accepted", "Accepted fixtures"],
  ["match_reminder", "Match reminders"],
  ["live_score", "Live score updates"]
] as const;
type Category = typeof categories[number][0];
type Preferences = Record<Category, boolean>;
const defaultPreferences: Preferences = { match_request: true, fixture_accepted: true, match_reminder: true, live_score: true };

function decodeVapidKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}

export function PushSettings() {
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const isSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(isSupported);
    if (!isSupported) {
      setBusy(false);
      return;
    }
    void (async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setEnabled(Boolean(subscription));
        const response = await fetch("/api/push/subscriptions");
        if (response.ok) {
          const data = await response.json() as { preferences?: Preferences; subscribed?: boolean };
          if (data.preferences) setPreferences({ ...defaultPreferences, ...data.preferences });
          if (typeof data.subscribed === "boolean") setEnabled(data.subscribed);
        } else if (response.status === 401) {
          setEnabled(false);
          setMessage("Sign in to enable push notifications.");
        } else {
          const data = await response.json().catch(() => ({})) as { error?: string };
          setMessage(data.error || "Could not load notification settings.");
        }
      } catch {
        setMessage("Could not load notification settings. Check your connection and try again.");
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  async function savePreferences(nextPreferences: Preferences) {
    const previousPreferences = preferences;
    setPreferences(nextPreferences);
    setMessage("");
    try {
      const response = await fetch("/api/push/subscriptions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: nextPreferences })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || (response.status === 401 ? "Sign in to save notification preferences." : "Could not save preferences."));
      }
      setMessage("Notification preferences saved.");
    } catch (error) {
      setPreferences(previousPreferences);
      setMessage(error instanceof Error ? error.message : "Could not save preferences.");
    }
  }

  async function enableNotifications() {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      setMessage("Push notifications are not configured on this site yet.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage(permission === "denied" ? "Notifications are blocked in browser settings." : "Notification permission was not granted.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(vapidKey) as BufferSource
      });
      const response = await fetch("/api/push/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription)
      });
      if (!response.ok) {
        await subscription.unsubscribe();
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || (response.status === 401 ? "Sign in before enabling notifications." : "Could not register this device."));
      }
      setEnabled(true);
      setMessage("Notifications are enabled on this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not enable notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disableNotifications() {
    setBusy(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/push/subscriptions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint })
        });
        if (!response.ok) throw new Error("Could not remove this device from notification delivery.");
        await subscription.unsubscribe();
      }
      setEnabled(false);
      setMessage("Notifications are off on this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not turn off notifications.");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return <p className="form-help">Push notifications are not supported by this browser.</p>;
  return <section className="push-settings">
    <div className="push-optin">
      {enabled ? <Bell size={20}/> : <BellOff size={20}/>}
      <div><b>{enabled ? "Notifications enabled" : "Stay in the match"}</b><p>Choose whether to receive updates. Your browser will ask permission only when you opt in.</p></div>
      <button type="button" className="button button-small" disabled={busy} onClick={() => void (enabled ? disableNotifications() : enableNotifications())}>{busy ? "Please wait" : enabled ? "Turn off" : "Enable alerts"}</button>
    </div>
    {enabled && <div className="push-preferences"><h3>Notification preferences</h3>{categories.map(([key, label]) => <label className="preference-row" key={key}><span>{label}</span><input type="checkbox" checked={preferences[key]} disabled={busy} onChange={event => void savePreferences({ ...preferences, [key]: event.target.checked })}/></label>)}</div>}
    {message && <p className="form-message" role="status">{message}</p>}
    <p className="form-help"><ShieldCheck size={15}/> Notifications require an account and configured server keys. Push delivery is subject to your browser and device settings.</p>
  </section>;
}
