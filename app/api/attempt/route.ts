import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { lesson_id, subject, topic, correct_count, total } = await req.json();

    if (!lesson_id || typeof correct_count !== "number" || typeof total !== "number") {
      return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400 });
    }

    const cookieStore = await cookies(); // ✅ Next 15 expects await here
    const accessToken = cookieStore.get("sb-access-token")?.value ?? "";

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const sb = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const { data: auth } = await sb.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });

    const { error } = await sb.from("attempts").insert({
      user_id: uid,
      lesson_id,
      subject: typeof subject === "string" ? subject : null,
      correct_count,
      total,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    // Update profile points + streak
    const today = new Date().toISOString().slice(0,10);
    const { data: prof } = await sb
      .from("profiles")
      .select("points, streak, last_study_date")
      .eq("id", uid)
      .maybeSingle();
    const last = (prof?.last_study_date as string | null) ?? null;
    let newStreak = 1;
    if (last) {
      const d0 = new Date(today);
      const d1 = new Date(last);
      const diff = Math.floor((+d0 - +d1)/86400000);
      if (diff === 0) newStreak = (prof?.streak as number | null) ?? 1;
      else newStreak = diff === 1 ? (((prof?.streak as number | null) ?? 0) + 1) : 1;
    }
    const addPts = Math.max(0, Number(correct_count) || 0) * 10;
    await sb.from("profiles").update({
      last_study_date: today,
      streak: newStreak,
      points: ((prof?.points as number | null) ?? 0) + addPts,
      updated_at: new Date().toISOString(),
    }).eq("id", uid);

    // Progress update: mark completion and advance to next subtopic when appropriate
    if (typeof subject === 'string' && typeof topic === 'string') {
      const { data: state } = await sb
        .from('user_subject_state')
        .select('path, next_topic')
        .eq('user_id', uid)
        .eq('subject', subject)
        .maybeSingle();
      type Sub = { name: string; mini_lessons: number; completed?: boolean };
      type Topic = { name: string; completed?: boolean; subtopics?: Sub[] };
      type Progress = { topicIdx?: number; subtopicIdx?: number; deliveredMini?: number };
      const path = state?.path as { topics?: Topic[]; progress?: Progress } | null;
      const topics = path?.topics ?? [];
      const [tName, sName] = topic.split('>').map((x: string) => x.trim());
      const ti = topics.findIndex((t) => t?.name === tName);
      if (ti >= 0) {
        const subs = (topics[ti]?.subtopics ?? []) as Sub[];
        const si = subs.findIndex((s) => s?.name === sName);
        if (si >= 0) {
          const cur = subs[si]!;
          const planned = Math.max(1, Number(cur.mini_lessons || 1));
          const prog = (path?.progress ?? {}) as Progress;
          const curDelivered = Math.max(0, Number(prog.deliveredMini ?? 0));
          let deliveredMini = curDelivered + 1; // increment on quiz finish
          let topicIdx = typeof prog.topicIdx === 'number' ? prog.topicIdx : ti;
          let subtopicIdx = typeof prog.subtopicIdx === 'number' ? prog.subtopicIdx : si;
          let nextTopicStr: string | null = `${tName} > ${sName}`;
          if (deliveredMini >= planned) {
            deliveredMini = 0;
            subs[si] = { ...cur, completed: true };
            topics[ti] = { ...(topics[ti] ?? {}), subtopics: subs, completed: subs.every((s) => s.completed === true) };
            // Find next incomplete
            let found: [number, number] | null = null;
            for (let tj = ti; tj < topics.length && !found; tj++) {
              const ss = (topics[tj]?.subtopics ?? []) as Sub[];
              for (let sj = (tj === ti ? si + 1 : 0); sj < ss.length; sj++) {
                if (ss[sj]?.completed !== true) { found = [tj, sj]; break; }
              }
            }
            if (!found) {
              for (let tj = 0; tj < ti && !found; tj++) {
                const ss = (topics[tj]?.subtopics ?? []) as Sub[];
                for (let sj = 0; sj < ss.length; sj++) {
                  if (ss[sj]?.completed !== true) { found = [tj, sj]; break; }
                }
              }
            }
            if (found) {
              topicIdx = found[0];
              subtopicIdx = found[1];
              const nt = topics[topicIdx];
              const ns = (nt?.subtopics ?? [])[subtopicIdx];
              if (nt && ns) nextTopicStr = `${nt.name} > ${ns.name}`;
            } else {
              nextTopicStr = null;
            }
          }
          const newPath = { ...(path ?? {}), topics, progress: { ...(path?.progress ?? {}), topicIdx, subtopicIdx, deliveredMini } };
          await sb
            .from('user_subject_state')
            .update({ next_topic: nextTopicStr, path: newPath, updated_at: new Date().toISOString() })
            .eq('user_id', uid)
            .eq('subject', subject);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, addPts, newStreak }), { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
