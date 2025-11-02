// app/api/fyp/generate-pending/route.ts
// Background lesson generation using slow (cheaper) models

import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { generateLessonForTopic } from "@/lib/fyp";
import { fetchUserTier } from "@/lib/model-config";
import { storePendingLesson, countPendingLessons } from "@/lib/pending-lessons";
import type { Difficulty } from "@/types/placement";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60; // Allow up to 60 seconds for background generation

// Maximum number of lessons to keep in the pending queue
const MAX_PENDING_LESSONS = 2;

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  const uid = user.id;
  const reqId = Math.random().toString(36).slice(2, 8);

  try {
    const body = await req.json();
    const subject = typeof body.subject === "string" ? body.subject : null;
    const topicLabel = typeof body.topicLabel === "string" ? body.topicLabel : null;
    const count = typeof body.count === "number" ? Math.min(Math.max(1, body.count), MAX_PENDING_LESSONS) : 1;

    if (!subject || !topicLabel) {
      return new Response(
        JSON.stringify({ error: "Missing subject or topicLabel" }),
        { status: 400 }
      );
    }

    console.debug(`[generate-pending][${reqId}] begin`, {
      uid: uid.slice(0, 8),
      subject,
      topicLabel,
      requestedCount: count,
    });

    // Check current pending lesson count
    const currentCount = await countPendingLessons(sb, uid, subject);
    if (currentCount >= MAX_PENDING_LESSONS) {
      console.debug(`[generate-pending][${reqId}] queue full`, { currentCount });
      return new Response(
        JSON.stringify({
          success: true,
          generated: 0,
          reason: "Queue full",
          currentCount,
          maxCount: MAX_PENDING_LESSONS
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    const userTier = await fetchUserTier(sb, uid);
    const lessonsToGenerate = Math.min(count, MAX_PENDING_LESSONS - currentCount);
    const generatedLessons: string[] = [];

    console.debug(`[generate-pending][${reqId}] generating`, {
      tier: userTier,
      currentCount,
      willGenerate: lessonsToGenerate,
    });

    // Get user context for lesson generation
    // OPTIMIZATION: No longer fetching delivered_ids/titles since they're not sent to AI
    const [stateResponse, preferenceResponse] = await Promise.all([
      sb
        .from("user_subject_state")
        .select("difficulty")
        .eq("user_id", uid)
        .eq("subject", subject)
        .maybeSingle(),
      sb
        .from("user_subject_preferences")
        .select("liked_ids, saved_ids, tone_tags")
        .eq("user_id", uid)
        .eq("subject", subject)
        .maybeSingle(),
    ]);

    const state = stateResponse.data as { difficulty?: string } | null;
    const preferenceRow = preferenceResponse.data as {
      liked_ids?: unknown;
      saved_ids?: unknown;
      tone_tags?: unknown;
    } | null;

    const toStringArray = (value: unknown): string[] => {
      if (!Array.isArray(value)) return [];
      return value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    };

    // OPTIMIZATION: avoidIds/avoidTitles no longer sent to AI (saves 50-150 tokens per request)
    // Removed delivered ID/title tracking as it's no longer needed for AI prompt
    const likedIds = toStringArray(preferenceRow?.liked_ids);
    const savedIds = toStringArray(preferenceRow?.saved_ids);
    const toneTags = toStringArray(preferenceRow?.tone_tags);

    // Generate lessons sequentially to avoid race conditions
    for (let i = 0; i < lessonsToGenerate; i++) {
      try {
        console.debug(`[generate-pending][${reqId}] generating lesson ${i + 1}/${lessonsToGenerate}`);

        // Use SLOW model for background generation (cheaper, more cost-effective)
        const generatorOptions: Parameters<typeof generateLessonForTopic>[5] = {
          difficultyPref: (state?.difficulty as Difficulty | undefined) ?? undefined,
          // avoidIds/avoidTitles removed from AI prompt (saves 50-150 tokens per request)
          // Diversity is natural when AI has creative freedom
          likedIds,
          savedIds,
          toneTags,
          userTier,
          modelSpeed: 'slow', // KEY: Use slow model for background generation
        };

        const lesson = await generateLessonForTopic(
          sb,
          uid,
          ip,
          subject,
          topicLabel,
          generatorOptions
        );

        // Store the generated lesson in pending queue
        const stored = await storePendingLesson(
          sb,
          uid,
          subject,
          topicLabel,
          lesson,
          'slow',
          userTier
        );

        if (stored) {
          generatedLessons.push(lesson.id);
          console.debug(`[generate-pending][${reqId}] stored lesson`, {
            lessonId: lesson.id,
            position: stored.position,
          });
        } else {
          console.warn(`[generate-pending][${reqId}] failed to store lesson ${i + 1}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Generation error";
        console.error(`[generate-pending][${reqId}] lesson ${i + 1} error:`, msg);
        // Continue generating other lessons even if one fails
      }
    }

    console.debug(`[generate-pending][${reqId}] success`, {
      generated: generatedLessons.length,
      lessonIds: generatedLessons,
    });

    return new Response(
      JSON.stringify({
        success: true,
        generated: generatedLessons.length,
        lessonIds: generatedLessons,
        currentCount: currentCount + generatedLessons.length,
        maxCount: MAX_PENDING_LESSONS,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    console.error(`[generate-pending][${reqId}] error:`, msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
