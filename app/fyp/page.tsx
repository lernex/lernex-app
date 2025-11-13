import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import FypFeedClient from "./FypFeedClient";
import { normalizeProfileBasics } from "@/lib/profile-basics";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function FypHome({ searchParams }: { searchParams: SearchParams }) {
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

  // Get the subject parameter if present (from placement completion)
  const params = await searchParams;
  const autoSelectSubject = typeof params.subject === "string" ? params.subject : null;

  return <FypFeedClient initialProfile={initialProfile} autoSelectSubject={autoSelectSubject} />;
}
