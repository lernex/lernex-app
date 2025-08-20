import { supabaseServer } from "@/lib/supabase-server";
import { redirect } from "next/navigation";

export default async function PlacementGate() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: me, error } = await sb
    .from("profiles")
    .select("placement_ready")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    // If there's a types-level mismatch, it usually means the column didn't exist at build time
    // but after Step 1 it will.
    redirect("/app");
  }

  if (!me?.placement_ready) redirect("/app");

  return (
    <main className="min-h-screen grid place-items-center text-white">
      <div className="w-full max-w-md px-4 py-6 space-y-4 rounded-2xl bg-neutral-900 border border-neutral-800">
        <h1 className="text-2xl font-bold">Let’s calibrate your starting level</h1>
        <p className="text-neutral-400 text-sm">
          We’ll run a super quick set of questions to tailor difficulty and pacing for you.
        </p>
        <form action="/placement/start" method="post">
          <button className="w-full py-3 rounded-2xl bg-lernex-blue hover:bg-blue-500">Start</button>
        </form>
      </div>
    </main>
  );
}
