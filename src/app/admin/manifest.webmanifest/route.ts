import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    id: "/admin",
    name: "Peshawar Cricket Club Admin",
    short_name: "PCC Admin",
    description: "Private administration app for Peshawar Cricket Club.",
    start_url: "/admin",
    scope: "/admin",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#071b36",
    theme_color: "#071b36",
    icons: [
      { src: "/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ],
    shortcuts: [
      { name: "Pending approvals", short_name: "Approvals", url: "/admin?view=approvals", icons: [{ src: "/icon-96.png", sizes: "96x96", type: "image/png" }] },
      { name: "Matches", short_name: "Matches", url: "/admin?view=matches", icons: [{ src: "/icon-96.png", sizes: "96x96", type: "image/png" }] },
      { name: "Live scores", short_name: "Live scores", url: "/admin?view=live", icons: [{ src: "/icon-96.png", sizes: "96x96", type: "image/png" }] }
    ]
  }, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "application/manifest+json; charset=utf-8"
    }
  });
}
