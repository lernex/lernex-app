"use client";
import { ThemeProvider as NextThemes, useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

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

    // Always apply initialTheme immediately if provided (from server-side user profile)
    if (initialTheme) {
      applyTheme(initialTheme);
      return () => {
        cancelled = true;
      };
    }

    // If no initialTheme (user not logged in), check localStorage
    const stored = getStoredTheme();
    if (stored) {
      applyTheme(stored);
    } else {
      // No stored preference and no user preference - default to dark
      applyTheme("dark");
    }

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
  // Determine the theme to use on mount (avoids browser preference override)
  const [mountTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return sanitizedInitial ?? "dark";
    const stored = getStoredTheme();
    return sanitizedInitial ?? stored ?? "dark";
  });

  return (
    <NextThemes
      attribute="class"
      defaultTheme={mountTheme}
      enableSystem={false}
      storageKey={STORAGE_KEY}
      disableTransitionOnChange
    >
      <SyncThemeFromProfile initialTheme={sanitizedInitial} />
      {children}
    </NextThemes>
  );
}
