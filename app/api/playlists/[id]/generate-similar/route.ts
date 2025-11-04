import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { generateLessonForTopic } from "@/lib/fyp";
import { generateLessonBatch, type BatchLessonRequest } from "@/lib/batch-lesson-generator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401
    });
  }

  const { id: playlistId } = await params;
  const url = new URL(req.url);
  const countParam = url.searchParams.get("count");
  const count = countParam ? Math.min(Math.max(1, parseInt(countParam)), 10) : 3;

  try {
    // Get the playlist and verify access
    const { data: playlist, error: playlistError } = await sb
      .from("playlists")
      .select("id, user_id")
      .eq("id", playlistId)
      .maybeSingle();

    if (playlistError) {
      throw playlistError;
    }

    if (!playlist) {
      return new Response(JSON.stringify({ error: "Playlist not found" }), {
        status: 404
      });
    }

    const playlistData = playlist as { id: string; user_id: string };

    // Check if user has access (owner or member)
    const isOwner = playlistData.user_id === user.id;
    let hasAccess = isOwner;

    if (!isOwner) {
      const { data: membership } = await sb
        .from("playlist_memberships")
        .select("id")
        .eq("playlist_id", playlistId)
        .eq("profile_id", user.id)
        .maybeSingle();

      hasAccess = !!membership;
    }

    if (!hasAccess) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403
      });
    }

    // Get all lessons from the playlist
    const { data: playlistItems, error: itemsError } = await sb
      .from("playlist_items")
      .select("lesson_id")
      .eq("playlist_id", playlistId);

    if (itemsError) {
      throw itemsError;
    }

    if (!playlistItems || playlistItems.length === 0) {
      return new Response(JSON.stringify({ error: "Playlist has no lessons" }), {
        status: 400
      });
    }

    const items = playlistItems as Array<{ lesson_id: string }>;

    // Get full lesson data from saved_lessons
    const lessonIds = items.map(item => item.lesson_id);
    const { data: savedLessons, error: lessonsError } = await sb
      .from("saved_lessons")
      .select("*")
      .eq("user_id", user.id)
      .in("lesson_id", lessonIds);

    if (lessonsError) {
      throw lessonsError;
    }

    if (!savedLessons || savedLessons.length === 0) {
      return new Response(JSON.stringify({
        error: "No saved lesson data found. Please ensure lessons are saved before generating similar ones."
      }), {
        status: 400
      });
    }

    const lessons = savedLessons as Array<{ subject?: string | null; topic?: string | null; difficulty?: string | null; lesson_data?: unknown }>;

    // Analyze the lessons to determine common patterns
    const subjects = lessons.map(l => l.subject).filter((s): s is string => Boolean(s));
    const topics = lessons.map(l => l.topic).filter((t): t is string => Boolean(t));
    const difficulties = lessons.map(l => l.difficulty).filter((d): d is string => Boolean(d));

    // Most common subject
    const subjectCounts = subjects.reduce((acc, s) => {
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const primarySubject = Object.keys(subjectCounts).sort((a, b) =>
      subjectCounts[b] - subjectCounts[a]
    )[0] || "General";

    // Most common topic
    const topicCounts = topics.reduce((acc, t) => {
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const primaryTopic = Object.keys(topicCounts).sort((a, b) =>
      topicCounts[b] - topicCounts[a]
    )[0];

    // Most common difficulty
    const difficultyCounts = difficulties.reduce((acc, d) => {
      acc[d] = (acc[d] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const primaryDifficulty = Object.keys(difficultyCounts).sort((a, b) =>
      difficultyCounts[b] - difficultyCounts[a]
    )[0] as "intro" | "easy" | "medium" | "hard" | undefined;

    // Extract tone tags and titles for context
    const allTitles = lessons.map(l => (l as { title?: string }).title).filter((t): t is string => Boolean(t));
    const lessonDescriptors = allTitles.slice(0, 5);

    // OPTIMIZED: Use batch generation for similar lessons (saves ~30% input tokens)
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";

    // Build batch requests for all similar lessons
    const batchRequests: BatchLessonRequest[] = Array.from({ length: count }, () => ({
      subject: primarySubject,
      topic: primaryTopic || `${primarySubject} Concepts`,
      opts: {
        difficultyPref: primaryDifficulty,
        // avoidTitles removed - AI prompt optimization (saves 50-150 tokens)
        // Natural diversity without explicit avoidance
        savedLessonDescriptors: lessonDescriptors,
        structuredContext: {
          focus: "reinforcement",
          miniLesson: `Similar to: ${lessonDescriptors.slice(0, 3).join(", ")}`,
        }
      }
    }));

    console.log(`[generate-similar] Using batch generation for ${count} lessons (saves ~30% tokens)`);

    // Generate all lessons in parallel batch
    const batchResults = await generateLessonBatch(sb, user.id, ip, batchRequests);

    // Extract successful lessons
    const generatedLessons = batchResults
      .filter(result => result.success && result.lesson)
      .map(result => result.lesson!);

    if (generatedLessons.length === 0) {
      console.error('[generate-similar] All batch generations failed:', batchResults.map(r => r.error));
      return new Response(JSON.stringify({
        error: "Failed to generate similar lessons. Please try again."
      }), {
        status: 500
      });
    }

    console.log(`[generate-similar] Successfully generated ${generatedLessons.length}/${count} lessons`);


    return new Response(JSON.stringify({ lessons: generatedLessons }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch (error) {
    console.error("[generate-similar] Failed", error);
    return new Response(JSON.stringify({ error: "Failed to generate similar lessons" }), {
      status: 500
    });
  }
}
