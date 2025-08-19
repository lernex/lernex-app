import { createBrowserClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "./types_db"; // optional

export function supabaseBrowser() {
  return createBrowserClient<Database | any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
