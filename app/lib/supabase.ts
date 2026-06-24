import { createBrowserClient } from "@supabase/ssr";

function clearLegacyHostOnlyAuthCookies() {
  if (typeof document === "undefined") return;
  const names = document.cookie
    .split("; ")
    .map((c) => c.split("=")[0])
    .filter((n) => /^sb-.*-auth-token(\.\d+)?$/.test(n));
  for (const name of names) {
    document.cookie = `${name}=; Max-Age=0; path=/`;
  }
}

export function createClient() {
  clearLegacyHostOnlyAuthCookies();
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { domain: ".yururi.app" },
    }
  );
}