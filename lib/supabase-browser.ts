import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "./types_db"; // optional

export function supabaseBrowser() {
  return createClientComponentClient<Database>();
}
