"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, Loader2, Pause } from "lucide-react";

interface TTSButtonProps {
  lessonText: string;
  lessonId?: string; // Optional lesson ID for fetching pre-existing audio
  audioUrl?: string; // Optional pre-existing audio URL
  onAudioGenerated?: (audioUrl: string) => void; // Callback when new audio is generated
  className?: string;
}

/**
 * TTS Button Component
 *
 * Provides text-to-speech functionality for lesson content.
 * - Off by default (muted icon)
 * - Only generates TTS when user clicks the button
 * - Caches audio to prevent regeneration
 * - Shows loading state during generation
 * - Plays audio and shows playing state
 * - Allows pausing/resuming audio
 * - Stops audio on page/tab navigation
 * - Includes tooltip
 */
export default function TTSButton({
  lessonText,
  lessonId,
  audioUrl: initialAudioUrl,
  onAudioGenerated,
  className = ""
}: TTSButtonProps) {
  const [state, setState] = useState<"off" | "loading" | "playing" | "paused">("off");
  const [error, setError] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [cachedAudioUrl, setCachedAudioUrl] = useState<string | null>(initialAudioUrl || null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      if (audioUrlRef.current && !cachedAudioUrl) {
        // Only revoke if it's a blob URL and not a cached URL
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, [cachedAudioUrl]);

  // Pause audio when tab visibility changes (user switches tabs)
  // Only pause if already playing - don't interrupt loading
  useEffect(() => {
    const handleVisibilityChange = () => {
      // Only pause if audio is currently playing (not loading)
      if (document.hidden && audioRef.current && state === "playing") {
        audioRef.current.pause();
        setState("paused");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [state]);

  // Stop audio when navigating away (route change)
  useEffect(() => {
    const handleRouteChange = () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };

    // Listen for route changes
    window.addEventListener("beforeunload", handleRouteChange);

    return () => {
      window.removeEventListener("beforeunload", handleRouteChange);
      handleRouteChange();
    };
  }, []);

  const generateAndCacheAudio = async (): Promise<string> => {
    // Generate TTS
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ lessonText, lessonId }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Failed to generate audio" }));
      throw new Error(errorData.error || "Failed to generate audio");
    }

    // Get audio blob
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);

    // Cache the audio URL
    setCachedAudioUrl(audioUrl);

    // Notify parent component if callback provided
    if (onAudioGenerated) {
      onAudioGenerated(audioUrl);
    }

    return audioUrl;
  };

  const handleClick = async () => {
    try {
      setError(null);

      // If off, generate/load and play
      if (state === "off") {
        setState("loading");

        let audioUrl = cachedAudioUrl;

        // If no cached audio, generate new audio
        if (!audioUrl) {
          audioUrl = await generateAndCacheAudio();
        }

        // Clean up old audio URL if it exists and it's a blob
        if (audioUrlRef.current && audioUrlRef.current !== cachedAudioUrl) {
          URL.revokeObjectURL(audioUrlRef.current);
        }
        audioUrlRef.current = audioUrl;

        // Create audio element
        const audio = new Audio();
        audioRef.current = audio;

        audio.onended = () => {
          setState("off");
        };

        audio.onerror = (e) => {
          console.error("[TTS] Audio playback error:", e);
          setState("off");
          setError("Failed to play audio");
        };

        // Wait for audio to be ready before attempting to play
        audio.oncanplaythrough = async () => {
          // Only auto-play if the tab is visible
          // If tab is hidden, just set to paused state so user can play when they return
          if (!document.hidden) {
            try {
              await audio.play();
              setState("playing");
            } catch (playError) {
              console.error("[TTS] Play error:", playError);
              // If play fails, just set to paused so user can try again
              setState("paused");
            }
          } else {
            // Tab is hidden, don't auto-play but audio is ready
            setState("paused");
          }
        };

        // Set the audio source (this will trigger loading)
        audio.src = audioUrl;
      }
      // If playing, pause
      else if (state === "playing") {
        audioRef.current?.pause();
        setState("paused");
      }
      // If paused, resume
      else if (state === "paused") {
        await audioRef.current?.play();
        setState("playing");
      }
    } catch (err) {
      console.error("[TTS] Error:", err);
      setState("off");
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  };

  const getIcon = () => {
    switch (state) {
      case "loading":
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case "playing":
        return <Volume2 className="h-4 w-4" />;
      case "paused":
        return <Pause className="h-4 w-4" />;
      case "off":
      default:
        return <VolumeX className="h-4 w-4" />;
    }
  };

  const getTooltipText = () => {
    if (error) return error;
    switch (state) {
      case "loading":
        return "Generating speech...";
      case "playing":
        return "Pause audio";
      case "paused":
        return "Resume audio";
      case "off":
      default:
        return cachedAudioUrl ? "Play audio" : "Listen to lesson";
    }
  };

  const getButtonColor = () => {
    if (error) return "border-red-500/70 bg-red-500/15 text-red-700 dark:text-red-300";
    switch (state) {
      case "loading":
        return "border-lernex-blue/70 bg-lernex-blue/15 text-lernex-blue animate-pulse";
      case "playing":
        return "border-lernex-blue/70 bg-lernex-blue/15 text-lernex-blue shadow-sm";
      case "paused":
        return "border-amber-500/70 bg-amber-400/15 text-amber-700 dark:text-amber-300 shadow-sm";
      case "off":
      default:
        return "border-surface bg-surface-muted text-neutral-600 hover:bg-surface-card dark:text-neutral-300";
    }
  };

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        onClick={handleClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        disabled={state === "loading"}
        className={`px-3 py-1.5 rounded-full border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lernex-blue/40 disabled:cursor-not-allowed ${getButtonColor()}`}
        aria-label={getTooltipText()}
      >
        <span className="flex items-center gap-1.5">
          {getIcon()}
          <span className="text-sm font-medium">
            {state === "loading" && "Loading..."}
            {state === "playing" && "Playing"}
            {state === "paused" && "Paused"}
            {state === "off" && "Audio"}
          </span>
        </span>
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-neutral-900 dark:bg-neutral-800 text-white text-xs rounded-lg shadow-lg whitespace-nowrap pointer-events-none z-50 animate-in fade-in slide-in-from-bottom-1 duration-200">
          {getTooltipText()}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <div className="border-4 border-transparent border-t-neutral-900 dark:border-t-neutral-800" />
          </div>
        </div>
      )}

      {/* Error message (if any) - shown briefly */}
      {error && (
        <div className="absolute top-full left-0 mt-2 px-3 py-2 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 text-xs rounded-lg shadow-lg whitespace-nowrap z-50 animate-in fade-in slide-in-from-top-1 duration-200">
          {error}
        </div>
      )}
    </div>
  );
}
