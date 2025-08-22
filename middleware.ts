// middleware.ts
export default function middleware() { /* no-op for now */ }
export const config = {
  matcher: ["/((?!_next/|.*\\..*).*)"], // pass-through
};
