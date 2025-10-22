// app/api/profile/interests/add/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { DOMAINS } from "@/data/domains";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { interest } = await req.json().catch(() => ({}));

  // Validate the interest is a valid domain
  if (!interest || typeof interest !== "string" || !DOMAINS.includes(interest)) {
    return NextResponse.json({ error: "Invalid subject" }, { status: 400 });
  }

  // Get current profile
  const { data: profile, error: fetchError } = await sb
    .from("profiles")
    .select("interests")
    .eq("id", user.id)
    .single();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const currentInterests = profile?.interests || [];

  // Check if interest already exists
  if (currentInterests.includes(interest)) {
    return NextResponse.json({ error: "Subject already added" }, { status: 400 });
  }

  // Add the new interest
  const updatedInterests = [...currentInterests, interest];

  const { error: updateError } = await sb
    .from("profiles")
    .update({
      interests: updatedInterests,
      updated_at: new Date().toISOString(),
      placement_ready: true // Enable placement for the new interest
    })
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    interests: updatedInterests,
    message: `${interest} added successfully. Run placement to set your level.`
  });
}
