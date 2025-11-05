// app/post-auth/page.tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PostAuth() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/profile/me", { cache: "no-store" });
      if (res.status === 401) { router.replace("/login"); return; }
      const me = await res.json();

      if (!me?.username || !me?.dob) { router.replace("/welcome"); return; }
      if (!me?.interests?.length) { router.replace("/onboarding"); return; }

      const needsLevel = me.interests.some((d: string) => !(me.level_map && me.level_map[d]));
      if (needsLevel) { router.replace("/onboarding/levels"); return; }

      // Check if user actually needs placement by verifying they don't have existing placement data
      if (me?.placement_ready) {
        // Verify user hasn't already completed placement
        const stateRes = await fetch("/api/profile/subject-states", { cache: "no-store" });
        if (stateRes.ok) {
          const states = await stateRes.json();
          // If user has subject states, they've already done placement - clear the stale flag
          if (Array.isArray(states) && states.length > 0) {
            // Clear the stale placement_ready flag
            await fetch("/api/profile/clear-placement-flag", { method: "POST" });
            router.replace("/fyp");
            return;
          }
        }
        // User actually needs placement
        router.replace("/placement");
        return;
      }

      router.replace("/fyp");
    })();
  }, [router]);

  return (
    <main className="min-h-screen grid place-items-center text-neutral-900 dark:text-white">
      <div className="text-neutral-500 dark:text-neutral-400">Setting up your account…</div>
    </main>
  );
}
