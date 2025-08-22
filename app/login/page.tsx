// app/login/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Session } from "@supabase/supabase-js";

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const supabase = supabaseBrowser();

  // 1) Fresh server probe to avoid stale client state & loops
  // at top of /login page
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const j = await res.json();
        if (j?.authenticated) router.replace("/post-auth");
      } finally {
        setChecking(false);
      }
    })();
  }, [router]);


  // 2) Handle legacy case: if some provider/magic link returns to /login with ?code=...
  useEffect(() => {
    const code = sp.get("code");
    if (!code) return;
    (async () => {
      try {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setErr(error.message);
          setChecking(false);
          return;
        }
        router.replace("/post-auth");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Sign-in failed");
        setChecking(false);
      }
    })();
    // NOTE: do not set checking true here; we want to render errors if any
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, router]);

  // Optional: surface provider errors
  useEffect(() => {
    const e = sp.get("error_description");
    if (e) setErr(e);
  }, [sp]);

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/api/auth/callback` },
    });
  };

  const signInWithEmail = async () => {
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
    });
    setSending(false);
    if (error) setErr(error.message);
    else alert("Check your email for a sign-in link!");
  };

  if (checking) {
    return (
      <main className="min-h-screen grid place-items-center text-white">
        <div>Checking session…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen grid place-items-center text-white">
      <div className="w-full max-w-md px-4 py-6 space-y-5 rounded-2xl bg-neutral-900 border border-neutral-800">
        <h1 className="text-2xl font-bold">Sign in to Lernex</h1>

        {err && <div className="text-sm text-red-400">{err}</div>}

        <button
          onClick={signInWithGoogle}
          className="w-full py-3 rounded-xl bg-white text-black hover:bg-neutral-200"
        >
          Continue with Google
        </button>

        <div className="text-center text-neutral-500 text-sm">— or —</div>

        <div className="space-y-3">
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 outline-none"
          />
          <button
            onClick={signInWithEmail}
            disabled={sending || !email}
            className="w-full py-3 rounded-xl bg-lernex-blue hover:bg-blue-500 disabled:opacity-60"
          >
            {sending ? "Sending link…" : "Send magic link"}
          </button>
        </div>
      </div>
    </main>
  );
}
