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

      // 1) Basic profile details
      if (!me?.username || !me?.dob) { router.replace("/welcome"); return; }

      // 2) High-level interests
      if (!me?.interests?.length) { router.replace("/onboarding"); return; }

      // 3) Specific course selections for each interest
      const needsLevel = me.interests.some((d: string) => !(me.level_map && me.level_map[d]));
      if (needsLevel) { router.replace("/onboarding/levels"); return; }

      // 4) Run placement quiz if flagged
      if (me?.placement_ready) { router.replace("/placement"); return; }

      // 5) All set – go to the app
      router.replace("/app");
    })();
  }, [router]);

  return (
    <main className="min-h-screen grid place-items-center text-white">
      <div className="text-neutral-400">Setting up your account…</div>
    </main>
  );
}