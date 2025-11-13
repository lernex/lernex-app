"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import WelcomeTourOverlay from "@/components/WelcomeTourOverlay";
import ClassPicker from "@/components/ClassPicker";
import FypFeed from "@/components/FypFeed";
import { ProfileBasicsProvider } from "@/app/providers/ProfileBasicsProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import type { ProfileBasics } from "@/lib/profile-basics";
import LearningPathProgress from "./LearningPathProgress";
import { useLernexStore } from "@/lib/store";

type FypFeedClientProps = {
  initialProfile?: ProfileBasics | null;
  autoSelectSubject?: string | null;
};

export default function FypFeedClient({ initialProfile, autoSelectSubject }: FypFeedClientProps) {
  const { setSelectedSubjects } = useLernexStore();

  // Auto-select the newly added class after placement
  useEffect(() => {
    if (autoSelectSubject) {
      console.log("[FYP] Auto-selecting subject after placement:", autoSelectSubject);
      setSelectedSubjects([autoSelectSubject]);
    }
  }, [autoSelectSubject, setSelectedSubjects]);

  return (
    <ErrorBoundary>
      <ProfileBasicsProvider initialData={initialProfile ?? undefined}>
      <WelcomeTourOverlay />
      <main
        data-fyp-feed-root="true"
        className="relative isolate mx-auto flex min-h-[calc(100vh-56px)] w-full max-w-7xl flex-col gap-8 px-4 pb-16 pt-8 text-foreground transition-colors duration-300 sm:px-6 lg:px-8"
      >
        {/* Ambient background gradients */}
        <div className="pointer-events-none absolute inset-0 -z-20 overflow-hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2 }}
            className="absolute inset-x-[-15%] top-[-25%] h-[500px] rounded-full bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.12),transparent_65%)] blur-3xl dark:bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.22),transparent_65%)]"
          />
          <motion.div
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 0.7, x: 0 }}
            transition={{ duration: 1.5, delay: 0.2 }}
            className="absolute left-[-10%] top-[35%] h-72 w-72 rounded-full bg-lernex-blue/15 blur-3xl dark:bg-lernex-blue/25"
          />
          <motion.div
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 0.7, x: 0 }}
            transition={{ duration: 1.5, delay: 0.4 }}
            className="absolute right-[-10%] bottom-[20%] h-80 w-80 rounded-full bg-lernex-purple/15 blur-3xl dark:bg-lernex-purple/25"
          />
        </div>

        {/* Simplified header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10"
        >
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <motion.h1
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="text-4xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-5xl"
              >
                <span className="bg-gradient-to-r from-lernex-blue via-indigo-500 to-lernex-purple bg-clip-text text-transparent">
                  For You
                </span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="text-sm text-neutral-600 dark:text-neutral-400"
              >
                Your personalized learning experience
              </motion.p>
            </div>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="relative z-20"
            >
              <ClassPicker />
            </motion.div>
          </div>
        </motion.header>

        {/* Main content area */}
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
          {/* Feed section */}
          <motion.section
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="flex-1"
          >
            <div className="relative mx-auto flex max-w-full justify-center">
              <FypFeed />
            </div>
          </motion.section>

          {/* Simplified sidebar */}
          <motion.aside
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="w-full lg:w-[min(380px,42%)]"
          >
            <LearningPathProgress />
          </motion.aside>
        </div>
      </main>
    </ProfileBasicsProvider>
    </ErrorBoundary>
  );
}
