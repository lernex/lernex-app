// app/post-auth/page.tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DOMAINS, LEVELS_BY_DOMAIN } from "@/data/domains";

export default function PostAuth() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/profile/me", { cache: "no-store" });
      if (res.status === 401) { router.replace("/login"); return; }
      const me = await res.json();

      if (!me?.username || !me?.dob) { router.replace("/welcome"); return; }
      if (!me?.interests?.length) { router.replace("/onboarding"); return; }

      // Check if interests contains domains (old model) or courses (new model)
      const allValidCourses = Object.values(LEVELS_BY_DOMAIN).flat();
      const hasOldModel = me.interests.some((item: string) => DOMAINS.includes(item));
      const hasNewModel = me.interests.some((item: string) => allValidCourses.includes(item));

      // If user has domains in interests, check if they need to pick courses
      if (hasOldModel && !hasNewModel) {
        const needsLevel = me.interests.some((d: string) => !(me.level_map && me.level_map[d]));
        if (needsLevel) { router.replace("/onboarding/levels"); return; }
      }

      // Check if user actually needs placement by verifying they don't have existing placement data
      if (me?.placement_ready) {
        // Verify user hasn't already completed placement for ALL their courses
        const stateRes = await fetch("/api/profile/subject-states", { cache: "no-store" });
        if (stateRes.ok) {
          const states = await stateRes.json();

          // Get courses from interests (new model) or level_map (old model)
          let courses: string[];
          if (hasNewModel) {
            // New model: interests contains courses directly
            courses = me.interests.filter((item: string) => allValidCourses.includes(item));
          } else {
            // Old model: get courses from level_map
            const level_map = me.level_map || {};
            courses = Object.values(level_map) as string[];
          }

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
