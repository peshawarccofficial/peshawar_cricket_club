"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type PwaContextValue = {
  canInstall: boolean;
  isInstalled: boolean;
  isIosSafari: boolean;
  showInstallGuide: boolean;
  install: () => Promise<void>;
  dismissInstallGuide: () => void;
};

const PwaContext = createContext<PwaContextValue | null>(null);
const DISMISSED_KEY = "pcc-install-prompt-dismissed";

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIosSafari, setIsIosSafari] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);

  useEffect(() => {
    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    const updateInstalled = () => {
      setIsInstalled(standaloneQuery.matches || ("standalone" in navigator && navigator.standalone === true));
    };
    const userAgent = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsIosSafari(isIos && /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent));
    updateInstalled();
    standaloneQuery.addEventListener("change", updateInstalled);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      setShowInstallGuide(false);
      window.localStorage.removeItem(DISMISSED_KEY);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
        console.error("Service worker registration failed:", error);
      });
    }

    return () => {
      standaloneQuery.removeEventListener("change", updateInstalled);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (isInstalled) return;
    if (!installPrompt) {
      setShowInstallGuide(true);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") setShowInstallGuide(false);
  }, [installPrompt, isInstalled]);

  const value = useMemo<PwaContextValue>(() => ({
    canInstall: Boolean(installPrompt),
    isInstalled,
    isIosSafari,
    showInstallGuide,
    install,
    dismissInstallGuide: () => setShowInstallGuide(false)
  }), [installPrompt, isInstalled, isIosSafari, showInstallGuide, install]);

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export function usePwa() {
  const context = useContext(PwaContext);
  if (!context) throw new Error("usePwa must be used within PwaProvider");
  return context;
}

export function useInstallPromptDismissed() {
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    setDismissed(window.localStorage.getItem(DISMISSED_KEY) === "true");
  }, []);
  const dismiss = useCallback(() => {
    window.localStorage.setItem(DISMISSED_KEY, "true");
    setDismissed(true);
  }, []);
  return { dismissed, dismiss };
}
