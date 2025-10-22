import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { generateLessonForTopic } from "@/lib/fyp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sb = supabaseServer();
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

    // Check if user has access (owner or member)
    const isOwner = playlist.user_id === user.id;
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

    // Get full lesson data from saved_lessons
    const lessonIds = playlistItems.map(item => item.lesson_id);
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

    // Analyze the lessons to determine common patterns
    const subjects = savedLessons.map(l => l.subject).filter(Boolean);
    const topics = savedLessons.map(l => l.topic).filter(Boolean);
    const difficulties = savedLessons.map(l => l.difficulty).filter(Boolean);

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
    const allTitles = savedLessons.map(l => l.title);
    const lessonDescriptors = allTitles.slice(0, 5);

    // Generate similar lessons
    const generatedLessons = [];
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";

    for (let i = 0; i < count; i++) {
      try {
        const lesson = await generateLessonForTopic(
          sb,
          user.id,
          ip,
          primarySubject,
          primaryTopic || `${primarySubject} Concepts`,
          {
            difficultyPref: primaryDifficulty,
            avoidTitles: [...allTitles, ...generatedLessons.map(l => l.title)],
            savedLessonDescriptors: lessonDescriptors,
            structuredContext: {
              focus: "reinforcement",
              miniLesson: `Similar to: ${lessonDescriptors.slice(0, 3).join(", ")}`,
            }
          }
        );

        if (lesson) {
          generatedLessons.push(lesson);
        }
      } catch (genError) {
        console.error(`[generate-similar] Failed to generate lesson ${i + 1}`, genError);
        // Continue trying other lessons
      }
    }

    if (generatedLessons.length === 0) {
      return new Response(JSON.stringify({
        error: "Failed to generate similar lessons. Please try again."
      }), {
        status: 500
      });
    }

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
