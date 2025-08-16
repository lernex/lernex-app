"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

export default function Playlists() {
  const [rows, setRows] = useState<any[]>([]);
  const [name, setName] = useState("");

  useEffect(() => { refresh(); }, []);
  async function refresh() {
    const { data } = await supabase.from("playlists").select("*").order("created_at", { ascending: false });
    setRows(data ?? []);
  }
  async function create() {
    if (!name.trim()) return;
    await supabase.from("playlists").insert({ name });
    setName(""); refresh();
  }

  return (
    <main className="min-h-[calc(100vh-56px)] flex items-center justify-center">
      <div className="w-full max-w-md px-4 py-6 space-y-4">
        <h1 className="text-xl font-semibold">Your Playlists</h1>
        <div className="flex gap-2">
          <input value={name} onChange={(e)=>setName(e.target.value)}
            className="flex-1 px-3 py-2 rounded-xl bg-neutral-800 border border-neutral-700 outline-none"
            placeholder="Exam Prep: Algebra I" />
          <button onClick={create} className="px-4 py-2 rounded-xl bg-lernex-blue">Create</button>
        </div>

        <div className="grid gap-2">
          {rows.map((p) => (
            <Link key={p.id} href={`/playlists/${p.id}`} className="rounded-xl bg-neutral-900 border border-neutral-800 p-3 hover:bg-neutral-800">
              {p.name} {p.is_public ? <span className="text-xs text-green-400">(public)</span> : null}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
