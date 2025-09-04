// app/onboarding/levels/page.tsx
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { LEVELS_BY_DOMAIN } from "@/data/domains";

export const dynamic = "force-dynamic";

export default async function LevelsPage() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  // Fresh read of interests
  const { data: prof } = await sb
    .from("profiles")
    .select("interests, level_map")
    .eq("id", user.id)
    .maybeSingle();

  const interests: string[] = Array.isArray(prof?.interests) ? prof!.interests : [];
  if (!interests.length) redirect("/onboarding");

  // Render a simple form (SSR) that posts to our save endpoint
  return (
    <main className="min-h-screen grid place-items-center bg-gradient-to-br from-neutral-50 to-neutral-200 text-neutral-900 dark:from-neutral-900 dark:to-neutral-800 dark:text-white">
      <form
        action="/onboarding/levels/save"
        method="post"
        className="w-full max-w-md space-y-4 rounded-2xl border border-neutral-200 bg-white px-4 py-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
      >
        <h1 className="text-2xl font-bold">Pick your course level</h1>
        {interests.map((domain) => (
          <div key={domain} className="space-y-2">
            <label className="text-sm text-neutral-700 dark:text-neutral-300">{domain}</label>
            <select
              name={`lv_${domain}`}
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            >
              {LEVELS_BY_DOMAIN[domain]?.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              )) ?? <option>No options</option>}
            </select>
          </div>
        ))}
        <button className="w-full rounded-xl bg-lernex-blue py-3 transition hover:bg-blue-500">Continue</button>
      </form>
    </main>
  );
}
