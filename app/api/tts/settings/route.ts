import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

/**
 * GET /api/tts/settings
 *
 * Gets the user's TTS preferences
 *
 * Response:
 * - tts_voice: string - User's preferred voice
 * - tts_auto_play: boolean - Whether to auto-play TTS
 */
export async function GET() {
  try {
    const supabase = await supabaseServer();

    // Get authenticated user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get user's TTS settings
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("tts_voice, tts_auto_play")
      .eq("user_id", user.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .maybeSingle() as { data: any; error: any };

    if (error) {
      console.error("[tts-settings] Error fetching settings:", error);
      return NextResponse.json(
        { error: "Failed to fetch TTS settings" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      tts_voice: profile?.tts_voice || "af_bella",
      tts_auto_play: profile?.tts_auto_play || false,
    });
  } catch (error) {
    console.error("[tts-settings] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

/**
 * POST /api/tts/settings
 *
 * Updates the user's TTS preferences
 *
 * Request body:
 * - tts_voice: string (optional) - User's preferred voice
 * - tts_auto_play: boolean (optional) - Whether to auto-play TTS
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();

    // Get authenticated user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await req.json();
    const { tts_voice, tts_auto_play } = body;

    // Validate voice if provided
    if (tts_voice !== undefined) {
      const validVoices = [
        "af_bella",
        "af_sarah",
        "am_adam",
        "am_michael",
        "bf_emma",
        "bf_isabella",
        "bm_george",
        "bm_lewis"
      ];

      if (!validVoices.includes(tts_voice)) {
        return NextResponse.json(
          { error: `Invalid voice. Valid voices: ${validVoices.join(", ")}` },
          { status: 400 }
        );
      }
    }

    // Validate auto_play if provided
    if (tts_auto_play !== undefined && typeof tts_auto_play !== "boolean") {
      return NextResponse.json(
        { error: "tts_auto_play must be a boolean" },
        { status: 400 }
      );
    }

    // Build update object with only provided fields
    const updates: { tts_voice?: string; tts_auto_play?: boolean } = {};
    if (tts_voice !== undefined) updates.tts_voice = tts_voice;
    if (tts_auto_play !== undefined) updates.tts_auto_play = tts_auto_play;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No settings provided to update" },
        { status: 400 }
      );
    }

    // Update user's TTS settings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("profiles")
      .update(updates)
      .eq("user_id", user.id);

    if (error) {
      console.error("[tts-settings] Error updating settings:", error);
      return NextResponse.json(
        { error: "Failed to update TTS settings" },
        { status: 500 }
      );
    }

    console.log(`[tts-settings] Updated settings for user ${user.id}:`, updates);

    return NextResponse.json({
      success: true,
      updated: updates,
    });
  } catch (error) {
    console.error("[tts-settings] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
