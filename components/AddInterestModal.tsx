// components/AddInterestModal.tsx
"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Check } from "lucide-react";
import { DOMAINS } from "@/data/domains";
import { useRouter } from "next/navigation";

interface AddInterestModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentInterests: string[];
  onSuccess: () => void;
}

export default function AddInterestModal({
  isOpen,
  onClose,
  currentInterests,
  onSuccess,
}: AddInterestModalProps) {
  const [selectedInterest, setSelectedInterest] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Filter out interests that are already added
  const availableInterests = DOMAINS.filter(
    (domain) => !currentInterests.includes(domain)
  );

  const handleAdd = async () => {
    if (!selectedInterest) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/profile/interests/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interest: selectedInterest }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to add subject");
      }

      // Success - navigate to placement test
      onSuccess();
      onClose();
      router.push("/placement");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full max-w-md rounded-3xl border border-slate-200/80 bg-surface-card p-6 shadow-3xl backdrop-blur-xl dark:border-white/10 dark:shadow-2xl"
            >
              {/* Close Button */}
              <button
                onClick={onClose}
                className="absolute right-4 top-4 rounded-full p-2 text-neutral-500 transition hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Header */}
              <div className="mb-6">
                <div className="mb-2 flex items-center gap-2">
                  <div className="rounded-full bg-gradient-to-br from-lernex-blue to-sky-500 p-2">
                    <Plus className="h-5 w-5 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold">Add a Subject</h2>
                </div>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Select a subject to add. You&apos;ll run a placement test to determine your
                  starting level.
                </p>
              </div>

              {/* Available Subjects */}
              {availableInterests.length === 0 ? (
                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 text-center dark:border-neutral-800 dark:bg-neutral-800/50">
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    You&apos;ve already added all available subjects!
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {availableInterests.map((interest) => (
                    <motion.button
                      key={interest}
                      onClick={() => setSelectedInterest(interest)}
                      className={`relative w-full overflow-hidden rounded-2xl border px-4 py-3 text-left font-medium transition-all ${
                        selectedInterest === interest
                          ? "border-lernex-blue bg-gradient-to-r from-lernex-blue to-sky-500 text-white shadow-lg shadow-lernex-blue/25"
                          : "border-neutral-200 bg-white hover:border-lernex-blue/50 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/50 dark:hover:border-lernex-blue/50 dark:hover:bg-neutral-800"
                      }`}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="flex items-center justify-between">
                        <span>{interest}</span>
                        {selectedInterest === interest && (
                          <motion.div
                            initial={{ scale: 0, rotate: -180 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                          >
                            <Check className="h-5 w-5" />
                          </motion.div>
                        )}
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}

              {/* Error Message */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 overflow-hidden rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600 dark:border-rose-900/50 dark:bg-rose-950/50 dark:text-rose-400"
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Action Buttons */}
              <div className="mt-6 flex gap-3">
                <button
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="flex-1 rounded-2xl border border-neutral-300 px-4 py-3 font-semibold transition hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  disabled={!selectedInterest || isSubmitting || availableInterests.length === 0}
                  className="flex-1 rounded-2xl bg-gradient-to-r from-lernex-blue to-sky-500 px-4 py-3 font-semibold text-white shadow-lg shadow-lernex-blue/25 transition hover:shadow-xl hover:shadow-lernex-blue/30 disabled:opacity-50 disabled:shadow-none"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      >
                        <Plus className="h-5 w-5" />
                      </motion.div>
                      Adding...
                    </span>
                  ) : (
                    "Add & Run Placement"
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
