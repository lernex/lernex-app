import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import type { LevelMap } from "@/lib/learning-path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PathProgress = {
  deliveredByTopic?: Record<string, number>;
  deliveredIdsByTopic?: Record<string, string[]>;
  preferences?: { liked?: string[]; disliked?: string[]; saved?: string[] };
};

type PathWithProgress = LevelMap & { progress?: PathProgress };

export async function POST(req: NextRequest) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });

  const { subject, lesson_id, action } = await req.json().catch(() => ({} as Record<string, unknown>));
  if (typeof subject !== "string" || typeof lesson_id !== "string") {
    return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400 });
  }
  if (!["like","dislike","save"].includes(String(action))) {
    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400 });
  }

  const { data: state } = await sb
    .from("user_subject_state")
    .select("path")
    .eq("user_id", user.id)
    .eq("subject", subject)
    .maybeSingle();

  const path = state?.path as PathWithProgress | null;
  if (!path) return new Response(JSON.stringify({ error: "No learning path" }), { status: 400 });

  const progress: PathProgress = path.progress ?? {};
  progress.preferences = progress.preferences ?? {};
  const prefs = progress.preferences;
  const pushUnique = (arr: string[] | undefined, id: string) => {
    const a = arr ?? [];
    if (!a.includes(id)) a.push(id);
    return a.slice(-200);
  };

  if (action === "like") {
    prefs.liked = pushUnique(prefs.liked, lesson_id);
    // If previously disliked, remove it
    prefs.disliked = (prefs.disliked ?? []).filter((x) => x !== lesson_id);
  } else if (action === "dislike") {
    prefs.disliked = pushUnique(prefs.disliked, lesson_id);
    prefs.liked = (prefs.liked ?? []).filter((x) => x !== lesson_id);
  } else if (action === "save") {
    prefs.saved = pushUnique(prefs.saved, lesson_id);
  }

  const newPath: PathWithProgress = { ...path, progress };
  await sb
    .from("user_subject_state")
    .update({ path: newPath, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("subject", subject);

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
