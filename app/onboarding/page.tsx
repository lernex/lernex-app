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
    <main className="min-h-screen grid place-items-center bg-gradient-to-br from-neutral-50 to-neutral-200 text-neutral-900 dark:from-neutral-900 dark:to-neutral-800 dark:text-white">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-neutral-200 bg-white px-4 py-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="text-2xl font-bold">Pick your subjects</h1>
        <div className="grid gap-2">
          {DOMAINS.map((d) => (
            <button
              key={d}
              onClick={() => toggle(d)}
              className={`rounded-xl border px-3 py-2 transition-colors ${
                sel.includes(d)
                  ? "bg-lernex-blue border-lernex-blue text-white"
                  : "bg-white border-neutral-300 text-neutral-900 hover:bg-neutral-100 dark:bg-neutral-800 dark:border-neutral-700 dark:text-white dark:hover:bg-neutral-700"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <button
          onClick={save}
          disabled={!sel.length || saving}
          className="w-full rounded-xl bg-lernex-blue py-3 transition hover:bg-blue-500 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Continue"}
        </button>
      </div>
    </main>
  );
}
