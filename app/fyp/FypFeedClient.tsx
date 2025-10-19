"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Compass,
  Lightbulb,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import WelcomeTourOverlay from "@/components/WelcomeTourOverlay";
import ClassPicker from "@/components/ClassPicker";
import FypFeed from "@/components/FypFeed";
import { ProfileBasicsProvider } from "@/app/providers/ProfileBasicsProvider";
import { useLernexStore } from "@/lib/store";
import type { ProfileBasics } from "@/lib/profile-basics";

type FypFeedClientProps = {
  initialProfile?: ProfileBasics | null;
};

export default function FypFeedClient({ initialProfile }: FypFeedClientProps) {
  const { selectedSubjects, accuracyBySubject } = useLernexStore();
  const hasSelection = selectedSubjects.length > 0;
  const highlightedSubjects = hasSelection ? selectedSubjects : initialProfile?.interests ?? [];
  const highlightedChips = highlightedSubjects.slice(0, 6);

  const accuracyHighlights = Object.entries(accuracyBySubject)
    .map(([subject, stats]) => {
      const percent = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : null;
      return { subject, percent, attempts: stats.total };
    })
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, 3);
  const hasAccuracy = accuracyHighlights.some((entry) => entry.attempts > 0);
  const fallbackAccuracy = highlightedSubjects.slice(0, 3).map((subject) => ({
    subject,
    percent: null as number | null,
    attempts: 0,
  }));
  const accuracyCards =
    hasAccuracy && accuracyHighlights.length ? accuracyHighlights : fallbackAccuracy;

  const levelHighlights = Object.entries(initialProfile?.levelMap ?? {}).slice(0, 4);
  const placementReady = initialProfile?.placementReady ?? false;
  const learningTips = [
    "Drag a lesson upward or tap Skip with context so Lernex can sharpen future picks.",
    "Use auto-advance for streak mode - pause it when you want to take notes.",
    "Rotate subjects with Mix to keep long study sessions fresh and balanced.",
  ];

  return (
    <ProfileBasicsProvider initialData={initialProfile ?? undefined}>
      <WelcomeTourOverlay />
      <main
        data-fyp-feed-root="true"
        className="relative isolate mx-auto flex min-h-[calc(100vh-56px)] w-full max-w-6xl flex-col gap-10 px-4 pb-16 pt-12 text-foreground transition-colors duration-200 sm:px-6 lg:px-8"
      >
        <div className="pointer-events-none absolute inset-0 -z-20">
          <div className="absolute inset-x-[-12%] top-[-18%] h-[420px] rounded-full bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_70%)] blur-3xl dark:bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.26),transparent_70%)]" />
          <div className="absolute left-[-6%] top-[32%] h-64 w-64 rounded-full bg-lernex-blue/20 blur-3xl opacity-70 dark:bg-lernex-blue/35 dark:opacity-60" />
          <div className="absolute right-[-8%] bottom-[14%] h-72 w-72 rounded-full bg-lernex-purple/20 blur-3xl opacity-70 dark:bg-lernex-purple/35 dark:opacity-60" />
        </div>

        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="relative rounded-[32px] border border-white/60 bg-white/80 px-6 py-8 shadow-[0_42px_120px_-46px_rgba(47,128,237,0.55)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5"
        >
          <div className="pointer-events-none absolute inset-0 -z-10 rounded-[32px] bg-[linear-gradient(135deg,rgba(59,130,246,0.12),rgba(129,140,248,0.08),transparent)] dark:bg-[linear-gradient(135deg,rgba(47,128,237,0.26),rgba(129,140,248,0.12),transparent)]" />
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-4">
              <span className="inline-flex items-center gap-2 rounded-full bg-lernex-blue/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-lernex-blue/80 dark:bg-lernex-blue/15 dark:text-lernex-blue/60">
                For you
              </span>
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold leading-tight text-neutral-900 dark:text-white sm:text-4xl">
                  Your personalized{" "}
                  <span className="bg-gradient-to-r from-lernex-blue via-indigo-500 to-lernex-purple bg-clip-text text-transparent">
                    learning flow
                  </span>
                </h1>
                <p className="max-w-2xl text-sm text-neutral-600 dark:text-neutral-300 sm:text-base">
                  Slide through fresh micro-lessons, quizzes, and tips designed around your saved classes. Swap subjects
                  anytime and keep momentum with real-time progress cues.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Sparkles className="h-4 w-4 text-lernex-blue/80 dark:text-lernex-blue/60" />
                {highlightedChips.length ? (
                  highlightedChips.map((subject) => (
                    <span
                      key={subject}
                      className="inline-flex items-center rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs font-medium text-neutral-700 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-neutral-100"
                    >
                      {subject}
                    </span>
                  ))
                ) : (
                  <span className="rounded-full border border-dashed border-lernex-blue/40 bg-white/60 px-3 py-1 text-xs font-medium text-neutral-500 dark:border-lernex-blue/30 dark:bg-white/10 dark:text-neutral-300">
                    Add a class below to spotlight it here.
                  </span>
                )}
              </div>
            </div>
            <div className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end lg:w-auto lg:flex-col lg:items-end">
              <div className="flex items-center gap-3 rounded-2xl border border-white/60 bg-white/70 p-4 text-left text-xs text-neutral-500 shadow-inner backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-neutral-300">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-lernex-blue/15 text-lernex-blue dark:bg-lernex-blue/25 dark:text-lernex-blue/80">
                  <Compass className="h-5 w-5" />
                </div>
                <div className="leading-tight">
                  <div className="text-sm font-semibold text-neutral-700 dark:text-white">Tune your feed</div>
                  <div>Focus on one class, mix them all, or let Lernex choose what&apos;s next.</div>
                </div>
              </div>
              <div className="relative flex shrink-0 items-center justify-end">
                <ClassPicker />
              </div>
              {placementReady && (
                <div className="inline-flex items-center gap-2 rounded-full border border-lime-400/40 bg-lime-50/75 px-3 py-1 text-xs font-semibold text-lime-600 shadow-sm dark:border-lime-300/30 dark:bg-lime-400/15 dark:text-lime-200">
                  <CheckCircle2 className="h-4 w-4" />
                  Placement ready
                </div>
              )}
            </div>
          </div>
        </motion.header>

        <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="flex-1"
          >
            <div className="relative mx-auto flex max-w-full justify-center">
              <div className="pointer-events-none absolute inset-x-[-5%] top-3 -z-10 hidden max-w-[720px] rounded-[36px] border border-white/50 bg-white/65 shadow-[0_55px_140px_-70px_rgba(47,128,237,0.55)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5 lg:block" />
              <FypFeed />
            </div>
          </motion.section>

          <motion.aside
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.5 }}
            className="w-full space-y-6 lg:w-[min(360px,40%)]"
          >
            <motion.div
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-[0_32px_90px_-64px_rgba(47,128,237,0.65)] backdrop-blur-lg dark:border-white/10 dark:bg-white/5"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-lernex-blue/15 text-lernex-blue dark:bg-lernex-blue/20 dark:text-lernex-blue/70">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-neutral-800 dark:text-white">Learning snapshot</h2>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Track accuracy across the subjects you touch most.
                  </p>
                </div>
              </div>
              <ul className="mt-5 space-y-3">
                {accuracyCards.length ? (
                  accuracyCards.map(({ subject, percent, attempts }) => {
                    const tone =
                      percent == null
                        ? "text-neutral-400 dark:text-neutral-500"
                        : percent >= 80
                        ? "text-emerald-500 dark:text-emerald-300"
                        : percent >= 60
                        ? "text-lernex-blue dark:text-lernex-blue/80"
                        : "text-amber-500 dark:text-amber-300";
                    const attemptsLabel =
                      attempts > 0 ? `${attempts} question${attempts === 1 ? "" : "s"} answered` : "Just getting started";
                    return (
                      <li
                        key={subject}
                        className="flex items-center justify-between rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-sm text-neutral-700 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-neutral-200"
                      >
                        <div className="mr-3 flex flex-col">
                          <span className="font-semibold">{subject}</span>
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">{attemptsLabel}</span>
                        </div>
                        <div className={`flex flex-col items-end text-sm font-semibold ${tone}`}>
                          {percent != null ? (
                            <>
                              {percent}%
                              <span className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
                                correct
                              </span>
                            </>
                          ) : (
                            <span className="text-xs font-medium text-neutral-400 dark:text-neutral-500">Ready</span>
                          )}
                        </div>
                      </li>
                    );
                  })
                ) : (
                  <li className="rounded-2xl border border-dashed border-white/60 bg-white/40 px-4 py-3 text-sm text-neutral-500 dark:border-white/15 dark:bg-white/5 dark:text-neutral-300">
                    Answer a few questions to light up subject insights.
                  </li>
                )}
              </ul>
            </motion.div>

            <motion.div
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-[0_32px_90px_-64px_rgba(111,87,238,0.55)] backdrop-blur-lg dark:border-white/10 dark:bg-white/5"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-lernex-purple/15 text-lernex-purple dark:bg-lernex-purple/20 dark:text-lernex-purple/70">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-neutral-800 dark:text-white">Interests & next steps</h2>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Lean into topics you have saved.</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {initialProfile?.interests?.length ? (
                  initialProfile.interests.slice(0, 8).map((interest) => (
                    <span
                      key={interest}
                      className="inline-flex items-center rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-medium text-neutral-700 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-neutral-200"
                    >
                      {interest}
                    </span>
                  ))
                ) : (
                  <span className="rounded-full border border-dashed border-white/60 bg-white/50 px-3 py-1 text-xs text-neutral-500 dark:border-white/15 dark:bg-white/5 dark:text-neutral-400">
                    Save a few interests so we can surface themes here.
                  </span>
                )}
              </div>
              {levelHighlights.length > 0 && (
                <div className="mt-5 grid gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                  {levelHighlights.map(([subject, level]) => (
                    <div
                      key={subject}
                      className="flex items-center justify-between rounded-2xl border border-white/60 bg-white/60 px-4 py-2 font-medium text-neutral-600 dark:border-white/10 dark:bg-white/10 dark:text-neutral-300"
                    >
                      <span>{subject}</span>
                      <span className="text-neutral-500 dark:text-neutral-400">{level}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-6 grid gap-2 text-sm">
                <Link
                  href="/generate"
                  className="group inline-flex items-center justify-between rounded-2xl border border-white/60 bg-white/70 px-4 py-3 font-medium text-lernex-blue transition hover:border-lernex-blue/50 hover:text-lernex-blue/90 dark:border-white/10 dark:bg-white/10 dark:text-lernex-blue/70"
                >
                  <span>Spin up a fresh micro-lesson</span>
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/playlists"
                  className="group inline-flex items-center justify-between rounded-2xl border border-white/60 bg-white/70 px-4 py-3 font-medium text-neutral-600 transition hover:border-lernex-purple/40 hover:text-lernex-purple/80 dark:border-white/10 dark:bg-white/10 dark:text-neutral-200 dark:hover:border-lernex-purple/60 dark:hover:text-lernex-purple/70"
                >
                  <span>Queue a curated playlist</span>
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/leaderboard"
                  className="group inline-flex items-center justify-between rounded-2xl border border-white/60 bg-white/70 px-4 py-3 font-medium text-neutral-600 transition hover:border-lernex-blue/50 hover:text-lernex-blue/80 dark:border-white/10 dark:bg-white/10 dark:text-neutral-200 dark:hover:border-lernex-blue/60 dark:hover:text-lernex-blue/70"
                >
                  <span>Compare progress on the leaderboard</span>
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </Link>
              </div>
            </motion.div>

            <motion.div
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-[0_32px_90px_-64px_rgba(47,128,237,0.45)] backdrop-blur-lg dark:border-white/10 dark:bg-white/5"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-500 dark:bg-amber-400/20 dark:text-amber-300">
                  <Lightbulb className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-neutral-800 dark:text-white">Flow tips</h2>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Move smarter through each lesson block.</p>
                </div>
              </div>
              <ul className="mt-5 space-y-3 text-sm text-neutral-600 dark:text-neutral-300">
                {learningTips.map((tip) => (
                  <li
                    key={tip}
                    className="rounded-2xl border border-dashed border-white/60 bg-white/60 px-4 py-3 leading-snug dark:border-white/15 dark:bg-white/10"
                  >
                    {tip}
                  </li>
                ))}
              </ul>
            </motion.div>
          </motion.aside>
        </div>
      </main>
    </ProfileBasicsProvider>
  );
}
