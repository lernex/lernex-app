"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function PostAuth() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const supabase = supabaseBrowser();
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }

      // ensure profile row exists
      await fetch("/api/profile/init", { method: "POST" });

      // fetch current profile
      const res = await fetch("/api/profile/me");
      const me = await res.json();

      // 1) username + DOB required
      if (!me?.username || !me?.dob) {
        router.replace("/welcome");
        return;
      }
      // 2) interests required
      if (!me?.interests || me.interests.length === 0) {
        router.replace("/onboarding");
        return;
      }
      // 3) level_map must cover each interest
      const needsLevel = me.interests.some((d: string) => !(me.level_map && me.level_map[d]));
      if (needsLevel) {
        router.replace("/onboarding/levels");
        return;
      }
      // 4) run placement if flagged
      if (me?.placement_ready) {
        router.replace("/placement");
        return;
      }

      // else → feed
      router.replace("/app");
    })();
  }, [router]);

  return (
    <main className="min-h-screen grid place-items-center text-white">
      <div className="text-neutral-400">Setting up your account…</div>
    </main>
  );
}
