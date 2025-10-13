"use client";
import { ThemeProvider as NextThemes, useTheme } from "next-themes";
import { useEffect } from "react";

const STORAGE_KEY = "lernex-theme";
const LEGACY_STORAGE_KEY = "theme";
type ThemeMode = "light" | "dark";

const sanitizeTheme = (value: string | null): ThemeMode | null =>
  value === "light" || value === "dark" ? value : null;

const readStoredTheme = (): ThemeMode | null => {
  if (typeof window === "undefined") return null;
  try {
    return sanitizeTheme(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
};

function SyncThemeFromProfile() {
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy != null) {
        const migrated = sanitizeTheme(legacy);
        if (migrated) {
          window.localStorage.setItem(STORAGE_KEY, migrated);
        }
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const stored = readStoredTheme();
    if (!stored) {
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(STORAGE_KEY, "dark");
        } catch {}
      }
      if (resolvedTheme !== "dark") setTheme("dark");
      return;
    }
    if (stored !== resolvedTheme) {
      setTheme(stored);
    }
  }, [resolvedTheme, setTheme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const initialStored = (() => {
      try {
        return window.localStorage.getItem(STORAGE_KEY);
      } catch {
        return null;
      }
    })();

    (async () => {
      try {
        const res = await fetch("/api/profile/me", { cache: "no-store" });
        if (!res.ok) return;
        const me = await res.json();
        const pref = sanitizeTheme(me?.theme_pref ?? null);
        if (!pref || cancelled) return;

        const currentStored = (() => {
          try {
            return window.localStorage.getItem(STORAGE_KEY);
          } catch {
            return null;
          }
        })();

        if (currentStored && currentStored !== initialStored) {
          return;
        }
        if (currentStored === pref) {
          return;
        }
        setTheme(pref);
      } catch {}
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
