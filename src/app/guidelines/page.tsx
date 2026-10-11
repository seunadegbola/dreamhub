import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Community guidelines — DreamHub",
  description: "How we focus together on DreamHub: be kind, stay on task, cameras show only you, no recording, no selling.",
};

export default function Guidelines() {
  return (
    <LegalPage
      title="Community guidelines"
      intro="DreamHub works because people show up for each other. Everyone at a table is trying to get something done, often something hard. These five rules keep it a place people want to come back to."
    >
      <Section title="1. Be kind">
        <p>Assume good intent. Celebrate other people&apos;s progress, however small. No insults, harassment, hate, or comments on anyone&apos;s appearance, home, ability or background.</p>
      </Section>
      <Section title="2. Stay on task">
        <p>Focus blocks are for working. Keep your mic muted during blocks and save chat for the breaks. Leaving quietly at a break is always fine.</p>
      </Section>
      <Section title="3. Cameras show only you">
        <p>Cameras are optional. If yours is on, it should show you working, and nothing sexual, violent or shocking, and no one who hasn&apos;t agreed to be on camera.</p>
      </Section>
      <Section title="4. No recording">
        <p>Never record, screenshot or share video, audio or messages from a session. DreamHub doesn&apos;t record sessions, and neither should anyone else.</p>
      </Section>
      <Section title="5. No selling">
        <p>No advertising, promotion, recruitment or asking people to contact you elsewhere. Hosting a session to work alongside friends is great; using it to pitch them isn&apos;t.</p>
      </Section>
      <Section title="If something goes wrong">
        <ul>
          <li>
            Use <strong>⋯ → Report</strong> on anyone&apos;s tile in a session. We review every report.
          </li>
          <li>
            Use <strong>⋯ → Block</strong> to make sure you&apos;re never seated together again, or <strong>Hide their video</strong> just for yourself.
          </li>
          <li>Hosts can remove people from their own sessions.</li>
          <li>
            For anything urgent, email <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>. If someone is in danger, contact the emergency services first.
          </li>
        </ul>
        <p>Breaking these guidelines can lead to being removed from a session, losing the ability to host public sessions, or having your account suspended or closed.</p>
      </Section>
    </LegalPage>
  );
}
