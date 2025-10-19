import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logUsage } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sb = supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400 });
  }

  const stage = typeof (body as { stage?: unknown }).stage === "string" ? String((body as { stage: unknown }).stage) : null;
  const duration = Number((body as { durationMs?: unknown }).durationMs);
  const subject = typeof (body as { subject?: unknown }).subject === "string" ? String((body as { subject?: unknown }).subject) : null;
  const status = Number.isFinite((body as { status?: unknown }).status) ? Number((body as { status?: unknown }).status) : null;

  if (!stage || !Number.isFinite(duration)) {
    return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400 });
  }

  if (user) {
    await logUsage(
      sb,
      user.id,
      null,
      "client/fyp-latency",
      { input_tokens: null, output_tokens: null },
      {
        metadata: {
          feature: "fyp-lesson",
          kind: "latency",
          stage,
          durationMs: Math.round(duration),
          subject,
          status,
        },
      },
    );
  }

  return new Response(null, { status: 204 });
}
