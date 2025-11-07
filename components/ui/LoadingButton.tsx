import React from "react";
import { LoadingSpinner } from "./LoadingSpinner";
import { cn } from "@/lib/utils";

interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  children: React.ReactNode;
  spinnerSize?: "sm" | "md" | "lg" | "xl";
  loadingText?: string;
}

export function LoadingButton({
  loading = false,
  children,
  spinnerSize = "sm",
  loadingText,
  disabled,
  className,
  ...props
}: LoadingButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "relative inline-flex items-center justify-center gap-2",
        loading && "cursor-not-allowed opacity-75",
        className
      )}
      {...props}
    >
      {loading && (
        <LoadingSpinner size={spinnerSize} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
      )}
      <span className={cn(loading && "invisible")}>
        {loadingText && loading ? loadingText : children}
      </span>
    </button>
  );
}
