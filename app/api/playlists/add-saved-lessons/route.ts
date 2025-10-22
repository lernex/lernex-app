import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  try {
    const payload = await req.json();
    const { playlist_id, lesson_ids } = payload;

    if (!playlist_id || !Array.isArray(lesson_ids) || lesson_ids.length === 0) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400 });
    }

    // Verify user has access to the playlist (owner or moderator)
    const { data: playlist, error: playlistError } = await sb
      .from("playlists")
      .select("id, user_id")
      .eq("id", playlist_id)
      .maybeSingle();

    if (playlistError) {
      throw playlistError;
    }

    if (!playlist) {
      return new Response(JSON.stringify({ error: "Playlist not found" }), { status: 404 });
    }

    const isOwner = playlist.user_id === user.id;
    let isModerator = false;

    if (!isOwner) {
      const { data: membership } = await sb
        .from("playlist_memberships")
        .select("role")
        .eq("playlist_id", playlist_id)
        .eq("profile_id", user.id)
        .maybeSingle();

      isModerator = membership?.role === "moderator";
    }

    if (!isOwner && !isModerator) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), { status: 403 });
    }

    // Get current max position
    const { data: items } = await sb
      .from("playlist_items")
      .select("position")
      .eq("playlist_id", playlist_id)
      .order("position", { ascending: false })
      .limit(1);

    const nextPosition = (items && items[0]?.position) ? items[0].position + 1 : 1;

    // Get existing lesson IDs in playlist to avoid duplicates
    const { data: existingItems } = await sb
      .from("playlist_items")
      .select("lesson_id")
      .eq("playlist_id", playlist_id);

    const existingLessonIds = new Set((existingItems ?? []).map(item => item.lesson_id));

    // Filter out lessons already in the playlist
    const newLessonIds = lesson_ids.filter(id => !existingLessonIds.has(id));

    if (newLessonIds.length === 0) {
      return new Response(JSON.stringify({
        message: "All selected lessons are already in the playlist",
        added: 0
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    // Add lessons to playlist
    const itemsToInsert = newLessonIds.map((lessonId, index) => ({
      playlist_id,
      lesson_id: lessonId,
      position: nextPosition + index
    }));

    const { error: insertError } = await sb
      .from("playlist_items")
      .insert(itemsToInsert);

    if (insertError) {
      throw insertError;
    }

    return new Response(JSON.stringify({
      ok: true,
      added: newLessonIds.length,
      message: `Added ${newLessonIds.length} lesson${newLessonIds.length === 1 ? '' : 's'} to playlist`
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch (error) {
    console.error("[add-saved-lessons] Failed", error);
    return new Response(JSON.stringify({ error: "Failed to add lessons to playlist" }), {
      status: 500
    });
  }
}
