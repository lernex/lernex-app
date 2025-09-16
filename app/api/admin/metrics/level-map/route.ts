import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Public metrics endpoint (dev-only): no auth required
export async function GET(req: NextRequest) {
  const sb = supabaseServer();

  const url = new URL(req.url);
  const daysParam = url.searchParams.get("days");
  const sinceParam = url.searchParams.get("since");
  const days = Math.max(1, Math.min(90, Number(daysParam ?? "7")));
  const since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - days * 24 * 3600_000);
  const sinceIso = since.toISOString();

  const metricModels = ["metric/level-map-attempts", "metric/level_map_attempts", "metric/level-map/attempts"];
  type Row = { model: string; input_tokens: number | null; output_tokens: number | null; created_at: string };
  const { data, error } = await sb
    .from("usage_logs")
    .select("model, input_tokens, output_tokens, created_at")
    .in("model", metricModels)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data as Row[] | null ?? []).map((r: Row) => ({
    model: r.model,
    attempts: (r.input_tokens ?? 0) | 0,
    fallbackUsed: (r.output_tokens ?? 0) | 0,
    created_at: r.created_at,
  }));

  const totalRecords = rows.length;
  const totalAttempts = rows.reduce((s, r) => s + r.attempts, 0);
  const totalFallbacks = rows.reduce((s, r) => s + (r.fallbackUsed > 0 ? 1 : 0), 0);
  const avgAttempts = totalRecords ? totalAttempts / totalRecords : 0;
  const fallbackRate = totalRecords ? totalFallbacks / totalRecords : 0;

  const byDayMap = new Map<string, { records: number; attempts: number; fallbacks: number }>();
  for (const r of rows) {
    const day = r.created_at?.slice(0, 10) ?? "unknown";
    const cur = byDayMap.get(day) ?? { records: 0, attempts: 0, fallbacks: 0 };
    cur.records += 1;
    cur.attempts += r.attempts;
    cur.fallbacks += r.fallbackUsed > 0 ? 1 : 0;
    byDayMap.set(day, cur);
  }
  const byDay = Array.from(byDayMap.entries()).map(([date, v]) => ({
    date,
    records: v.records,
    attempts: v.attempts,
    fallbacks: v.fallbacks,
    avgAttempts: v.records ? v.attempts / v.records : 0,
    fallbackRate: v.records ? v.fallbacks / v.records : 0,
  }));

  return NextResponse.json({
    since: sinceIso,
    windowDays: daysParam ? days : undefined,
    totalRecords,
    totalAttempts,
    avgAttempts,
    totalFallbacks,
    fallbackRate,
    byDay,
  });
}
