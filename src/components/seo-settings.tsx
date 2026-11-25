"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import styles from "./adsense-settings.module.css";

type SeoSettings = { title:string; description:string; verification:string; canonicalUrl:string };

export function SeoSettings() {
  const [settings, setSettings] = useState<SeoSettings>({ title:"", description:"", verification:"", canonicalUrl:"" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/admin/seo")
      .then(async response => {
        const result: unknown = await response.json();
        if (!response.ok) throw new Error(result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "Could not load SEO settings.");
        if (result && typeof result === "object" && "settings" in result && result.settings && typeof result.settings === "object") {
          const value = result.settings as Partial<SeoSettings>;
          if (active) setSettings({
            title: typeof value.title === "string" ? value.title : "",
            description: typeof value.description === "string" ? value.description : "",
            verification: typeof value.verification === "string" ? value.verification : "",
            canonicalUrl: typeof value.canonicalUrl === "string" ? value.canonicalUrl : ""
          });
        }
      })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : "Could not load SEO settings."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active=false; };
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/seo", { method:"PUT", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(settings) });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "Could not save SEO settings.");
      setMessage("SEO settings saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save SEO settings.");
    } finally {
      setSaving(false);
    }
  }

  function update(field:keyof SeoSettings, value:string) {
    setSettings(current => ({ ...current, [field]:value }));
  }

  return <article className={styles.panel}>
    <div className={styles.header}><div><h2><Search size={16}/> SEO & Search Console</h2><p>Configure optional search metadata. Environment variables still control the deployed verification tag and canonical base.</p></div></div>
    {loading ? <p className={styles.status}>Loading SEO settings…</p> : <form className={styles.placements} onSubmit={event => void save(event)} style={{ gridTemplateColumns:"1fr" }}>
      <label className={styles.field}>SEO title<input maxLength={80} value={settings.title} onChange={event=>update("title",event.target.value)} placeholder="Peshawar Cricket Club"/></label>
      <label className={styles.field}>Meta description<textarea maxLength={160} value={settings.description} onChange={event=>update("description",event.target.value)} style={{ minHeight:70,resize:"vertical",borderRadius:7,border:"1px solid var(--line)",background:"var(--surface)",color:"var(--text)",padding:"7px 8px" }}/></label>
      <label className={styles.field}>Search Console verification token<input maxLength={200} value={settings.verification} onChange={event=>update("verification",event.target.value)} placeholder="Google verification token"/></label>
      <label className={styles.field}>Canonical website URL<input type="url" maxLength={500} value={settings.canonicalUrl} onChange={event=>update("canonicalUrl",event.target.value)} placeholder="https://peshawarcricketclub.com"/></label>
      <button type="submit" className={styles.save} disabled={saving}>{saving ? "Saving…" : "Save SEO settings"}</button>
    </form>}
    {message && <p className={styles.status} role="status">{message}</p>}
  </article>;
}
