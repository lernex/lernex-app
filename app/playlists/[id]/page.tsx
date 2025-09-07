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
  const [renaming, setRenaming] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LessonLite[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

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

  const saveName = async () => {
    if (!id || renaming == null) return;
    const name = renaming.trim();
    if (!name) return;
    await supabase.from("playlists").update({ name }).eq("id", id);
    setPl((prev) => (prev ? { ...prev, name } : prev));
    setRenaming(null);
  };

  const search = async () => {
    if (!query.trim()) { setResults([]); return; }
    setLoadingSearch(true);
    const { data } = await supabase
      .from("lessons")
      .select("id, title, subject")
      .or(`title.ilike.%${query}%,subject.ilike.%${query}%`)
      .limit(10);
    setResults((data as unknown as LessonLite[]) ?? []);
    setLoadingSearch(false);
  };

  const addLesson = async (lessonId: string) => {
    if (!id) return;
    const nextPos = (items[items.length - 1]?.position ?? 0) + 1;
    await supabase.from("playlist_items").insert({ playlist_id: id, lesson_id: lessonId, position: nextPos });
    // refresh items
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
  };

  const removeItem = async (itemId: string) => {
    await supabase.from("playlist_items").delete().eq("id", itemId);
    setItems((prev) => prev.filter((x) => x.id !== itemId));
  };

  const move = async (itemId: string, dir: -1 | 1) => {
    const idx = items.findIndex((x) => x.id === itemId);
    if (idx === -1) return;
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= items.length) return;
    const a = items[idx];
    const b = items[swapIdx];
    const aPos = a.position ?? 0;
    const bPos = b.position ?? 0;
    await supabase.from("playlist_items").update({ position: bPos }).eq("id", a.id);
    await supabase.from("playlist_items").update({ position: aPos }).eq("id", b.id);
    const arr = items.slice();
    arr[idx] = b; arr[swapIdx] = a;
    setItems(arr);
  };

  if (!pl) return <div className="p-6 text-neutral-900 dark:text-white">Loading…</div>;

  return (
    <main className="min-h-[calc(100vh-56px)] flex items-center justify-center text-neutral-900 dark:text-white">
      <div className="w-full max-w-md px-4 py-6 space-y-3">
        <div className="flex items-center gap-2">
          {renaming !== null ? (
            <>
              <input value={renaming} onChange={(e) => setRenaming(e.target.value)} className="flex-1 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white" />
              <button onClick={saveName} className="rounded-xl bg-lernex-blue px-3 py-2 text-white">Save</button>
              <button onClick={() => setRenaming(null)} className="rounded-xl border border-neutral-300 px-3 py-2 dark:border-neutral-700">Cancel</button>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold flex-1">{pl.name}</h1>
              <button onClick={() => setRenaming(pl.name)} className="rounded-xl border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700">Rename</button>
            </>
          )}
        </div>
        <div className="text-sm text-neutral-500 dark:text-neutral-400">
          {pl.is_public ? "Public" : "Private"}
        </div>

        <button
          onClick={share}
          disabled={savingPublic || pl.is_public === true}
          className="px-4 py-2 rounded-xl bg-lernex-green hover:bg-green-600 transition disabled:opacity-60"
        >
          {pl.is_public ? "Link is Public" : savingPublic ? "Making Public…" : "Share Public Link"}
        </button>

        {/* Search and add lessons */}
        <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
          <div className="text-sm font-medium mb-2">Add lessons</div>
          <div className="flex gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title or subject" className="flex-1 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white" />
            <button onClick={search} disabled={loadingSearch} className="rounded-xl bg-lernex-blue px-3 py-2 text-white disabled:opacity-60">{loadingSearch ? "Searching…" : "Search"}</button>
          </div>
          {results.length > 0 && (
            <div className="mt-2 grid gap-2 max-h-56 overflow-auto">
              {results.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-xl border border-neutral-200 p-2 dark:border-neutral-800">
                  <div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">{r.subject}</div>
                    <div className="font-medium">{r.title}</div>
                  </div>
                  <button onClick={() => addLesson(r.id)} className="rounded-lg bg-lernex-blue px-2 py-1 text-sm text-white">Add</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-2 pt-3">
          {items.map((it) => (
            <div key={it.id} className="rounded-xl bg-white border border-neutral-200 p-3 dark:bg-neutral-900 dark:border-neutral-800">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">{it.lessons?.subject}</div>
                  <div className="font-semibold">{it.lessons?.title}</div>
                </div>
                <div className="flex gap-2 text-sm">
                  <button onClick={() => move(it.id, -1)} className="rounded-lg border border-neutral-300 px-2 py-1 dark:border-neutral-700">↑</button>
                  <button onClick={() => move(it.id, 1)} className="rounded-lg border border-neutral-300 px-2 py-1 dark:border-neutral-700">↓</button>
                  <button onClick={() => removeItem(it.id)} className="rounded-lg border border-red-300 px-2 py-1 text-red-600 dark:border-red-700">Remove</button>
                </div>
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <div className="text-neutral-500 dark:text-neutral-400 text-sm">No lessons yet.</div>
          )}
        </div>
      </div>
    </main>
  );
}
