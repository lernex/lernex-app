"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";

export function ReactQueryProvider({ children }: { children: ReactNode }) {
  // Create QueryClient instance inside component to ensure it's created once per mount
  // and shared across all components in the tree
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Stale time: data is considered fresh for 5 minutes
            // This prevents redundant network requests for recently fetched data
            staleTime: 5 * 60 * 1000, // 5 minutes

            // Cache time: unused data is kept in cache for 10 minutes
            // This allows quick restoration of data if user navigates back
            gcTime: 10 * 60 * 1000, // 10 minutes (was cacheTime in v4)

            // Retry failed requests up to 1 time
            // This helps with temporary network issues without being too aggressive
            retry: 1,

            // Refetch on window focus to keep data fresh when user returns to tab
            refetchOnWindowFocus: true,

            // Don't refetch on mount if data is still fresh (within staleTime)
            refetchOnMount: false,

            // Refetch on reconnect to sync data after network interruptions
            refetchOnReconnect: true,
          },
          mutations: {
            // Retry failed mutations once
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
