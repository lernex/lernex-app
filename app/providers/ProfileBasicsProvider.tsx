"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ProfileBasics } from "@/lib/profile-basics";
import { normalizeProfileBasics, type ProfileBasicsSource } from "@/lib/profile-basics";

const DEFAULT_VALUE: ProfileBasics = { interests: [], levelMap: {}, placementReady: false };

type ProfileBasicsContextValue = {
  data: ProfileBasics;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
};

const ProfileBasicsContext = createContext<ProfileBasicsContextValue | undefined>(undefined);

function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(typeof err === "string" ? err : "Unknown error");
}

async function fetchProfileBasics(signal?: AbortSignal): Promise<ProfileBasics> {
  const res = await fetch("/api/profile/me", { cache: "no-store", signal });
  if (!res.ok) {
    throw new Error(`Profile request failed (${res.status})`);
  }
  const json = (await res.json().catch(() => ({}))) as ProfileBasicsSource;
  return normalizeProfileBasics(json);
}

type ProviderProps = {
  children: ReactNode;
  initialData?: ProfileBasics | null;
};

export function ProfileBasicsProvider({ children, initialData }: ProviderProps) {
  const [data, setData] = useState<ProfileBasics>(initialData ?? DEFAULT_VALUE);
  const [loading, setLoading] = useState<boolean>(!initialData);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef<Promise<void> | null>(null);

  const runFetch = useCallback(() => {
    if (pendingRef.current) return pendingRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    const promise = fetchProfileBasics(controller.signal)
      .then((next) => {
        setData(next);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(toError(err));
      })
      .finally(() => {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        if (pendingRef.current === promise) {
          pendingRef.current = null;
        }
        setLoading(false);
      });
    pendingRef.current = promise;
    return promise;
  }, []);

  const refresh = useCallback(async () => {
    await runFetch();
  }, [runFetch]);

  useEffect(() => {
    if (initialData) {
      setLoading(false);
      return;
    }
    runFetch().catch(() => {});
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [initialData, runFetch]);

  const value = useMemo<ProfileBasicsContextValue>(() => ({
    data,
    loading,
    error,
    refresh,
  }), [data, loading, error, refresh]);

  return <ProfileBasicsContext.Provider value={value}>{children}</ProfileBasicsContext.Provider>;
}

export function useProfileBasics(): ProfileBasicsContextValue {
  const ctx = useContext(ProfileBasicsContext);
  if (!ctx) throw new Error("useProfileBasics must be used within a ProfileBasicsProvider");
  return ctx;
}
