"use client";
import { motion, useAnimation } from "framer-motion";
import { ReactNode, useRef } from "react";

export default function SwipeCard({ children, onSwipeLeft, onSwipeRight }: {
  children: ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}) {
  const controls = useAnimation();
  const threshold = 120;
  const ref = useRef<HTMLDivElement>(null);

  return (
    <motion.div
      ref={ref}
      className="rounded-2xl bg-gradient-to-br from-white via-slate-50/30 to-white border border-slate-200/80 shadow-card shadow-slate-900/5 ring-1 ring-slate-900/5 p-5 transition-all duration-300 dark:from-neutral-900 dark:via-neutral-800/20 dark:to-neutral-900 dark:border-neutral-800 dark:shadow-xl dark:shadow-black/20 dark:ring-black/10"
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={(_, info) => {
        const x = info.offset.x;
        if (x > threshold) onSwipeRight?.();
        else if (x < -threshold) onSwipeLeft?.();
        controls.start({ x: 0, rotate: 0, transition: { type: "spring", stiffness: 300 } });
      }}
      whileDrag={{ rotate: 2 }}
      animate={controls}
    >
      {children}
    </motion.div>
  );
}
