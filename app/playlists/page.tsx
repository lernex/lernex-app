"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

type PlaylistRow = {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean | null;
  created_at: string | null;
};

export default function Playlists() {
  const [rows, setRows] = useState<PlaylistRow[]>([]);
  const [name, setName] = useState("");

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    const { data, error } = await supabase
      .from("playlists")
      .select("id, name, description, is_public, created_at")
      .order("created_at", { ascending: false });

    if (!error && data) setRows(data as PlaylistRow[]);
  }

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await supabase.from("playlists").insert({ name: trimmed });
    setName("");
    await refresh();
  }

  return (
    <main className="min-h-[calc(100vh-56px)] flex items-center justify-center text-neutral-900 dark:text-white">
      <div className="w-full max-w-md px-4 py-6 space-y-4">
        <h1 className="text-xl font-semibold">Your Playlists</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Create sets of lessons to study and share with friends.</p>

        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 px-3 py-2 rounded-xl bg-white border border-neutral-300 outline-none text-neutral-900 dark:bg-neutral-800 dark:border-neutral-700 dark:text-white"
            placeholder="Exam Prep: Algebra I"
          />
          <button
            onClick={create}
            className="px-4 py-2 rounded-xl bg-lernex-blue hover:bg-blue-500 transition text-white"
          >
            Create
          </button>
        </div>

        <div className="grid gap-2">
          {rows.map((p) => (
            <Link
              key={p.id}
              href={`/playlists/${p.id}`}
              className="rounded-xl bg-white border border-neutral-200 p-3 hover:bg-neutral-100 text-neutral-900 dark:bg-neutral-900 dark:border-neutral-800 dark:hover:bg-neutral-800 dark:text-white"
            >
              <div className="font-semibold">{p.name}</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                {p.is_public ? "Public" : "Private"}
              </div>
            </Link>
          ))}
          {rows.length === 0 && (
            <div className="text-sm text-neutral-500 dark:text-neutral-400">No playlists yet — create your first above.</div>
          )}
        </div>
      </div>
    </main>
  );
}
