// app/api/fyp/complete/route.ts
// Handle lesson completion and cleanup pending lessons

import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { removePendingLesson, cleanupStalePendingLessons } from "@/lib/pending-lessons";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401 });
  }

  const uid = user.id;
  const reqId = Math.random().toString(36).slice(2, 8);

  try {
    const body = await req.json();
    const subject = typeof body.subject === "string" ? body.subject : null;
    const lessonId = typeof body.lessonId === "string" ? body.lessonId : null;

    if (!subject) {
      return new Response(
        JSON.stringify({ error: "Missing subject" }),
        { status: 400 }
      );
    }

    console.debug(`[fyp-complete][${reqId}] begin`, {
      uid: uid.slice(0, 8),
      subject,
      lessonId,
    });

    // Remove the completed lesson from pending queue (position 0)
    const removed = await removePendingLesson(sb, uid, subject, 0);

    if (removed) {
      console.debug(`[fyp-complete][${reqId}] removed pending lesson`, {
        subject,
        position: 0,
      });
    }

    // Opportunistically clean up stale pending lessons (older than 7 days)
    const cleanedCount = await cleanupStalePendingLessons(sb, uid, 7);
    if (cleanedCount > 0) {
      console.debug(`[fyp-complete][${reqId}] cleaned stale lessons`, {
        cleanedCount,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        removed,
        cleanedStale: cleanedCount,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    console.error(`[fyp-complete][${reqId}] error:`, msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
