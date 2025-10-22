import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import NavBar from "@/components/NavBar";
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
type ThemeMode = "light" | "dark";
type ThemePreference = "auto" | "light" | "dark";

export const metadata: Metadata = defaultMetadata;

export const dynamic = "force-dynamic";

const sanitizeThemePref = (value: unknown): ThemePreference | null =>
  value === "auto" || value === "light" || value === "dark" ? value : null;

// Get browser's preferred color scheme (server-safe fallback)
const getBrowserPreferenceServer = (): ThemeMode => "dark";

// Resolve preference to actual theme (server-side version)
const resolveThemeServer = (preference: ThemePreference | null): ThemeMode => {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  // "auto" or null - default to dark for server-side
  return getBrowserPreferenceServer();
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let initialPreference: ThemePreference | null = null;

  try {
    const sb = supabaseServer();
    const {
      data: { user },
    } = await sb.auth.getUser();

    if (user) {
      const { data } = await sb
        .from("profiles")
        .select("theme_pref")
        .eq("id", user.id)
        .maybeSingle();
      initialPreference = sanitizeThemePref(data?.theme_pref ?? null);
    }
  } catch {
    initialPreference = null;
  }

  // Generate inline script to set theme BEFORE first paint
  const themeScript = `
    (function() {
      try {
        var STORAGE_KEY = 'lernex-theme';
        var serverPreference = ${JSON.stringify(initialPreference)};
        var stored = localStorage.getItem(STORAGE_KEY);
        var preference = serverPreference || stored || 'auto';

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

        // Clean up and apply theme
        document.documentElement.classList.remove('light', 'dark');
        if (theme === 'light' || theme === 'dark') {
          document.documentElement.classList.add(theme);
        } else {
          document.documentElement.classList.add('dark');
        }
      } catch (e) {
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add('dark');
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
            <NavBar />
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
