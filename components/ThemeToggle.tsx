"use client";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const current = theme === "system" ? systemTheme : theme;
  return (
    <button
      onClick={() => setTheme(current === "dark" ? "light" : "dark")}
      className="px-3 py-1 rounded-lg border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-sm"
      title="Toggle theme"
    >
      {current === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}