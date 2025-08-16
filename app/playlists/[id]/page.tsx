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

type PlaylistItemRow = {
  id: string;
  position: number | null;
  lessons: {
    id: string;
    title: string;
    subject: string;
  } | null;
};

export default function PlaylistDetail() {
  const { id } = useParams<{ id: string }>();
  const [pl, setPl] = useState<PlaylistRow | null>(null);
  const [items, setItems] = useState<PlaylistItemRow[]>([]);
  const [savingPublic, setSavingPublic] = useState(false);

  useEffect(() => {
  if (!id) return;
  void (async () => {
    // load playlist
    const { data: p } = await supabase
      .from("playlists")
      .select("id, name, description, is_public, created_at")
      .eq("id", id)
      .maybeSingle();
    setPl((p as PlaylistRow) ?? null);

    // load items with joined lesson fields
    const { data: it } = await supabase
      .from("playlist_items")
      .select("id, position, lessons(id, title, subject)")
      .eq("playlist_id", id)
      .order("position", { ascending: true });

    // Normalize: some drivers return lessons as an array; we want a single object
    const normalized: PlaylistItemRow[] = (it ?? []).map((row: any) => {
      const l = Array.isArray(row.lessons) ? row.lessons[0] ?? null : row.lessons ?? null;
      return {
        id: String(row.id),
        position: typeof row.position === "number" ? row.position : (row.position ?? 0),
        lessons: l
          ? {
              id: String(l.id),
              title: String(l.title),
              subject: String(l.subject),
            }
          : null,
      };
    });

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
    // reflect UI
    setPl((prev) => (prev ? { ...prev, is_public: true } : prev));
  };

  if (!pl) return <div className="p-6 text-white">Loading…</div>;

  return (
    <main className="min-h-[calc(100vh-56px)] flex items-center justify-center">
      <div className="w-full max-w-md px-4 py-6 space-y-3 text-white">
        <h1 className="text-xl font-semibold">{pl.name}</h1>
        <div className="text-sm text-neutral-400">{pl.is_public ? "Public" : "Private"}</div>

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
