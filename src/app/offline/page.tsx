import Link from "next/link";

export default function OfflinePage() {
  return <div className="page-wrap narrow"><div className="empty-state"><h1>You are offline</h1><p>This page is not available in the offline cache. Reconnect to the internet and try again.</p><Link className="button" href="/">Try again</Link></div></div>;
}
