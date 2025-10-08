"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useLernexStore } from "@/lib/store";
import { useProfileStats } from "@/app/providers/ProfileStatsProvider";
import { supabaseBrowser } from "@/lib/supabase-browser";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, CheckCircle2, Loader2, UploadCloud } from "lucide-react";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

type FeedbackTone = "success" | "error" | "info";
type FeedbackState = { message: string; tone: FeedbackTone };

const toneClass: Record<FeedbackTone, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  error: "text-rose-600 dark:text-rose-400",
  info: "text-neutral-500 dark:text-neutral-400",
};

const cardMotion = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
} as const;

export default function Profile() {
  const { accuracyBySubject } = useLernexStore();
  const { stats } = useProfileStats();
  const points = stats?.points ?? 0;
  const streak = stats?.streak ?? 0;
  const [email, setEmail] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string>("");
  const [avatarUrlInput, setAvatarUrlInput] = useState<string>("");
  const [usernameSaving, setUsernameSaving] = useState<boolean>(false);
  const [avatarSaving, setAvatarSaving] = useState<boolean>(false);
  const [usernameFeedback, setUsernameFeedback] = useState<FeedbackState | null>(null);
  const [avatarFeedback, setAvatarFeedback] = useState<FeedbackState | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const supabase = useMemo(() => supabaseBrowser(), []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth
      .getUser()
      .then(async ({ data }) => {
        if (!active) return;
        const u = data.user;
        setEmail(u?.email ?? null);
        setUserId(u?.id ?? null);
        const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
        const metaAvatar =
          typeof meta.avatar_url === "string" ? (meta.avatar_url as string) : null;
        setAvatar(metaAvatar);
        setAvatarUrlInput(metaAvatar ?? "");
        // Load profile details if present
        if (u?.id) {
          const {
            data: profile,
            error,
          } = await supabase
            .from("profiles")
            .select("username, avatar_url")
            .eq("id", u.id)
            .maybeSingle();
          if (!active || error) return;
          const profileUsername =
            typeof profile?.username === "string" ? (profile.username as string) : "";
          setUsername(profileUsername);
          const storedAvatar =
            typeof profile?.avatar_url === "string" ? (profile.avatar_url as string) : null;
          if (storedAvatar && storedAvatar !== metaAvatar) {
            setAvatar(storedAvatar);
            setAvatarUrlInput(storedAvatar);
          }
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const handleUsernameSave = useCallback(async () => {
    const trimmed = username.trim();
    if (!trimmed) {
      setUsernameFeedback({ message: "Username cannot be empty.", tone: "error" });
      return;
    }
    setUsernameSaving(true);
    setUsernameFeedback({ message: "Saving username…", tone: "info" });
    try {
      const res = await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmed }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to save profile.");
      }
      setUsername(trimmed);
      setUsernameFeedback({ message: "Profile updated.", tone: "success" });
    } catch (error) {
      const message =
        (error as { message?: string } | undefined)?.message || "Could not update profile.";
      setUsernameFeedback({ message, tone: "error" });
    } finally {
      setUsernameSaving(false);
    }
  }, [username]);

  const handleUpload = useCallback(
    async (file: File) => {
      setAvatarSaving(true);
      setAvatarFeedback({ message: "Uploading image…", tone: "info" });
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/profile/avatar", { method: "POST", body: formData });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload?.error || "Failed to upload avatar.");
        }
        const url = typeof payload?.url === "string" ? (payload.url as string) : null;
        if (!url) {
          throw new Error("Upload response missing URL.");
        }
        setAvatar(url);
        setAvatarUrlInput(url);
        setAvatarFeedback({ message: "Avatar updated!", tone: "success" });
        await supabase.auth.getUser();
      } catch (error) {
        const message =
          (error as { message?: string } | undefined)?.message || "Image upload failed.";
        setAvatarFeedback({ message, tone: "error" });
      } finally {
        setAvatarSaving(false);
      }
    },
    [supabase],
  );

  const processFile = useCallback(
    (file: File | null) => {
      if (!file) return;
      setIsDragActive(false);
      setAvatarFeedback(null);
      if (!file.type.startsWith("image/")) {
        setAvatarFeedback({ message: "Please choose an image file.", tone: "error" });
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setAvatarFeedback({
          message: "Max file size is 4MB.",
          tone: "error",
        });
        return;
      }
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
      void handleUpload(file);
    },
    [handleUpload],
  );

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      processFile(file);
      event.target.value = "";
    },
    [processFile],
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const related = event.relatedTarget as Node | null;
    if (related && event.currentTarget.contains(related)) return;
    setIsDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragActive(false);
      const file = event.dataTransfer.files?.[0] ?? null;
      processFile(file);
    },
    [processFile],
  );

  const triggerFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleAvatarUrlSave = useCallback(async () => {
    const trimmed = avatarUrlInput.trim();
    if (trimmed === (avatar ?? "")) {
      setAvatarFeedback({ message: "Avatar is already up to date.", tone: "info" });
      return;
    }
    setAvatarSaving(true);
    setAvatarFeedback({
      message: trimmed ? "Saving avatar…" : "Removing avatar…",
      tone: "info",
    });
    try {
      const { data } = await supabase.auth.getUser();
      const currentUser = data.user;
      const targetId = currentUser?.id || userId;
      const targetUrl = trimmed || null;
      const authRes = await supabase.auth.updateUser({ data: { avatar_url: targetUrl } });
      if (authRes.error) throw authRes.error;
      if (targetId) {
        const profileRes = await supabase
          .from("profiles")
          .update({
            avatar_url: targetUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", targetId);
        if (profileRes.error) throw profileRes.error;
      }
      setAvatar(targetUrl);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setAvatarFeedback({
        message: targetUrl ? "Avatar URL saved." : "Avatar cleared.",
        tone: "success",
      });
    } catch (error) {
      const message =
        (error as { message?: string } | undefined)?.message || "Could not update avatar.";
      setAvatarFeedback({ message, tone: "error" });
    } finally {
      setAvatarSaving(false);
    }
  }, [avatar, avatarUrlInput, supabase, userId]);
  const subjects = useMemo(
    () => Object.entries(accuracyBySubject).sort((a, b) => b[1].total - a[1].total),
    [accuracyBySubject],
  );
  const normalizedPoints = Math.max(0, points);
  const pointsTowardsGoal = normalizedPoints % 200;
  const goalRemaining =
    pointsTowardsGoal === 0 && normalizedPoints > 0 ? 0 : 200 - pointsTowardsGoal;
  const weeklyGoalProgress = Math.min(
    100,
    Math.round(((normalizedPoints % 200) / 200) * 100),
  );
  const nextMilestone = Math.max(0, 7 - ((streak ?? 0) % 7));

  return (
    <main className="relative min-h-[calc(100vh-56px)] overflow-hidden bg-gradient-to-br from-lernex-blue/5 via-white/10 to-transparent px-0 text-neutral-900 dark:from-[#0f172a] dark:via-[#020617] dark:to-black dark:text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_farthest-side_at_top,_rgba(59,130,246,0.22),_transparent)] dark:bg-[radial-gradient(circle_farthest-side_at_top,_rgba(56,189,248,0.25),_transparent)]" />
      <div className="relative z-10 mx-auto w-full max-w-5xl px-4 pb-16 pt-12">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileInputChange}
        />
        <div className="grid gap-5 md:grid-cols-3 lg:grid-cols-[360px,1fr]">
        {/* Left: profile card */}
        <motion.section
          {...cardMotion}
          className="relative overflow-hidden rounded-3xl border border-white/30 bg-white/85 p-6 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/80 md:col-span-1"
        >
          <div className="absolute -left-10 -top-10 h-32 w-32 rounded-full bg-lernex-blue/10 blur-3xl dark:bg-lernex-blue/20" />
          <div className="relative flex flex-col gap-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="relative h-14 w-14 overflow-hidden rounded-full border border-white/60 bg-white shadow-inner dark:border-white/10 dark:bg-neutral-950">
                  {avatar ? (
                    <Image src={avatar} alt="avatar" fill sizes="56px" className="object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-200 to-neutral-100 text-lg font-semibold text-neutral-600 dark:from-neutral-800 dark:to-neutral-900 dark:text-neutral-200">
                      {email?.[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
                    Signed in as
                  </div>
                  <div className="text-sm font-semibold">{email ?? "Guest"}</div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Personalize your profile to unlock the best Lernex experience.
                  </p>
                </div>
              </div>
              <span className="hidden items-center gap-2 rounded-full bg-lernex-blue/10 px-3 py-1 text-xs font-semibold text-lernex-blue dark:text-sky-300 md:inline-flex">
                <UploadCloud className="h-3.5 w-3.5" />
                {avatar ? "Profile ready" : "Add an avatar"}
              </span>
            </div>
            <div className="rounded-2xl border border-white/30 bg-white/70 p-4 text-sm text-neutral-600 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-950/60 dark:text-neutral-300">
              Keep your streak alive and your avatar fresh to stay visible on the leaderboard and in
              study groups.
            </div>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-2xl bg-gradient-to-br from-amber-100 via-orange-50 to-white p-4 shadow-sm dark:from-orange-500/20 dark:via-orange-500/10 dark:to-transparent">
                <div className="text-xs text-neutral-500 dark:text-neutral-300">🔥 Streak</div>
                <div className="mt-1 text-2xl font-semibold">{streak}</div>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-indigo-100 via-sky-50 to-white p-4 shadow-sm dark:from-sky-500/20 dark:via-sky-500/10 dark:to-transparent">
                <div className="text-xs text-neutral-500 dark:text-neutral-300">⭐ Points</div>
                <div className="mt-1 text-2xl font-semibold">{points}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm font-semibold">
              <Link
                href="/settings"
                className="rounded-xl bg-lernex-blue px-4 py-2 text-center text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lernex-blue/50"
              >
                Settings
              </Link>
              <Link
                href="/leaderboard"
                className="rounded-xl border border-white/40 px-4 py-2 text-center transition hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10"
              >
                Leaderboard
              </Link>
            </div>
          </div>
        </motion.section>

        {/* Right: subjects + actions */}
        <motion.section
          {...cardMotion}
          className="relative overflow-hidden rounded-3xl border border-white/30 bg-white/85 p-6 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/85 md:col-span-2"
        >
          <div className="absolute inset-0 opacity-70 [background:radial-gradient(circle_at_top,_rgba(59,130,246,0.08),_transparent_55%)] dark:opacity-60" />
          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Your Learning</h2>
              <span className="inline-flex items-center gap-2 rounded-full bg-lernex-blue/10 px-3 py-1 text-xs font-medium text-lernex-blue dark:text-sky-300">
                {subjects.length ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Tracking progress
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-3.5 w-3.5" />
                    Let's get started
                  </>
                )}
              </span>
            </div>
            {subjects.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-neutral-300/80 bg-white/70 p-6 text-sm text-neutral-600 shadow-sm backdrop-blur-md dark:border-neutral-700 dark:bg-neutral-900/70 dark:text-neutral-300">
                <p>No progress yet. Try the generator or playlists to jump in.</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link
                    href="/generate"
                    className="inline-flex items-center gap-2 rounded-full bg-lernex-blue/90 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <UploadCloud className="h-4 w-4" />
                    Start a lesson
                  </Link>
                  <Link
                    href="/playlists"
                    className="inline-flex items-center gap-2 rounded-full border border-neutral-300 px-4 py-2 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-lg dark:border-neutral-700"
                  >
                    Browse playlists
                  </Link>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {subjects.map(([subject, acc]) => {
                  const pct = acc.total ? Math.round((acc.correct / acc.total) * 100) : 0;
                  return (
                    <motion.div
                      key={subject}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                      className="rounded-2xl border border-white/40 bg-white/70 p-4 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-950/50"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium">
                        <span className="capitalize">{subject}</span>
                        <span className="text-neutral-500 dark:text-neutral-400">
                          {acc.correct}/{acc.total} correct
                        </span>
                      </div>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-200/80 dark:bg-neutral-800">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-lernex-blue to-sky-400 dark:from-lernex-blue dark:to-sky-500"
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                        />
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Link
                href="/onboarding"
                className="rounded-2xl border border-white/40 px-4 py-3 text-center text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10"
              >
                Update interests
              </Link>
              <Link
                href="/placement"
                className="rounded-2xl border border-white/40 px-4 py-3 text-center text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10"
              >
                Run placement
              </Link>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/40 bg-white/70 p-4 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-950/50">
                <div className="text-sm font-semibold">Weekly goal</div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Earn 200 points
                </p>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-neutral-200/80 dark:bg-neutral-800">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-lernex-blue to-sky-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${weeklyGoalProgress}%` }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
                <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                  {goalRemaining === 0
                    ? "Goal reached! Keep going to stay ahead."
                    : `You're ${goalRemaining} point${goalRemaining === 1 ? "" : "s"} away from the next reward.`}
                </p>
              </div>
              <div className="rounded-2xl border border-white/40 bg-white/70 p-4 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-950/50">
                <div className="text-sm font-semibold">Next streak milestone</div>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                  {nextMilestone === 0
                    ? "Milestone unlocked! Keep the momentum going."
                    : `${nextMilestone} day${nextMilestone === 1 ? "" : "s"} to your next reward.`}
                </p>
              </div>
            </div>
          </div>
        </motion.section>
      </div>
      <motion.section
        {...cardMotion}
        className="mt-6 rounded-3xl border border-white/30 bg-white/80 p-6 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/80"
      >
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-base font-semibold">Profile preferences</h3>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Fine-tune your username and avatar from one place.
            </p>
          </div>
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 rounded-full border border-white/40 px-4 py-2 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10"
          >
            Manage settings
          </Link>
        </div>
        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr),minmax(0,1.2fr)]">
          <div className="rounded-2xl border border-white/30 bg-white/70 p-5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-950/60">
            <label
              htmlFor="username"
              className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400"
            >
              Username
            </label>
            <input
              id="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="your_name"
              className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm shadow-inner focus:border-lernex-blue focus:outline-none focus:ring-2 focus:ring-lernex-blue/30 dark:border-neutral-700 dark:bg-neutral-950"
            />
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleUsernameSave}
                disabled={usernameSaving || !username.trim()}
                className="inline-flex items-center justify-center rounded-xl bg-lernex-blue px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg disabled:pointer-events-none disabled:opacity-60"
              >
                {usernameSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save username"}
              </button>
            </div>
            <AnimatePresence mode="wait">
              {usernameFeedback ? (
                <motion.p
                  key={`${usernameFeedback.tone}-${usernameFeedback.message}`}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className={`mt-2 text-xs font-medium ${toneClass[usernameFeedback.tone]}`}
                >
                  {usernameFeedback.message}
                </motion.p>
              ) : null}
            </AnimatePresence>
            <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
              Tip: Clear usernames and expressive avatars help friends recognize you faster.
            </p>
          </div>
          <div className="space-y-4">
            <div
              className={`group relative flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed px-5 py-6 text-center transition will-change-transform ${
                isDragActive
                  ? "border-lernex-blue/70 bg-lernex-blue/10 shadow-lg dark:border-sky-400/70 dark:bg-sky-500/10"
                  : "border-white/40 bg-white/70 hover:border-lernex-blue/60 hover:shadow-lg dark:border-white/10 dark:bg-neutral-950/60"
              }`}
              onClick={triggerFileDialog}
              onDragOver={handleDragOver}
              onDragEnter={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              role="button"
              tabIndex={0}
            >
              <div className="relative h-24 w-24 overflow-hidden rounded-full border border-white/60 bg-white shadow-inner transition group-hover:scale-[1.02] dark:border-white/10 dark:bg-neutral-950">
                {previewUrl ? (
                  <img src={previewUrl} alt="Avatar preview" className="h-full w-full object-cover" />
                ) : avatar ? (
                  <Image src={avatar} alt="Profile avatar" fill sizes="96px" className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-200 to-neutral-100 text-2xl font-semibold text-neutral-600 dark:from-neutral-800 dark:to-neutral-900 dark:text-neutral-200">
                    {email?.[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    triggerFileDialog();
                  }}
                  className="absolute bottom-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-lernex-blue text-white shadow-lg transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lernex-blue/60"
                  aria-label="Upload new avatar"
                >
                  {avatarSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                </button>
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
                  Drop a new photo or click to upload
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  JPG, PNG, or WEBP up to 4MB
                </p>
              </div>
            </div>
            <AnimatePresence mode="wait">
              {avatarFeedback ? (
                <motion.p
                  key={`${avatarFeedback.tone}-${avatarFeedback.message}`}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className={`text-center text-xs font-medium ${toneClass[avatarFeedback.tone]}`}
                >
                  {avatarFeedback.message}
                </motion.p>
              ) : null}
            </AnimatePresence>
            <div className="rounded-2xl border border-white/30 bg-white/70 p-5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-950/60">
              <label
                htmlFor="avatarUrl"
                className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400"
              >
                Avatar URL (optional)
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="avatarUrl"
                  value={avatarUrlInput}
                  onChange={(event) => setAvatarUrlInput(event.target.value)}
                  placeholder="https://your-image-host.com/avatar.png"
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm shadow-inner focus:border-lernex-blue focus:outline-none focus:ring-2 focus:ring-lernex-blue/30 dark:border-neutral-700 dark:bg-neutral-950"
                />
                <button
                  type="button"
                  onClick={handleAvatarUrlSave}
                  disabled={avatarSaving}
                  className="inline-flex shrink-0 items-center justify-center rounded-xl border border-white/40 px-4 py-2 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-lg disabled:pointer-events-none disabled:opacity-60 dark:border-white/10"
                >
                  {avatarSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save URL"}
                </button>
              </div>
              <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                Use this if you already host your avatar elsewhere or want to clear it.
              </p>
            </div>
          </div>
        </div>
      </motion.section>
    </div>
    </main>
  );
}
