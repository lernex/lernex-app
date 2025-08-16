"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sendLink = async () => {
    setErr(null);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: typeof window !== "undefined" ? `${location.origin}/auth/callback` : undefined } });
    if (error) setErr(error.message);
    else setSent(true);
  };

  return (
    <main className="min-h-[calc(100vh-56px)] flex items-center justify-center">
      <div className="w-full max-w-md px-4 py-6 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-3">
        <h1 className="text-xl font-semibold">Log in to Lernex</h1>
        <input
          className="w-full px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 outline-none"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button onClick={sendLink} className="w-full py-3 rounded-2xl bg-lernex-blue hover:bg-blue-500 transition">
          Send Magic Link
        </button>
        {sent && <div className="text-green-400 text-sm">Check your email!</div>}
        {err && <div className="text-red-400 text-sm">{err}</div>}
        <div className="text-sm text-neutral-400">No account? We’ll create it on first login. <Link href="/" className="underline">Back</Link></div>
      </div>
    </main>
  );
}
