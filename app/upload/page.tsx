import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import UploadLessonsClient from "./UploadLessonsClient";
import { normalizeProfileBasics } from "@/lib/profile-basics";

export default async function UploadHome() {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) redirect("/login");

  const { data: profileRow } = await sb
    .from("profiles")
    .select("interests, level_map, placement_ready")
    .eq("id", user.id)
    .maybeSingle();

  const initialProfile = normalizeProfileBasics(profileRow ?? null);

  return <UploadLessonsClient initialProfile={initialProfile} />;
}
