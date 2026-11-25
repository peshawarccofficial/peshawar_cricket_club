"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Check, Megaphone } from "lucide-react";
import styles from "./adsense-settings.module.css";

const placements = [
  { id: "homepage_content", title: "Homepage content", description: "A responsive placement between the homepage sections." },
  { id: "public_content", title: "Public tournament directory", description: "A responsive placement on the public tournaments page." }
] as const;

type Placement = typeof placements[number]["id"];
type AdSetting = { placement: Placement; enabled: boolean; publisherId: string; slotId: string };
type SettingsState = Record<Placement, AdSetting>;

const emptySettings: SettingsState = {
  homepage_content: { placement: "homepage_content", enabled: false, publisherId: "", slotId: "" },
  public_content: { placement: "public_content", enabled: false, publisherId: "", slotId: "" }
};

export function AdsenseSettings() {
  const [settings, setSettings] = useState(emptySettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Placement | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/admin/advertisements")
      .then(async response => {
        const result: unknown = await response.json();
        if (!response.ok || !result || typeof result !== "object" || !("settings" in result) || !Array.isArray(result.settings)) {
          throw new Error(result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "Could not load ad settings.");
        }
        const next = { ...emptySettings };
        for (const setting of result.settings) {
          if (!setting || typeof setting !== "object" || !("placement" in setting) || !("enabled" in setting) ||
              !("publisherId" in setting) || !("slotId" in setting) ||
              typeof setting.placement !== "string" || !(setting.placement in next) ||
              typeof setting.enabled !== "boolean" || typeof setting.publisherId !== "string" || typeof setting.slotId !== "string") continue;
          next[setting.placement as Placement] = setting as AdSetting;
        }
        if (active) setSettings(next);
      })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : "Could not load ad settings."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function update(placement: Placement, patch: Partial<AdSetting>) {
    setSettings(current => ({ ...current, [placement]: { ...current[placement], ...patch } }));
  }

  async function save(event: FormEvent<HTMLFormElement>, setting: AdSetting) {
    event.preventDefault();
    setSaving(setting.placement);
    setMessage("");
    try {
      const response = await fetch("/api/admin/advertisements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(setting)
      });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "Could not save ad settings.");
      setMessage(`${placements.find(item => item.id === setting.placement)?.title} settings saved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save ad settings.");
    } finally {
      setSaving(null);
    }
  }

  return <article className={styles.panel}>
    <div className={styles.header}><div><h2><Megaphone size={16}/> Google AdSense</h2><p>Ads stay off until you provide valid IDs and explicitly enable a placement.</p></div></div>
    {loading ? <p className={styles.status} role="status">Loading ad settings…</p> : <div className={styles.placements}>{placements.map(placement => {
      const setting = settings[placement.id];
      return <form className={styles.placement} key={placement.id} onSubmit={event => void save(event, setting)}>
        <div className={styles.placementHeading}><div><h3>{placement.title}</h3><p>{placement.description}</p></div><label className={styles.toggle}><input type="checkbox" checked={setting.enabled} onChange={event => update(placement.id, { enabled: event.target.checked })}/><span>Enable</span></label></div>
        <label className={styles.field}>Publisher ID
          <input value={setting.publisherId} onChange={event => update(placement.id, { publisherId: event.target.value.trim() })} placeholder="ca-pub-0000000000000000" autoComplete="off" spellCheck={false}/>
        </label>
        <label className={styles.field}>Ad slot ID
          <input value={setting.slotId} onChange={event => update(placement.id, { slotId: event.target.value.trim() })} placeholder="Numeric slot ID" inputMode="numeric" autoComplete="off"/>
        </label>
        <button type="submit" className={styles.save} disabled={loading || saving !== null}>{saving === placement.id ? "Saving…" : <><Check size={14}/>Save placement</>}</button>
      </form>;
    })}</div>}
    {message && <p className={styles.status} role="status">{message}</p>}
    <p className={styles.note}>Only public pages load the official Google script, and only for enabled placements. Never enter credentials here; use IDs from your approved AdSense account.</p>
  </article>;
}
