import { supabase } from "./supabase";

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

export async function bumpStreakAndPoints(pointsToAdd: number) {
  const session = await getSession();
  const uid = session?.user?.id;
  if (!uid) return;
  const today = new Date().toISOString().slice(0,10);
  // get current
  const { data: prof } = await supabase
    .from("profiles")
    .select("streak, points, last_study_date")
    .eq("id", uid)
    .maybeSingle();

  const last = prof?.last_study_date as string | null;
  let newStreak = 1;
  if (last) {
    const d0 = new Date(today);
    const d1 = new Date(last);
    const diff = Math.floor((+d0 - +d1) / 86400000);
    if (diff === 0) newStreak = prof?.streak ?? 1;
    else newStreak = diff === 1 ? ((prof?.streak ?? 0) + 1) : 1;
  }
  await supabase
    .from("profiles")
    .update({
      last_study_date: today,
      streak: newStreak,
      points: (prof?.points ?? 0) + pointsToAdd,
      updated_at: new Date().toISOString(),
    })
    .eq("id", uid);
}
