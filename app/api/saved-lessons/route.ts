import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const url = new URL(req.url);
  const subject = url.searchParams.get("subject");

  try {
    let query = sb
      .from("saved_lessons")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (subject) {
      query = query.eq("subject", subject);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify({ lessons: data ?? [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch (error) {
    console.error("[saved-lessons] Failed to fetch", error);
    return new Response(JSON.stringify({ error: "Failed to fetch saved lessons" }), {
      status: 500
    });
  }
}

export async function POST(req: NextRequest) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  try {
    const payload = await req.json();
    const { lesson } = payload;

    if (!lesson || !lesson.id || !lesson.subject || !lesson.title || !lesson.content) {
      return new Response(JSON.stringify({ error: "Invalid lesson data" }), { status: 400 });
    }

    const { data, error } = await sb
      .from("saved_lessons")
      .upsert({
        user_id: user.id,
        lesson_id: lesson.id,
        subject: lesson.subject,
        topic: lesson.topic,
        title: lesson.title,
        content: lesson.content,
        difficulty: lesson.difficulty,
        questions: lesson.questions ?? [],
        context: lesson.context,
        knowledge: lesson.knowledge,
      }, {
        onConflict: "user_id,lesson_id",
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify({ saved: data }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch (error) {
    console.error("[saved-lessons] Failed to save", error);
    return new Response(JSON.stringify({ error: "Failed to save lesson" }), {
      status: 500
    });
  }
}

export async function DELETE(req: NextRequest) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const url = new URL(req.url);
  const lessonId = url.searchParams.get("lesson_id");

  if (!lessonId) {
    return new Response(JSON.stringify({ error: "lesson_id is required" }), { status: 400 });
  }

  try {
    const { error } = await sb
      .from("saved_lessons")
      .delete()
      .eq("user_id", user.id)
      .eq("lesson_id", lessonId);

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch (error) {
    console.error("[saved-lessons] Failed to delete", error);
    return new Response(JSON.stringify({ error: "Failed to delete saved lesson" }), {
      status: 500
    });
  }
}
