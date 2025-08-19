"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function PostAuth() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const supabase = supabaseBrowser();
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        router.replace("/login");
        return;
      }

      // Ensure profile exists; then redirect based on completion
      await fetch("/api/profile/init", { method: "POST" });

      // Fetch profile to see what’s missing
      const res = await fetch("/api/profile/me");
      const me = await res.json();
      if (!me?.username) {
        router.replace("/welcome"); // ask username / avatar
        return;
      }
      if (!me?.interests || me.interests.length === 0) {
        router.replace("/onboarding"); // pick broad domains
        return;
      }
      // if has interests but no level_map for a picked domain, go to level picker
      const needsLevel = me.interests.some((d: string) => !(me.level_map && me.level_map[d]));
      if (needsLevel) {
        router.replace("/onboarding/levels"); // choose specific level per domain
        return;
      }
      router.replace("/app");
    })();
  }, [router]);

  return (
    <main className="min-h-screen grid place-items-center text-white">
      <div className="text-neutral-400">Checking your account…</div>
    </main>
  );
}
