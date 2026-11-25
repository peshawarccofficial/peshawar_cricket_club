import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./brand.css";
import { AppShell } from "@/components/app-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { PwaProvider } from "@/components/pwa-provider";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: { default: "Peshawar Cricket Club | Find Matches & Follow Live Scores", template: "%s | Peshawar Cricket Club" },
  description: "Connect cricket teams in Peshawar, arrange matches, manage squads and follow live cricket scores.",
  applicationName: "Peshawar Cricket Club",
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : undefined,
  icons: { icon: "/favicon.png", apple: "/apple-touch-icon.png" },
  openGraph: { title: "Peshawar Cricket Club", description: "Play, connect and compete in Peshawar.", type: "website", images: ["/icon-512.png"] },
  appleWebApp: { capable: true, title: "Peshawar Cricket Club", statusBarStyle: "default" },
  robots: { index: true, follow: true }
};
export const viewport: Viewport = { themeColor: "#071b36", width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const organization = {
    "@context": "https://schema.org",
    "@type": "SportsOrganization",
    name: "Peshawar Cricket Club",
    alternateName: "PCC",
    url: base,
    logo: `${base}/logo.png`,
    sport: "Cricket",
    address: { "@type": "PostalAddress", addressLocality: "Peshawar", addressRegion: "Khyber Pakhtunkhwa", addressCountry: "PK" }
  };
  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Peshawar Cricket Club",
    url: base,
    inLanguage: "en-PK"
  };
  return <html lang="en" suppressHydrationWarning>
    <head>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization).replace(/</g, "\\u003c") }}/>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(website).replace(/</g, "\\u003c") }}/>
    </head>
    <body><ThemeProvider><PwaProvider><AppShell>{children}</AppShell></PwaProvider></ThemeProvider></body>
  </html>;
}
