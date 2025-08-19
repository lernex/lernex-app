import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "./types_db"; // optional if you have generated types

export function supabaseServer() {
  return createServerComponentClient<Database>({ cookies });
}
