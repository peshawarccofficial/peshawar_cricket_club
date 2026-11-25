import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Peshawar Cricket Club",
    short_name: "PCC",
    description: "Connect, arrange matches and follow cricket in Peshawar.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#071b36",
    theme_color: "#071b36",
    icons: [
      { src: "/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ],
    shortcuts: [
      { name: "Matches", short_name: "Matches", url: "/matches", icons: [{ src: "/icon-96.png", sizes: "96x96", type: "image/png" }] },
      { name: "Live scores", short_name: "Live", url: "/live", icons: [{ src: "/icon-96.png", sizes: "96x96", type: "image/png" }] },
      { name: "Teams", short_name: "Teams", url: "/teams", icons: [{ src: "/icon-96.png", sizes: "96x96", type: "image/png" }] }
    ]
  };
}
