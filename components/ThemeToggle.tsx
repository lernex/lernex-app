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
      className={`relative flex items-center gap-2 rounded-md bg-lernex-blue px-3 py-1 text-sm text-white shadow-sm transition-transform hover:scale-105 hover:bg-lernex-blue/90 disabled:cursor-progress disabled:opacity-70 ${className}`}
      title={`Theme: ${getLabel()} (click to cycle)`}
      aria-label={`Current theme: ${getLabel()}`}
    >
      <span aria-hidden="true" className="text-lg">
        {getIcon()}
      </span>
      <span>{getLabel()}</span>
    </button>
  );
}
