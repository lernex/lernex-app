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

const inter = Inter({ subsets: ["latin"] });
type ThemeMode = "light" | "dark";

export const metadata: Metadata = defaultMetadata;

export const dynamic = "force-dynamic";

const sanitizeThemePref = (value: unknown): ThemeMode | null =>
  value === "light" || value === "dark" ? value : null;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let initialTheme: ThemeMode | null = null;

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
      initialTheme = sanitizeThemePref(data?.theme_pref ?? null);
    }
  } catch {
    initialTheme = null;
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        id="top"
        className={`${inter.className} bg-white text-neutral-900 dark:bg-lernex-charcoal dark:text-white`}
      >
        <ThemeProvider initialTheme={initialTheme}>
          <ProfileStatsProvider>
            <div className="fixed inset-0 -z-10 bg-[radial-gradient(60%_40%_at_50%_0%,rgba(47,128,237,0.12),transparent)]"></div>
            <NavBar />
            <PageTransition>
              {children}
            </PageTransition>
            <Footer />
            <Analytics />
            <SpeedInsights />
            <StructuredData />
          </ProfileStatsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
