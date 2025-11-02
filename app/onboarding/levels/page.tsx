// app/onboarding/levels/page.tsx
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { LEVELS_BY_DOMAIN } from "@/data/domains";

export const dynamic = "force-dynamic";

export default async function LevelsPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  // Fresh read of interests
  const { data: prof } = await sb
    .from("profiles")
    .select("interests, level_map")
    .eq("id", user.id)
    .maybeSingle();

  const profile = prof as { interests?: unknown; level_map?: unknown } | null;
  const interests: string[] = Array.isArray(profile?.interests) ? profile.interests as string[] : [];
  if (!interests.length) redirect("/onboarding");

  // Render a simple form (SSR) that posts to our save endpoint
  return (
    <main className="min-h-screen grid place-items-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-neutral-900 dark:via-neutral-800 dark:to-neutral-900 text-neutral-900 dark:text-white transition-all duration-500">
      <form
        action="/onboarding/levels/save"
        method="post"
        className="w-full max-w-md space-y-6 rounded-2xl border border-neutral-200 bg-white/80 backdrop-blur-sm px-6 py-8 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900/80 animate-fade-in"
      >
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent animate-slide-down">
            Choose Your Class
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 animate-slide-up">
            Select the class you want to take
          </p>
        </div>

        {interests.map((domain, idx) => (
          <div key={domain} className="space-y-3 animate-fade-in-item" style={{ animationDelay: `${idx * 100}ms` }}>
            <label className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white text-xs">
                {domain.charAt(0)}
              </span>
              {domain}
            </label>
            <select
              name={`lv_${domain}`}
              className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 font-medium transition-all duration-300 hover:border-blue-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-200 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white dark:hover:border-purple-400 dark:focus:border-purple-600 dark:focus:ring-purple-200"
            >
              {LEVELS_BY_DOMAIN[domain]?.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              )) ?? <option>No options</option>}
            </select>
          </div>
        ))}

        <button className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 py-3 font-semibold text-white transition-all duration-300 transform hover:scale-[1.02] hover:shadow-xl">
          Continue to Placement
        </button>
      </form>
    </main>
  );
}
