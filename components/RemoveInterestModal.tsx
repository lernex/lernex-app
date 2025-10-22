// components/RemoveInterestModal.tsx
"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Trash2, AlertCircle } from "lucide-react";

interface RemoveInterestModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentInterests: string[];
  levelMap: Record<string, string> | null;
  onSuccess: () => void;
}

export default function RemoveInterestModal({
  isOpen,
  onClose,
  currentInterests,
  levelMap,
  onSuccess,
}: RemoveInterestModalProps) {
  const [selectedInterest, setSelectedInterest] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmStep, setConfirmStep] = useState(false);

  const handleRemove = async () => {
    if (!selectedInterest) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/profile/interests/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interest: selectedInterest }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to remove subject");
      }

      // Success
      onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setConfirmStep(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedInterest(null);
    setConfirmStep(false);
    setError(null);
    onClose();
  };

  const handleSelectInterest = (interest: string) => {
    setSelectedInterest(interest);
    setError(null);
    setConfirmStep(false);
  };

  const handleConfirmClick = () => {
    if (currentInterests.length === 1) {
      setError("Cannot remove your last subject. Add another subject first.");
      return;
    }
    setConfirmStep(true);
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
            onClick={handleClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full max-w-md rounded-3xl border border-white/20 bg-white/95 p-6 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/95"
            >
              {/* Close Button */}
              <button
                onClick={handleClose}
                className="absolute right-4 top-4 rounded-full p-2 text-neutral-500 transition hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              >
                <X className="h-5 w-5" />
              </button>

              {/* Header */}
              <div className="mb-6">
                <div className="mb-2 flex items-center gap-2">
                  <div className="rounded-full bg-gradient-to-br from-rose-500 to-red-600 p-2">
                    <Trash2 className="h-5 w-5 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold">Remove a Subject</h2>
                </div>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  {!confirmStep
                    ? "Select a subject to remove from your learning path."
                    : "This action will delete all progress for this subject."}
                </p>
              </div>

              {/* Confirmation Step */}
              <AnimatePresence mode="wait">
                {confirmStep && selectedInterest ? (
                  <motion.div
                    key="confirm"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="space-y-4"
                  >
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/50 dark:bg-rose-950/30">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 flex-shrink-0 text-rose-600 dark:text-rose-400" />
                        <div>
                          <p className="font-semibold text-rose-900 dark:text-rose-200">
                            Are you sure?
                          </p>
                          <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">
                            Removing <span className="font-bold">{selectedInterest}</span>{" "}
                            will permanently delete:
                          </p>
                          <ul className="mt-2 space-y-1 text-sm text-rose-700 dark:text-rose-300">
                            <li>• Your current level and progress</li>
                            <li>• All mastery data and statistics</li>
                            <li>• Your personalized learning path</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => setConfirmStep(false)}
                        disabled={isSubmitting}
                        className="flex-1 rounded-2xl border border-neutral-300 px-4 py-3 font-semibold transition hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                      >
                        Go Back
                      </button>
                      <button
                        onClick={handleRemove}
                        disabled={isSubmitting}
                        className="flex-1 rounded-2xl bg-gradient-to-r from-rose-500 to-red-600 px-4 py-3 font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:shadow-xl hover:shadow-rose-500/30 disabled:opacity-50 disabled:shadow-none"
                      >
                        {isSubmitting ? (
                          <span className="flex items-center justify-center gap-2">
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            >
                              <Trash2 className="h-5 w-5" />
                            </motion.div>
                            Removing...
                          </span>
                        ) : (
                          "Yes, Remove"
                        )}
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="select"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {/* Current Subjects */}
                    <div className="mb-6 space-y-2">
                      {currentInterests.map((interest) => {
                        const level = levelMap?.[interest];
                        return (
                          <motion.button
                            key={interest}
                            onClick={() => handleSelectInterest(interest)}
                            className={`relative w-full overflow-hidden rounded-2xl border px-4 py-3 text-left transition-all ${
                              selectedInterest === interest
                                ? "border-rose-500 bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-lg shadow-rose-500/25"
                                : "border-neutral-200 bg-white hover:border-rose-500/50 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/50 dark:hover:border-rose-500/50 dark:hover:bg-neutral-800"
                            }`}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-semibold">{interest}</div>
                                {level && (
                                  <div
                                    className={`mt-1 text-sm ${
                                      selectedInterest === interest
                                        ? "text-white/90"
                                        : "text-neutral-500 dark:text-neutral-400"
                                    }`}
                                  >
                                    {level}
                                  </div>
                                )}
                              </div>
                              {selectedInterest === interest && (
                                <motion.div
                                  initial={{ scale: 0, rotate: -180 }}
                                  animate={{ scale: 1, rotate: 0 }}
                                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                                >
                                  <Trash2 className="h-5 w-5" />
                                </motion.div>
                              )}
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>

                    {/* Error Message */}
                    <AnimatePresence>
                      {error && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mb-4 overflow-hidden rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600 dark:border-rose-900/50 dark:bg-rose-950/50 dark:text-rose-400"
                        >
                          {error}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                      <button
                        onClick={handleClose}
                        className="flex-1 rounded-2xl border border-neutral-300 px-4 py-3 font-semibold transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleConfirmClick}
                        disabled={!selectedInterest}
                        className="flex-1 rounded-2xl bg-gradient-to-r from-rose-500 to-red-600 px-4 py-3 font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:shadow-xl hover:shadow-rose-500/30 disabled:opacity-50 disabled:shadow-none"
                      >
                        Continue
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
