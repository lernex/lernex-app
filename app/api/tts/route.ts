import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { translateLessonForTTS } from "@/lib/tts-translation";
import { generateSpeech } from "@/lib/elevenlabs-tts";
import { logUsage, calcCost, checkUsageLimit } from "@/lib/usage";

/**
 * POST /api/tts
 *
 * Generates text-to-speech audio for lesson content
 *
 * Request body:
 * - lessonText: string - The lesson text to convert to speech
 *
 * Response:
 * - audio/mpeg - The generated audio file
 *
 * Process:
 * 1. Translate lesson text using DeepInfra GPT-OSS-20B
 * 2. Generate speech using ElevenLabs Eleven V3
 * 3. Log usage costs for both steps
 * 4. Return audio file
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

    // Check usage limit
    const withinLimit = await checkUsageLimit(supabase, user.id);
    if (!withinLimit) {
      return NextResponse.json(
        { error: "Usage limit reached. Please upgrade your plan." },
        { status: 429 }
      );
    }

    // Parse request body
    const body = await req.json();
    const { lessonText, lessonId } = body;

    if (!lessonText || typeof lessonText !== "string") {
      return NextResponse.json(
        { error: "lessonText is required and must be a string" },
        { status: 400 }
      );
    }

    if (lessonText.length > 10000) {
      return NextResponse.json(
        { error: "Lesson text is too long (max 10,000 characters)" },
        { status: 400 }
      );
    }

    // Get client IP for logging
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null;

    // Step 1: Translate lesson text for natural TTS
    console.log("[tts] Starting translation...");
    const { translatedText, inputTokens, outputTokens } = await translateLessonForTTS(lessonText);

    // Log translation usage
    await logUsage(
      supabase,
      user.id,
      ip,
      "deepinfra/gpt-oss-20b",
      { input_tokens: inputTokens, output_tokens: outputTokens },
      { metadata: { type: "tts-translation" } }
    );

    const translationCost = calcCost("deepinfra/gpt-oss-20b", inputTokens, outputTokens);
    console.log(`[tts] Translation complete. Cost: $${translationCost.toFixed(6)}`);

    // Step 2: Generate speech using ElevenLabs
    console.log("[tts] Generating speech...");
    const { audioBuffer, characterCount } = await generateSpeech(translatedText);

    // Log TTS usage (character count is INPUT to ElevenLabs API)
    await logUsage(
      supabase,
      user.id,
      ip,
      "elevenlabs",
      { input_tokens: characterCount, output_tokens: 0 },
      { metadata: { type: "tts-generation", characterCount } }
    );

    const ttsCost = calcCost("elevenlabs", characterCount, 0);
    console.log(`[tts] Speech generation complete. Input characters: ${characterCount}, Cost: $${ttsCost.toFixed(6)}`);

    // Total cost
    const totalCost = translationCost + ttsCost;
    console.log(`[tts] Total TTS cost: $${totalCost.toFixed(6)}`);

    // If lessonId is provided, upload audio to Supabase Storage and return URL
    if (lessonId) {
      try {
        const fileName = `${user.id}/${lessonId}.mp3`;
        const { error: uploadError } = await supabase.storage
          .from("tts-audio")
          .upload(fileName, audioBuffer, {
            contentType: "audio/mpeg",
            upsert: true, // Replace if exists
          });

        if (uploadError) {
          console.error("[tts] Failed to upload audio to storage:", uploadError);
        } else {
          // Get public URL
          const { data: publicUrlData } = supabase.storage
            .from("tts-audio")
            .getPublicUrl(fileName);

          console.log("[tts] Audio uploaded to storage:", publicUrlData.publicUrl);
        }
      } catch (uploadError) {
        console.error("[tts] Error uploading audio:", uploadError);
        // Continue even if upload fails
      }
    }

    // Return audio as MP3
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error("[tts] Error:", error);

    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
