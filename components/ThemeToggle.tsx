"use client";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark";
type ThemePreference = "auto" | "light" | "dark";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [pending, setPending] = useState(false);
  const [currentPreference, setCurrentPreference] = useState<ThemePreference>("auto");

  useEffect(() => {
    setMounted(true);
    // Get the current preference from localStorage (using the new preference key)
    try {
      const stored = window.localStorage.getItem("lernex-theme-preference");
      if (stored === "auto" || stored === "light" || stored === "dark") {
        setCurrentPreference(stored);
      }
    } catch {
      // ignore
    }
  }, []);

  if (!mounted) return null;

  const current: ThemeMode = resolvedTheme === "light" ? "light" : "dark";

  // Cycle through: auto -> light -> dark -> auto
  const getNextPreference = (pref: ThemePreference): ThemePreference => {
    if (pref === "auto") return "light";
    if (pref === "light") return "dark";
    return "auto";
  };

  const handleToggle = () => {
    const next = getNextPreference(currentPreference);
    setCurrentPreference(next);

    // Save preference to localStorage (using the new preference key) and dispatch event
    try {
      window.localStorage.setItem("lernex-theme-preference", next);
      window.dispatchEvent(new CustomEvent('theme-preference-changed', {
        detail: { preference: next }
      }));
    } catch {
      // ignore
    }

    setPending(true);
    void fetch("/api/profile/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme_pref: next }),
    })
      .catch(() => undefined)
      .finally(() => setPending(false));
  };

  const getLabel = () => {
    if (currentPreference === "auto") return "Auto";
    if (currentPreference === "light") return "Light";
    return "Dark";
  };

  const getIcon = () => {
    if (currentPreference === "auto") return "🔄";
    if (current === "dark") return "🌞";
    return "🌙";
  };

  return (
    <button
      onClick={handleToggle}
      disabled={pending}
      className={`relative flex items-center gap-2 rounded-full bg-gradient-to-r from-lernex-blue via-blue-600 to-lernex-purple px-4 py-2 text-sm font-medium text-white shadow-md shadow-lernex-blue/25 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-lernex-blue/35 disabled:cursor-progress disabled:opacity-70 dark:shadow-lernex-blue/30 dark:hover:shadow-lernex-blue/40 ${className}`}
      title={`Theme: ${getLabel()} (click to cycle)`}
      aria-label={`Current theme: ${getLabel()}`}
    >
      <span aria-hidden="true" className="text-lg transition-transform duration-300 hover:rotate-12">
        {getIcon()}
      </span>
      <span>{getLabel()}</span>
    </button>
  );
}
