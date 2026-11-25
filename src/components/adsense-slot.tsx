"use client";

import Script from "next/script";
import { useEffect } from "react";
import styles from "./adsense-slot.module.css";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export function AdsenseSlot({ publisherId, slotId, placement }: {
  publisherId: string;
  slotId: string;
  placement: string;
}) {
  useEffect(() => {
    try {
      (window.adsbygoogle ??= []).push({});
    } catch (error) {
      console.error("Could not initialize the configured AdSense placement:", error);
    }
  }, []);

  return <aside className={styles.placement} aria-label="Advertisement">
    <span className={styles.label}>Advertisement</span>
    <Script
      id={`adsense-${placement}`}
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(publisherId)}`}
      strategy="afterInteractive"
      crossOrigin="anonymous"
    />
    <ins
      className="adsbygoogle"
      style={{ display: "block" }}
      data-ad-client={publisherId}
      data-ad-slot={slotId}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  </aside>;
}
