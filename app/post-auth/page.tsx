"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PostAuth() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      // Ensure the session exists via server cookie; then hit API fresh
      const res = await fetch("/api/profile/me", { cache: "no-store" });
      if (res.status === 401) { router.replace("/login"); return; }
      const me = await res.json();

      if (!me?.username || !me?.dob) { router.replace("/welcome"); return; }
      if (!me?.interests || me.interests.length === 0) { router.replace("/onboarding"); return; }

      const needsLevel = me.interests.some((d: string) => !(me.level_map && me.level_map[d]));
      if (needsLevel) { router.replace("/onboarding/levels"); return; }

      if (me?.placement_ready) { router.replace("/placement"); return; }

      router.replace("/app");
    })();
  }, [router]);

  return (
    <main className="min-h-screen grid place-items-center text-white">
      <div className="text-neutral-400">Setting up your account…</div>
    </main>
  );
}
