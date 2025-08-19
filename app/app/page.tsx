import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import Feed from "@/components/Feed";
import { lessons } from "@/data/lessons";
import StreakPoints from "@/components/StreakPoints";

export default async function AppHome() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");  // not signed in → login

  return (
    <main className="min-h-[calc(100vh-56px)]">
      <StreakPoints />
      <Feed lessons={lessons} />
    </main>
  );
}
