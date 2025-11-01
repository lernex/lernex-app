import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();

  if (!user) {
    console.log("[add-saved-lessons] Not authenticated");
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" }
    });
  }

  console.log("[add-saved-lessons] User authenticated:", user.id);

  try {
    const payload = await req.json();
    const { playlist_id, lesson_ids } = payload;

    console.log("[add-saved-lessons] Received payload:", { playlist_id, lesson_ids });

    if (!playlist_id || !Array.isArray(lesson_ids) || lesson_ids.length === 0) {
      console.log("[add-saved-lessons] Invalid payload");
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }

    // Verify user has access to the playlist (owner or moderator)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: playlist, error: playlistError } = await (sb as any)
      .from("playlists")
      .select("id, user_id")
      .eq("id", playlist_id)
      .maybeSingle();

    if (playlistError) {
      console.error("[add-saved-lessons] Playlist query error:", playlistError);
      throw playlistError;
    }

    if (!playlist) {
      console.log("[add-saved-lessons] Playlist not found:", playlist_id);
      return new Response(JSON.stringify({ error: "Playlist not found" }), {
        status: 404,
        headers: { "content-type": "application/json" }
      });
    }

    const playlistData = playlist as { id: string; user_id: string };
    const isOwner = playlistData.user_id === user.id;
    let isModerator = false;

    if (!isOwner) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: membership } = await (sb as any)
        .from("playlist_memberships")
        .select("role")
        .eq("playlist_id", playlist_id)
        .eq("profile_id", user.id)
        .maybeSingle();

      const memberData = membership as { role?: string } | null;
      isModerator = memberData?.role === "moderator";
    }

    if (!isOwner && !isModerator) {
      console.log("[add-saved-lessons] Insufficient permissions:", { userId: user.id, playlistOwnerId: playlistData.user_id });
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403,
        headers: { "content-type": "application/json" }
      });
    }

    console.log("[add-saved-lessons] User has permissions:", { isOwner, isModerator });

    // Get current max position
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: items } = await (sb as any)
      .from("playlist_items")
      .select("position")
      .eq("playlist_id", playlist_id)
      .order("position", { ascending: false })
      .limit(1);

    const positionItems = (items ?? []) as Array<{ position: number }>;
    const nextPosition = (positionItems && positionItems[0]?.position) ? positionItems[0].position + 1 : 1;

    // Get existing lesson IDs in playlist to avoid duplicates
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingItems } = await (sb as any)
      .from("playlist_items")
      .select("lesson_id")
      .eq("playlist_id", playlist_id);

    const existingItemsData = (existingItems ?? []) as Array<{ lesson_id: string }>;
    const existingLessonIds = new Set(existingItemsData.map(item => item.lesson_id));

    // Filter out lessons already in the playlist
    const newLessonIds = lesson_ids.filter(id => !existingLessonIds.has(id));

    console.log("[add-saved-lessons] Filtering lessons:", {
      totalRequested: lesson_ids.length,
      alreadyInPlaylist: lesson_ids.length - newLessonIds.length,
      newToAdd: newLessonIds.length
    });

    if (newLessonIds.length === 0) {
      console.log("[add-saved-lessons] All lessons already in playlist");
      return new Response(JSON.stringify({
        message: "All selected lessons are already in the playlist",
        added: 0
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    // Validate that all lessons exist in saved_lessons before inserting
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: validLessons, error: validationError } = await (sb as any)
      .from("saved_lessons")
      .select("lesson_id")
      .eq("user_id", user.id)
      .in("lesson_id", newLessonIds);

    if (validationError) {
      console.error("[add-saved-lessons] Validation error:", validationError);
      return new Response(JSON.stringify({
        error: "Failed to validate lessons",
        details: validationError.message
      }), {
        status: 500,
        headers: { "content-type": "application/json" }
      });
    }

    const validLessonIds = new Set((validLessons ?? []).map((l: { lesson_id: string }) => l.lesson_id));
    const invalidLessons = newLessonIds.filter(id => !validLessonIds.has(id));

    if (invalidLessons.length > 0) {
      console.log("[add-saved-lessons] Some lessons not found in saved_lessons:", invalidLessons);
      return new Response(JSON.stringify({
        error: "Some lessons are not in your saved lessons",
        details: `${invalidLessons.length} lesson(s) not found. Please save them first.`
      }), {
        status: 404,
        headers: { "content-type": "application/json" }
      });
    }

    // Add lessons to playlist - only include valid lesson IDs
    const itemsToInsert = Array.from(validLessonIds).map((lessonId, index) => ({
      playlist_id,
      lesson_id: lessonId,
      position: nextPosition + index
    }));

    console.log("[add-saved-lessons] Inserting items:", {
      count: itemsToInsert.length,
      startPosition: nextPosition
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (sb as any)
      .from("playlist_items")
      .insert(itemsToInsert);

    if (insertError) {
      console.error("[add-saved-lessons] Insert error:", insertError);

      // Check for specific error types
      if (insertError.code === "23505") {
        return new Response(JSON.stringify({
          error: "Duplicate lesson in playlist",
          details: "One or more lessons are already in the playlist"
        }), {
          status: 409,
          headers: { "content-type": "application/json" }
        });
      }

      if (insertError.code === "23503") {
        return new Response(JSON.stringify({
          error: "Invalid reference",
          details: "The playlist or lesson reference is invalid"
        }), {
          status: 400,
          headers: { "content-type": "application/json" }
        });
      }

      throw insertError;
    }

    console.log("[add-saved-lessons] Successfully inserted items");

    return new Response(JSON.stringify({
      ok: true,
      added: validLessonIds.size,
      message: `Added ${validLessonIds.size} lesson${validLessonIds.size === 1 ? '' : 's'} to playlist`
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch (error) {
    console.error("[add-saved-lessons] Failed", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({
      error: "Failed to add lessons to playlist",
      details: errorMessage
    }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
}
