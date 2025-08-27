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
      className={`relative flex items-center gap-2 rounded-md bg-lernex-blue px-3 py-1 text-sm text-white shadow-sm transition-transform hover:scale-105 hover:bg-lernex-blue/90 ${className}`}
      title="Toggle theme"
    >
      <span aria-hidden="true" className="text-lg">
        {current === "dark" ? "🌞" : "🌙"}
      </span>
      <span>{current === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}