import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "./types_db"; // optional if you have generated types

export function supabaseServer() {
  const cookieStore = cookies();
  return createServerClient<Database | any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
}
