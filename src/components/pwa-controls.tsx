"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, Download, Share2, X } from "lucide-react";
import { useInstallPromptDismissed, usePwa } from "./pwa-provider";

export function InstallButton({ className = "button button-small", showInstalled = false }: { className?: string; showInstalled?: boolean }) {
  const { isInstalled, install } = usePwa();
  if (isInstalled) return showInstalled ? <span className="installed-label"><Check size={15}/>Installed</span> : null;
  return <button type="button" className={className} onClick={() => void install()}><Download size={16}/>Install App</button>;
}

export function InstallGuide() {
  const { showInstallGuide, isIosSafari, dismissInstallGuide } = usePwa();
  if (!showInstallGuide) return null;
  return <div className="pwa-dialog-backdrop" role="presentation" onClick={dismissInstallGuide}>
    <section className="pwa-dialog" role="dialog" aria-modal="true" aria-labelledby="install-guide-title" onClick={event => event.stopPropagation()}>
      <button className="icon-button pwa-dialog-close" type="button" onClick={dismissInstallGuide} aria-label="Close install instructions"><X size={18}/></button>
      <span className="pwa-app-icon"><Image src="/icon-192.png" alt="" width={58} height={58}/></span>
      <h2 id="install-guide-title">Install Peshawar Cricket Club</h2>
      {isIosSafari ? <ol><li>Tap the <b>Share</b> button in Safari.</li><li>Choose <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b> to finish.</li></ol> : <p>Open your browser menu and choose <b>Install app</b> or <b>Add to Home screen</b>. The exact wording depends on your browser.</p>}
      <button type="button" className="button full" onClick={dismissInstallGuide}>Got it</button>
    </section>
  </div>;
}

export function InstallBanner() {
  const { canInstall, isInstalled, isIosSafari, install } = usePwa();
  const { dismissed, dismiss } = useInstallPromptDismissed();
  const [showIosHint, setShowIosHint] = useState(false);
  if (isInstalled || dismissed || (!canInstall && !isIosSafari)) return null;
  return <aside className="install-banner" aria-label="Install app">
    <span className="pwa-app-icon"><Image src="/icon-192.png" alt="" width={42} height={42}/></span>
    <div className="install-banner-copy"><b>Take the club with you</b><span>Install for quick access to matches and scores.</span></div>
    {showIosHint && isIosSafari && <span className="install-ios-hint">Share → Add to Home Screen → Add</span>}
    <button className="button button-small" type="button" onClick={() => {
      if (isIosSafari) setShowIosHint(value => !value);
      else void install();
    }}>{isIosSafari ? "How to install" : "Install Now"}</button>
    <button className="install-dismiss" type="button" onClick={dismiss} aria-label="Maybe later"><X size={17}/><span>Maybe Later</span></button>
  </aside>;
}

export function ShareAppButton({ className = "button button-small" }: { className?: string }) {
  const [status, setStatus] = useState("");

  async function shareApp() {
    const url = window.location.origin;
    const shareData: ShareData = {
      title: "Peshawar Cricket Club",
      text: "Connect cricket teams, arrange matches and follow live scores in Peshawar.",
      url
    };
    try {
      if (navigator.share) {
        let data = shareData;
        try {
          const response = await fetch("/icon-512.png");
          if (response.ok && typeof File !== "undefined") {
            const image = new File([await response.blob()], "peshawar-cricket-club.png", { type: "image/png" });
            if (navigator.canShare?.({ files: [image] })) data = { ...shareData, files: [image] };
          }
        } catch {
          // Sharing the URL is still useful when sharing an image is unavailable.
        }
        await navigator.share(data);
        setStatus("App shared.");
        return;
      }
      if (!navigator.clipboard?.writeText) throw new Error("Link sharing is not available in this browser.");
      await navigator.clipboard.writeText(url);
      setStatus("App link copied.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus(error instanceof Error ? error.message : "Could not share the app link.");
    }
  }

  return <span className="share-control">
    <button type="button" className={className} onClick={() => void shareApp()}><Share2 size={16}/>Share App</button>
    {status && <span className="share-status" role="status"><Check size={14}/>{status}</span>}
  </span>;
}
