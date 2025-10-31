"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { useEffect } from "react";

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
}

export default function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Delete Lesson",
  message = "Are you sure you want to delete this lesson from history? This action cannot be undone.",
  confirmText = "Delete",
  cancelText = "Cancel",
}: DeleteConfirmModalProps) {
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

  const handleConfirm = () => {
    onConfirm();
    onClose();
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
              bounce: 0.3
            }}
            className="relative z-10 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Animated gradient background effect */}
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-red-500/20 via-orange-500/20 to-pink-500/20 blur-xl" />

            {/* Main modal content */}
            <div className="relative rounded-3xl border border-red-500/20 bg-surface-card shadow-2xl overflow-hidden">
              {/* Header with gradient */}
              <div className="relative overflow-hidden bg-gradient-to-r from-red-500/10 via-orange-500/10 to-pink-500/10 px-6 py-5 border-b border-red-500/20">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    {/* Animated icon */}
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{
                        delay: 0.1,
                        type: "spring",
                        duration: 0.5
                      }}
                      className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500/20 to-orange-500/20 text-red-500 ring-2 ring-red-500/30"
                    >
                      <AlertTriangle className="h-6 w-6" />
                    </motion.div>

                    <div className="flex-1 min-w-0">
                      <motion.h3
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.15 }}
                        className="text-xl font-semibold text-foreground"
                      >
                        {title}
                      </motion.h3>
                    </div>
                  </div>

                  {/* Close button */}
                  <motion.button
                    initial={{ opacity: 0, rotate: -90 }}
                    animate={{ opacity: 1, rotate: 0 }}
                    transition={{ delay: 0.2 }}
                    onClick={onClose}
                    className="rounded-full p-2 transition-all duration-200 hover:bg-red-500/10 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
                    aria-label="Close modal"
                  >
                    <X className="h-5 w-5" />
                  </motion.button>
                </div>
              </div>

              {/* Message */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="px-6 py-6"
              >
                <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                  {message}
                </p>
              </motion.div>

              {/* Action buttons */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="flex items-center justify-end gap-3 px-6 py-5 bg-surface-muted/30 border-t border-surface"
              >
                {/* Cancel button */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl font-medium transition-all duration-200 bg-surface-muted hover:bg-surface text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500/40"
                >
                  {cancelText}
                </motion.button>

                {/* Delete button */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleConfirm}
                  className="px-5 py-2.5 rounded-xl font-medium transition-all duration-200 bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white shadow-lg shadow-red-500/25 hover:shadow-red-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
                >
                  {confirmText}
                </motion.button>
              </motion.div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
