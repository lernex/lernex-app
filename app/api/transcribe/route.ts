import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logUsage } from "@/lib/usage";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DeepInfra OpenAI-compatible client for Whisper
const openai = new OpenAI({
  baseURL: "https://api.deepinfra.com/v1/openai",
  apiKey: process.env.DEEPINFRA_API_KEY,
});

export async function POST(req: Request) {
  try {
    // Get user session
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse form data
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File;
    const durationStr = formData.get("duration") as string;

    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    const duration = parseInt(durationStr) || 0;

    // Convert File to Buffer for OpenAI SDK
    const bytes = await audioFile.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Create a File-like object that the OpenAI SDK expects
    const file = new File([buffer], "recording.webm", { type: audioFile.type });

    // Call DeepInfra Whisper API
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: "openai/whisper-large-v3-turbo",
    });

    // Log usage
    // Whisper costs $0.0002 per minute on DeepInfra
    // We'll convert duration (seconds) to minutes for cost calculation
    const durationMinutes = duration / 60;

    // For usage tracking, we'll use a special "tokens" format:
    // input_tokens = duration in seconds (for record keeping)
    // We'll store the actual cost in metadata and let the usage system calculate
    // But since Whisper doesn't use tokens, we'll use a workaround:
    // Store duration in metadata and use input_tokens to represent billable units

    // Cost: $0.0002 per minute = $0.000003333 per second
    // We'll multiply duration by 1000 to get "pseudo-tokens" so the cost calculation works
    // This way: if we define Whisper price as $0.000003333 per 1 input token,
    // and we pass duration * 1000 as input_tokens, the math works out

    // Actually, let's use a simpler approach:
    // Define Whisper in PRICES as $0.0002 per "token" where 1 token = 1 minute
    // So input_tokens = durationMinutes * 1000 (to convert to integer)

    const inputTokens = Math.ceil(durationMinutes * 1000); // Store minutes as tokens (scaled)

    await logUsage(
      supabase,
      user.id,
      req.headers.get("x-forwarded-for") || "unknown",
      "whisper-large-v3-turbo",
      { input_tokens: inputTokens, output_tokens: 0 },
      {
        metadata: {
          route: "transcribe",
          provider: "deepinfra",
          duration_seconds: duration,
          duration_minutes: durationMinutes,
          audio_type: audioFile.type,
        },
      }
    );

    return NextResponse.json({
      text: transcription.text,
      duration,
    });
  } catch (error: unknown) {
    console.error("Transcription error:", error);

    // Log error for monitoring
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      try {
        await logUsage(
          supabase,
          user.id,
          req.headers.get("x-forwarded-for") || "unknown",
          "whisper-large-v3-turbo",
          { input_tokens: 0, output_tokens: 0 },
          {
            metadata: {
              route: "transcribe",
              provider: "deepinfra",
              error: error instanceof Error ? error.message : String(error),
              error_type: error instanceof Error ? error.constructor.name : typeof error,
            },
          }
        );
      } catch (logError) {
        console.error("Error logging failed transcription:", logError);
      }
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to transcribe audio",
      },
      { status: 500 }
    );
  }
}
