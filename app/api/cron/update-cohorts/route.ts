// app/api/cron/update-cohorts/route.ts
// Cron endpoint for updating user cohorts
// Should be called daily via cron service (e.g., Vercel Cron, GitHub Actions)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Database } from "@/lib/types_db";
import { runCohortBuilderJob, cleanupOldCohorts } from "@/lib/background-jobs/cohort-builder";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes max

/**
 * POST /api/cron/update-cohorts
 *
 * Requires CRON_SECRET in request header for authorization
 *
 * curl -X POST https://your-app.vercel.app/api/cron/update-cohorts \
 *   -H "Authorization: Bearer YOUR_CRON_SECRET"
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
    // Create Supabase client with service role key for admin operations
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

    console.log("[cron] Starting cohort update job...");
    const startTime = Date.now();

    // Run cohort builder
    await runCohortBuilderJob(supabase);

    // Cleanup old data
    await cleanupOldCohorts(supabase);

    const duration = Date.now() - startTime;
    console.log(`[cron] Cohort update job completed in ${duration}ms`);

    return NextResponse.json({
      success: true,
      duration,
      message: "Cohort update completed successfully",
    });
  } catch (error) {
    console.error("[cron] Cohort update job failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
