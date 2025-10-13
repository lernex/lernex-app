"use client";
import { ThemeProvider as NextThemes, useTheme } from "next-themes";
import { useEffect } from "react";

const STORAGE_KEY = "lernex-theme";
const LEGACY_STORAGE_KEY = "theme";
type ThemeMode = "light" | "dark";

const sanitizeTheme = (value: string | null): ThemeMode | null =>
  value === "light" || value === "dark" ? value : null;

function migrateLegacyStorage() {
  if (typeof window === "undefined") return;
  try {
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy == null) return;
    const next = sanitizeTheme(legacy);
    if (next) {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* no-op */
  }
}

function SyncThemeFromProfile() {
  const { setTheme } = useTheme();

  useEffect(() => {
    migrateLegacyStorage();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const stored = (() => {
      try {
        return sanitizeTheme(window.localStorage.getItem(STORAGE_KEY));
      } catch {
        return null;
      }
    })();
    if (stored) return;

    (async () => {
      try {
        const res = await fetch("/api/profile/me", { cache: "no-store" });
        if (!res.ok) return;
        const me = await res.json();
        const pref = sanitizeTheme(me?.theme_pref ?? null);
        if (!pref || cancelled) return;
        setTheme(pref);
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setTheme]);

  return null;
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="dark" enableSystem={false} storageKey={STORAGE_KEY}>
      <SyncThemeFromProfile />
      {children}
    </NextThemes>
  );
}
