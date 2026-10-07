"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo, Mascot } from "@/components/brand";
import { Button, Field, inputClass } from "@/components/ui";
import { supabase, supabaseConfigured } from "@/lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [next, setNext] = useState("/home");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const n = q.get("next");
    if (n && n.startsWith("/") && !n.startsWith("//")) setNext(n);
    if (q.get("error")) setError("That sign-in link has expired or was already used. Send a new one.");
  }, []);

  const callback = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  if (!supabaseConfigured) {
    return (
      <Shell>
        <h1 className="text-3xl font-bold tracking-tight">Accounts aren’t switched on yet</h1>
        <p className="mt-2 text-muted">This copy of DreamHub runs in demo mode. Try the demo from the home page.</p>
        <Link href="/" className="mt-6 inline-block font-semibold text-sky underline underline-offset-4">
          Back to home
        </Link>
      </Shell>
    );
  }

  if (sent) {
    return (
      <Shell>
        <Mascot mood="happy" size={88} />
        <h1 className="mt-4 text-3xl font-bold tracking-tight">Check your email 📬</h1>
        <p className="mt-2 text-muted">We sent a sign-in link to {email}. Open it on this device.</p>
        <Button variant="secondary" className="mt-6" onClick={() => setSent(false)}>
          Use a different email
        </Button>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-muted">Sign in to pick up where you left off.</p>
      <div className="mt-8 space-y-4">
        <Button
          variant="secondary"
          size="lg"
          className="w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const { error } = await supabase().auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback() } });
            if (error) {
              setBusy(false);
              setError("Google sign-in isn’t available right now. Use your email instead.");
            }
          }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8z" />
            <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1-3.8 1-2.9 0-5.4-2-6.3-4.6H2v2.8A11 11 0 0 0 12 23z" />
            <path fill="#FBBC05" d="M5.7 14a6.6 6.6 0 0 1 0-4.2V7H2a11 11 0 0 0 0 10l3.7-3z" />
            <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2 7l3.7 2.8C6.6 7.3 9 5.4 12 5.4z" />
          </svg>
          Continue with Google
        </Button>
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="h-px flex-1 bg-hairline" /> or use email <span className="h-px flex-1 bg-hairline" />
        </div>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!/\S+@\S+\.\S+/.test(email)) return;
            setBusy(true);
            setError(null);
            // shouldCreateUser: false — new people go through onboarding first.
            const { error } = await supabase().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: callback(), shouldCreateUser: false } });
            setBusy(false);
            if (error) setError(error.message.includes("Signups not allowed") || error.message.includes("not found") ? "We don’t have an account for that email yet." : "We couldn’t send the link. Try again in a minute.");
            else setSent(true);
          }}
        >
          <Field label="Email">
            <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
          </Field>
          {error && <p className="rounded-[8px] bg-missed-tint px-3 py-2 text-sm font-medium text-missed">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={busy || !email}>
            {busy ? "Sending…" : "Email me a sign-in link"}
          </Button>
        </form>
        <p className="pt-2 text-center text-sm text-muted">
          New here?{" "}
          <Link href="/start" className="font-semibold text-ink underline underline-offset-4">
            Make your plan first
          </Link>
        </p>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="mx-auto flex h-16 max-w-md items-center px-4">
        <Link href="/" aria-label="DreamHub home">
          <Logo height={24} />
        </Link>
      </header>
      <main className="mx-auto max-w-md px-4 pb-16 pt-8">{children}</main>
    </div>
  );
}
