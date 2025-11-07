// app/api/cron/update-learning-styles/route.ts
// Cron endpoint for batch updating learning style profiles
// Should be called daily via cron service

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Database } from "@/lib/types_db";
import { updateLearningStyleProfile } from "@/lib/learning-style-detection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes max

/**
 * POST /api/cron/update-learning-styles
 *
 * Requires CRON_SECRET in request header for authorization
 */
export async function POST(req: NextRequest) {
  // Verify cron secret for security
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[cron] CRON_SECRET not configured");
    return NextResponse.json(
      { error: "Cron secret not configured" },
      { status: 500 }
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error("[cron] Invalid authorization");
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    // Create Supabase client with service role key
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_CUSTOM_URL ??
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    console.log("[cron] Starting learning style update job...");
    const startTime = Date.now();

    // Get all users with recent interaction signals (last 24 hours)
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const { data: recentSignals, error: signalsError } = await supabase
      .from("interaction_signals")
      .select("user_id, subject")
      .gte("created_at", oneDayAgo.toISOString())
      .limit(1000);

    if (signalsError) {
      console.error("[cron] Error fetching interaction signals:", signalsError);
      return NextResponse.json(
        { error: "Failed to fetch interaction signals" },
        { status: 500 }
      );
    }

    if (!recentSignals || recentSignals.length === 0) {
      console.log("[cron] No recent interaction signals found");
      return NextResponse.json({
        success: true,
        updated: 0,
        message: "No profiles to update",
      });
    }

    // Get unique user-subject pairs
    const uniquePairs = new Map<string, string>();
    for (const signal of recentSignals) {
      const key = `${signal.user_id}:${signal.subject}`;
      uniquePairs.set(key, signal.subject);
    }

    console.log(`[cron] Updating ${uniquePairs.size} learning style profiles...`);

    // Update profiles
    let updated = 0;
    for (const [key, subject] of uniquePairs.entries()) {
      const userId = key.split(":")[0]!;
      try {
        await updateLearningStyleProfile(supabase, userId, subject);
        updated++;
      } catch (error) {
        console.error(`[cron] Failed to update profile for ${userId}:`, error);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[cron] Learning style update job completed in ${duration}ms (${updated} profiles updated)`);

    return NextResponse.json({
      success: true,
      updated,
      duration,
      message: `Updated ${updated} learning style profiles`,
    });
  } catch (error) {
    console.error("[cron] Learning style update job failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
