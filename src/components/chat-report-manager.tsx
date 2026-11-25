"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./chat-report-manager.module.css";

type Report = {
  id: string;
  message_id: string;
  reporter_name: string;
  reason: string;
  status: "open" | "resolved" | "dismissed";
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  message_body: string;
  message_sender: string;
  conversation_id: string | null;
  message_created_at: string | null;
};

function responseError(value: unknown, fallback: string) {
  return value && typeof value === "object" && "error" in value && typeof value.error === "string"
    ? value.error
    : fallback;
}

export function ChatReportManager() {
  const [reports, setReports] = useState<Report[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadReports = useCallback(async () => {
    setBusy("refresh");
    setError("");
    try {
      const response = await fetch("/api/admin/chat-reports");
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(responseError(result, "Could not load chat reports."));
      if (result && typeof result === "object" && "reports" in result && Array.isArray(result.reports)) {
        setReports(result.reports as Report[]);
      } else {
        throw new Error("The chat reports response was invalid.");
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load chat reports.");
    } finally {
      setBusy("");
    }
  }, []);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  async function review(report: Report, status: "resolved" | "dismissed") {
    setBusy(report.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/chat-reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: report.id, status, reviewNote: notes[report.id] || "" })
      });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(responseError(result, "Could not review this chat report."));
      setReports(current => current.map(item => item.id === report.id
        ? { ...item, status, review_note: notes[report.id]?.trim() || null, reviewed_at: new Date().toISOString() }
        : item));
      setNotice(status === "resolved" ? "Report marked resolved." : "Report dismissed.");
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Could not review this chat report.");
    } finally {
      setBusy("");
    }
  }

  return <section className={styles.panel}>
    <header className={styles.header}>
      <div><h2>Reported chat messages</h2><p>Owner-only moderation queue · {reports.filter(report => report.status === "open").length} open</p></div>
      <button className={styles.refresh} type="button" disabled={Boolean(busy)} onClick={() => void loadReports()}>{busy === "refresh" ? "Refreshing…" : "Refresh"}</button>
    </header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {reports.length ? <div className={styles.list}>{reports.map(report => <article className={styles.report} key={report.id}>
      <div className={styles.meta}>
        <strong>{report.status === "open" ? "Open report" : report.status}</strong>
        <time dateTime={report.created_at}>{new Date(report.created_at).toLocaleString()}</time>
      </div>
      <p className={styles.context}>Reported by {report.reporter_name} · Message from {report.message_sender}{report.message_created_at ? ` · ${new Date(report.message_created_at).toLocaleString()}` : ""}</p>
      {report.conversation_id && <p className={styles.context}>Conversation {report.conversation_id.slice(0, 8)}</p>}
      <blockquote>{report.message_body}</blockquote>
      <p><strong>Report reason:</strong> {report.reason}</p>
      {report.status === "open" ? <>
        <label className={styles.noteLabel} htmlFor={`review-note-${report.id}`}>Private review note (optional)</label>
        <textarea id={`review-note-${report.id}`} maxLength={1000} value={notes[report.id] || ""} onChange={event => setNotes(current => ({ ...current, [report.id]: event.target.value }))}/>
        <div className={styles.actions}>
          <button type="button" disabled={Boolean(busy)} onClick={() => void review(report, "resolved")}>{busy === report.id ? "Saving…" : "Resolve"}</button>
          <button type="button" className={styles.dismiss} disabled={Boolean(busy)} onClick={() => void review(report, "dismissed")}>Dismiss</button>
        </div>
      </> : <p className={styles.reviewNote}>Review {report.status}{report.reviewed_by ? ` by ${report.reviewed_by}` : ""}{report.review_note ? `: ${report.review_note}` : "."}</p>}
    </article>)}</div> : !error ? <p className={styles.empty}>No chat messages have been reported.</p> : null}
  </section>;
}
