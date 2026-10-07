"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** False when the Supabase env vars aren't set: the app then runs in demo-only mode. */
export const supabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!supabaseConfigured) throw new Error("Supabase is not configured");
  client ??= createBrowserClient(url!, key!);
  return client;
}
