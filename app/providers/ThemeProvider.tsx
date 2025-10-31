"use client";
import { ThemeProvider as NextThemes, useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

// Separate keys to avoid conflicts between preference and resolved theme
const PREFERENCE_KEY = "lernex-theme-preference";  // Stores: "auto" | "light" | "dark"
const THEME_KEY = "lernex-theme";  // Used by next-themes for resolved theme: "light" | "dark"
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
    // Migrate from old "theme" key to new "lernex-theme-preference" key
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy != null) {
      const pref = sanitizeThemePreference(legacy);
      if (pref) {
        window.localStorage.setItem(PREFERENCE_KEY, pref);
      }
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    }

    // Migrate from old unified "lernex-theme" key (if it exists and looks like a preference)
    const oldUnified = window.localStorage.getItem(THEME_KEY);
    if (oldUnified === "auto") {
      // This was a preference, not a resolved theme
      window.localStorage.setItem(PREFERENCE_KEY, "auto");
      window.localStorage.removeItem(THEME_KEY); // Clear it so next-themes can set it fresh
    }
  } catch {
    /* no-op */
  }
}

function getStoredPreference(): ThemePreference | null {
  if (typeof window === "undefined") return null;
  try {
    return sanitizeThemePreference(window.localStorage.getItem(PREFERENCE_KEY));
  } catch {
    return null;
  }
}

function persistPreference(value: ThemePreference) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFERENCE_KEY, value);
  } catch {
    /* ignore */
  }
}

function SyncThemeFromProfile({ initialPreference }: { initialPreference?: ThemePreference | null }) {
  const { setTheme, theme: currentTheme } = useTheme();
  const themeSetterRef = useRef(setTheme);
  const [currentPreference, setCurrentPreference] = useState<ThemePreference | null>(null);
  const mediaQueryRef = useRef<MediaQueryList | null>(null);
  const handlerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    themeSetterRef.current = setTheme;
  }, [setTheme]);

  useEffect(() => {
    migrateLegacyStorage();
  }, []);

  // Listen for localStorage changes (from other tabs or profile page updates)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStorageChange = (e: StorageEvent) => {
      // Listen for changes to the PREFERENCE key, not the theme key
      if (e.key === PREFERENCE_KEY && e.newValue) {
        const newPref = sanitizeThemePreference(e.newValue);
        if (newPref) {
          setCurrentPreference(newPref);
          const resolvedTheme = resolveTheme(newPref);
          themeSetterRef.current(resolvedTheme);
          // Also persist the preference locally to stay in sync
          persistPreference(newPref);
        }
      }
    };

    // Also listen for custom events (for same-tab updates)
    const handleCustomThemeChange = ((e: CustomEvent) => {
      const newPref = sanitizeThemePreference(e.detail?.preference);
      if (newPref) {
        setCurrentPreference(newPref);
        const resolvedTheme = resolveTheme(newPref);
        themeSetterRef.current(resolvedTheme);
        // Preference will be persisted by the caller
      }
    }) as EventListener;

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("theme-preference-changed", handleCustomThemeChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("theme-preference-changed", handleCustomThemeChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    // Clean up previous media query listener
    if (mediaQueryRef.current && handlerRef.current) {
      mediaQueryRef.current.removeEventListener("change", handlerRef.current);
      mediaQueryRef.current = null;
      handlerRef.current = null;
    }

    const applyPreference = (preference: ThemePreference) => {
      if (cancelled) return;
      setCurrentPreference(preference);
      const resolvedTheme = resolveTheme(preference);
      themeSetterRef.current(resolvedTheme);
      persistPreference(preference);
    };

    // Priority: localStorage > initialPreference > auto
    const stored = getStoredPreference();
    const preference = stored ?? initialPreference ?? "auto";

    applyPreference(preference);

    // If preference is "auto", listen for system theme changes
    if (preference === "auto") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      mediaQueryRef.current = mediaQuery;

      const handleChange = () => {
        if (!cancelled && currentPreference === "auto") {
          themeSetterRef.current(getBrowserPreference());
        }
      };
      handlerRef.current = handleChange;

      mediaQuery.addEventListener("change", handleChange);

      return () => {
        cancelled = true;
        if (mediaQueryRef.current && handlerRef.current) {
          mediaQueryRef.current.removeEventListener("change", handlerRef.current);
        }
      };
    }

    return () => {
      cancelled = true;
    };
  }, [initialPreference, currentPreference]);

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
    const preference = stored ?? sanitizedInitial ?? "auto";
    return resolveTheme(preference);
  });

  return (
    <NextThemes
      attribute="class"
      defaultTheme={mountTheme}
      enableSystem={false}
      enableColorScheme
      themes={["light", "dark"]}
      storageKey={THEME_KEY}
      disableTransitionOnChange
    >
      <SyncThemeFromProfile initialPreference={sanitizedInitial} />
      {children}
    </NextThemes>
  );
}

// Export utility for components to use
export { PREFERENCE_KEY, THEME_KEY, resolveTheme, type ThemePreference };
