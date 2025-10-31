﻿import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import Navbar from "@/components/Navbar";
import { Analytics } from "@vercel/analytics/next";
import Footer from "@/components/Footer";
import { SpeedInsights } from "@vercel/speed-insights/next";
import ThemeProvider from "./providers/ThemeProvider";
import PageTransition from "@/components/PageTransition";
import { ProfileStatsProvider } from "./providers/ProfileStatsProvider";
import StructuredData from "@/components/StructuredData";
import { defaultMetadata } from "@/lib/seo";
import { supabaseServer } from "@/lib/supabase-server";
import SidebarOffsetWrapper from "@/components/SidebarOffsetWrapper";

const inter = Inter({ subsets: ["latin"] });
type ThemePreference = "auto" | "light" | "dark";

export const metadata: Metadata = defaultMetadata;

export const dynamic = "force-dynamic";

const sanitizeThemePref = (value: unknown): ThemePreference | null =>
  value === "auto" || value === "light" || value === "dark" ? value : null;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let initialPreference: ThemePreference | null = null;

  try {
    const sb = await supabaseServer();
    const {
      data: { user },
    } = await sb.auth.getUser();

    if (user) {
      const { data } = await sb
        .from("profiles")
        .select("theme_pref")
        .eq("id", user.id)
        .maybeSingle();
      const profile = data as { theme_pref?: string } | null;
      initialPreference = sanitizeThemePref(profile?.theme_pref ?? null);
    }
  } catch {
    initialPreference = null;
  }

  // Generate inline script to set theme BEFORE first paint to prevent flash
  const themeScript = `
    (function() {
      try {
        var STORAGE_KEY = 'lernex-theme';
        var stored = localStorage.getItem(STORAGE_KEY);
        var serverPreference = ${JSON.stringify(initialPreference)};
        // Priority: localStorage > serverPreference > 'auto'
        var preference = stored || serverPreference || 'auto';

        // Resolve preference to actual theme
        var theme;
        if (preference === 'light') {
          theme = 'light';
        } else if (preference === 'dark') {
          theme = 'dark';
        } else {
          // auto - use browser preference
          theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }

        // Apply theme class to html element
        var root = document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(theme);

        // Set color-scheme for browser chrome
        root.style.colorScheme = theme;
      } catch (e) {
        // Fallback to light mode on error for better visibility
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add('light');
        document.documentElement.style.colorScheme = 'light';
      }
    })();
  `;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        id="top"
        className={`${inter.className} bg-white text-neutral-900 dark:bg-lernex-charcoal dark:text-white`}
      >
        <ThemeProvider initialPreference={initialPreference}>
          <ProfileStatsProvider>
            <div className="fixed inset-0 -z-10 bg-[radial-gradient(60%_40%_at_50%_0%,rgba(47,128,237,0.12),transparent)]"></div>
            <Navbar />
            <SidebarOffsetWrapper>
              <PageTransition>
                {children}
              </PageTransition>
              <Footer />
            </SidebarOffsetWrapper>
            <Analytics />
            <SpeedInsights />
            <StructuredData />
          </ProfileStatsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
