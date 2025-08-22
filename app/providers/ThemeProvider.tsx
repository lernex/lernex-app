"use client";
import { ThemeProvider as NextThemes, useTheme } from "next-themes";
import { useEffect } from "react";

function SyncThemeFromProfile() {
  const { setTheme } = useTheme();
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/profile/me");
        if (!res.ok) return;
        const me = await res.json();
        if (me?.theme_pref) setTheme(me.theme_pref);
      } catch {}
    })();
  }, [setTheme]);
  return null;
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="dark" enableSystem>
      <SyncThemeFromProfile />
      {children}
    </NextThemes>
  );
}
