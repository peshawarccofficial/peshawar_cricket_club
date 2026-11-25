import type { Metadata } from "next";
import { InformationPage } from "@/components/information-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Peshawar Cricket Club handles account, team and match information.",
  alternates: { canonical: "/privacy-policy" }
};

export default function PrivacyPolicyPage() {
  return <InformationPage
    eyebrow="YOUR INFORMATION"
    title="Privacy Policy"
    description="This notice describes the information used by the PCC website and how it is shown."
    sections={[
      {
        title: "Information we use",
        paragraphs: [
          "When you create an account, the service processes the identity and contact information provided to its authentication provider. Team applications and captain-managed rosters may include names, roles, photographs and contact details.",
          "Match coordination, tournament applications, private conversations and notification preferences are processed to provide the corresponding club features."
        ]
      },
      {
        title: "Public and private information",
        paragraphs: [
          "Approved team profiles and players marked public can be viewed by visitors. Photographs stored in the public avatar bucket are accessible to anyone who has the image URL. Do not upload an image or detail unless you are authorized to share it.",
          "Private contact details and account information are not intended for public team pages. Access is restricted by account permissions and database policies, but no internet service can promise absolute security."
        ]
      },
      {
        title: "Storage, security and retention",
        paragraphs: [
          "Account and club data are processed by the configured authentication, hosting and database providers. Information is retained while needed to operate club workflows, meet legal obligations, resolve disputes or protect the service.",
          "Use the account settings and password-reset flows to maintain your account. You may request correction or deletion through the configured club contact address, subject to records that must be retained for security or operational reasons."
        ]
      },
      {
        title: "Cookies, notifications and future services",
        paragraphs: [
          "The site uses browser storage and cookies required for sign-in, appearance preferences and PWA behavior. Push notifications are optional and require browser permission.",
          "Google AdSense placements are disabled by default. If the club configures and enables them, Google may use cookies or similar technologies to serve and measure ads. The club should review Google's publisher requirements and update this notice and any required consent controls before enabling advertising in production. No analytics integration is enabled by this policy alone."
        ]
      }
    ]}
  />;
}
