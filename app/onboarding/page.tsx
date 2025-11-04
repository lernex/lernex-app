// app/onboarding/page.tsx (client component)
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DOMAINS } from "@/data/domains";

function OnboardingInterestsContent() {
  const [sel, setSel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const select = (d: string) => {
    setSel(d === sel ? null : d);
  };

  const save = async () => {
    if (!sel) return;
    setSaving(true);
    const res = await fetch("/api/profile/interests/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ interests: [sel] }),
    });
    setSaving(false);
    if (res.ok) router.replace("/post-auth"); // ✅ central router decides next step
  };

  return (
    <main className="min-h-screen grid place-items-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-neutral-900 dark:via-neutral-800 dark:to-neutral-900 text-neutral-900 dark:text-white transition-all duration-500">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-neutral-200 bg-white/80 backdrop-blur-sm px-6 py-8 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900/80 animate-fade-in">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent animate-slide-down">
            Choose Your First Subject
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 animate-slide-up">
            Pick one subject to get started. You can add more subjects later from your dashboard!
          </p>
        </div>

        <div className="grid gap-3 animate-stagger-in">
          {DOMAINS.map((d, idx) => (
            <button
              key={d}
              onClick={() => select(d)}
              style={{ animationDelay: `${idx * 50}ms` }}
              className={`rounded-xl border px-4 py-3 text-left font-medium transition-all duration-300 transform hover:scale-[1.02] hover:shadow-lg animate-fade-in-item ${
                sel === d
                  ? "bg-gradient-to-r from-blue-600 to-purple-600 border-transparent text-white shadow-lg scale-[1.02]"
                  : "bg-white border-neutral-300 text-neutral-900 hover:bg-neutral-50 dark:bg-neutral-800 dark:border-neutral-600 dark:text-white dark:hover:bg-neutral-700"
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        <button
          onClick={save}
          disabled={!sel || saving}
          className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 py-3 font-semibold text-white transition-all duration-300 transform hover:scale-[1.02] hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
        >
          {saving ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Saving…
            </span>
          ) : (
            "Continue"
          )}
        </button>
      </div>
    </main>
  );
}

export default function OnboardingInterests() {
  return (
    <ErrorBoundary>
      <OnboardingInterestsContent />
    </ErrorBoundary>
  );
}
