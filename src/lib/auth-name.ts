/** The first name a sign-in provider shared (Google sends given_name / full_name / name). */
export function providerFirstName(meta: Record<string, unknown> | undefined | null): string {
  if (!meta) return "";
  const pick = (k: string) => (typeof meta[k] === "string" ? (meta[k] as string).trim() : "");
  return pick("given_name") || pick("full_name").split(/\s+/)[0] || pick("name").split(/\s+/)[0] || "";
}
