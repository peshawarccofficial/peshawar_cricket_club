import type { Metadata } from "next";
import { InformationPage } from "@/components/information-page";

export const metadata: Metadata = {
  title: "About PCC",
  description: "Learn about Peshawar Cricket Club and its community cricket platform.",
  alternates: { canonical: "/about" }
};

export default function AboutPage() {
  return <InformationPage
    eyebrow="ABOUT THE CLUB"
    title="Peshawar Cricket Club"
    description="A digital home for the cricket community of Peshawar."
    sections={[
      {
        title: "Play, connect and compete",
        paragraphs: [
          "PCC brings local teams and players together to discover squads, coordinate fixtures, follow match progress and find tournament opportunities.",
          "The website is designed to make cricket coordination easier on phones, tablets and desktop devices while keeping approved team information accessible to the community."
        ]
      },
      {
        title: "Community-first platform",
        paragraphs: [
          "Team registrations and tournament entries are reviewed before they are published. Captains manage their own approved rosters and coordinate match arrangements with other teams.",
          "Peshawar Cricket Club is an independent community platform. Tournament schedules, scores and team information are published as provided and verified through the available club workflows."
        ]
      }
    ]}
  />;
}
