"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, X, Clock, TrendingUp, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { formatTimeRemaining } from "@/lib/usage";

interface UsageLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  timeUntilResetMs: number;
  tier: "free" | "plus" | "premium";
  currentCost: number;
  limitAmount: number;
  percentUsed: number;
}

export default function UsageLimitModal({
  isOpen,
  onClose,
  timeUntilResetMs: initialTime,
  tier,
  currentCost,
  limitAmount,
  percentUsed,
}: UsageLimitModalProps) {
  const [timeRemaining, setTimeRemaining] = useState(initialTime);

  // Update countdown every minute
  useEffect(() => {
    if (!isOpen) return;

    setTimeRemaining(initialTime);

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        const newTime = prev - 60000; // Subtract 1 minute
        return newTime > 0 ? newTime : 0;
      });
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [isOpen, initialTime]);

  // Handle ESC key press
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  const { hours, minutes } = formatTimeRemaining(timeRemaining);

  const getTierInfo = () => {
    switch (tier) {
      case "free":
        return {
          name: "Free Explorer",
          resetPeriod: "daily",
          upgradeText: "Upgrade to Plus for 42x more daily usage!",
          gradientFrom: "from-blue-500/20",
          gradientVia: "via-purple-500/20",
          gradientTo: "to-pink-500/20",
          iconBg: "from-blue-500/20 to-purple-500/20",
          iconRing: "ring-blue-500/30",
          iconColor: "text-blue-500",
          borderColor: "border-blue-400/30 dark:border-blue-500/20",
          buttonGradient: "from-blue-500 to-purple-500",
          buttonHover: "hover:from-blue-600 hover:to-purple-600",
          buttonShadow: "shadow-blue-500/25 hover:shadow-blue-500/40",
        };
      case "plus":
        return {
          name: "Plus Momentum",
          resetPeriod: "monthly",
          upgradeText: "Upgrade to Premium for 2x more monthly usage!",
          gradientFrom: "from-purple-500/20",
          gradientVia: "via-pink-500/20",
          gradientTo: "to-orange-500/20",
          iconBg: "from-purple-500/20 to-pink-500/20",
          iconRing: "ring-purple-500/30",
          iconColor: "text-purple-500",
          borderColor: "border-purple-400/30 dark:border-purple-500/20",
          buttonGradient: "from-purple-500 to-pink-500",
          buttonHover: "hover:from-purple-600 hover:to-pink-600",
          buttonShadow: "shadow-purple-500/25 hover:shadow-purple-500/40",
        };
      case "premium":
        return {
          name: "Premium Unlimited",
          resetPeriod: "monthly",
          upgradeText: "You're on our highest tier!",
          gradientFrom: "from-orange-500/20",
          gradientVia: "via-red-500/20",
          gradientTo: "to-pink-500/20",
          iconBg: "from-orange-500/20 to-red-500/20",
          iconRing: "ring-orange-500/30",
          iconColor: "text-orange-500",
          borderColor: "border-orange-400/30 dark:border-orange-500/20",
          buttonGradient: "from-orange-500 to-red-500",
          buttonHover: "hover:from-orange-600 hover:to-red-600",
          buttonShadow: "shadow-orange-500/25 hover:shadow-orange-500/40",
        };
    }
  };

  const tierInfo = getTierInfo();

  const handleUpgrade = () => {
    window.location.href = "/pricing";
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{
              type: "spring",
              duration: 0.4,
              bounce: 0.3,
            }}
            className="relative z-10 w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Animated gradient background effect */}
            <div
              className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${tierInfo.gradientFrom} ${tierInfo.gradientVia} ${tierInfo.gradientTo} blur-xl`}
            />

            {/* Main modal content */}
            <div
              className={`relative rounded-3xl border ${tierInfo.borderColor} bg-surface-card shadow-3xl overflow-hidden dark:shadow-2xl`}
            >
              {/* Header with gradient */}
              <div
                className={`relative overflow-hidden bg-gradient-to-r ${tierInfo.gradientFrom} ${tierInfo.gradientVia} ${tierInfo.gradientTo} px-6 py-5 border-b border-opacity-20`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    {/* Animated icon */}
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{
                        delay: 0.1,
                        type: "spring",
                        duration: 0.5,
                      }}
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${tierInfo.iconBg} ${tierInfo.iconColor} ring-2 ${tierInfo.iconRing}`}
                    >
                      <AlertCircle className="h-6 w-6" />
                    </motion.div>

                    <div className="flex-1 min-w-0">
                      <motion.h3
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.15 }}
                        className="text-xl font-semibold text-foreground"
                      >
                        Usage Limit Reached
                      </motion.h3>
                      <motion.p
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                        className="text-sm text-neutral-600 dark:text-neutral-400 mt-0.5"
                      >
                        {tierInfo.name} Plan
                      </motion.p>
                    </div>
                  </div>

                  {/* Close button */}
                  <motion.button
                    initial={{ opacity: 0, rotate: -90 }}
                    animate={{ opacity: 1, rotate: 0 }}
                    transition={{ delay: 0.2 }}
                    onClick={onClose}
                    className={`rounded-full p-2 transition-all duration-200 hover:bg-opacity-10 ${tierInfo.iconColor} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-opacity-40`}
                    aria-label="Close modal"
                  >
                    <X className="h-5 w-5" />
                  </motion.button>
                </div>
              </div>

              {/* Content */}
              <div className="px-6 py-6 space-y-6">
                {/* Message */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                >
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    You&apos;ve reached your {tierInfo.resetPeriod} usage limit.
                    Your limit will reset in:
                  </p>
                </motion.div>

                {/* Countdown Timer */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                  className={`relative rounded-2xl bg-gradient-to-br ${tierInfo.gradientFrom} ${tierInfo.gradientVia} ${tierInfo.gradientTo} p-6 border ${tierInfo.borderColor}`}
                >
                  <div className="flex items-center justify-center gap-3 mb-3">
                    <Clock
                      className={`h-6 w-6 ${tierInfo.iconColor}`}
                    />
                    <span className="text-3xl font-bold text-foreground tabular-nums">
                      {hours}h {minutes}m
                    </span>
                  </div>
                  <p className="text-sm text-center text-neutral-600 dark:text-neutral-400">
                    Until your {tierInfo.resetPeriod} limit resets
                  </p>
                </motion.div>

                {/* Usage Stats */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                  className="space-y-3"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-neutral-600 dark:text-neutral-400">
                      Usage this period
                    </span>
                    <span className="font-semibold text-foreground">
                      ${currentCost.toFixed(4)} / ${limitAmount.toFixed(2)}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="relative h-3 rounded-full bg-surface-muted overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(percentUsed, 100)}%` }}
                      transition={{ delay: 0.4, duration: 0.6, ease: "easeOut" }}
                      className={`h-full bg-gradient-to-r ${tierInfo.buttonGradient} rounded-full`}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-500">0%</span>
                    <span className={`font-semibold ${tierInfo.iconColor}`}>
                      {percentUsed}%
                    </span>
                    <span className="text-neutral-500">100%</span>
                  </div>
                </motion.div>

                {/* Upgrade suggestion (if not premium) */}
                {tier !== "premium" && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="flex items-start gap-3 p-4 rounded-xl bg-surface-muted/50 border border-surface"
                  >
                    <div className={`p-2 rounded-lg bg-gradient-to-br ${tierInfo.iconBg}`}>
                      <TrendingUp className={`h-4 w-4 ${tierInfo.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        Need more usage?
                      </p>
                      <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                        {tierInfo.upgradeText}
                      </p>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Action buttons */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
                className="flex items-center justify-end gap-3 px-6 py-5 bg-surface-muted/30 border-t border-surface"
              >
                {/* Close button */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl font-medium transition-all duration-200 bg-surface-muted border border-slate-300/80 hover:bg-surface-card hover:shadow-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500/40 dark:border-transparent"
                >
                  Got it
                </motion.button>

                {/* Upgrade button (if not premium) */}
                {tier !== "premium" && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleUpgrade}
                    className={`px-5 py-2.5 rounded-xl font-medium transition-all duration-200 bg-gradient-to-r ${tierInfo.buttonGradient} ${tierInfo.buttonHover} text-white shadow-lg ${tierInfo.buttonShadow} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-opacity-40 flex items-center gap-2`}
                  >
                    <Sparkles className="h-4 w-4" />
                    Upgrade Plan
                  </motion.button>
                )}
              </motion.div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
