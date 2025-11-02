"use client";

import { useState, useRef, useEffect } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { WebAPIFeatures } from "@/lib/browser-detection";

interface VoiceInputProps {
  onTranscription: (text: string) => void;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export default function VoiceInput({
  onTranscription,
  className = "",
  size = "md",
}: VoiceInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState<string>("");
  const [isSupported, setIsSupported] = useState<boolean>(true);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Check browser support for MediaRecorder API
  useEffect(() => {
    const supported = WebAPIFeatures.supportsMediaRecorder();
    setIsSupported(supported);

    if (!supported) {
      setError("Voice input is not supported in your browser. Please use a modern browser like Chrome, Edge, or Safari.");
    }
  }, []);

  // Get available audio devices
  const getAudioDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((device) => device.kind === "audioinput");
      setAudioDevices(audioInputs);

      // Set default device if none selected
      if (!selectedDeviceId && audioInputs.length > 0) {
        setSelectedDeviceId(audioInputs[0].deviceId);
      }
    } catch (err) {
      console.error("Error getting audio devices:", err);
      setError("Failed to access audio devices");
    }
  };

  // Request microphone permission and show device selector
  const handleMicClick = async () => {
    if (isRecording) {
      stopRecording();
      return;
    }

    try {
      // Request permission first
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Get available devices
      await getAudioDevices();

      // If multiple devices, show modal to choose
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((device) => device.kind === "audioinput");

      if (audioInputs.length > 1) {
        setShowDeviceModal(true);
      } else {
        // Start recording with default device
        startRecording(audioInputs[0]?.deviceId);
      }
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setError("Microphone access denied. Please enable microphone permissions.");
      setTimeout(() => setError(""), 5000);
    }
  };

  // Start recording with selected device
  const startRecording = async (deviceId?: string) => {
    try {
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      });

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        await sendAudioForTranscription(audioBlob);

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setShowDeviceModal(false);
      setRecordingTime(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Error starting recording:", err);
      setError("Failed to start recording");
      setTimeout(() => setError(""), 5000);
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  // Send audio to API for transcription
  const sendAudioForTranscription = async (audioBlob: Blob) => {
    setIsProcessing(true);

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      formData.append("duration", recordingTime.toString());

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Transcription failed");
      }

      const data = await response.json();

      if (data.text) {
        onTranscription(data.text);
      } else {
        throw new Error("No transcription text received");
      }
    } catch (err) {
      console.error("Error transcribing audio:", err);
      setError(err instanceof Error ? err.message : "Failed to transcribe audio");
      setTimeout(() => setError(""), 5000);
    } finally {
      setIsProcessing(false);
      setRecordingTime(0);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (mediaRecorderRef.current && isRecording) {
        stopRecording();
      }
    };
  }, []);

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Size classes
  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12",
  };

  const iconSizes = {
    sm: 16,
    md: 20,
    lg: 24,
  };

  return (
    <>
      <div className={`relative ${className}`}>
        <button
          type="button"
          onClick={handleMicClick}
          disabled={isProcessing || !isSupported}
          className={`
            ${sizeClasses[size]}
            rounded-full transition-all duration-300
            flex items-center justify-center
            ${
              isRecording
                ? "bg-red-500 hover:bg-red-600 animate-pulse"
                : isProcessing
                ? "bg-surface-card border border-surface"
                : !isSupported
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-lernex-blue hover:bg-lernex-blue/80"
            }
            disabled:opacity-50 disabled:cursor-not-allowed
            shadow-lg hover:shadow-xl
            group relative
          `}
          aria-label={
            !isSupported
              ? "Voice input not supported"
              : isRecording
                ? "Stop recording"
                : "Start voice input"
          }
        >
          {isProcessing ? (
            <Loader2 size={iconSizes[size]} className="text-foreground animate-spin" />
          ) : isRecording ? (
            <Square size={iconSizes[size]} className="text-white fill-white" />
          ) : (
            <Mic size={iconSizes[size]} className="text-white" />
          )}

          {/* Tooltip */}
          {!isRecording && !isProcessing && (
            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              Voice input
            </span>
          )}
        </button>

        {/* Recording timer */}
        {isRecording && (
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-red-500 text-white text-xs px-2 py-1 rounded-full font-mono shadow-lg animate-in fade-in slide-in-from-bottom-2">
            {formatTime(recordingTime)}
          </div>
        )}

        {/* Processing indicator */}
        {isProcessing && (
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-lernex-blue text-white text-xs px-2 py-1 rounded-full shadow-lg animate-in fade-in slide-in-from-bottom-2">
            Transcribing...
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-red-500 text-white text-xs px-3 py-2 rounded-lg shadow-lg max-w-[200px] text-center animate-in fade-in slide-in-from-top-2 z-50">
            {error}
          </div>
        )}
      </div>

      {/* Device selection modal */}
      {showDeviceModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-surface-card border border-surface rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Select Microphone
            </h3>

            <div className="space-y-2 mb-6">
              {audioDevices.map((device) => (
                <button
                  key={device.deviceId}
                  onClick={() => {
                    setSelectedDeviceId(device.deviceId);
                    startRecording(device.deviceId);
                  }}
                  className={`
                    w-full text-left px-4 py-3 rounded-xl transition-all
                    ${
                      selectedDeviceId === device.deviceId
                        ? "bg-lernex-blue text-white"
                        : "bg-surface hover:bg-surface-card border border-surface"
                    }
                  `}
                >
                  <div className="flex items-center gap-3">
                    <Mic size={18} />
                    <span className="text-sm font-medium">
                      {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowDeviceModal(false)}
              className="w-full px-4 py-2 bg-surface hover:bg-surface-card border border-surface text-foreground rounded-xl transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
