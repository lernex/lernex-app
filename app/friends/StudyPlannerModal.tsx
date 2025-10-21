"use client";

import { useState, useEffect } from "react";
import {
  X,
  Calendar,
  Clock,
  BookOpen,
  FileText,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Check,
  Sparkles,
} from "lucide-react";

type StudyPlannerModalProps = {
  isOpen: boolean;
  onClose: () => void;
  friend: {
    id: string;
    username: string | null;
    fullName: string | null;
    avatarUrl: string | null;
  };
  onSessionCreated?: () => void;
};

type StepType = "datetime" | "details" | "review";

const SUBJECTS = [
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "English",
  "History",
  "Computer Science",
  "Economics",
  "Psychology",
  "Other",
];

const DURATION_PRESETS = [
  { label: "30 min", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "1.5 hours", value: 90 },
  { label: "2 hours", value: 120 },
  { label: "3 hours", value: 180 },
];

function cn(...classes: Array<string | null | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

function displayName(username: string | null, fullName: string | null, fallback: string) {
  const trimmedFullName = fullName?.trim();
  const trimmedUsername = username?.trim();
  if (trimmedFullName && trimmedFullName.length > 0) return trimmedFullName;
  if (trimmedUsername && trimmedUsername.length > 0) return trimmedUsername;
  return fallback;
}

export default function StudyPlannerModal({
  isOpen,
  onClose,
  friend,
  onSessionCreated,
}: StudyPlannerModalProps) {
  const [step, setStep] = useState<StepType>("datetime");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calendar state
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState("");
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Details state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState("");
  const [customSubject, setCustomSubject] = useState("");
  const [topics, setTopics] = useState("");
  const [duration, setDuration] = useState(60);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep("datetime");
      setSelectedDate(null);
      setSelectedTime("");
      setTitle("");
      setDescription("");
      setSubject("");
      setCustomSubject("");
      setTopics("");
      setDuration(60);
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const friendName = displayName(friend.username, friend.fullName, "Friend");

  // Calendar logic
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: Array<Date | null> = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const isDateDisabled = (date: Date | null) => {
    if (!date) return true;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const isDateSelected = (date: Date | null) => {
    if (!date || !selectedDate) return false;
    return (
      date.getDate() === selectedDate.getDate() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getFullYear() === selectedDate.getFullYear()
    );
  };

  const formatMonthYear = (date: Date) => {
    return new Intl.DateTimeFormat(undefined, {
      month: "long",
      year: "numeric",
    }).format(date);
  };

  const formatDateLong = (date: Date | null) => {
    if (!date) return "";
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(date);
  };

  const generateTimeSlots = () => {
    const slots: string[] = [];
    for (let hour = 6; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const h = hour.toString().padStart(2, "0");
        const m = minute.toString().padStart(2, "0");
        slots.push(`${h}:${m}`);
      }
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();

  const canProceedFromDateTime = selectedDate !== null && selectedTime !== "";
  const canProceedFromDetails = title.trim().length > 0;

  const finalSubject = subject === "Other" ? customSubject : subject;

  const handleNextStep = () => {
    if (step === "datetime" && canProceedFromDateTime) {
      setStep("details");
    } else if (step === "details" && canProceedFromDetails) {
      setStep("review");
    }
  };

  const handleBack = () => {
    if (step === "details") setStep("datetime");
    else if (step === "review") setStep("details");
  };

  const handleSubmit = async () => {
    if (!selectedDate || !selectedTime || !title.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const [hours, minutes] = selectedTime.split(":").map(Number);
      const scheduledDateTime = new Date(selectedDate);
      scheduledDateTime.setHours(hours, minutes, 0, 0);

      const topicsArray = topics
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const response = await fetch("/api/study-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          friendId: friend.id,
          title: title.trim(),
          description: description.trim() || null,
          subject: finalSubject.trim() || null,
          topics: topicsArray.length > 0 ? topicsArray : null,
          scheduledAt: scheduledDateTime.toISOString(),
          durationMinutes: duration,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to create session");
      }

      if (onSessionCreated) onSessionCreated();
      onClose();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md p-4 animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div
        className={cn(
          "relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-3xl",
          "border border-neutral-200/70 bg-gradient-to-br from-white via-slate-50/80 to-white/95",
          "shadow-[0_50px_120px_-50px_rgba(47,128,237,0.5)] transition-all duration-500",
          "dark:border-neutral-800 dark:bg-gradient-to-br dark:from-[#101a2c] dark:via-[#0d1524] dark:to-[#090f1c]",
          "animate-in slide-in-from-bottom-8 zoom-in-95 duration-400"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200/70 bg-gradient-to-r from-lernex-blue/10 via-lernex-purple/5 to-transparent px-6 py-4 dark:border-neutral-700">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-lernex-blue to-lernex-purple text-white shadow-lg">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
                Plan Study Session
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                with {friendName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-neutral-600 shadow-sm transition-all duration-200 hover:bg-neutral-100 hover:scale-110 hover:rotate-90 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-b from-neutral-50/50 to-transparent dark:from-neutral-900/30">
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300",
              step === "datetime"
                ? "bg-gradient-to-br from-lernex-blue to-lernex-purple text-white shadow-md scale-110"
                : "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400"
            )}
          >
            1
          </div>
          <div
            className={cn(
              "h-0.5 w-12 transition-all duration-300",
              step !== "datetime"
                ? "bg-gradient-to-r from-lernex-blue to-lernex-purple"
                : "bg-neutral-200 dark:bg-neutral-700"
            )}
          />
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300",
              step === "details"
                ? "bg-gradient-to-br from-lernex-blue to-lernex-purple text-white shadow-md scale-110"
                : step === "review"
                ? "bg-lernex-blue/20 text-lernex-blue dark:bg-lernex-blue/30"
                : "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400"
            )}
          >
            2
          </div>
          <div
            className={cn(
              "h-0.5 w-12 transition-all duration-300",
              step === "review"
                ? "bg-gradient-to-r from-lernex-blue to-lernex-purple"
                : "bg-neutral-200 dark:bg-neutral-700"
            )}
          />
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300",
              step === "review"
                ? "bg-gradient-to-br from-lernex-blue to-lernex-purple text-white shadow-md scale-110"
                : "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400"
            )}
          >
            3
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-220px)] px-6 py-4">
          {error && (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
              {error}
            </div>
          )}

          {/* Step 1: Date & Time */}
          {step === "datetime" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-3">
                  <Calendar className="h-4 w-4" />
                  Select Date
                </label>
                <div className="rounded-2xl border border-neutral-200/70 bg-white/60 p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-800/40">
                  <div className="flex items-center justify-between mb-4">
                    <button
                      onClick={() => {
                        const prev = new Date(currentMonth);
                        prev.setMonth(prev.getMonth() - 1);
                        setCurrentMonth(prev);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 transition hover:bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-600"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div className="text-sm font-semibold text-neutral-900 dark:text-white">
                      {formatMonthYear(currentMonth)}
                    </div>
                    <button
                      onClick={() => {
                        const next = new Date(currentMonth);
                        next.setMonth(next.getMonth() + 1);
                        setCurrentMonth(next);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 transition hover:bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-600"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-2">
                    {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
                      <div
                        key={day}
                        className="flex h-8 items-center justify-center text-xs font-medium text-neutral-500 dark:text-neutral-400"
                      >
                        {day}
                      </div>
                    ))}
                    {getDaysInMonth(currentMonth).map((date, index) => {
                      const disabled = isDateDisabled(date);
                      const selected = isDateSelected(date);
                      return (
                        <button
                          key={index}
                          onClick={() => !disabled && date && setSelectedDate(date)}
                          disabled={disabled}
                          className={cn(
                            "flex h-10 w-full items-center justify-center rounded-xl text-sm font-medium transition-all duration-200",
                            disabled &&
                              "cursor-not-allowed text-neutral-300 dark:text-neutral-600",
                            !disabled &&
                              !selected &&
                              "bg-neutral-100 text-neutral-700 hover:bg-gradient-to-br hover:from-lernex-blue/20 hover:to-lernex-purple/20 hover:text-lernex-blue hover:scale-105 hover:shadow-md dark:bg-neutral-700/50 dark:text-neutral-200 dark:hover:bg-neutral-700",
                            selected &&
                              "bg-gradient-to-br from-lernex-blue to-lernex-purple text-white shadow-lg scale-110 ring-2 ring-lernex-blue/30 animate-in zoom-in-50 duration-200"
                          )}
                        >
                          {date ? date.getDate() : ""}
                        </button>
                      );
                    })}
                  </div>
                  {selectedDate && (
                    <div className="mt-4 rounded-xl border border-lernex-blue/30 bg-gradient-to-r from-lernex-blue/10 to-lernex-purple/10 px-4 py-2 text-sm text-lernex-blue dark:text-lernex-blue/90">
                      {formatDateLong(selectedDate)}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-3">
                  <Clock className="h-4 w-4" />
                  Select Time
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {timeSlots.map((time) => (
                    <button
                      key={time}
                      onClick={() => setSelectedTime(time)}
                      className={cn(
                        "rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200",
                        selectedTime === time
                          ? "bg-gradient-to-br from-lernex-blue to-lernex-purple text-white shadow-lg scale-105 ring-2 ring-lernex-blue/30 animate-in zoom-in-50 duration-200"
                          : "bg-neutral-100 text-neutral-700 hover:bg-gradient-to-br hover:from-lernex-blue/15 hover:to-lernex-purple/15 hover:text-lernex-blue hover:scale-105 hover:shadow-md dark:bg-neutral-700/50 dark:text-neutral-200 dark:hover:bg-neutral-700"
                      )}
                    >
                      {time}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-3">
                  <Clock className="h-4 w-4" />
                  Duration
                </label>
                <div className="flex flex-wrap gap-2">
                  {DURATION_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      onClick={() => setDuration(preset.value)}
                      className={cn(
                        "rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200",
                        duration === preset.value
                          ? "bg-gradient-to-br from-lernex-blue to-lernex-purple text-white shadow-lg scale-105 ring-2 ring-lernex-blue/30"
                          : "bg-neutral-100 text-neutral-700 hover:bg-gradient-to-br hover:from-lernex-blue/15 hover:to-lernex-purple/15 hover:text-lernex-blue hover:scale-105 hover:shadow-md dark:bg-neutral-700/50 dark:text-neutral-200 dark:hover:bg-neutral-700"
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Details */}
          {step === "details" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
                  <FileText className="h-4 w-4" />
                  Session Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Algebra Problem Solving"
                  className="w-full rounded-xl border border-neutral-200/70 bg-white/80 px-4 py-3 text-sm text-neutral-900 outline-none transition-all duration-200 focus:border-lernex-blue/60 focus:ring-2 focus:ring-lernex-blue/30 focus:shadow-lg focus:shadow-lernex-blue/10 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-white"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
                  <BookOpen className="h-4 w-4" />
                  Subject
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                  {SUBJECTS.map((subj) => (
                    <button
                      key={subj}
                      onClick={() => setSubject(subj)}
                      className={cn(
                        "rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200",
                        subject === subj
                          ? "bg-gradient-to-br from-lernex-blue to-lernex-purple text-white shadow-lg scale-105 ring-2 ring-lernex-blue/30"
                          : "bg-neutral-100 text-neutral-700 hover:bg-gradient-to-br hover:from-lernex-blue/15 hover:to-lernex-purple/15 hover:text-lernex-blue hover:scale-105 hover:shadow-md dark:bg-neutral-700/50 dark:text-neutral-200 dark:hover:bg-neutral-700"
                      )}
                    >
                      {subj}
                    </button>
                  ))}
                </div>
                {subject === "Other" && (
                  <input
                    type="text"
                    value={customSubject}
                    onChange={(e) => setCustomSubject(e.target.value)}
                    placeholder="Enter subject name"
                    className="w-full rounded-xl border border-neutral-200/70 bg-white/80 px-4 py-3 text-sm text-neutral-900 outline-none transition-all duration-200 focus:border-lernex-blue/60 focus:ring-2 focus:ring-lernex-blue/30 focus:shadow-lg focus:shadow-lernex-blue/10 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-white animate-in fade-in slide-in-from-top-2"
                  />
                )}
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
                  <FileText className="h-4 w-4" />
                  Topics (comma-separated)
                </label>
                <input
                  type="text"
                  value={topics}
                  onChange={(e) => setTopics(e.target.value)}
                  placeholder="e.g., Quadratic equations, Factoring, Graphing"
                  className="w-full rounded-xl border border-neutral-200/70 bg-white/80 px-4 py-3 text-sm text-neutral-900 outline-none transition-all duration-200 focus:border-lernex-blue/60 focus:ring-2 focus:ring-lernex-blue/30 focus:shadow-lg focus:shadow-lernex-blue/10 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-white"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
                  <FileText className="h-4 w-4" />
                  Notes (optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add any additional notes or goals for this session..."
                  rows={4}
                  className="w-full rounded-xl border border-neutral-200/70 bg-white/80 px-4 py-3 text-sm text-neutral-900 outline-none transition-all duration-200 focus:border-lernex-blue/60 focus:ring-2 focus:ring-lernex-blue/30 focus:shadow-lg focus:shadow-lernex-blue/10 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-white resize-none"
                />
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === "review" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="rounded-2xl border border-lernex-blue/30 bg-gradient-to-br from-lernex-blue/5 via-lernex-purple/5 to-transparent p-6 dark:border-lernex-blue/40 dark:from-lernex-blue/10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-lernex-blue to-lernex-purple text-white shadow-lg">
                    <Check className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
                      {title}
                    </h3>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      with {friendName}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-xl bg-white/60 px-4 py-3 dark:bg-neutral-800/40">
                    <Calendar className="h-5 w-5 text-lernex-blue" />
                    <div className="flex-1">
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        Date & Time
                      </div>
                      <div className="text-sm font-medium text-neutral-900 dark:text-white">
                        {selectedDate && formatDateLong(selectedDate)} at {selectedTime}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-xl bg-white/60 px-4 py-3 dark:bg-neutral-800/40">
                    <Clock className="h-5 w-5 text-lernex-purple" />
                    <div className="flex-1">
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        Duration
                      </div>
                      <div className="text-sm font-medium text-neutral-900 dark:text-white">
                        {duration} minutes
                      </div>
                    </div>
                  </div>

                  {finalSubject && (
                    <div className="flex items-center gap-3 rounded-xl bg-white/60 px-4 py-3 dark:bg-neutral-800/40">
                      <BookOpen className="h-5 w-5 text-emerald-500" />
                      <div className="flex-1">
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">
                          Subject
                        </div>
                        <div className="text-sm font-medium text-neutral-900 dark:text-white">
                          {finalSubject}
                        </div>
                      </div>
                    </div>
                  )}

                  {topics && (
                    <div className="flex items-start gap-3 rounded-xl bg-white/60 px-4 py-3 dark:bg-neutral-800/40">
                      <FileText className="h-5 w-5 text-amber-500 mt-0.5" />
                      <div className="flex-1">
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">
                          Topics
                        </div>
                        <div className="text-sm font-medium text-neutral-900 dark:text-white">
                          {topics}
                        </div>
                      </div>
                    </div>
                  )}

                  {description && (
                    <div className="rounded-xl bg-white/60 px-4 py-3 dark:bg-neutral-800/40">
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
                        Notes
                      </div>
                      <div className="text-sm text-neutral-700 dark:text-neutral-300">
                        {description}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-neutral-200/70 bg-gradient-to-t from-neutral-50/50 to-transparent px-6 py-4 dark:border-neutral-700 dark:from-neutral-900/30">
          {step !== "datetime" ? (
            <button
              onClick={handleBack}
              className="inline-flex items-center gap-2 rounded-full border border-neutral-200/70 bg-white/80 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
          ) : (
            <div />
          )}

          {step === "review" ? (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-lernex-blue to-lernex-purple px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:scale-105 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Create Session
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleNextStep}
              disabled={
                (step === "datetime" && !canProceedFromDateTime) ||
                (step === "details" && !canProceedFromDetails)
              }
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-lernex-blue to-lernex-purple px-6 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:scale-105 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
