import { supabase } from "./supabase";
import { normalizeProfileStats, type ProfileStats, computeStreakAfterActivity } from "./profile-stats";

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

export async function ensureProfile() {
  const session = await getSession();
  const uid = session?.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
  if (error) throw error;
  if (!data) {
    const { data: created, error: e2 } = await supabase
      .from("profiles")
      .insert({ id: uid, total_cost: 0 })
      .select()
      .maybeSingle();
    if (e2) throw e2;
    return created;
  }
  return data;
}

export async function bumpStreakAndPoints(pointsToAdd: number): Promise<ProfileStats | null> {
  const session = await getSession();
  const uid = session?.user?.id;
  if (!uid) return null;
  const now = new Date();
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);

  const { data: prof, error: loadError } = await supabase
    .from("profiles")
    .select("streak, points, last_study_date")
    .eq("id", uid)
    .maybeSingle();
  if (loadError) throw loadError;

  const current = normalizeProfileStats((prof as Record<string, unknown> | null | undefined) ?? null);
  const last = current.lastStudyDate;
  const newStreak = computeStreakAfterActivity(current.streak, last, now);

  const updatePayload = {
    last_study_date: today,
    streak: newStreak,
    points: current.points + pointsToAdd,
    updated_at: nowIso,
  };

  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update(updatePayload)
    .eq("id", uid)
    .select("points, streak, last_study_date, updated_at")
    .maybeSingle();
  if (updateError) throw updateError;

  return normalizeProfileStats((updated as Record<string, unknown> | null | undefined) ?? null);
}
