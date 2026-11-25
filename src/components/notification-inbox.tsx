"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import styles from "./notification-inbox.module.css";

type Notification = { id: string; title: string; body: string | null; read_at: string | null; created_at: string };

export function NotificationInbox() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [signedIn, setSignedIn] = useState(false);

  const loadNotifications = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) {
      setMessage("Sign-in is not configured.");
      setLoading(false);
      return;
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError && authError.name !== "AuthSessionMissingError") {
      setMessage("Could not verify your account.");
      setLoading(false);
      return;
    }
    setSignedIn(Boolean(user));
    if (!user) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.from("notifications")
      .select("id,title,body,read_at,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) setMessage("Notifications are unavailable. Check that the notifications schema is installed.");
    else {
      setNotifications((data ?? []) as Notification[]);
      setMessage("");
    }
    setLoading(false);
  }, []);

  useEffect(() => { void loadNotifications(); }, [loadNotifications]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;
      channel = supabase.channel(`pcc-notifications-${data.user.id}`)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${data.user.id}`
        }, () => { void loadNotifications(); })
        .subscribe();
    });
    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [loadNotifications]);

  async function markAllRead() {
    const supabase = createClient();
    if (!supabase) return;
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setMessage("Sign in to update notifications.");
      return;
    }
    const { error } = await supabase.from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    if (error) setMessage("Could not mark notifications as read.");
    else void loadNotifications();
  }

  const unreadCount = notifications.filter(notification => !notification.read_at).length;
  return <section className={styles.inbox} aria-labelledby="notification-inbox-title">
    <div className={styles.heading}>
      <div><h3 id="notification-inbox-title"><Bell size={17}/> Notifications</h3><span>{unreadCount ? `${unreadCount} unread` : "All caught up"}</span></div>
      {unreadCount > 0 && <button type="button" onClick={() => void markAllRead()}><CheckCheck size={15}/>Mark all read</button>}
    </div>
    {!signedIn && !loading ? <p className={styles.empty}>Sign in to see notifications for your account.</p>
      : loading ? <p className={styles.empty}>Loading notifications…</p>
        : message ? <p className={styles.error} role="alert">{message}</p>
          : notifications.length ? <ul className={styles.list}>
            {notifications.map(notification => <li className={notification.read_at ? styles.read : styles.unread} key={notification.id}>
              <span className={styles.indicator} aria-hidden="true"/>
              <div><strong>{notification.title}</strong>{notification.body && <p>{notification.body}</p>}<time dateTime={notification.created_at}>{new Date(notification.created_at).toLocaleString()}</time></div>
            </li>)}
          </ul> : <p className={styles.empty}>No notifications yet. Team and match updates will appear here.</p>}
  </section>;
}
