import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types_db"; // optional

export function supabaseBrowser() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_CUSTOM_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
