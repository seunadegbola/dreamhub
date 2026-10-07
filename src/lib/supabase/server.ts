import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Supabase client for route handlers: acts as the signed-in user (RLS applies). */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a context that can't set cookies; middleware refreshes them instead.
        }
      },
    },
  });
}
