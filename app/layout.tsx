import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import NavBar from "@/components/NavBar";
import { Analytics } from "@vercel/analytics/next";
import Footer from "@/components/Footer";
import { SpeedInsights } from '@vercel/speed-insights/next';
import ThemeProvider from "./providers/ThemeProvider";
import PageTransition from "@/components/PageTransition";
import { ProfileStatsProvider } from "./providers/ProfileStatsProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Lernex",
  description: "AI micro-lessons + instant quizzes",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        id="top"
        className={`${inter.className} bg-white text-neutral-900 dark:bg-lernex-charcoal dark:text-white`}
      >
        <ThemeProvider>
          <ProfileStatsProvider>
            <div className="fixed inset-0 -z-10 bg-[radial-gradient(60%_40%_at_50%_0%,rgba(47,128,237,0.12),transparent)]"></div>
            <NavBar />
            <PageTransition>
              {children}
            </PageTransition>
            <Footer />
            <Analytics />
            <SpeedInsights />
          </ProfileStatsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
