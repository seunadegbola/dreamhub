import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section } from "@/components/legal-page";
import { LEGAL, runBy } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy policy — DreamHub",
  description: "What DreamHub collects, why, who processes it, and your rights under UK GDPR.",
};

const mail = <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>;

export default function PrivacyPolicy() {
  return (
    <LegalPage
      title="Privacy policy"
      intro="DreamHub helps you break goals into steps, keep deadlines and focus alongside other people. This page explains what information we collect to do that, why, who helps us process it, and the choices you have. We don't sell your data and we don't use advertising trackers."
    >
      <Section title="Who we are">
        <p>
          {LEGAL.product} ({LEGAL.site}) is {runBy()}. We are the data controller for the personal information described here. Contact us about anything
          on this page at {mail}.
        </p>
      </Section>

      <Section title="What we collect">
        <ul>
          <li>
            <strong>Account details</strong>: your email address and first name. If you sign in with Google, we receive your name and email address from Google.
          </li>
          <li>
            <strong>Date of birth</strong>: used only to confirm you are 18 or over. It is never shown to other members.
          </li>
          <li>
            <strong>Your plans</strong>: goals, tasks, steps, deadlines, deadline extensions and the reasons you give for them.
          </li>
          <li>
            <strong>Activity</strong>: the days you were active or resting (for your streak), XP and achievements, focus sessions you joined, how many blocks you completed, your check-ins and what you planned to work on.
          </li>
          <li>
            <strong>Social features</strong>: your focus buddies, nudges, session invitations, and any reports or blocks you make.
          </li>
          <li>
            <strong>Settings</strong>: timezone, rest days, notification and animation preferences, and, if you switch reminders on, a technical address for each device that should receive them.
          </li>
          <li>
            <strong>Basic technical data</strong>: information your browser sends when you use the site, such as IP address and device type, kept in our hosting and security logs.
          </li>
        </ul>
      </Section>

      <Section title="Video, audio and chat">
        <p>
          Focus sessions use live video and audio. Cameras are always optional and microphones start muted. <strong>Sessions are never recorded.</strong> Audio, video and table chat pass through our video
          provider in real time so the people at your table can see and hear you, and are not stored by DreamHub. Recording other members is against our{" "}
          <Link href="/guidelines">community guidelines</Link>.
        </p>
        <p>The people at your table can see your first name, the goal you set for the block and any check-in update you share.</p>
      </Section>

      <Section title="What buddies and other members can see">
        <ul>
          <li>Any signed-in member can see your first name, for example when you host a session or sit at the same table.</li>
          <li>
            Focus buddies you accept can also see your streak, whether today counts yet, your goal titles and any deadlines you choose to commit to. They cannot see your steps, task details or
            session history.
          </li>
          <li>Your email address and date of birth are never shown to anyone.</li>
        </ul>
      </Section>

      <Section title="Why we use it (lawful bases)">
        <ul>
          <li>
            <strong>To provide DreamHub</strong> (contract): creating your account, saving your plans, running sessions, calculating streaks and deadlines, and connecting you with buddies.
          </li>
          <li>
            <strong>To keep members safe</strong> (legitimate interests): checking age, handling reports and blocks, preventing abuse and securing the service.
          </li>
          <li>
            <strong>To improve DreamHub</strong> (legitimate interests): understanding, in aggregate, which features help people finish what they start.
          </li>
          <li>
            <strong>Optional reminders</strong> (consent): notifications you switch on, which you can turn off at any time in your profile.
          </li>
        </ul>
      </Section>

      <Section id="google" title="Signing in with Google">
        <p>
          If you choose Continue with Google, Google shares your name and email address with us. We use them only to create your DreamHub account and sign you in. We do not request access to your Gmail,
          Calendar, Drive, contacts or any other Google data, and we do not post anything on your behalf.
        </p>
        <p>
          We do not sell Google user data, use it for advertising, or share it with anyone except the service providers listed below that run DreamHub. Our use of information received from Google
          adheres to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener noreferrer" target="_blank">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
      </Section>

      <Section title="Who processes your data for us">
        <p>We use a small number of providers to run DreamHub. They process data only on our instructions.</p>
        <ul>
          <li>
            <strong>Supabase</strong>: account sign-in and our database (stored in London, UK).
          </li>
          <li>
            <strong>LiveKit</strong>: live audio and video for focus sessions (EU data region; nothing is recorded).
          </li>
          <li>
            <strong>Vercel</strong>: hosting the website.
          </li>
          <li>
            <strong>Resend</strong>: sending sign-in emails.
          </li>
          <li>
            <strong>Anthropic</strong>: when you use automatic task breakdown, the goal or task title you entered (and its deadline) is sent to Anthropic&apos;s AI to suggest steps. Nothing else about you
            is included. Under Anthropic&apos;s commercial terms, this data is not used to train their models.
          </li>
          <li>
            <strong>Google</strong>: only if you choose to sign in with Google.
          </li>
          <li>
            <strong>Your browser&apos;s push service</strong> (Google, Apple, Mozilla or Microsoft, depending on your device): delivers reminders you switch on. Reminders are encrypted on the way,
            so the push service can&apos;t read them.
          </li>
        </ul>
        <p>
          Some providers may process data outside the UK. Where they do, we rely on the safeguards UK law requires, such as the UK International Data Transfer Agreement or addendum, or the UK-US data
          bridge.
        </p>
      </Section>

      <Section title="Cookies and storage on your device">
        <p>
          We use essential cookies to keep you signed in. DreamHub also saves a small amount of information in your browser, such as your onboarding plan before you sign up and an in-progress solo
          session, so the app works smoothly. We do not use advertising or cross-site tracking cookies.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          We keep your account and plans for as long as you have an account. When you delete your account (Profile → Delete account), your account and everything linked to it is deleted from our database
          straight away. Copies may remain in encrypted backups for up to 30 days before they are overwritten. We may keep a record of reports about serious misconduct for longer where needed to keep
          members safe.
        </p>
      </Section>

      <Section title="Your rights">
        <p>Under UK data protection law you can:</p>
        <ul>
          <li>get a copy of your data (Profile → Export my data gives you a copy instantly)</li>
          <li>correct information that is wrong</li>
          <li>delete your account and data (Profile → Delete account)</li>
          <li>object to or ask us to restrict certain uses</li>
          <li>withdraw consent for optional reminders at any time</li>
        </ul>
        <p>
          To use any of these rights, email {mail}. If you are unhappy with how we handle your data, you can complain to the Information Commissioner&apos;s Office at{" "}
          <a href="https://ico.org.uk/make-a-complaint/" rel="noopener noreferrer" target="_blank">
            ico.org.uk
          </a>
          .
        </p>
      </Section>

      <Section title="Age">
        <p>DreamHub is for adults aged 18 and over. We do not knowingly collect data from anyone younger. If you believe someone under 18 has an account, email {mail} and we will remove it.</p>
      </Section>

      <Section title="Changes">
        <p>If we change this policy in a way that matters, we will tell you in the app or by email before the change takes effect. The date at the top shows when it was last updated.</p>
      </Section>
    </LegalPage>
  );
}
