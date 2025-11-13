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
        // Verify user hasn't already completed placement for ALL their courses
        const stateRes = await fetch("/api/profile/subject-states", { cache: "no-store" });
        if (stateRes.ok) {
          const states = await stateRes.json();

          // Check if all courses in level_map have corresponding subject states
          const level_map = me.level_map || {};
          const courses = Object.values(level_map) as string[];
          const completedCourses = Array.isArray(states) ? states.map((s: { course: string }) => s.course) : [];

          // If all courses have states, placement is done - clear the flag
          const allCoursesHaveStates = courses.length > 0 && courses.every((course: string) => completedCourses.includes(course));

          if (allCoursesHaveStates) {
            // Clear the stale placement_ready flag
            await fetch("/api/profile/clear-placement-flag", { method: "POST" });
            router.replace("/fyp");
            return;
          }
        }
        // User actually needs placement for at least one course
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
