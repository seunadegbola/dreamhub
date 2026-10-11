import Link from "next/link";
import { Logo } from "./brand";
import { LEGAL } from "@/lib/legal";

/** Shared layout for privacy, terms and guidelines: readable measure, plain structure. */
export function LegalPage({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-surface">
      <header className="border-b-2 border-ink">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <Link href="/" aria-label="DreamHub home">
            <Logo height={24} />
          </Link>
          <Link href="/start" className="text-sm font-semibold text-ink underline underline-offset-4">
            Get started
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-10">
        <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated {LEGAL.updated}</p>
        <p className="mt-6 max-w-[68ch] text-lg leading-relaxed text-muted">{intro}</p>
        <div className="legal mt-10 max-w-[68ch]">{children}</div>
      </main>
      <LegalFooter />
    </div>
  );
}

export function LegalFooter() {
  return (
    <footer className="border-t-2 border-ink">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-muted md:px-6">
        <Logo height={20} />
        <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/privacy-policy" className="hover:text-ink">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-ink">
            Terms
          </Link>
          <Link href="/guidelines" className="hover:text-ink">
            Community guidelines
          </Link>
          <a href={`mailto:${LEGAL.contactEmail}`} className="hover:text-ink">
            {LEGAL.contactEmail}
          </a>
        </nav>
      </div>
    </footer>
  );
}

export function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-10 scroll-mt-6">
      <h2 className="mb-3 text-xl font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 text-[16px] leading-relaxed [&_a]:font-semibold [&_a]:text-sky [&_a]:underline [&_a]:underline-offset-4 [&_li]:pl-1 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}
