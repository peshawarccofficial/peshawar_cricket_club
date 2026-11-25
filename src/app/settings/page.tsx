import { Bell, Download, Share2 } from "lucide-react";
import { InstallButton, ShareAppButton } from "@/components/pwa-controls";
import { PushSettings } from "@/components/push-settings";
import { NotificationInbox } from "@/components/notification-inbox";
import { AccountSettings, AppearanceSettings } from "@/components/settings-controls";

export default function SettingsPage() {
  return <div className="page-wrap">
    <div className="page-heading"><span className="eyebrow">YOUR EXPERIENCE</span><h1>App settings</h1><p>Install the club app, share it with teammates, and manage optional match alerts.</p></div>
    <div className="settings-grid">
      <AccountSettings/>
      <AppearanceSettings/>
      <section className="settings-card"><div className="settings-card-heading"><Download size={20}/><div><h2>Install the app</h2><p>Add Peshawar Cricket Club to your home screen for quick access.</p></div></div><InstallButton showInstalled/></section>
      <section className="settings-card"><div className="settings-card-heading"><Share2 size={20}/><div><h2>Share the app</h2><p>Invite teammates using this website&apos;s current address.</p></div></div><ShareAppButton/></section>
      <section className="settings-card settings-card-wide"><div className="settings-card-heading"><Bell size={20}/><div><h2>Notifications</h2><p>Review saved team updates and opt in to mobile alerts.</p></div></div><NotificationInbox/><PushSettings/></section>
    </div>
  </div>;
}
