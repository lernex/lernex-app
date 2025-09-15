import type { SupabaseClient } from "@supabase/supabase-js";

export type LockResult = { acquired: boolean; supported: boolean; reason?: "busy" | "error" };

// Attempts to acquire a cross-instance generation lock using a DB row in
// table `generation_locks` with UNIQUE(user_id, subject).
// If the table does not exist, returns supported: false so callers can fall back.
export async function acquireGenLock(
  sb: SupabaseClient,
  uid: string,
  subject: string,
  ttlMs = 3 * 60_000
): Promise<LockResult> {
  const now = Date.now();
  try {
    const insert = await sb
      .from("generation_locks")
      .insert({ user_id: uid, subject, created_at: new Date(now).toISOString() });
    if (insert.error) {
      // Duplicate key likely means busy; try TTL takeover
      type PostgrestError = { code?: string; message: string };
      const code = (insert.error as PostgrestError)?.code ?? "";
      if (code === "42P01" || /relation .* does not exist/i.test(insert.error.message)) {
        return { acquired: false, supported: false };
      }
      if (code === "23505" || /duplicate key/i.test(insert.error.message)) {
        const { data: existing } = await sb
          .from("generation_locks")
          .select("created_at")
          .eq("user_id", uid)
          .eq("subject", subject)
          .maybeSingle();
        const createdAt = existing?.created_at ? +new Date(existing.created_at as unknown as string) : null;
        if (createdAt && now - createdAt > ttlMs) {
          // Stale lock; try to steal
          await sb
            .from("generation_locks")
            .delete()
            .eq("user_id", uid)
            .eq("subject", subject);
          const retry = await sb
            .from("generation_locks")
            .insert({ user_id: uid, subject, created_at: new Date(now).toISOString() });
          if (!retry.error) return { acquired: true, supported: true };
        }
        return { acquired: false, supported: true, reason: "busy" };
      }
      return { acquired: false, supported: true, reason: "error" };
    }
    return { acquired: true, supported: true };
  } catch (e: unknown) {
    const msg = (() => {
      const m = (e as { message?: unknown })?.message;
      return typeof m === "string" ? m : String(m ?? "");
    })();
    if (/relation .* does not exist/i.test(msg)) return { acquired: false, supported: false };
    return { acquired: false, supported: true, reason: "error" };
  }
}

export async function releaseGenLock(
  sb: SupabaseClient,
  uid: string,
  subject: string
) {
  try {
    await sb
      .from("generation_locks")
      .delete()
      .eq("user_id", uid)
      .eq("subject", subject);
  } catch {
    // ignore
  }
}

// SQL (run once) to create the locks table:
// create table if not exists generation_locks (
//   user_id uuid not null,
//   subject text not null,
//   created_at timestamptz not null default now(),
//   primary key (user_id, subject)
// );
