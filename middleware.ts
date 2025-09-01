import { NextRequest, NextResponse } from "next/server";

export default function middleware(req: NextRequest) {
  // If Supabase returns to the root with a `?code=` param, redirect it to our
  // auth callback so the session is exchanged and the user can continue.
  const code = req.nextUrl.searchParams.get("code");
  if (code && req.nextUrl.pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/api/auth/callback";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|.*\\..*).*)"], // pass-through
};