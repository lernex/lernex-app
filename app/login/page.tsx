"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const supabase = supabaseBrowser();

  // If already logged in, go to app
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) router.replace("/app");
    });
    return () => { mounted = false; };
  }, [router, supabase]);

  // If redirected back with a `code` from email link or Google, exchange it
  useEffect(() => {
    const code = sp.get("code");
    if (!code) return;
    (async () => {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) router.replace("/post-auth");
    })();
  }, [sp, supabase, router]);

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/login`, // will return with ?code=
      },
    });
  };

  const signInWithEmail = async () => {
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/login` },
    });
    setSending(false);
    if (!error) alert("Check your email for a sign-in link!");
  };

  return (
    <main className="min-h-screen grid place-items-center text-white">
      <div className="w-full max-w-md px-4 py-6 space-y-5 rounded-2xl bg-neutral-900 border border-neutral-800">
        <h1 className="text-2xl font-bold">Sign in to Lernex</h1>

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
