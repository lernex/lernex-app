import React from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4 text-center",
        className
      )}
    >
      {Icon && (
        <div className="mb-4 rounded-full bg-lernex-blue/10 dark:bg-lernex-blue/5 p-6">
          <Icon className="h-12 w-12 text-lernex-blue dark:text-lernex-blue/80" />
        </div>
      )}
      <h3 className="text-xl font-semibold text-lernex-charcoal dark:text-white mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-lernex-charcoal/70 dark:text-white/60 max-w-md mb-6">
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="px-6 py-3 bg-gradient-to-r from-lernex-blue to-lernex-purple text-white rounded-xl font-medium shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
