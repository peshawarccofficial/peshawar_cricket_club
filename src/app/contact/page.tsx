import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { InformationPage } from "@/components/information-page";
import styles from "@/components/information-page.module.css";

export const metadata: Metadata = {
  title: "Contact PCC",
  description: "Contact Peshawar Cricket Club about teams, fixtures and the PCC website.",
  alternates: { canonical: "/contact" }
};

export default function ContactPage() {
  const configuredEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "";
  const email = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(configuredEmail)
    ? configuredEmail
    : null;
  return <InformationPage
    eyebrow="GET IN TOUCH"
    title="Contact Peshawar Cricket Club"
    description="For team, match and website questions, use the club contact address below."
    sections={[
      {
        title: "Team and account support",
        paragraphs: [
          "For team registration decisions, use the feedback shown on your team application and resubmit corrected details from the Teams page.",
          "For account or privacy requests, include only the information needed to identify your account. Do not send passwords, verification codes or private player credentials."
        ]
      }
    ]}
  >
    {email
      ? <a className={styles.contactLink} href={`mailto:${email}`}><Mail size={17}/>{email}</a>
      : <p role="status">A public club contact email has not been configured yet. Please check back later.</p>}
  </InformationPage>;
}
