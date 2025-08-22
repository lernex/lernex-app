// app/onboarding/page.tsx (client component)
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DOMAINS } from "@/data/domains";

export default function OnboardingInterests() {
  const [sel, setSel] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const toggle = (d: string) =>
    setSel((arr) => (arr.includes(d) ? arr.filter((x) => x !== d) : [...arr, d]));

  const save = async () => {
    setSaving(true);
    const res = await fetch("/api/profile/interests/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ interests: sel }),
    });
    setSaving(false);
    if (res.ok) router.replace("/post-auth"); // ✅ central router decides next step
  };

  return (
    <main className="min-h-screen grid place-items-center text-white">
      <div className="w-full max-w-md px-4 py-6 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4">
        <h1 className="text-2xl font-bold">Pick your subjects</h1>
        <div className="grid gap-2">
          {DOMAINS.map((d) => (
            <button
              key={d}
              onClick={() => toggle(d)}
              className={`px-3 py-2 rounded-xl border ${
                sel.includes(d) ? "bg-lernex-blue border-lernex-blue" : "bg-neutral-800 border-neutral-700"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <button onClick={save} disabled={!sel.length || saving}
          className="w-full py-3 rounded-xl bg-lernex-blue disabled:opacity-60">
          {saving ? "Saving…" : "Continue"}
        </button>
      </div>
    </main>
  );
}
