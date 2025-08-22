// app/api/auth/callback/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = createRouteHandlerClient({ cookies });
    // This sets the auth cookies on YOUR domain
    await supabase.auth.exchangeCodeForSession(code);
  }
  // After cookies are set, centralize routing via /post-auth
  return NextResponse.redirect(new URL("/post-auth", url.origin));
}

// Some providers POST; handle both just in case
export const POST = GET;
