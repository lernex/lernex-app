// lib/pending-lessons.ts
// Helper functions for managing pre-generated pending lessons

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lesson } from "./schema";

export type PendingLesson = {
  id: string;
  user_id: string;
  subject: string;
  topic_label: string;
  lesson: Lesson;
  model_speed: "fast" | "slow";
  generation_tier: "free" | "plus" | "premium";
  position: number;
  created_at: string;
  updated_at: string;
};

/**
 * Get the next pending lesson for a user and subject.
 * Returns the lesson at position 0 (the immediate next lesson).
 */
export async function getNextPendingLesson(
  sb: SupabaseClient,
  userId: string,
  subject: string
): Promise<PendingLesson | null> {
  try {
    const { data, error } = await sb
      .from("user_pending_lessons")
      .select("*")
      .eq("user_id", userId)
      .eq("subject", subject)
      .eq("position", 0)
      .maybeSingle();

    if (error) {
      console.error("[pending-lessons] getNextPendingLesson error:", error);
      return null;
    }

    return data as PendingLesson | null;
  } catch (err) {
    console.error("[pending-lessons] getNextPendingLesson exception:", err);
    return null;
  }
}

/**
 * Get all pending lessons for a user and subject, ordered by position.
 */
export async function getAllPendingLessons(
  sb: SupabaseClient,
  userId: string,
  subject: string
): Promise<PendingLesson[]> {
  try {
    const { data, error } = await sb
      .from("user_pending_lessons")
      .select("*")
      .eq("user_id", userId)
      .eq("subject", subject)
      .order("position", { ascending: true });

    if (error) {
      console.error("[pending-lessons] getAllPendingLessons error:", error);
      return [];
    }

    return (data as PendingLesson[]) ?? [];
  } catch (err) {
    console.error("[pending-lessons] getAllPendingLessons exception:", err);
    return [];
  }
}

/**
 * Count pending lessons for a user and subject.
 */
export async function countPendingLessons(
  sb: SupabaseClient,
  userId: string,
  subject: string
): Promise<number> {
  try {
    const { data, error, count } = await sb
      .from("user_pending_lessons")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("subject", subject);

    if (error) {
      console.error("[pending-lessons] countPendingLessons error:", error);
      return 0;
    }

    return count ?? 0;
  } catch (err) {
    console.error("[pending-lessons] countPendingLessons exception:", err);
    return 0;
  }
}

/**
 * Store a new pending lesson.
 * Automatically assigns the next available position.
 */
export async function storePendingLesson(
  sb: SupabaseClient,
  userId: string,
  subject: string,
  topicLabel: string,
  lesson: Lesson,
  modelSpeed: "fast" | "slow",
  generationTier: "free" | "plus" | "premium"
): Promise<PendingLesson | null> {
  try {
    // Get current max position
    const { data: maxData } = await sb
      .from("user_pending_lessons")
      .select("position")
      .eq("user_id", userId)
      .eq("subject", subject)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextPosition = maxData ? (maxData.position ?? 0) + 1 : 0;

    const { data, error } = await sb
      .from("user_pending_lessons")
      .insert({
        user_id: userId,
        subject,
        topic_label: topicLabel,
        lesson,
        model_speed: modelSpeed,
        generation_tier: generationTier,
        position: nextPosition,
      })
      .select()
      .single();

    if (error) {
      console.error("[pending-lessons] storePendingLesson error:", error);
      return null;
    }

    console.debug("[pending-lessons] stored lesson", {
      userId: userId.slice(0, 8),
      subject,
      position: nextPosition,
      modelSpeed,
      lessonId: lesson.id,
    });

    return data as PendingLesson;
  } catch (err) {
    console.error("[pending-lessons] storePendingLesson exception:", err);
    return null;
  }
}

/**
 * Remove a pending lesson and shift all subsequent positions down.
 * This is called when a lesson is completed.
 */
export async function removePendingLesson(
  sb: SupabaseClient,
  userId: string,
  subject: string,
  position: number = 0
): Promise<boolean> {
  try {
    // Delete the lesson at the specified position
    const { error: deleteError } = await sb
      .from("user_pending_lessons")
      .delete()
      .eq("user_id", userId)
      .eq("subject", subject)
      .eq("position", position);

    if (deleteError) {
      console.error("[pending-lessons] removePendingLesson delete error:", deleteError);
      return false;
    }

    // Shift down all subsequent positions
    const { data: remaining, error: fetchError } = await sb
      .from("user_pending_lessons")
      .select("id, position")
      .eq("user_id", userId)
      .eq("subject", subject)
      .gt("position", position)
      .order("position", { ascending: true });

    if (fetchError) {
      console.error("[pending-lessons] removePendingLesson fetch error:", fetchError);
      return false;
    }

    if (remaining && remaining.length > 0) {
      // Update positions for remaining lessons
      for (const item of remaining) {
        const newPosition = item.position - 1;
        const { error: updateError } = await sb
          .from("user_pending_lessons")
          .update({ position: newPosition, updated_at: new Date().toISOString() })
          .eq("id", item.id);

        if (updateError) {
          console.error("[pending-lessons] removePendingLesson update error:", updateError);
        }
      }
    }

    console.debug("[pending-lessons] removed lesson", {
      userId: userId.slice(0, 8),
      subject,
      position,
      shiftedCount: remaining?.length ?? 0,
    });

    return true;
  } catch (err) {
    console.error("[pending-lessons] removePendingLesson exception:", err);
    return false;
  }
}

/**
 * Clear all pending lessons for a user and subject.
 * Useful for reset scenarios or when curriculum changes.
 */
export async function clearAllPendingLessons(
  sb: SupabaseClient,
  userId: string,
  subject: string
): Promise<boolean> {
  try {
    const { error } = await sb
      .from("user_pending_lessons")
      .delete()
      .eq("user_id", userId)
      .eq("subject", subject);

    if (error) {
      console.error("[pending-lessons] clearAllPendingLessons error:", error);
      return false;
    }

    console.debug("[pending-lessons] cleared all lessons", {
      userId: userId.slice(0, 8),
      subject,
    });

    return true;
  } catch (err) {
    console.error("[pending-lessons] clearAllPendingLessons exception:", err);
    return false;
  }
}

/**
 * Clean up stale pending lessons (older than 7 days).
 * This prevents accumulation of old lessons if user changes subjects.
 */
export async function cleanupStalePendingLessons(
  sb: SupabaseClient,
  userId: string,
  maxAgeDays: number = 7
): Promise<number> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

    const { data, error } = await sb
      .from("user_pending_lessons")
      .delete()
      .eq("user_id", userId)
      .lt("created_at", cutoffDate.toISOString())
      .select("id");

    if (error) {
      console.error("[pending-lessons] cleanupStalePendingLessons error:", error);
      return 0;
    }

    const deletedCount = data?.length ?? 0;
    if (deletedCount > 0) {
      console.debug("[pending-lessons] cleaned up stale lessons", {
        userId: userId.slice(0, 8),
        deletedCount,
        maxAgeDays,
      });
    }

    return deletedCount;
  } catch (err) {
    console.error("[pending-lessons] cleanupStalePendingLessons exception:", err);
    return 0;
  }
}
