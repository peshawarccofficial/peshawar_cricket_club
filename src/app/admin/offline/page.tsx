import Link from "next/link";

export default function AdminOfflinePage() {
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f4f7fb", color: "#172033", fontFamily: "sans-serif" }}>
    <section style={{ maxWidth: 420, textAlign: "center" }}>
      <h1>You are offline</h1>
      <p>The private admin dashboard needs an internet connection to securely load club data. Reconnect and try again.</p>
      <Link href="/admin" style={{ color: "#5144d7", fontWeight: 700 }}>Try again</Link>
    </section>
  </main>;
}
