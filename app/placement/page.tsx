import { supabaseServer } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import dynamic from "next/dynamic";

const PlacementClient = dynamic(() => import("./client/PlacementClient"), { ssr: false });

export default async function PlacementPage() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await sb.from("profiles").select("placement_ready").eq("id", user.id).maybeSingle();
  if (!me?.placement_ready) redirect("/app");

  // Client runs the flow; SSR just gates access
  return <PlacementClient />;
}
