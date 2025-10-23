// app/api/profile/interests/remove/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { interest } = await req.json().catch(() => ({}));

  if (!interest || typeof interest !== "string") {
    return NextResponse.json({ error: "Invalid subject" }, { status: 400 });
  }

  // Get current profile
  const { data: profile, error: fetchError } = await sb
    .from("profiles")
    .select("interests, level_map")
    .eq("id", user.id)
    .single();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const currentInterests = profile?.interests || [];

  // Check if interest exists
  if (!currentInterests.includes(interest)) {
    return NextResponse.json({ error: "Subject not found" }, { status: 400 });
  }

  // Check if this is the last interest
  if (currentInterests.length === 1) {
    return NextResponse.json({
      error: "Cannot remove your last subject. Add another subject first."
    }, { status: 400 });
  }

  // Remove the interest
  const updatedInterests = currentInterests.filter((i: string) => i !== interest);

  // Also update level_map to remove this subject's level
  let updatedLevelMap = profile?.level_map as Record<string, string> | null;
  if (updatedLevelMap && updatedLevelMap[interest]) {
    updatedLevelMap = { ...updatedLevelMap };
    delete updatedLevelMap[interest];
  }

  const { error: updateError } = await sb
    .from("profiles")
    .update({
      interests: updatedInterests,
      level_map: updatedLevelMap,
      updated_at: new Date().toISOString()
    })
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Also delete the user_subject_state for this subject
  await sb
    .from("user_subject_state")
    .delete()
    .eq("user_id", user.id)
    .eq("subject", interest);

  return NextResponse.json({
    ok: true,
    interests: updatedInterests,
    message: `${interest} removed successfully`
  });
}
