import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
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

    const cookieStore = await cookies();
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_CUSTOM_URL ??
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    );
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

      const buildAttempt = (includeSubject: boolean): Database["public"]["Tables"]["attempts"]["Insert"] => ({
        ...baseAttempt,
        ...(includeSubject && subjectValue ? { subject: subjectValue } : {}),
      });

      let includeSubject = !!subjectValue;
      let attemptPayload = buildAttempt(includeSubject);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let { error: insertError } = await supabase.from("attempts").insert(attemptPayload as any);
      if (insertError?.code === "PGRST204" && includeSubject) {
        console.warn("[api/attempt] subject column missing; retrying without subject");
        includeSubject = false;
        attemptPayload = buildAttempt(includeSubject);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ error: insertError } = await supabase.from("attempts").insert(attemptPayload as any));
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
      type ProfileData = { points?: number | null; streak?: number | null; last_study_date?: string | null } | null;
      const profileData = prof as ProfileData;
      const currentPoints = profileData?.points ?? 0;
      const last = profileData?.last_study_date ?? null;
      const previousStreak = profileData?.streak ?? 0;
      const resolvedStreak = computeStreakAfterActivity(previousStreak, last, now);
      newStreak = resolvedStreak;
      addPts = units * perCorrect;
      // TypeScript has issues with the profiles table type, using any to bypass
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profile, error: updateError } = await (supabase as any)
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
        .select("path")
        .eq("user_id", uid)
        .eq("subject", progressSubject)
        .maybeSingle();
      type Subtopic = { name: string; mini_lessons: number; completed?: boolean };
      type TopicEntry = { name: string; subtopics?: Subtopic[] };
      type StateData = { path?: { topics?: TopicEntry[] } } | null;
      const stateData = state as StateData;
      const path = stateData?.path ?? null;
      const topics = path?.topics ?? [];
      const [rawTopic, rawSubtopic] = topic.split(">").map((x: string) => x.trim());
      const ti = topics.findIndex((t) => t?.name === rawTopic);
      if (ti < 0) {
        console.warn("[api/attempt] topic not found for progress update", { topic });
      } else {
        const subs = (topics[ti]?.subtopics ?? []) as Subtopic[];
        const si = subs.findIndex((s) => s?.name === rawSubtopic);
        if (si < 0) {
          console.warn("[api/attempt] subtopic not found for progress update", { topic });
        } else {
          const current = subs[si]!;
          const planned = Math.max(1, Number(current.mini_lessons || 1));
          const label = `${rawTopic} > ${rawSubtopic}`;

          const { data: progressRow } = await supabase
            .from("user_subject_progress")
            .select("topic_idx, subtopic_idx, delivered_mini, completion_map")
            .eq("user_id", uid)
            .eq("subject", progressSubject)
            .maybeSingle();

          type ProgressData = { topic_idx?: number; subtopic_idx?: number; delivered_mini?: number; completion_map?: Record<string, boolean> } | null;
          const progressData = progressRow as ProgressData;
          const completionMapRaw = progressData?.completion_map ?? {};
          const completionMap: Record<string, boolean> = { ...completionMapRaw };
          const prevDeliveredMini = typeof progressData?.delivered_mini === "number" && Number.isFinite(progressData.delivered_mini)
            ? progressData.delivered_mini
            : 0;
          let deliveredMini = prevDeliveredMini + 1;
          let topicIdx = typeof progressData?.topic_idx === "number" ? progressData.topic_idx : ti;
          let subtopicIdx = typeof progressData?.subtopic_idx === "number" ? progressData.subtopic_idx : si;

          let completedThisSubtopic = false;
          if (deliveredMini >= planned) {
            deliveredMini = 0;
            completedThisSubtopic = true;
          }
          completionMap[label] = completedThisSubtopic;

          const isCompleted = (topicName: string, subtopicName: string, fallback?: boolean) => {
            const key = `${topicName} > ${subtopicName}`;
            if (typeof completionMap[key] === "boolean") return completionMap[key] === true;
            return fallback === true;
          };

          const findNextIncomplete = () => {
            for (let tj = ti; tj < topics.length; tj++) {
              const topicEntry = topics[tj];
              if (!topicEntry) continue;
              const subtopics = topicEntry.subtopics ?? [];
              const start = tj === ti ? si + 1 : 0;
              for (let sj = start; sj < subtopics.length; sj++) {
                const subEntry = subtopics[sj];
                if (!subEntry) continue;
                if (!isCompleted(topicEntry.name, subEntry.name, (subEntry as { completed?: boolean }).completed)) {
                  return { topicIdx: tj, subtopicIdx: sj, label: `${topicEntry.name} > ${subEntry.name}` };
                }
              }
            }
            for (let tj = 0; tj < topics.length; tj++) {
              const topicEntry = topics[tj];
              if (!topicEntry) continue;
              const subtopics = topicEntry.subtopics ?? [];
              for (let sj = 0; sj < subtopics.length; sj++) {
                if (tj === ti && sj <= si) continue;
                const subEntry = subtopics[sj];
                if (!subEntry) continue;
                if (!isCompleted(topicEntry.name, subEntry.name, (subEntry as { completed?: boolean }).completed)) {
                  return { topicIdx: tj, subtopicIdx: sj, label: `${topicEntry.name} > ${subEntry.name}` };
                }
              }
            }
            return null as null;
          };

          let nextTopicStr: string | null = label;
          if (completedThisSubtopic) {
            const next = findNextIncomplete();
            if (next) {
              topicIdx = next.topicIdx;
              subtopicIdx = next.subtopicIdx;
              nextTopicStr = next.label;
            } else {
              nextTopicStr = null;
            }
          }

          const rpcPayload: Record<string, unknown> = {
            p_subject: progressSubject,
            p_topic_idx: topicIdx,
            p_subtopic_idx: subtopicIdx,
            p_delivered_mini_delta: 1,
            p_completion_patch: { [label]: completedThisSubtopic },
          };
          if (completedThisSubtopic) {
            rpcPayload.p_delivered_mini = 0;
          }

          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any).rpc("apply_user_subject_progress_patch", rpcPayload);
          } catch (progressErr) {
            console.error("[api/attempt] progress patch failed", progressErr);
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: stateUpdateError } = await (supabase as any)
            .from("user_subject_state")
            .update({ next_topic: nextTopicStr, updated_at: new Date().toISOString() })
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
