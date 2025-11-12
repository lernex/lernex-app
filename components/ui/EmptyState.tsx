"use client";

import React from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  animated?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  animated = true,
}: EmptyStateProps) {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.1,
      },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  const iconVariant = {
    hidden: { scale: 0, rotate: -180 },
    show: {
      scale: 1,
      rotate: 0,
      transition: {
        type: "spring" as const,
        stiffness: 200,
        damping: 15,
      },
    },
  };

  const Container = animated ? motion.div : "div";
  const IconContainer = animated ? motion.div : "div";
  const Title = animated ? motion.h3 : "h3";
  const Description = animated ? motion.p : "p";
  const Actions = animated ? motion.div : "div";

  return (
    <Container
      variants={animated ? container : undefined}
      initial={animated ? "hidden" : undefined}
      animate={animated ? "show" : undefined}
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4 text-center",
        className
      )}
    >
      {Icon && (
        <IconContainer
          variants={animated ? iconVariant : undefined}
          className="mb-6 rounded-full bg-gradient-to-br from-lernex-blue/10 via-lernex-purple/5 to-transparent dark:from-lernex-blue/8 dark:via-lernex-purple/4 p-8 relative overflow-hidden group"
        >
          {/* Animated glow effect */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-lernex-blue/20 to-lernex-purple/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl" />
          <Icon className="h-12 w-12 text-lernex-blue dark:text-lernex-blue/80 relative z-10 group-hover:scale-110 transition-transform duration-300" />
        </IconContainer>
      )}
      <Title
        variants={animated ? item : undefined}
        className="text-2xl font-semibold text-gray-900 dark:text-white mb-2"
      >
        {title}
      </Title>
      {description && (
        <Description
          variants={animated ? item : undefined}
          className="text-gray-600 dark:text-gray-400 max-w-md mb-8 leading-relaxed"
        >
          {description}
        </Description>
      )}
      {(action || secondaryAction) && (
        <Actions
          variants={animated ? item : undefined}
          className="flex flex-col sm:flex-row gap-3"
        >
          {action && (
            <button
              onClick={action.onClick}
              className="px-6 py-3 bg-gradient-to-r from-lernex-blue to-lernex-purple text-white rounded-xl font-medium shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 button-press"
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="px-6 py-3 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-xl font-medium hover:border-lernex-blue dark:hover:border-lernex-blue transition-all duration-200 button-press"
            >
              {secondaryAction.label}
            </button>
          )}
        </Actions>
      )}
    </Container>
  );
}
