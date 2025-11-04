"use client";

import { Component, type ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }

      return (
        <div className="flex min-h-[calc(100vh-56px)] flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-lg dark:border-red-900/50 dark:bg-red-950/20">
            <h2 className="mb-2 text-lg font-semibold text-red-800 dark:text-red-200">
              Something went wrong
            </h2>
            <p className="mb-4 text-sm text-red-600 dark:text-red-300">
              {this.state.error.message || "An unexpected error occurred"}
            </p>
            <button
              onClick={this.reset}
              className="rounded-full border border-slate-300/80 bg-surface-muted px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-all hover:bg-surface-card hover:shadow-md dark:border-neutral-700"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
