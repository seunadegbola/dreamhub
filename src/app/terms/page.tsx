import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section } from "@/components/legal-page";
import { LEGAL, runBy } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of service — DreamHub",
  description: "The agreement between you and DreamHub when you use joindreamhub.com.",
};

const mail = <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>;

export default function Terms() {
  return (
    <LegalPage
      title="Terms of service"
      intro="These terms are the agreement between you and DreamHub when you use joindreamhub.com. We've kept them short and in plain English. By creating an account, you agree to them."
    >
      <Section title="Who we are">
        <p>
          {LEGAL.product} is {runBy()}. You can reach us at {mail}.
        </p>
      </Section>

      <Section title="Who can use DreamHub">
        <ul>
          <li>You must be 18 or over.</li>
          <li>You need one account, in your own name, with an email address you control.</li>
          <li>Keep access to your email and Google account secure: anyone who can open your sign-in links can use your DreamHub account.</li>
        </ul>
      </Section>

      <Section title="What DreamHub is, and isn't">
        <p>
          DreamHub is a productivity and accountability tool: task breakdown, deadlines, streaks and focus sessions with other members. It is{" "}
          <strong>not a medical, mental health or therapy service</strong>, and nothing on DreamHub is medical advice. If you are struggling, please talk to a GP or another qualified professional.
        </p>
        <p>
          Suggested steps and deadlines, including those produced by AI, are suggestions. Check that they make sense for you before relying on them, especially for work, study or anything with real
          consequences.
        </p>
      </Section>

      <Section title="Focus sessions and community">
        <ul>
          <li>
            Follow our <Link href="/guidelines">community guidelines</Link> in every session, chat and invitation.
          </li>
          <li>Cameras are optional. If you turn yours on, make sure it shows only you and nothing you wouldn&apos;t want others to see.</li>
          <li>
            <strong>Do not record, screenshot or share other members</strong> or anything said in a session.
          </li>
          <li>Hosts can mute or remove people from their sessions. We can remove anyone from any session.</li>
          <li>Other members are not checked or supervised by us. Use the report and block tools if anyone makes you uncomfortable.</li>
        </ul>
      </Section>

      <Section title="Your content">
        <p>
          Your goals, tasks, steps and messages belong to you. You give us permission to store and display them as needed to run DreamHub, for example showing your session goal to your table, or your
          committed deadlines to your buddies. This permission ends when you delete the content or your account, apart from backups that are overwritten within 30 days.
        </p>
        <p>Don&apos;t post anything illegal, hateful, sexual, misleading, or anything you don&apos;t have the right to share.</p>
      </Section>

      <Section title="Suspending or closing accounts">
        <p>
          We may suspend or close an account that breaks these terms or the community guidelines, puts other members at risk, or misuses the service. Where it&apos;s safe to do so, we&apos;ll tell you why.
          You can delete your account at any time from Profile → Delete account.
        </p>
      </Section>

      <Section title="Price">
        <p>DreamHub is currently free. If we introduce paid features, we will tell you the price clearly before you pay for anything, and free features you already use won&apos;t be charged without notice.</p>
      </Section>

      <Section title="Availability and changes">
        <p>
          We work hard to keep DreamHub running, including Focus Hours, but we can&apos;t promise it will always be available or free of errors. We may change, add or remove features. If we make a change
          to these terms that matters, we&apos;ll tell you in the app or by email before it takes effect.
        </p>
      </Section>

      <Section title="Our responsibility to you">
        <p>
          Nothing in these terms limits your rights under UK consumer law, or our liability for death or personal injury caused by our negligence, or for fraud. Otherwise, because DreamHub is provided free
          of charge, we are not responsible for indirect losses, such as a missed deadline, lost work or lost income, that result from using or being unable to use the service.
        </p>
      </Section>

      <Section title="Privacy">
        <p>
          Our <Link href="/privacy-policy">privacy policy</Link> explains what we collect and how we use it.
        </p>
      </Section>

      <Section title="Law">
        <p>These terms are governed by the law of England and Wales. If you live elsewhere in the UK, you can also bring a claim in your local courts.</p>
      </Section>

      <Section title="Contact">
        <p>Questions about these terms: {mail}.</p>
      </Section>
    </LegalPage>
  );
}
