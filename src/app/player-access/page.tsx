import type { Metadata } from "next";
import { PlayerAccountClaim } from "@/components/player-account-claim";

export const metadata: Metadata = {
  title: "Link Player Account",
  description: "Securely link a Peshawar Cricket Club Player ID to your own account.",
  robots: { index: false, follow: false }
};

export default function PlayerAccessPage() {
  return <div className="page-wrap narrow">
    <div className="page-heading">
      <span className="eyebrow">PLAYER ACCOUNT SETUP</span>
      <h1>Claim your Player ID</h1>
      <p>Your captain provides a one-time access code. Your password stays personal and is never shared with the team.</p>
    </div>
    <PlayerAccountClaim/>
  </div>;
}
