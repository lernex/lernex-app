"use client";
import { ThemeProvider as NextThemes, useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "lernex-theme";
const LEGACY_STORAGE_KEY = "theme";
type ThemeMode = "light" | "dark";
type ThemePreference = "auto" | "light" | "dark";

const sanitizeTheme = (value: string | null): ThemeMode | null =>
  value === "light" || value === "dark" ? value : null;

const sanitizeThemePreference = (value: string | null): ThemePreference | null =>
  value === "auto" || value === "light" || value === "dark" ? value : null;

// Get browser's preferred color scheme
const getBrowserPreference = (): ThemeMode => {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

// Resolve preference to actual theme
const resolveTheme = (preference: ThemePreference | null): ThemeMode => {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  // "auto" or null - use browser preference
  return getBrowserPreference();
};

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

function getStoredPreference(): ThemePreference | null {
  if (typeof window === "undefined") return null;
  try {
    return sanitizeThemePreference(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function persistPreference(value: ThemePreference) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}

function SyncThemeFromProfile({ initialPreference }: { initialPreference?: ThemePreference | null }) {
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

    const applyPreference = (preference: ThemePreference) => {
      if (cancelled) return;
      const resolvedTheme = resolveTheme(preference);
      themeSetterRef.current(resolvedTheme);
      persistPreference(preference);
    };

    // Always apply initialPreference immediately if provided (from server-side user profile)
    if (initialPreference) {
      applyPreference(initialPreference);

      // If preference is "auto", listen for system theme changes
      if (initialPreference === "auto") {
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const handleChange = () => {
          if (!cancelled) {
            themeSetterRef.current(getBrowserPreference());
          }
        };
        mediaQuery.addEventListener("change", handleChange);
        return () => {
          cancelled = true;
          mediaQuery.removeEventListener("change", handleChange);
        };
      }

      return () => {
        cancelled = true;
      };
    }

    // If no initialPreference (user not logged in), check localStorage
    const stored = getStoredPreference();
    if (stored) {
      applyPreference(stored);

      // If stored preference is "auto", listen for system theme changes
      if (stored === "auto") {
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const handleChange = () => {
          if (!cancelled) {
            themeSetterRef.current(getBrowserPreference());
          }
        };
        mediaQuery.addEventListener("change", handleChange);
        return () => {
          cancelled = true;
          mediaQuery.removeEventListener("change", handleChange);
        };
      }
    } else {
      // No stored preference and no user preference - default to auto
      applyPreference("auto");

      // Listen for system theme changes
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => {
        if (!cancelled) {
          themeSetterRef.current(getBrowserPreference());
        }
      };
      mediaQuery.addEventListener("change", handleChange);
      return () => {
        cancelled = true;
        mediaQuery.removeEventListener("change", handleChange);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [initialPreference]);

  return null;
}

export default function ThemeProvider({
  children,
  initialPreference,
}: {
  children: React.ReactNode;
  initialPreference?: ThemePreference | null;
}) {
  const sanitizedInitial = initialPreference ? sanitizeThemePreference(initialPreference) : null;
  // Determine the theme to use on mount (avoids browser preference override)
  const [mountTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      // Server-side: resolve the preference to a theme
      return resolveTheme(sanitizedInitial ?? "auto");
    }
    const stored = getStoredPreference();
    const preference = sanitizedInitial ?? stored ?? "auto";
    return resolveTheme(preference);
  });

  return (
    <NextThemes
      attribute="class"
      defaultTheme={mountTheme}
      enableSystem={false}
      themes={["light", "dark"]}
      value={{ light: "", dark: "dark" }}
      disableTransitionOnChange
    >
      <SyncThemeFromProfile initialPreference={sanitizedInitial} />
      {children}
    </NextThemes>
  );
}
