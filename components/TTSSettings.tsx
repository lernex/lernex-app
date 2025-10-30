"use client";

import { useEffect, useState, useRef } from "react";
import { Volume2, Check, Loader2, Play, Pause } from "lucide-react";

interface TTSSettingsProps {
  onSave?: () => void;
}

interface Voice {
  id: string;
  name: string;
  gender: string;
  accent: string;
}

const AVAILABLE_VOICES: Voice[] = [
  { id: "af_bella", name: "Bella", gender: "Female", accent: "American" },
  { id: "af_sarah", name: "Sarah", gender: "Female", accent: "American" },
  { id: "am_adam", name: "Adam", gender: "Male", accent: "American" },
  { id: "am_michael", name: "Michael", gender: "Male", accent: "American" },
  { id: "bf_emma", name: "Emma", gender: "Female", accent: "British" },
  { id: "bf_isabella", name: "Isabella", gender: "Female", accent: "British" },
  { id: "bm_george", name: "George", gender: "Male", accent: "British" },
  { id: "bm_lewis", name: "Lewis", gender: "Male", accent: "British" },
];

export default function TTSSettings({ onSave }: TTSSettingsProps) {
  const [selectedVoice, setSelectedVoice] = useState<string>("af_bella");
  const [autoPlay, setAutoPlay] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCache = useRef<Map<string, string>>(new Map());

  // Load current settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch("/api/tts/settings");
        if (response.ok) {
          const data = await response.json();
          setSelectedVoice(data.tts_voice || "af_bella");
          setAutoPlay(data.tts_auto_play || false);
        }
      } catch (error) {
        console.error("Failed to load TTS settings:", error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      // Revoke all cached blob URLs
      audioCache.current.forEach((url) => URL.revokeObjectURL(url));
      audioCache.current.clear();
    };
  }, []);

  const playVoicePreview = async (voiceId: string) => {
    try {
      // If already playing this voice, pause it
      if (playingVoice === voiceId && audioRef.current) {
        audioRef.current.pause();
        setPlayingVoice(null);
        return;
      }

      // Pause any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
      }

      setPlayingVoice(voiceId);

      // Check if we have cached audio for this voice
      let audioUrl = audioCache.current.get(voiceId);

      if (!audioUrl) {
        // Fetch the voice preview
        const response = await fetch(`/api/tts/voice-preview?voice=${voiceId}`);
        if (!response.ok) {
          throw new Error("Failed to load voice preview");
        }

        const audioBlob = await response.blob();
        audioUrl = URL.createObjectURL(audioBlob);
        audioCache.current.set(voiceId, audioUrl);
      }

      // Create and play audio
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setPlayingVoice(null);
      };

      audio.onerror = () => {
        setPlayingVoice(null);
        console.error("Failed to play voice preview");
      };

      await audio.play();
    } catch (error) {
      console.error("Error playing voice preview:", error);
      setPlayingVoice(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch("/api/tts/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tts_voice: selectedVoice,
          tts_auto_play: autoPlay,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save settings");
      }

      setSaveMessage("Settings saved successfully!");
      setTimeout(() => setSaveMessage(null), 3000);

      if (onSave) {
        onSave();
      }
    } catch (error) {
      console.error("Error saving TTS settings:", error);
      setSaveMessage("Failed to save settings. Please try again.");
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-lernex-blue" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-surface">
        <Volume2 className="h-5 w-5 text-lernex-blue" />
        <div>
          <h3 className="text-lg font-semibold text-foreground">Text-to-Speech Settings</h3>
          <p className="text-sm text-muted-foreground">Customize your audio learning experience</p>
        </div>
      </div>

      {/* Voice Selection */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">Voice Selection</label>
        <p className="text-xs text-muted-foreground">Choose your preferred voice and preview it</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          {AVAILABLE_VOICES.map((voice) => {
            const isSelected = selectedVoice === voice.id;
            const isPlaying = playingVoice === voice.id;

            return (
              <button
                key={voice.id}
                onClick={() => setSelectedVoice(voice.id)}
                className={`relative p-4 rounded-xl border-2 transition-all duration-200 text-left group ${
                  isSelected
                    ? "border-lernex-blue bg-lernex-blue/10 shadow-md"
                    : "border-surface bg-surface-card hover:border-lernex-blue/30 hover:bg-surface-muted"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className={`font-semibold ${isSelected ? "text-lernex-blue" : "text-foreground"}`}>
                        {voice.name}
                      </h4>
                      {isSelected && (
                        <Check className="h-4 w-4 text-lernex-blue animate-in zoom-in duration-200" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="px-2 py-0.5 bg-surface rounded-full">{voice.gender}</span>
                      <span className="px-2 py-0.5 bg-surface rounded-full">{voice.accent}</span>
                    </div>
                  </div>

                  {/* Preview Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      playVoicePreview(voice.id);
                    }}
                    className={`p-2 rounded-lg transition-all duration-200 ${
                      isPlaying
                        ? "bg-lernex-blue text-white shadow-sm"
                        : "bg-surface hover:bg-surface-muted text-muted-foreground hover:text-foreground"
                    }`}
                    title="Preview voice"
                  >
                    {isPlaying ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {/* Animated selection indicator */}
                {isSelected && (
                  <div className="absolute inset-0 rounded-xl border-2 border-lernex-blue animate-pulse pointer-events-none" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Auto-Play Toggle */}
      <div className="p-4 rounded-xl border border-surface bg-surface-card space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <label htmlFor="auto-play-toggle" className="text-sm font-medium text-foreground cursor-pointer">
              Auto-Play Text-to-Speech
            </label>
            <p className="text-xs text-muted-foreground mt-1">
              Automatically generate and play audio when lessons are generated
            </p>
          </div>

          {/* Toggle Switch */}
          <button
            id="auto-play-toggle"
            onClick={() => setAutoPlay(!autoPlay)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-lernex-blue focus:ring-offset-2 ${
              autoPlay ? "bg-lernex-blue" : "bg-surface"
            }`}
            role="switch"
            aria-checked={autoPlay}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                autoPlay ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Warning message when auto-play is enabled */}
        {autoPlay && (
          <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg animate-in fade-in slide-in-from-top-2 duration-200">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              <strong>Note:</strong> Auto-play will generate TTS for every lesson, which may increase your usage costs.
            </p>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-3 pt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-lernex-blue text-white rounded-xl font-medium hover:bg-lernex-blue/90 focus:outline-none focus:ring-2 focus:ring-lernex-blue focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md"
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </span>
          ) : (
            "Save Settings"
          )}
        </button>

        {/* Save message */}
        {saveMessage && (
          <span
            className={`text-sm animate-in fade-in slide-in-from-left-2 duration-200 ${
              saveMessage.includes("success")
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {saveMessage}
          </span>
        )}
      </div>
    </div>
  );
}
