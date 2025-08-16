"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function PlaylistDetail() {
  const { id } = useParams<{ id: string }>();
  const [pl, setPl] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => { (async () => {
    const { data: p } = await supabase.from("playlists").select("*").eq("id", id).maybeSingle();
    setPl(p);
    const { data: it } = await supabase.from("playlist_items")
      .select("id, position, lessons(id, title, subject)")
      .eq("playlist_id", id)
      .order("position", { ascending: true });
    setItems(it ?? []);
  })(); }, [id]);

  const share = async () => {
    await supabase.from("playlists").update({ is_public: true }).eq("id", id);
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(location.href);
      alert("Public link copied!");
    }
  };

  if (!pl) return <div className="p-6">Loading…</div>;

  return (
    <main className="min-h-[calc(100vh-56px)] flex items-center justify-center">
      <div className="w-full max-w-md px-4 py-6 space-y-3">
        <h1 className="text-xl font-semibold">{pl.name}</h1>
        <button onClick={share} className="px-4 py-2 rounded-xl bg-lernex-green">Share public link</button>
        <div className="grid gap-2">
          {items.map((it) => (
            <div key={it.id} className="rounded-xl bg-neutral-900 border border-neutral-800 p-3">
              <div className="text-xs text-neutral-400">{it.lessons?.subject}</div>
              <div className="font-semibold">{it.lessons?.title}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
