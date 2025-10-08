import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/lib/types_db";
import { computeStreakAfterActivity } from "@/lib/profile-stats";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown> | null;
    const {
      lesson_id,
      subject,
      topic,
      correct_count,
      total,
      event,
      skip_points,
      correct_increment,
      points_per_correct,
    } = (body ?? {}) as {
      lesson_id?: unknown;
      subject?: unknown;
      topic?: unknown;
      correct_count?: unknown;
      total?: unknown;
      event?: unknown;
      skip_points?: unknown;
      correct_increment?: unknown;
      points_per_correct?: unknown;
    };

    const supabase = createRouteHandlerClient<Database>({ cookies });
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) {
      console.warn("[api/attempt] unauthorized: missing user session");
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
    }

    const subjectValue = typeof subject === "string" && subject.trim().length ? subject.trim() : null;

    type EventType = "lesson-finish" | "question-correct";
    const rawEvent = typeof event === "string" ? event : null;
    const eventType: EventType = rawEvent === "question-correct" ? "question-correct" : "lesson-finish";
    const skipPoints = eventType === "lesson-finish" && skip_points === true;

    let correctCountNumber = 0;

    if (eventType === "lesson-finish") {
      const lessonIdRaw = typeof lesson_id === "string" ? lesson_id.trim() : "";
      if (!lessonIdRaw || typeof correct_count !== "number" || typeof total !== "number") {
        return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400 });
      }
      correctCountNumber = Number(correct_count);
      const normalizedLessonId = UUID_PATTERN.test(lessonIdRaw) ? lessonIdRaw : null;
      const lessonSlug = normalizedLessonId ? null : lessonIdRaw;
      if (!normalizedLessonId && lessonSlug) {
        console.info("[api/attempt] non-uuid lesson id; storing without lesson_id", { slug: lessonSlug });
      }

      const totalNumber = Number(total);
      const baseAttempt: Database["public"]["Tables"]["attempts"]["Insert"] = {
        user_id: uid,
        lesson_id: normalizedLessonId,
        correct_count: correctCountNumber,
        total: totalNumber,
      };

      const buildAttempt = (includeSubject: boolean) => ({
        ...baseAttempt,
        ...(includeSubject && subjectValue ? { subject: subjectValue } : {}),
      });

      let includeSubject = !!subjectValue;
      let attemptPayload = buildAttempt(includeSubject);
      let { error: insertError } = await supabase.from("attempts").insert(attemptPayload);
      if (insertError?.code === "PGRST204" && includeSubject) {
        console.warn("[api/attempt] subject column missing; retrying without subject");
        includeSubject = false;
        attemptPayload = buildAttempt(includeSubject);
        ({ error: insertError } = await supabase.from("attempts").insert(attemptPayload));
      }
      if (insertError) {
        console.error("[api/attempt] attempts insert failed", insertError);
        return new Response(
          JSON.stringify({ error: insertError.message, hint: insertError.hint ?? null }),
          { status: 500 }
        );
      }
    } else {
      correctCountNumber = typeof correct_count === "number" ? Number(correct_count) : 0;
    }

    const perCorrect =
      typeof points_per_correct === "number" && Number.isFinite(points_per_correct) && points_per_correct > 0
        ? Number(points_per_correct)
        : 10;

    const rawUnitsValue =
      eventType === "question-correct"
        ? Number(typeof correct_increment === "number" ? correct_increment : 1)
        : Number(correctCountNumber);
    const units = Number.isFinite(rawUnitsValue) ? Math.max(0, Math.floor(rawUnitsValue)) : 0;
    const shouldAwardPoints = !skipPoints && units > 0;

    let addPts = 0;
    let updatedProfile: Record<string, unknown> | null = null;
    let newStreak: number | null = null;

    if (shouldAwardPoints) {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const nowIso = now.toISOString();
      const { data: prof } = await supabase
        .from("profiles")
        .select("points, streak, last_study_date")
        .eq("id", uid)
        .maybeSingle();
      const currentPoints = (prof?.points as number | null) ?? 0;
      const last = (prof?.last_study_date as string | null) ?? null;
      const previousStreak = (prof?.streak as number | null) ?? 0;
      const resolvedStreak = computeStreakAfterActivity(previousStreak, last, now);
      newStreak = resolvedStreak;
      addPts = units * perCorrect;
      const { data: profile, error: updateError } = await supabase
        .from("profiles")
        .update({
          last_study_date: today,
          streak: resolvedStreak,
          points: currentPoints + addPts,
          updated_at: nowIso,
        })
        .eq("id", uid)
        .select("points, streak, last_study_date, updated_at")
        .maybeSingle();
      if (updateError) {
        console.error("[api/attempt] profiles update failed", updateError);
        return new Response(
          JSON.stringify({ error: updateError.message, hint: updateError.hint ?? null }),
          { status: 500 }
        );
      }
      updatedProfile = profile ?? null;
    }

    const progressSubject = subjectValue ?? (typeof subject === "string" ? subject : null);
    if (eventType === "lesson-finish" && progressSubject && typeof topic === "string") {
      const { data: state } = await supabase
        .from("user_subject_state")
        .select("path, next_topic")
        .eq("user_id", uid)
        .eq("subject", progressSubject)
        .maybeSingle();
      type Sub = { name: string; mini_lessons: number; completed?: boolean };
      type TopicEntry = { name: string; completed?: boolean; subtopics?: Sub[] };
      type Progress = { topicIdx?: number; subtopicIdx?: number; deliveredMini?: number };
      const path = state?.path as { topics?: TopicEntry[]; progress?: Progress } | null;
      const topics = path?.topics ?? [];
      const [tName, sName] = topic.split(">").map((x: string) => x.trim());
      const ti = topics.findIndex((t) => t?.name === tName);
      if (ti >= 0) {
        const subs = (topics[ti]?.subtopics ?? []) as Sub[];
        const si = subs.findIndex((s) => s?.name === sName);
        if (si >= 0) {
          const cur = subs[si]!;
          const planned = Math.max(1, Number(cur.mini_lessons || 1));
          const prog = (path?.progress ?? {}) as Progress;
          const curDelivered = Math.max(0, Number(prog.deliveredMini ?? 0));
          let deliveredMini = curDelivered + 1;
          let topicIdx = typeof prog.topicIdx === "number" ? prog.topicIdx : ti;
          let subtopicIdx = typeof prog.subtopicIdx === "number" ? prog.subtopicIdx : si;
          let nextTopicStr: string | null = `${tName} > ${sName}`;
          if (deliveredMini >= planned) {
            deliveredMini = 0;
            subs[si] = { ...cur, completed: true };
            topics[ti] = {
              ...(topics[ti] ?? {}),
              subtopics: subs,
              completed: subs.every((s) => s.completed === true),
            };
            let found: [number, number] | null = null;
            for (let tj = ti; tj < topics.length && !found; tj++) {
              const ss = (topics[tj]?.subtopics ?? []) as Sub[];
              for (let sj = tj === ti ? si + 1 : 0; sj < ss.length; sj++) {
                if (ss[sj]?.completed !== true) {
                  found = [tj, sj];
                  break;
                }
              }
            }
            if (!found) {
              for (let tj = 0; tj < ti && !found; tj++) {
                const ss = (topics[tj]?.subtopics ?? []) as Sub[];
                for (let sj = 0; sj < ss.length; sj++) {
                  if (ss[sj]?.completed !== true) {
                    found = [tj, sj];
                    break;
                  }
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
          const newPath = {
            ...(path ?? {}),
            topics,
            progress: { ...(path?.progress ?? {}), topicIdx, subtopicIdx, deliveredMini },
          };
          const { error: stateUpdateError } = await supabase
            .from("user_subject_state")
            .update({ next_topic: nextTopicStr, path: newPath, updated_at: new Date().toISOString() })
            .eq("user_id", uid)
            .eq("subject", progressSubject);
          if (stateUpdateError) {
            console.error("[api/attempt] user_subject_state update failed", stateUpdateError);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        addPts,
        newStreak: (updatedProfile?.streak as number | null) ?? newStreak,
        profile: updatedProfile ?? null,
      }),
      { status: 200 }
    );
  } catch (err) {
    console.error("[api/attempt] unexpected error", err);
    const msg = err instanceof Error ? err.message : "Server error";
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
