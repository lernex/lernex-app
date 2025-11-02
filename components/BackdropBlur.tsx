"use client";

import { ReactNode, useEffect, useState } from "react";
import { CSSFeatures } from "@/lib/browser-detection";

interface BackdropBlurProps {
  /**
   * The children to render inside the backdrop blur container
   */
  children: ReactNode;

  /**
   * Blur intensity: sm, md, lg, xl, 2xl, 3xl
   * @default "md"
   */
  blur?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "none";

  /**
   * Additional CSS classes to apply
   */
  className?: string;

  /**
   * Fallback background color (used when backdrop-filter is not supported)
   * @default "var(--surface-panel)"
   */
  fallbackBg?: string;

  /**
   * Fallback background opacity (0-1)
   * @default 0.95
   */
  fallbackOpacity?: number;

  /**
   * Whether to always use the fallback (for testing)
   * @default false
   */
  forceFallback?: boolean;

  /**
   * HTML element type to render
   * @default "div"
   */
  as?: "div" | "section" | "header" | "footer" | "nav" | "aside" | "main";
}

/**
 * BackdropBlur Component
 *
 * A wrapper component that provides backdrop-filter blur effects with automatic
 * fallbacks for browsers that don't support the feature.
 *
 * Features:
 * - Automatic browser support detection
 * - Graceful fallback to semi-transparent background
 * - Configurable blur intensity
 * - Dark mode support
 * - TypeScript support
 *
 * @example
 * ```tsx
 * <BackdropBlur blur="lg" className="rounded-xl p-6">
 *   <h1>Content with blur background</h1>
 * </BackdropBlur>
 * ```
 */
export default function BackdropBlur({
  children,
  blur = "md",
  className = "",
  fallbackBg = "var(--surface-panel)",
  fallbackOpacity = 0.95,
  forceFallback = false,
  as: Element = "div",
}: BackdropBlurProps) {
  const [supportsBackdrop, setSupportsBackdrop] = useState<boolean>(true);

  useEffect(() => {
    // Check if backdrop-filter is supported
    const isSupported = !forceFallback && CSSFeatures.supportsBackdropFilter();
    setSupportsBackdrop(isSupported);
  }, [forceFallback]);

  // Backdrop blur class mapping
  const blurClasses: Record<typeof blur, string> = {
    none: "",
    sm: "backdrop-blur-sm",
    md: "backdrop-blur-md",
    lg: "backdrop-blur-lg",
    xl: "backdrop-blur-xl",
    "2xl": "backdrop-blur-2xl",
    "3xl": "backdrop-blur-3xl",
  };

  // Fallback background styles (when backdrop-filter is not supported)
  const fallbackStyles: React.CSSProperties = !supportsBackdrop
    ? {
        backgroundColor: fallbackBg,
        opacity: fallbackOpacity,
      }
    : {};

  // Combined classes
  const combinedClasses = [
    supportsBackdrop ? blurClasses[blur] : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Element className={combinedClasses} style={fallbackStyles}>
      {children}
    </Element>
  );
}

/**
 * Helper hook to check if backdrop-filter is supported
 */
export function useBackdropSupport() {
  const [supportsBackdrop, setSupportsBackdrop] = useState<boolean>(true);

  useEffect(() => {
    const isSupported = CSSFeatures.supportsBackdropFilter();
    setSupportsBackdrop(isSupported);
  }, []);

  return supportsBackdrop;
}

/**
 * Tailwind-compatible backdrop blur utility classes
 *
 * Use these directly in Tailwind className when you want manual control
 *
 * @example
 * ```tsx
 * <div className={`${backdropBlurClass('lg')} rounded-xl`}>
 *   Content
 * </div>
 * ```
 */
export function backdropBlurClass(blur: BackdropBlurProps["blur"] = "md"): string {
  const blurMap: Record<NonNullable<typeof blur>, string> = {
    none: "",
    sm: "backdrop-blur-sm",
    md: "backdrop-blur-md",
    lg: "backdrop-blur-lg",
    xl: "backdrop-blur-xl",
    "2xl": "backdrop-blur-2xl",
    "3xl": "backdrop-blur-3xl",
  };

  return blurMap[blur || "md"];
}
