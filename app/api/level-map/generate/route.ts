import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { ensureLearningPath } from "@/lib/learning-path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";

  const bodyText = await req.text();
  let body: { subject?: string | null; force?: boolean } = {};
  try { body = bodyText ? JSON.parse(bodyText) : {}; } catch {}
  const onlySubject = body.subject ?? null;
  const force = !!body.force;

  const { data: prof } = await sb
    .from("profiles")
    .select("interests, level_map")
    .eq("id", user.id)
    .maybeSingle();
  const interests: string[] = Array.isArray(prof?.interests) ? (prof!.interests as string[]) : [];
  const levelMap = (prof?.level_map || {}) as Record<string, string>;

  const targets = interests
    .filter((s) => levelMap[s])
    .filter((s) => !onlySubject || s === onlySubject)
    .map((s) => ({ subject: s, course: levelMap[s]! }));

  if (!targets.length) return new Response(JSON.stringify({ error: "No subject/course to generate" }), { status: 400 });

  const results: { subject: string; ok: boolean; error?: string }[] = [];
  for (const t of targets) {
    // Subject-specific mastery from attempts if available, else fallback
    const { data: attempts } = await sb
      .from("attempts")
      .select("subject, correct_count, total, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    let correct = 0, total = 0;
    (attempts ?? []).forEach((a) => {
      if (!a.subject || a.subject === t.subject) {
        correct += a.correct_count ?? 0;
        total += a.total ?? 0;
      }
    });
    const mastery = total > 0 ? Math.round((correct / total) * 100) : 50;

    const now = Date.now();
    const recent = (attempts ?? []).filter((a) => a.created_at && (now - +new Date(a.created_at)) < 72 * 3600_000);
    const pace = recent.length >= 12 ? "fast" : recent.length >= 4 ? "normal" : "slow";
    const notes = `Learner pace: ${pace}. Personalized for ${t.subject}. Use more real-world examples for engineering contexts when relevant.`;

    try {
      if (!force) {
        // Skip generation if a valid path already exists
        const { data: existing } = await sb
          .from("user_subject_state")
          .select("path, course")
          .eq("user_id", user.id)
          .eq("subject", t.subject)
          .maybeSingle();
        const p0 = existing?.path as unknown;
        const valid = p0 && typeof p0 === "object" && Array.isArray((p0 as any).topics) && (p0 as any).topics.length > 0;
        if (valid && existing?.course === t.course) {
          results.push({ subject: t.subject, ok: true });
          continue;
        }
      }

      await ensureLearningPath(sb, user.id, ip, t.subject, t.course, mastery, notes);
      results.push({ subject: t.subject, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Server error";
      results.push({ subject: t.subject, ok: false, error: msg });
    }
  }

  return new Response(JSON.stringify({ results }), { status: 200, headers: { "content-type": "application/json" } });
}
