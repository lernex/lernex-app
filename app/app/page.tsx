import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import AppFeedClient from "./AppFeedClient";
import { normalizeProfileBasics } from "@/lib/profile-basics";

export default async function AppHome() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: profileRow } = await sb
    .from("profiles")
    .select("interests, level_map, placement_ready")
    .eq("id", user.id)
    .maybeSingle();
  const initialProfile = normalizeProfileBasics(profileRow ?? null);
  return <AppFeedClient initialProfile={initialProfile} />;
}
