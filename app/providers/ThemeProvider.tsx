"use client";
import { ThemeProvider as NextThemes, useTheme } from "next-themes";
import { useEffect, useRef } from "react";

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

function getStoredTheme(): ThemeMode | null {
  if (typeof window === "undefined") return null;
  try {
    return sanitizeTheme(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function persistTheme(value: ThemeMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}

function SyncThemeFromProfile({ initialTheme }: { initialTheme?: ThemeMode | null }) {
  const { setTheme } = useTheme();
  const themeSetterRef = useRef(setTheme);

  useEffect(() => {
    themeSetterRef.current = setTheme;
  }, [setTheme]);

  useEffect(() => {
    migrateLegacyStorage();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const applyTheme = (next: ThemeMode) => {
      if (cancelled) return;
      themeSetterRef.current(next);
      persistTheme(next);
    };

    let stored = getStoredTheme();

    if (!stored && initialTheme) {
      applyTheme(initialTheme);
      stored = initialTheme;
    }

    (async () => {
      try {
        const res = await fetch("/api/profile/me", { cache: "no-store" });
        if (!res.ok) return;
        const me = await res.json();
        const pref = sanitizeTheme(me?.theme_pref ?? null);
        if (!pref || pref === stored || cancelled) return;
        applyTheme(pref);
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialTheme]);

  return null;
}

export default function ThemeProvider({
  children,
  initialTheme,
}: {
  children: React.ReactNode;
  initialTheme?: ThemeMode | null;
}) {
  const sanitizedInitial = initialTheme ? sanitizeTheme(initialTheme) : null;

  return (
    <NextThemes
      attribute="class"
      defaultTheme={sanitizedInitial ?? "dark"}
      enableSystem={false}
      storageKey={STORAGE_KEY}
    >
      <SyncThemeFromProfile initialTheme={sanitizedInitial} />
      {children}
    </NextThemes>
  );
}
