"use client";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const current = theme === "system" ? systemTheme : theme;
  return (
    <button
      onClick={() => setTheme(current === "dark" ? "light" : "dark")}
      className={`relative flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-100 px-3 py-1 text-sm text-neutral-900 shadow-sm transition-transform hover:scale-105 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white ${className}`}
      title="Toggle theme"
    >
      <span aria-hidden="true" className="text-lg">
        {current === "dark" ? "🌞" : "🌙"}
      </span>
      <span>{current === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}