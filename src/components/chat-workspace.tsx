"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import styles from "./chat-workspace.module.css";

type Conversation = { id: string; title: string; latest_message: string | null; latest_message_at: string | null; team_id: string | null; fixture_id: string | null };
type Message = { id: string; conversation_id: string; sender_id: string; sender_name: string; body: string; created_at: string };
type TeamOption = { id: string; name: string };
type FixtureOption = { id: string; home_team_id: string; away_team_id: string; home_team: string; away_team: string; match_date: string };

export function ChatWorkspace({
  initialConversations,
  teams,
  fixtures,
  userId,
  setupError
}: {
  initialConversations: Conversation[];
  teams: TeamOption[];
  fixtures: FixtureOption[];
  userId: string;
  setupError?: string;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState(initialConversations[0]?.id ?? "");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState("");
  const [reportingMessageId, setReportingMessageId] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [reportedMessageIds, setReportedMessageIds] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const active = conversations.find(conversation => conversation.id === activeId) ?? null;

  const loadMessages = useCallback(async (conversationId: string) => {
    const supabase = createClient();
    if (!supabase) return;
    const { data, error: loadError } = await supabase.from("public_chat_messages")
      .select("id,conversation_id,sender_id,sender_name,body,created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (loadError) {
      setError("Could not load messages. Apply the PCC platform migration and check chat permissions.");
      return;
    }
    setMessages((data ?? []) as Message[]);
    setError("");
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }));
  }, []);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    void loadMessages(activeId);
    const supabase = createClient();
    if (!supabase) return;
    const channel = supabase.channel(`pcc-chat-${activeId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${activeId}`
      }, () => { void loadMessages(activeId); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activeId, loadMessages]);

  async function createConversation(kind: "team" | "match", id: string) {
    const supabase = createClient();
    if (!supabase) {
      setError("Chat is not configured.");
      return;
    }
    setBusy(id);
    setError("");
    try {
      const { data, error: createError } = kind === "team"
        ? await supabase.rpc("start_team_chat", { p_team_id: id })
        : await supabase.rpc("start_match_chat", { p_fixture_id: id });
      if (createError) throw createError;
      const { data: rows, error: listError } = await supabase.from("public_chat_conversations").select("*").order("latest_message_at", { ascending: false });
      if (listError) throw listError;
      const next = (rows ?? []) as Conversation[];
      setConversations(next);
      setActiveId(typeof data === "string" ? data : next[0]?.id ?? "");
      setNotice("Private conversation is ready.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not start this conversation.");
    } finally {
      setBusy("");
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active || !draft.trim()) return;
    const supabase = createClient();
    if (!supabase) return;
    setBusy("message");
    setError("");
    const { error: sendError } = await supabase.rpc("send_chat_message", {
      p_conversation_id: active.id,
      p_body: draft.trim()
    });
    if (sendError) setError(sendError.message);
    else {
      setDraft("");
      await loadMessages(active.id);
    }
    setBusy("");
  }

  async function reportMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reportingMessageId || !reportReason.trim()) return;
    const supabase = createClient();
    if (!supabase) {
      setError("Chat is not configured.");
      return;
    }
    setBusy("report");
    setError("");
    const { error: reportError } = await supabase.rpc("report_chat_message", {
      p_message_id: reportingMessageId,
      p_reason: reportReason.trim()
    });
    if (reportError) {
      setError(reportError.message);
    } else {
      setReportedMessageIds(current => new Set(current).add(reportingMessageId));
      setReportingMessageId("");
      setReportReason("");
      setNotice("Your report was sent to the Club Owner for review.");
    }
    setBusy("");
  }

  if (setupError) return <div className={styles.error} role="alert">{setupError}</div>;

  return <div className={styles.workspace}>
    <aside className={styles.sidebar} aria-label="Conversations and chat actions">
      <div className={styles.sidebarHeading}><MessageCircle size={18}/><h2>Chats</h2></div>
      {conversations.map(conversation => <button className={activeId === conversation.id ? styles.activeConversation : styles.conversation} key={conversation.id} type="button" onClick={() => { setActiveId(conversation.id); setNotice(""); }}>
        <strong>{conversation.title}</strong><span>{conversation.latest_message || "No messages yet"}</span>
      </button>)}
      {!conversations.length && <p className={styles.hint}>Start a private chat with one of your teams or confirmed opponents.</p>}
      {teams.length > 0 && <div className={styles.actions}>
        <h3>Your team chats</h3>
        {teams.map(team => <button type="button" key={team.id} disabled={Boolean(busy)} onClick={() => void createConversation("team", team.id)}><Users size={15}/>{busy === team.id ? "Opening…" : team.name}</button>)}
      </div>}
      {fixtures.length > 0 && <div className={styles.actions}>
        <h3>Match chats</h3>
        {fixtures.map(fixture => <button type="button" key={fixture.id} disabled={Boolean(busy)} onClick={() => void createConversation("match", fixture.id)}><MessageCircle size={15}/>{busy === fixture.id ? "Opening…" : `${fixture.home_team} vs ${fixture.away_team}`}</button>)}
      </div>}
    </aside>

    <section className={styles.chat} aria-label={active ? `${active.title} conversation` : "Conversation"}>
      {active ? <>
        <header className={styles.chatHeader}><div><span className="eyebrow">PRIVATE CONVERSATION</span><h2>{active.title}</h2></div></header>
        {notice && <p className={styles.notice} role="status">{notice}</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.messages} role="log" aria-live="polite" aria-label="Chat messages">
          {messages.length ? messages.map(message => <article className={message.sender_id === userId ? styles.ownMessage : styles.otherMessage} key={message.id}>
            {message.sender_id !== userId && <strong>{message.sender_name}</strong>}
            <p>{message.body}</p>
            <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time>
            {message.sender_id !== userId && (reportedMessageIds.has(message.id)
              ? <span className={styles.reported}>Reported</span>
              : reportingMessageId === message.id
                ? <form className={styles.reportForm} onSubmit={reportMessage}>
                  <label htmlFor={`report-reason-${message.id}`}>Why are you reporting this message?</label>
                  <textarea id={`report-reason-${message.id}`} value={reportReason} onChange={event => setReportReason(event.target.value)} minLength={1} maxLength={1000} rows={2} required/>
                  <span><button type="submit" disabled={busy === "report" || !reportReason.trim()}>{busy === "report" ? "Sending…" : "Send report"}</button><button type="button" onClick={() => { setReportingMessageId(""); setReportReason(""); }}>Cancel</button></span>
                </form>
                : <button type="button" className={styles.reportButton} onClick={() => { setReportingMessageId(message.id); setReportReason(""); }} aria-label={`Report message from ${message.sender_name}`}>Report</button>)}
          </article>) : <p className={styles.emptyMessages}>No messages yet. Send the first message.</p>}
          <div ref={endRef}/>
        </div>
        <form className={styles.composer} onSubmit={sendMessage}>
          <label className="sr-only" htmlFor="chat-message">Write a message</label>
          <textarea id="chat-message" value={draft} onChange={event => setDraft(event.target.value)} maxLength={4000} rows={2} placeholder="Write a private message…" required/>
          <button type="submit" className="button" disabled={busy === "message" || !draft.trim()} aria-label="Send message"><Send size={17}/></button>
        </form>
      </> : <div className={styles.noConversation}><MessageCircle size={32}/><h2>Select a conversation</h2><p>Only team captains in a private conversation can read its messages.</p></div>}
    </section>
  </div>;
}
