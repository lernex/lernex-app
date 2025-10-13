"use client";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const current: ThemeMode = resolvedTheme === "light" ? "light" : "dark";
  const next: ThemeMode = current === "dark" ? "light" : "dark";

  const handleToggle = () => {
    setTheme(next);
    setPending(true);
    void fetch("/api/profile/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme_pref: next }),
    })
      .catch(() => undefined)
      .finally(() => setPending(false));
  };

  return (
    <button
      onClick={handleToggle}
      disabled={pending}
      className={`relative flex items-center gap-2 rounded-md bg-lernex-blue px-3 py-1 text-sm text-white shadow-sm transition-transform hover:scale-105 hover:bg-lernex-blue/90 disabled:cursor-progress disabled:opacity-70 ${className}`}
      title="Toggle theme"
      aria-pressed={current === "light"}
    >
      <span aria-hidden="true" className="text-lg">
        {current === "dark" ? "🌞" : "🌙"}
      </span>
      <span>{current === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}
