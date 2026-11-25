"use client";

import { useState, type FormEvent } from "react";
import { Megaphone, Plus } from "lucide-react";
import styles from "./adsense-settings.module.css";

export function PromotionManager() {
  const [kind, setKind] = useState<"banner" | "announcement">("announcement");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, title, description: body, body, imageUrl, destinationUrl, visible })
      });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "Could not publish promotion.");
      setTitle("");
      setBody("");
      setImageUrl("");
      setDestinationUrl("");
      setMessage(`${kind === "banner" ? "Banner" : "Announcement"} saved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not publish promotion.");
    } finally {
      setBusy(false);
    }
  }

  return <article className={styles.panel}>
    <div className={styles.header}><div><h2><Megaphone size={16}/> Homepage promotions</h2><p>Create a visible banner or club announcement.</p></div></div>
    <form className={styles.placements} onSubmit={event => void submit(event)} style={{ gridTemplateColumns: "1fr" }}>
      <div className={styles.placementHeading}><label className={styles.field}>Type
        <select value={kind} onChange={event => setKind(event.target.value as "banner" | "announcement")} style={{ minHeight: 34, borderRadius: 7, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--text)", padding: "7px 8px" }}>
          <option value="announcement">Announcement</option><option value="banner">Banner</option>
        </select>
      </label><label className={styles.toggle}><input type="checkbox" checked={visible} onChange={event => setVisible(event.target.checked)}/><span>Visible</span></label></div>
      <label className={styles.field}>Title<input required maxLength={kind === "banner" ? 120 : 160} value={title} onChange={event => setTitle(event.target.value)}/></label>
      <label className={styles.field}>{kind === "banner" ? "Description" : "Message"}<textarea required={kind === "announcement"} maxLength={kind === "banner" ? 500 : 2000} value={body} onChange={event => setBody(event.target.value)} style={{ minHeight: 70, resize: "vertical", borderRadius: 7, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--text)", padding: "7px 8px" }}/></label>
      {kind === "banner" && <label className={styles.field}>Image URL<input type="url" value={imageUrl} onChange={event => setImageUrl(event.target.value)} placeholder="/tournament-banner.jpg"/></label>}
      <label className={styles.field}>Destination URL<input value={destinationUrl} onChange={event => setDestinationUrl(event.target.value)} placeholder="/tournaments"/></label>
      <button type="submit" className={styles.save} disabled={busy}>{busy ? "Saving…" : <><Plus size={14}/>Publish promotion</>}</button>
    </form>
    {message && <p className={styles.status} role="status">{message}</p>}
  </article>;
}
