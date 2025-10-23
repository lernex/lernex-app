import { supabaseServer } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import PlacementClient from "./client/PlacementClient"; // <- static import of a Client Component

export default async function PlacementPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await sb
    .from("profiles")
    .select("placement_ready")
    .eq("id", user.id)
    .maybeSingle();

  const profile = me as { placement_ready?: boolean } | null;
  if (!profile?.placement_ready) redirect("/fyp");

  // Server guards access; Client component runs the interactive flow.
  return <PlacementClient />;
}
