"use client";

import { useState, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { UsageLimitCheck } from "@/lib/usage";

/**
 * Custom hook for checking user's usage limits before generation
 * Returns a function to check limits and modal state management
 */
export function useUsageLimitCheck() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [limitData, setLimitData] = useState<UsageLimitCheck | null>(null);

  /**
   * Check if user can perform generation
   * Returns true if allowed, false if limit exceeded (and shows modal)
   */
  const checkLimit = useCallback(async (): Promise<boolean> => {
    try {
      const supabase = supabaseBrowser();

      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        console.error("No user found");
        return false;
      }

      // Check usage limit via API
      const response = await fetch("/api/usage/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: user.id }),
      });

      if (!response.ok) {
        console.error("Failed to check usage limit");
        return false;
      }

      const data: UsageLimitCheck = await response.json();
      setLimitData(data);

      if (!data.allowed) {
        // Show modal if limit exceeded
        setIsModalOpen(true);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error checking usage limit:", error);
      return false;
    }
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  return {
    checkLimit,
    isModalOpen,
    closeModal,
    limitData,
  };
}
