"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  User,
  Sparkles,
  Save,
  Loader2,
  Eye,
  X,
  Plus,
  Check,
  Upload,
  Pencil,
  Globe,
  Lock,
  Info,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type ProfileData = {
  id: string;
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  interests: string[];
  publicStats: {
    showStreak: boolean;
    showPoints: boolean;
    showAccuracy: boolean;
    showActivity: boolean;
  };
};

type ToastState = {
  message: string;
  tone: "success" | "error" | "info";
};

const avatarPalette = [
  "bg-gradient-to-br from-lernex-blue/80 to-lernex-purple/70",
  "bg-gradient-to-br from-emerald-500/80 to-teal-500/70",
  "bg-gradient-to-br from-amber-400/80 to-orange-500/70",
  "bg-gradient-to-br from-rose-400/80 to-pink-500/70",
  "bg-gradient-to-br from-sky-400/80 to-cyan-500/70",
  "bg-gradient-to-br from-indigo-400/80 to-blue-600/70",
];

const AVAILABLE_INTERESTS = [
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "English",
  "History",
  "Computer Science",
  "Economics",
  "Psychology",
  "Geography",
  "Art",
  "Music",
  "Literature",
  "Philosophy",
  "Political Science",
];

function cn(...classes: Array<string | null | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

export default function PublicProfilePage() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Form state
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [publicStats, setPublicStats] = useState({
    showStreak: true,
    showPoints: true,
    showAccuracy: true,
    showActivity: true,
  });
  const [newInterest, setNewInterest] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/public-profile", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Failed to load profile");
      }
      const json = (await response.json()) as ProfileData;
      setData(json);
      setUsername(json.username || "");
      setFullName(json.fullName || "");
      setBio(json.bio || "");
      setInterests(json.interests || []);
      setPublicStats(json.publicStats);
      setAvatarUrl(json.avatarUrl);
    } catch (err) {
      console.error(err);
      setToast({
        message: err instanceof Error ? err.message : "Failed to load profile",
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/public-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          fullName,
          bio,
          interests,
          publicStats,
          avatarUrl,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to save profile");
      }
      await load();
      setToast({ message: "Profile saved successfully!", tone: "success" });
    } catch (err) {
      console.error(err);
      setToast({
        message: err instanceof Error ? err.message : "Failed to save profile",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setToast({ message: "Image must be less than 5MB", tone: "error" });
      return;
    }

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("avatar", file);

      const response = await fetch("/api/upload-avatar", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload avatar");
      }

      const { url } = await response.json();
      setAvatarUrl(url);
      setToast({ message: "Avatar uploaded successfully!", tone: "success" });
    } catch (err) {
      console.error(err);
      setToast({ message: "Failed to upload avatar", tone: "error" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const addInterest = (interest: string) => {
    const trimmed = interest.trim();
    if (!trimmed) return;
    if (interests.includes(trimmed)) {
      setToast({ message: "Interest already added", tone: "info" });
      return;
    }
    if (interests.length >= 10) {
      setToast({ message: "Maximum 10 interests allowed", tone: "info" });
      return;
    }
    setInterests([...interests, trimmed]);
    setNewInterest("");
  };

  const removeInterest = (interest: string) => {
    setInterests(interests.filter((i) => i !== interest));
  };

  if (loading) {
    return (
      <main className="min-h-[calc(100vh-56px)] mx-auto flex w-full max-w-5xl items-center justify-center px-4 py-24">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-3 rounded-2xl border border-neutral-200/60 bg-white/80 px-6 py-4 text-sm shadow-lg backdrop-blur dark:border-neutral-800 dark:bg-gradient-to-br dark:from-[#101a2c] dark:via-[#0d1524] dark:to-[#090f1c]"
        >
          <Loader2 className="h-5 w-5 animate-spin text-lernex-blue" />
          <span className="text-neutral-700 dark:text-neutral-200">
            Loading your profile...
          </span>
        </motion.div>
      </main>
    );
  }

  const displayName = fullName || username || "Learner";
  const initial = displayName.charAt(0).toUpperCase();
  const paletteIndex = displayName.charCodeAt(0) % avatarPalette.length;

  return (
    <main className="relative min-h-[calc(100vh-56px)] mx-auto w-full max-w-5xl px-4 py-8">
      {/* Background decorations */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[-40vw] -top-40 h-80 rounded-full bg-gradient-to-br from-lernex-blue/20 via-lernex-purple/10 to-transparent opacity-60 blur-3xl dark:hidden -z-10"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[-35vw] top-1/2 h-[520px] -translate-y-1/2 rounded-full bg-gradient-to-br from-rose-50 via-amber-50/50 to-transparent opacity-50 blur-3xl dark:hidden -z-10"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[-35vw] -top-48 hidden h-[520px] rounded-full bg-gradient-to-br from-lernex-blue/30 via-neutral-900/40 to-transparent opacity-70 blur-3xl dark:block -z-10"
      />

      <div className="relative z-10">
        {/* Toast notification */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className={cn(
                "mb-4 flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur-sm",
                toast.tone === "success" &&
                  "border-emerald-200 bg-emerald-50/80 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200",
                toast.tone === "error" &&
                  "border-rose-200 bg-rose-50/80 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200",
                toast.tone === "info" &&
                  "border-blue-200 bg-blue-50/80 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200"
              )}
            >
              <Info className="h-4 w-4" />
              <span>{toast.message}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
        >
          <div>
            <h1 className="bg-gradient-to-r from-lernex-blue via-lernex-purple to-lernex-blue/80 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl dark:from-lernex-blue/80 dark:via-lernex-purple/70 dark:to-white">
              Public Profile
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-neutral-600 dark:text-neutral-300">
              Customize what other users see when they view your profile. Control your
              visibility and make a great first impression.
            </p>
          </div>
          <div className="flex gap-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setPreviewMode(!previewMode)}
              className="inline-flex items-center gap-2 rounded-full border border-lernex-blue/30 bg-white/80 px-4 py-2 text-sm font-medium text-lernex-blue shadow-sm transition hover:border-lernex-blue/50 hover:bg-lernex-blue/10 dark:border-lernex-blue/50 dark:bg-lernex-blue/10 dark:hover:bg-lernex-blue/20"
            >
              {previewMode ? (
                <>
                  <Pencil className="h-4 w-4" />
                  Edit
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4" />
                  Preview
                </>
              )}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-lernex-blue to-lernex-purple px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Profile
                </>
              )}
            </motion.button>
          </div>
        </motion.div>

        {!previewMode ? (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Avatar Section */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5 }}
              className="lg:col-span-1"
            >
              <div className="rounded-3xl border border-neutral-200/70 bg-gradient-to-br from-white via-slate-50/70 to-white/95 p-6 shadow-[0_32px_70px_-45px_rgba(47,128,237,0.38)] backdrop-blur-sm dark:border-neutral-800 dark:bg-gradient-to-br dark:from-[#101a2c] dark:via-[#0d1524] dark:to-[#090f1c]">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
                  <User className="h-5 w-5 text-lernex-blue" />
                  Avatar
                </h2>
                <div className="flex flex-col items-center">
                  <div className="relative mb-4">
                    {avatarUrl ? (
                      <div className="relative h-32 w-32 overflow-hidden rounded-full ring-4 ring-white/50 dark:ring-neutral-800/50">
                        <Image
                          src={avatarUrl}
                          alt="Avatar"
                          width={128}
                          height={128}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "flex h-32 w-32 items-center justify-center rounded-full text-4xl font-semibold text-white shadow-lg ring-4 ring-white/50 dark:ring-neutral-800/50",
                          avatarPalette[paletteIndex]
                        )}
                      >
                        {initial}
                      </div>
                    )}
                    {uploadingAvatar && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
                        <Loader2 className="h-8 w-8 animate-spin text-white" />
                      </div>
                    )}
                  </div>
                  <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-neutral-200/70 bg-white/80 px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-200 dark:hover:bg-neutral-700/50">
                    <Upload className="h-4 w-4" />
                    Upload Photo
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarUpload}
                      disabled={uploadingAvatar}
                    />
                  </label>
                  <p className="mt-2 text-center text-xs text-neutral-500 dark:text-neutral-400">
                    JPG, PNG or GIF. Max 5MB.
                  </p>
                </div>
              </div>
            </motion.section>

            {/* Main Form */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="lg:col-span-2"
            >
              <div className="rounded-3xl border border-neutral-200/70 bg-gradient-to-br from-white via-slate-50/70 to-white/95 p-6 shadow-[0_32px_70px_-45px_rgba(47,128,237,0.38)] backdrop-blur-sm dark:border-neutral-800 dark:bg-gradient-to-br dark:from-[#101a2c] dark:via-[#0d1524] dark:to-[#090f1c]">
                <h2 className="mb-6 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
                  <Sparkles className="h-5 w-5 text-lernex-blue" />
                  Basic Information
                </h2>

                <div className="space-y-6">
                  {/* Username */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-200">
                      Username
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="your_username"
                      className="w-full rounded-xl border border-neutral-200/70 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm transition focus:border-lernex-blue/40 focus:outline-none focus:ring-2 focus:ring-lernex-blue/20 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-white dark:focus:border-lernex-blue/60"
                    />
                  </div>

                  {/* Full Name */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-200">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Your Full Name"
                      className="w-full rounded-xl border border-neutral-200/70 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm transition focus:border-lernex-blue/40 focus:outline-none focus:ring-2 focus:ring-lernex-blue/20 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-white dark:focus:border-lernex-blue/60"
                    />
                  </div>

                  {/* Bio */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-200">
                      Bio
                    </label>
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Tell others about yourself..."
                      rows={4}
                      maxLength={280}
                      className="w-full rounded-xl border border-neutral-200/70 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm transition focus:border-lernex-blue/40 focus:outline-none focus:ring-2 focus:ring-lernex-blue/20 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-white dark:focus:border-lernex-blue/60"
                    />
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                      {bio.length}/280 characters
                    </p>
                  </div>
                </div>
              </div>
            </motion.section>

            {/* Interests Section */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="lg:col-span-3"
            >
              <div className="rounded-3xl border border-neutral-200/70 bg-gradient-to-br from-white via-slate-50/70 to-white/95 p-6 shadow-[0_32px_70px_-45px_rgba(47,128,237,0.38)] backdrop-blur-sm dark:border-neutral-800 dark:bg-gradient-to-br dark:from-[#101a2c] dark:via-[#0d1524] dark:to-[#090f1c]">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
                  <Sparkles className="h-5 w-5 text-lernex-purple" />
                  Study Interests
                </h2>
                <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-300">
                  Add subjects you&apos;re interested in to help others find you. Select from the list
                  below or add your own.
                </p>

                {/* Current Interests */}
                <div className="mb-4 flex flex-wrap gap-2">
                  <AnimatePresence>
                    {interests.map((interest) => (
                      <motion.span
                        key={interest}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.2 }}
                        className="inline-flex items-center gap-2 rounded-full border border-lernex-blue/30 bg-gradient-to-r from-lernex-blue/10 to-lernex-purple/10 px-3 py-1.5 text-sm font-medium text-lernex-blue dark:text-lernex-blue/90"
                      >
                        {interest}
                        <button
                          onClick={() => removeInterest(interest)}
                          className="rounded-full hover:bg-lernex-blue/20"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </motion.span>
                    ))}
                  </AnimatePresence>
                  {interests.length === 0 && (
                    <span className="text-sm text-neutral-500 dark:text-neutral-400">
                      No interests added yet
                    </span>
                  )}
                </div>

                {/* Quick Add Interests */}
                <div className="mb-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    Quick Add
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {AVAILABLE_INTERESTS.filter((i) => !interests.includes(i)).map(
                      (interest) => (
                        <button
                          key={interest}
                          onClick={() => addInterest(interest)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200/70 bg-white/80 px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm transition hover:border-lernex-blue/40 hover:bg-lernex-blue/10 hover:text-lernex-blue dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-300 dark:hover:bg-lernex-blue/20"
                        >
                          <Plus className="h-3 w-3" />
                          {interest}
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* Custom Interest */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newInterest}
                    onChange={(e) => setNewInterest(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addInterest(newInterest);
                      }
                    }}
                    placeholder="Add custom interest..."
                    className="flex-1 rounded-xl border border-neutral-200/70 bg-white px-4 py-2 text-sm text-neutral-900 shadow-sm transition focus:border-lernex-blue/40 focus:outline-none focus:ring-2 focus:ring-lernex-blue/20 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-white dark:focus:border-lernex-blue/60"
                  />
                  <button
                    onClick={() => addInterest(newInterest)}
                    className="inline-flex items-center gap-2 rounded-xl bg-lernex-blue px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-lernex-blue/90"
                  >
                    <Plus className="h-4 w-4" />
                    Add
                  </button>
                </div>
              </div>
            </motion.section>

            {/* Privacy Settings */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="lg:col-span-3"
            >
              <div className="rounded-3xl border border-neutral-200/70 bg-gradient-to-br from-white via-slate-50/70 to-white/95 p-6 shadow-[0_32px_70px_-45px_rgba(47,128,237,0.38)] backdrop-blur-sm dark:border-neutral-800 dark:bg-gradient-to-br dark:from-[#101a2c] dark:via-[#0d1524] dark:to-[#090f1c]">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
                  <Globe className="h-5 w-5 text-emerald-500" />
                  Public Visibility
                </h2>
                <p className="mb-6 text-sm text-neutral-600 dark:text-neutral-300">
                  Control which stats are visible to other users when they view your profile.
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    { key: "showStreak", label: "Show Streak", desc: "Display your current study streak" },
                    { key: "showPoints", label: "Show Points", desc: "Display your total points earned" },
                    { key: "showAccuracy", label: "Show Accuracy", desc: "Display your average quiz accuracy" },
                    { key: "showActivity", label: "Show Activity", desc: "Display your recent study activity" },
                  ].map((stat) => (
                    <motion.div
                      key={stat.key}
                      whileHover={{ scale: 1.01 }}
                      className="flex items-start gap-3 rounded-xl border border-neutral-200/60 bg-white/50 p-4 dark:border-neutral-800 dark:bg-neutral-900/30"
                    >
                      <button
                        onClick={() =>
                          setPublicStats({
                            ...publicStats,
                            [stat.key]: !publicStats[stat.key as keyof typeof publicStats],
                          })
                        }
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition",
                          publicStats[stat.key as keyof typeof publicStats]
                            ? "border-lernex-blue bg-lernex-blue text-white"
                            : "border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800"
                        )}
                      >
                        {publicStats[stat.key as keyof typeof publicStats] && (
                          <Check className="h-4 w-4" />
                        )}
                      </button>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-neutral-900 dark:text-white">
                          {stat.label}
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">
                          {stat.desc}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.section>
          </div>
        ) : (
          <ProfilePreview
            displayName={displayName}
            username={username}
            bio={bio}
            interests={interests}
            avatarUrl={avatarUrl}
            initial={initial}
            paletteIndex={paletteIndex}
            publicStats={publicStats}
          />
        )}
      </div>
    </main>
  );
}

function ProfilePreview({
  displayName,
  username,
  bio,
  interests,
  avatarUrl,
  initial,
  paletteIndex,
  publicStats,
}: {
  displayName: string;
  username: string;
  bio: string;
  interests: string[];
  avatarUrl: string | null;
  initial: string;
  paletteIndex: number;
  publicStats: {
    showStreak: boolean;
    showPoints: boolean;
    showAccuracy: boolean;
    showActivity: boolean;
  };
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="rounded-3xl border border-neutral-200/70 bg-gradient-to-br from-white via-slate-50/70 to-white/95 p-8 shadow-[0_32px_70px_-45px_rgba(47,128,237,0.38)] backdrop-blur-sm dark:border-neutral-800 dark:bg-gradient-to-br dark:from-[#101a2c] dark:via-[#0d1524] dark:to-[#090f1c]"
    >
      <div className="mb-6 text-center">
        <h2 className="mb-2 text-lg font-semibold text-neutral-900 dark:text-white">
          Profile Preview
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          This is how other users will see your profile
        </p>
      </div>

      <div className="mx-auto max-w-2xl">
        {/* Avatar and Name */}
        <div className="mb-6 text-center">
          {avatarUrl ? (
            <div className="relative mx-auto mb-4 h-24 w-24 overflow-hidden rounded-full ring-4 ring-white/50 dark:ring-neutral-800/50">
              <Image
                src={avatarUrl}
                alt="Avatar"
                width={96}
                height={96}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div
              className={cn(
                "mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full text-3xl font-semibold text-white shadow-lg ring-4 ring-white/50 dark:ring-neutral-800/50",
                avatarPalette[paletteIndex]
              )}
            >
              {initial}
            </div>
          )}
          <h3 className="text-2xl font-bold text-neutral-900 dark:text-white">
            {displayName}
          </h3>
          {username && (
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              @{username}
            </p>
          )}
        </div>

        {/* Bio */}
        {bio && (
          <div className="mb-6 rounded-xl border border-neutral-200/60 bg-white/50 p-4 dark:border-neutral-800 dark:bg-neutral-900/30">
            <p className="text-center text-sm text-neutral-700 dark:text-neutral-300">
              {bio}
            </p>
          </div>
        )}

        {/* Interests */}
        {interests.length > 0 && (
          <div className="mb-6">
            <h4 className="mb-3 text-sm font-semibold text-neutral-700 dark:text-neutral-200">
              Study Interests
            </h4>
            <div className="flex flex-wrap gap-2">
              {interests.map((interest) => (
                <span
                  key={interest}
                  className="inline-flex items-center gap-1.5 rounded-full border border-lernex-blue/30 bg-gradient-to-r from-lernex-blue/10 to-lernex-purple/10 px-3 py-1.5 text-sm font-medium text-lernex-blue dark:text-lernex-blue/90"
                >
                  {interest}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Mock Stats (would show real data in actual profile view) */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {publicStats.showStreak && (
            <div className="rounded-xl border border-neutral-200/60 bg-white/50 p-4 text-center dark:border-neutral-800 dark:bg-neutral-900/30">
              <div className="text-2xl font-bold text-neutral-900 dark:text-white">
                12
              </div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                Day Streak
              </div>
            </div>
          )}
          {publicStats.showPoints && (
            <div className="rounded-xl border border-neutral-200/60 bg-white/50 p-4 text-center dark:border-neutral-800 dark:bg-neutral-900/30">
              <div className="text-2xl font-bold text-neutral-900 dark:text-white">
                1,234
              </div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                Points
              </div>
            </div>
          )}
          {publicStats.showAccuracy && (
            <div className="rounded-xl border border-neutral-200/60 bg-white/50 p-4 text-center dark:border-neutral-800 dark:bg-neutral-900/30">
              <div className="text-2xl font-bold text-neutral-900 dark:text-white">
                87%
              </div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                Accuracy
              </div>
            </div>
          )}
          {publicStats.showActivity && (
            <div className="rounded-xl border border-neutral-200/60 bg-white/50 p-4 text-center dark:border-neutral-800 dark:bg-neutral-900/30">
              <div className="text-2xl font-bold text-neutral-900 dark:text-white">
                45
              </div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                Quizzes
              </div>
            </div>
          )}
        </div>

        {!publicStats.showStreak &&
          !publicStats.showPoints &&
          !publicStats.showAccuracy &&
          !publicStats.showActivity && (
            <div className="rounded-xl border border-dashed border-neutral-200/70 bg-neutral-50/50 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/20 dark:text-neutral-400">
              <Lock className="mx-auto mb-2 h-6 w-6" />
              All stats are hidden
            </div>
          )}
      </div>
    </motion.div>
  );
}
