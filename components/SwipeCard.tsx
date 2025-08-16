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
      className="rounded-2xl bg-neutral-900 border border-neutral-800 shadow-lg p-5"
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
