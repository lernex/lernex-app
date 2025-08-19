import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import AppFeedClient from "./AppFeedClient";

export default async function AppHome() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login"); // not signed in → login
  return <AppFeedClient />;
}
