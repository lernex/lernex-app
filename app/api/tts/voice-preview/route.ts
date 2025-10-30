import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { generateSpeech } from "@/lib/kokoro-tts";

const PREVIEW_TEXT = "The quick brown fox jumped over the lazy dog.";

/**
 * GET /api/tts/voice-preview?voice=af_bella
 *
 * Gets or generates a voice preview for a given voice
 * Uses cached preview from database if available, generates if not
 *
 * Query params:
 * - voice: string - The voice name to preview
 *
 * Response:
 * - audio/mpeg - The preview audio file
 */
export async function GET(req: NextRequest) {
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

    // Get voice from query params
    const { searchParams } = new URL(req.url);
    const voice = searchParams.get("voice") || "af_bella";

    // Valid voices for Kokoro-82M
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

    if (!validVoices.includes(voice)) {
      return NextResponse.json(
        { error: `Invalid voice. Valid voices: ${validVoices.join(", ")}` },
        { status: 400 }
      );
    }

    console.log(`[voice-preview] Requesting preview for voice: ${voice}`);

    // Check if preview already exists in database
    const { data: existingPreview } = await supabase
      .from("tts_voice_previews")
      .select("audio_url")
      .eq("voice_name", voice)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .maybeSingle() as { data: any };

    // If preview exists and has a valid URL, fetch and return it
    if (existingPreview?.audio_url && existingPreview.audio_url !== "") {
      console.log(`[voice-preview] Found cached preview: ${existingPreview.audio_url}`);

      try {
        // Fetch from storage
        const fileName = existingPreview.audio_url.split("/tts-audio/")[1];
        const { data: audioData, error: downloadError } = await supabase.storage
          .from("tts-audio")
          .download(fileName);

        if (!downloadError && audioData) {
          const audioBuffer = await audioData.arrayBuffer();
          return new NextResponse(audioBuffer, {
            status: 200,
            headers: {
              "Content-Type": "audio/mpeg",
              "Content-Length": audioBuffer.byteLength.toString(),
              "Cache-Control": "public, max-age=31536000", // Cache for 1 year
            },
          });
        }
      } catch (fetchError) {
        console.warn(`[voice-preview] Failed to fetch cached audio, regenerating:`, fetchError);
      }
    }

    // Generate new preview
    console.log(`[voice-preview] Generating new preview for voice: ${voice}`);
    const { audioBuffer, characterCount } = await generateSpeech(PREVIEW_TEXT, voice);

    // Upload to storage
    const fileName = `voice-previews/${voice}.mp3`;
    const { error: uploadError } = await supabase.storage
      .from("tts-audio")
      .upload(fileName, audioBuffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error(`[voice-preview] Failed to upload preview:`, uploadError);
    } else {
      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from("tts-audio")
        .getPublicUrl(fileName);

      const audioUrl = publicUrlData.publicUrl;
      console.log(`[voice-preview] Uploaded preview to storage: ${audioUrl}`);

      // Update database with the new preview URL
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from("tts_voice_previews")
        .update({
          audio_url: audioUrl,
          character_count: characterCount,
          updated_at: new Date().toISOString()
        })
        .eq("voice_name", voice);

      if (updateError) {
        console.error(`[voice-preview] Failed to update database:`, updateError);
      } else {
        console.log(`[voice-preview] Database updated successfully`);
      }
    }

    // Return the generated audio
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
        "Cache-Control": "public, max-age=31536000", // Cache for 1 year
      },
    });
  } catch (error) {
    console.error("[voice-preview] Error:", error);

    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
