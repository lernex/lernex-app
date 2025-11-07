import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { canUserGenerate } from "@/lib/usage";

/**
 * POST /api/usage/check
 * Check if user can perform generation based on current usage limits
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const supabase = await supabaseServer();

    // Verify the requesting user matches the userId
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.id !== userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check if user can generate
    const limitCheck = await canUserGenerate(supabase, userId);

    return NextResponse.json(limitCheck);
  } catch (error) {
    console.error("Error checking usage limit:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
