"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type PlaylistRow = {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean | null;
  created_at: string | null;
};

type LessonLite = {
  id: string;
  title: string;
  subject: string;
};

type PlaylistItemRow = {
  id: string;
  position: number | null;
  lessons: LessonLite | null;
};

/** Raw shapes coming back from Supabase for the join */
type RawLesson = { id: unknown; title: unknown; subject: unknown } | null;
type RawItem = {
  id: unknown;
  position: unknown;
  lessons: RawLesson | RawLesson[] | null;
};

function toStr(v: unknown): string {
  return typeof v === "string" ? v : String(v ?? "");
}
function toNumOrNull(v: unknown): number | null {
  return typeof v === "number" ? v : v == null ? null : Number(v);
}
function toBoolOrNull(v: unknown): boolean | null {
  return v == null ? null : Boolean(v);
}
function normalizeLesson(l: RawLesson | RawLesson[] | null): LessonLite | null {
  const one: RawLesson | null = Array.isArray(l) ? (l[0] ?? null) : l;
  if (!one) return null;
  return {
    id: toStr((one as Record<string, unknown>).id),
    title: toStr((one as Record<string, unknown>).title),
    subject: toStr((one as Record<string, unknown>).subject),
  };
}

export default function PlaylistDetail() {
  const { id } = useParams<{ id: string }>();
  const [pl, setPl] = useState<PlaylistRow | null>(null);
  const [items, setItems] = useState<PlaylistItemRow[]>([]);
  const [savingPublic, setSavingPublic] = useState(false);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      // load playlist header
      const { data: p } = await supabase
        .from("playlists")
        .select("id, name, description, is_public, created_at")
        .eq("id", id)
        .maybeSingle();

      if (p) {
        const rec = p as unknown as Record<string, unknown>;
        const typed: PlaylistRow = {
          id: toStr(rec.id),
          name: toStr(rec.name),
          description: rec.description == null ? null : toStr(rec.description),
          is_public: toBoolOrNull(rec.is_public),
          created_at: rec.created_at == null ? null : toStr(rec.created_at),
        };
        setPl(typed);
      } else {
        setPl(null);
      }

      // load items with joined lesson fields
      const { data: it } = await supabase
        .from("playlist_items")
        .select("id, position, lessons(id, title, subject)")
        .eq("playlist_id", id)
        .order("position", { ascending: true });

      const raw: RawItem[] = (it ?? []) as unknown as RawItem[];
      const normalized: PlaylistItemRow[] = raw.map((row) => ({
        id: toStr(row.id),
        position: toNumOrNull(row.position),
        lessons: normalizeLesson(row.lessons),
      }));

      setItems(normalized);
    })();
  }, [id]);

  const share = async () => {
    if (!id) return;
    setSavingPublic(true);
    await supabase.from("playlists").update({ is_public: true }).eq("id", id);
    setSavingPublic(false);
    if (typeof window !== "undefined") {
      await navigator.clipboard.writeText(window.location.href);
      alert("Public link copied to clipboard!");
    }
    setPl((prev) => (prev ? { ...prev, is_public: true } : prev));
  };

  if (!pl) return <div className="p-6 text-white">Loading…</div>;

  return (
    <main className="min-h-[calc(100vh-56px)] flex items-center justify-center">
      <div className="w-full max-w-md px-4 py-6 space-y-3 text-white">
        <h1 className="text-xl font-semibold">{pl.name}</h1>
        <div className="text-sm text-neutral-400">
          {pl.is_public ? "Public" : "Private"}
        </div>

        <button
          onClick={share}
          disabled={savingPublic || pl.is_public === true}
          className="px-4 py-2 rounded-xl bg-lernex-green hover:bg-green-600 transition disabled:opacity-60"
        >
          {pl.is_public ? "Link is Public" : savingPublic ? "Making Public…" : "Share Public Link"}
        </button>

        <div className="grid gap-2 pt-3">
          {items.map((it) => (
            <div key={it.id} className="rounded-xl bg-neutral-900 border border-neutral-800 p-3">
              <div className="text-xs text-neutral-400">{it.lessons?.subject}</div>
              <div className="font-semibold">{it.lessons?.title}</div>
            </div>
          ))}
          {items.length === 0 && (
            <div className="text-neutral-400 text-sm">No lessons yet.</div>
          )}
        </div>
      </div>
    </main>
  );
}
