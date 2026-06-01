import { createBrowserClient } from "@supabase/ssr";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

function cleanEnvValue(value: string | undefined) {
  return value?.replace(/\uFEFF/g, "").trim() ?? "";
}

export function hasSupabaseEnv() {
  return Boolean(cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL) && cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));
}

export function getSupabaseBrowserClient() {
  if (!hasSupabaseEnv()) {
    return null;
  }
  if (!browserClient) {
    browserClient = createBrowserClient(
      cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL),
      cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    );
  }
  return browserClient;
}
