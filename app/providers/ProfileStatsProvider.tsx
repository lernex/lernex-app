"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PostgrestError, SupabaseClient, User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { normalizeProfileStats, type ProfileStats } from "@/lib/profile-stats";

type ProfileStatsContextValue = {
  user: User | null | undefined;
  userId: string | null;
  stats: ProfileStats | null;
  loading: boolean;
  error: PostgrestError | Error | null;
  refresh: () => Promise<void>;
  setStats: (next: ProfileStats | null) => void;
};

const ProfileStatsContext = createContext<ProfileStatsContextValue | undefined>(undefined);

function startOfUTCDay(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

async function ensureStreakForToday(
  supabase: SupabaseClient,
  userId: string,
  stats: ProfileStats
): Promise<ProfileStats> {
  const todayStr = isoToday();
  const today = new Date();
  const last = stats.lastStudyDate;
  let shouldUpdate = false;
  let nextStreak = stats.streak > 0 ? stats.streak : 0;

  if (!last) {
    nextStreak = Math.max(1, nextStreak || 1);
    shouldUpdate = true;
  } else {
    const lastDate = new Date(last);
    if (!Number.isFinite(lastDate.getTime())) {
      nextStreak = Math.max(1, nextStreak || 1);
      shouldUpdate = true;
    } else {
      const diff = Math.floor(
        (startOfUTCDay(today) - startOfUTCDay(lastDate)) / 86400000
      );
      if (diff === 0) {
        if (nextStreak <= 0) {
          nextStreak = 1;
          shouldUpdate = true;
        }
      } else if (diff === 1) {
        nextStreak = Math.max(nextStreak + 1, 1);
        shouldUpdate = true;
      } else if (diff > 1) {
        nextStreak = 1;
        shouldUpdate = true;
      }
    }
  }

  if (!shouldUpdate) return stats;

  const updatedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("profiles")
    .update({
      last_study_date: todayStr,
      streak: nextStreak,
      updated_at: updatedAt,
    })
    .eq("id", userId)
    .select("points, streak, last_study_date, updated_at")
    .maybeSingle();

  if (error) {
    console.warn("[profile-stats] ensureStreakForToday update failed", error);
    return stats;
  }

  return normalizeProfileStats((data as Record<string, unknown> | null | undefined) ?? null);
}

export function ProfileStatsProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [stats, setStatsState] = useState<ProfileStats | null>(null);
  const [error, setError] = useState<PostgrestError | Error | null>(null);
  const [fetching, setFetching] = useState(false);

  const userId = user?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) setUser(data.session?.user ?? null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err);
          setUser(null);
        }
      });
    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      if (!cancelled) setUser(session?.user ?? null);
    });
    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  const refresh = useCallback(async () => {
    if (!userId) {
      setStatsState(null);
      setFetching(false);
      return;
    }
    setFetching(true);
    try {
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("points, streak, last_study_date, updated_at")
        .eq("id", userId)
        .maybeSingle();
      if (profileError) throw profileError;

      let normalized = normalizeProfileStats((data as Record<string, unknown> | null | undefined) ?? null);
      if (data) {
        try {
          normalized = await ensureStreakForToday(supabase, userId, normalized);
        } catch (streakErr) {
          console.warn("[profile-stats] ensureStreakForToday error", streakErr);
        }
      }
      setStatsState(normalized);
      setError(null);
    } catch (err) {
      setError(err as PostgrestError | Error);
      setStatsState(null);
    } finally {
      setFetching(false);
    }
  }, [supabase, userId]);

  useEffect(() => {
    if (user === undefined) return;
    refresh().catch(() => {});
  }, [user, refresh]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`profiles-stats-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${userId}` }, (payload) => {
        const next = payload.new as Record<string, unknown> | null | undefined;
        setStatsState(normalizeProfileStats(next ?? null));
      });
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  useEffect(() => {
    if (!userId) {
      setStatsState(null);
    }
  }, [userId]);

  const setStats = useCallback((next: ProfileStats | null) => {
    setStatsState(next);
  }, []);

  const value = useMemo<ProfileStatsContextValue>(
    () => ({
      user,
      userId,
      stats,
      loading: fetching || user === undefined,
      error,
      refresh,
      setStats,
    }),
    [user, userId, stats, fetching, error, refresh, setStats]
  );

  return <ProfileStatsContext.Provider value={value}>{children}</ProfileStatsContext.Provider>;
}

export function useProfileStats() {
  const ctx = useContext(ProfileStatsContext);
  if (!ctx) throw new Error("useProfileStats must be used within ProfileStatsProvider");
  return ctx;
}

export type { ProfileStats };
