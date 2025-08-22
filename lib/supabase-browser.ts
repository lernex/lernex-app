import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "./types_db"; // optional

export function supabaseBrowser() {
  return createClientComponentClient<Database>({
    supabaseUrl:
      process.env.NEXT_PUBLIC_SUPABASE_CUSTOM_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
