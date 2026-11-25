import type { Metadata } from "next";
import { InformationPage } from "@/components/information-page";

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description: "Terms for using the Peshawar Cricket Club website and club tools.",
  alternates: { canonical: "/terms-and-conditions" }
};

export default function TermsPage() {
  return <InformationPage
    eyebrow="USING PCC"
    title="Terms and Conditions"
    description="Use the PCC website responsibly and only for authorized cricket activities."
    sections={[
      {
        title: "Accounts and accurate information",
        paragraphs: [
          "Keep your sign-in credentials private and provide accurate information when creating an account, applying for a team or managing a roster. You are responsible for activity performed through your account.",
          "Captains may manage only teams for which the service verifies their captain role. Do not submit another person's photograph or contact information without appropriate permission."
        ]
      },
      {
        title: "Acceptable use",
        paragraphs: [
          "Use match, tournament and messaging tools for lawful cricket coordination. Do not impersonate another person, harass users, publish private information without permission, interfere with service operation or attempt to bypass access controls.",
          "Public team and player information may be visible to visitors. You are responsible for ensuring that information you submit is suitable for publication."
        ]
      },
      {
        title: "Content and service availability",
        paragraphs: [
          "Users and organizers are responsible for the accuracy and rights associated with the content they submit. PCC may restrict or remove content that is unauthorized, inaccurate, unsafe or inconsistent with these terms.",
          "The service is provided as available. Scores, fixtures and tournament information may be delayed or corrected; do not rely on the website as the sole source for time-sensitive arrangements."
        ]
      },
      {
        title: "Changes and questions",
        paragraphs: [
          "Features and these terms may change as the platform develops. Continued use after an update means you accept the revised terms. For questions, use the configured contact details on the Contact page."
        ]
      }
    ]}
  />;
}
