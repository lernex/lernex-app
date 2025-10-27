import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

/**
 * GET /api/lesson-history
 *
 * Fetches lesson history for the authenticated user
 *
 * Query params:
 * - limit: number (default 50) - max number of lessons to return
 * - offset: number (default 0) - pagination offset
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await supabaseServer();

    // Get authenticated user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse query params
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    // Fetch lesson history
    const { data: history, error } = await supabase
      .from("lesson_history")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("[lesson-history] Error fetching history:", error);
      return NextResponse.json(
        { error: "Failed to fetch lesson history" },
        { status: 500 }
      );
    }

    return NextResponse.json({ history: history || [] });
  } catch (error) {
    console.error("[lesson-history] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

/**
 * POST /api/lesson-history
 *
 * Saves a lesson to history
 *
 * Request body:
 * - lesson: Lesson object
 * - subject: string
 * - topic: string (optional)
 * - mode: string (optional)
 * - audioUrl: string (optional)
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await supabaseServer();

    // Get authenticated user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await req.json();
    const { lesson, subject, topic, mode, audioUrl } = body;

    if (!lesson || typeof lesson !== "object") {
      return NextResponse.json(
        { error: "lesson is required and must be an object" },
        { status: 400 }
      );
    }

    // Insert lesson into history
    const { data: insertedLesson, error } = await supabase
      .from("lesson_history")
      // @ts-expect-error - Supabase types not yet generated for lesson_history table
      .insert({
        user_id: user.id,
        lesson_data: lesson,
        subject: subject || null,
        topic: topic || null,
        mode: mode || null,
        audio_url: audioUrl || null,
      })
      .select()
      .single();

    if (error) {
      console.error("[lesson-history] Error saving lesson:", error);
      return NextResponse.json(
        { error: "Failed to save lesson to history" },
        { status: 500 }
      );
    }

    return NextResponse.json({ lesson: insertedLesson });
  } catch (error) {
    console.error("[lesson-history] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

/**
 * DELETE /api/lesson-history?id=<lesson_id>
 *
 * Deletes a lesson from history
 */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await supabaseServer();

    // Get authenticated user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse query params
    const { searchParams } = new URL(req.url);
    const lessonId = searchParams.get("id");

    if (!lessonId) {
      return NextResponse.json(
        { error: "lesson id is required" },
        { status: 400 }
      );
    }

    // Delete lesson from history
    const { error } = await supabase
      .from("lesson_history")
      .delete()
      .eq("id", lessonId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[lesson-history] Error deleting lesson:", error);
      return NextResponse.json(
        { error: "Failed to delete lesson from history" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[lesson-history] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
