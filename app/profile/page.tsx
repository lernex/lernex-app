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
import { validateUsername } from "@/lib/username";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, CheckCircle2, Loader2, UploadCloud, Plus, Trash2 } from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import AddInterestModal from "@/components/AddInterestModal";
import RemoveInterestModal from "@/components/RemoveInterestModal";
import TTSSettings from "@/components/TTSSettings";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

type FeedbackTone = "success" | "error" | "info";
type FeedbackState = { message: string; tone: FeedbackTone };

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid" | "blocked";
type ThemePreference = "auto" | "light" | "dark";

const toneClass: Record<FeedbackTone, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  error: "text-rose-600 dark:text-rose-400",
  info: "text-neutral-500 dark:text-neutral-400",
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
};

function splitFullName(fullName: string | null | undefined) {
  if (!fullName) {
    return { first: "", last: "" };
  }
  const normalized = fullName.trim();
  if (!normalized) {
    return { first: "", last: "" };
  }
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { first: "", last: "" };
  }
  const [first, ...rest] = parts;
  return { first, last: rest.join(" ") };
}

function SettingsPageContent() {
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
  const router = useRouter();
  const { setTheme } = useTheme();
  const [firstName, setFirstName] = useState<string>("");
  const [lastName, setLastName] = useState<string>("");
  const [dob, setDob] = useState<string>("");
  const [themePreference, setThemePreference] = useState<ThemePreference>("auto");
  const [savedThemePreference, setSavedThemePreference] = useState<ThemePreference>("auto");
  const [accountLoading, setAccountLoading] = useState(true);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [preferencesFeedback, setPreferencesFeedback] = useState<FeedbackState | null>(null);
  const [showRealName, setShowRealName] = useState<boolean>(false);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [usernameStatusMessage, setUsernameStatusMessage] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [initialUsername, setInitialUsername] = useState<string>("");
  const [interests, setInterests] = useState<string[]>([]);
  const [levelMap, setLevelMap] = useState<Record<string, string> | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);

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
            data: profileData,
            error,
          } = await supabase
            .from("profiles")
            .select("username, avatar_url")
            .eq("id", u.id)
            .maybeSingle();
          if (!active || error) return;
          const profile = profileData as { username?: string; avatar_url?: string } | null;
          const profileUsername =
            typeof profile?.username === "string" ? (profile.username as string) : "";
          setUsername(profileUsername);
          setInitialUsername(profileUsername.trim());
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

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setAccountLoading(true);
        const res = await fetch("/api/profile/me", { cache: "no-store" });
        if (!active) return;
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (!res.ok) {
          setPreferencesFeedback({
            message: "Failed to load account settings.",
            tone: "error",
          });
          return;
        }
        const data = await res.json().catch(() => null);
        if (!active || !data) return;
        const fetchedUsername =
          typeof data.username === "string" ? (data.username as string) : "";
        if (fetchedUsername.trim()) {
          setUsername(fetchedUsername);
        }
        setInitialUsername(fetchedUsername.trim());
        const fullName =
          typeof data.full_name === "string" ? (data.full_name as string) : null;
        const { first, last } = splitFullName(fullName);
        setFirstName(first);
        setLastName(last);
        setDob(typeof data.dob === "string" ? data.dob : "");
        const themePrefRaw =
          typeof data?.theme_pref === "string" ? (data.theme_pref as string) : null;
        const nextTheme: ThemePreference =
          themePrefRaw === "auto" ? "auto" :
          themePrefRaw === "light" ? "light" :
          themePrefRaw === "dark" ? "dark" : "auto";
        setSavedThemePreference(nextTheme);
        setThemePreference(nextTheme);
        // Don't call setTheme here - let ThemeProvider handle it based on preference
        setUsernameStatus("idle");
        setUsernameStatusMessage("");
        setPreferencesFeedback(null);
        // Load interests and level_map
        setInterests(Array.isArray(data.interests) ? data.interests : []);
        setLevelMap(data.level_map && typeof data.level_map === "object" ? data.level_map : null);
        // Load show_real_name preference
        setShowRealName(typeof data.show_real_name === "boolean" ? data.show_real_name : false);
      } catch {
        if (!active) return;
        setPreferencesFeedback({
          message: "Could not load account settings.",
          tone: "error",
        });
      } finally {
        if (active) {
          setAccountLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [router, setTheme]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  useEffect(() => {
    const trimmed = username.trim();
    const baseline = initialUsername.trim();
    if (!trimmed) {
      setUsernameStatus("idle");
      setUsernameStatusMessage("");
      return;
    }
    if (trimmed === baseline) {
      setUsernameStatus("available");
      setUsernameStatusMessage("Current username");
      return;
    }
    const validation = validateUsername(trimmed);
    if (!validation.ok) {
      const blocked = validation.code === "reserved" || validation.code === "inappropriate";
      setUsernameStatus(blocked ? "blocked" : "invalid");
      setUsernameStatusMessage(validation.message);
      return;
    }
    const controller = new AbortController();
    setUsernameStatus("checking");
    setUsernameStatusMessage("Checking...");
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/profile/username/check?username=${encodeURIComponent(trimmed)}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!res.ok) {
          throw new Error("check failed");
        }
        const payload = await res.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (payload?.available) {
          setUsernameStatus("available");
          setUsernameStatusMessage("Available");
        } else {
          const reason = typeof payload?.reason === "string" ? (payload.reason as string) : "invalid";
          const message =
            typeof payload?.message === "string" && payload.message.trim()
              ? (payload.message as string)
              : reason === "taken"
              ? "Username already taken."
              : "Choose a different username.";
          if (reason === "taken") {
            setUsernameStatus("taken");
          } else if (reason === "reserved" || reason === "inappropriate") {
            setUsernameStatus("blocked");
          } else {
            setUsernameStatus("invalid");
          }
          setUsernameStatusMessage(message);
        }
      } catch {
        if (controller.signal.aborted) return;
        setUsernameStatus("invalid");
        setUsernameStatusMessage("Could not check");
      }
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [username, initialUsername]);

  const handleUsernameSave = useCallback(async () => {
    const trimmed = username.trim();
    if (!trimmed) {
      setUsernameFeedback({ message: "Username cannot be empty.", tone: "error" });
      setUsernameStatus("invalid");
      setUsernameStatusMessage("Username cannot be empty.");
      return;
    }
    if (usernameStatus === "checking") {
      setUsernameFeedback({
        message: "Hang tight, still checking availability.",
        tone: "info",
      });
      return;
    }
    if (usernameStatus === "invalid" || usernameStatus === "taken" || usernameStatus === "blocked") {
      setUsernameFeedback({
        message: usernameStatusMessage || "Choose a different username.",
        tone: "error",
      });
      return;
    }
    const validation = validateUsername(trimmed);
    if (!validation.ok) {
      const blocked = validation.code === "reserved" || validation.code === "inappropriate";
      setUsernameStatus(blocked ? "blocked" : "invalid");
      setUsernameStatusMessage(validation.message);
      setUsernameFeedback({ message: validation.message, tone: "error" });
      return;
    }
    setUsernameSaving(true);
    setUsernameFeedback({ message: "Saving username...", tone: "info" });
    try {
      const res = await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: validation.normalized }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const reason = typeof payload?.code === "string" ? (payload.code as string) : payload?.reason;
        const serverMessage =
          typeof payload?.error === "string" && payload.error.trim()
            ? (payload.error as string)
            : "Failed to save profile.";
        if (reason === "taken") {
          setUsernameStatus("taken");
          setUsernameStatusMessage(serverMessage);
        } else if (reason === "reserved" || reason === "inappropriate") {
          setUsernameStatus("blocked");
          setUsernameStatusMessage(serverMessage);
        } else if (reason === "too-short" || reason === "too-long" || reason === "invalid-characters") {
          setUsernameStatus("invalid");
          setUsernameStatusMessage(serverMessage);
        }
        throw new Error(serverMessage);
      }
      setUsername(validation.normalized);
      setInitialUsername(validation.normalized);
      setUsernameStatus("available");
      setUsernameStatusMessage("Available");
      setUsernameFeedback({ message: "Profile updated.", tone: "success" });
    } catch (error) {
      const message =
        (error as { message?: string } | undefined)?.message || "Could not update profile.";
      setUsernameFeedback({ message, tone: "error" });
    } finally {
      setUsernameSaving(false);
    }
  }, [username, usernameStatus, usernameStatusMessage]);

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const profileRes = await (supabase as any)
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
  const handlePreferencesSave = useCallback(async () => {
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    if (trimmedLast && !trimmedFirst) {
      setPreferencesFeedback({
        message: "Add a first name before saving a last name.",
        tone: "error",
      });
      return;
    }
    const composedFullName =
      trimmedFirst || trimmedLast
        ? trimmedLast
          ? `${trimmedFirst} ${trimmedLast}`
          : trimmedFirst
        : null;

    // Save the preference to localStorage using the correct key
    try {
      window.localStorage.setItem('lernex-theme-preference', themePreference);
      // Dispatch custom event to notify ThemeProvider
      window.dispatchEvent(new CustomEvent('theme-preference-changed', {
        detail: { preference: themePreference }
      }));
    } catch {
      // ignore
    }

    setSavedThemePreference(themePreference);

    setPreferencesSaving(true);
    setPreferencesFeedback({ message: "Saving settings...", tone: "info" });
    try {
      const res = await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: trimmedFirst,
          last_name: trimmedLast,
          dob: dob ? dob : null,
          theme_pref: themePreference,
          show_real_name: showRealName,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to save settings.");
      }

      const authResult = await supabase.auth.updateUser({
        data: {
          full_name: composedFullName ?? null,
          name: composedFullName ?? null,
          first_name: trimmedFirst || null,
          last_name: trimmedLast || null,
        },
      });
      if (authResult.error) {
        throw authResult.error;
      }

      setFirstName(trimmedFirst);
      setLastName(trimmedLast);
      setPreferencesFeedback({ message: "Settings saved.", tone: "success" });
    } catch (error) {
      const message =
        (error as { message?: string } | undefined)?.message || "Could not save settings.";
      setPreferencesFeedback({ message, tone: "error" });
    } finally {
      setPreferencesSaving(false);
    }
  }, [
    dob,
    firstName,
    lastName,
    setSavedThemePreference,
    showRealName,
    supabase.auth,
    themePreference,
  ]);

  const handleDeleteAccount = useCallback(async () => {
    if (!window.confirm("Delete your account? This cannot be undone.")) return;
    setDeleteBusy(true);
    setPreferencesFeedback({ message: "Deleting account...", tone: "info" });
    try {
      const res = await fetch("/api/profile/delete", { method: "POST" });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Could not delete account.");
      }
      window.location.href = "/";
    } catch (error) {
      const message =
        (error as { message?: string } | undefined)?.message || "Could not delete account.";
      setPreferencesFeedback({ message, tone: "error" });
    } finally {
      setDeleteBusy(false);
    }
  }, []);

  const handleInterestsRefresh = useCallback(async () => {
    try {
      const res = await fetch("/api/profile/me", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setInterests(Array.isArray(data.interests) ? data.interests : []);
        setLevelMap(data.level_map && typeof data.level_map === "object" ? data.level_map : null);
      }
    } catch {
      // Silently fail - user will see old data
    }
  }, []);

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
    <main className="relative min-h-[calc(100vh-56px)] overflow-hidden px-0 text-neutral-900 dark:text-white">
      {/* Animated background gradients */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-gradient-to-br from-lernex-blue/20 via-sky-400/10 to-transparent blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute -right-32 top-64 h-96 w-96 rounded-full bg-gradient-to-bl from-lernex-purple/20 via-violet-400/10 to-transparent blur-3xl"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1,
          }}
        />
      </div>

      <div className="relative mx-auto w-full max-w-5xl px-4 pb-16 pt-12">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileInputChange}
        />

        {/* Page Header with Animation */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mb-8"
        >
          <h1 className="bg-gradient-to-r from-lernex-blue via-sky-500 to-lernex-purple bg-clip-text text-4xl font-bold text-transparent">
            Profile & Settings
          </h1>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            Customize your learning experience and manage your account
          </p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="grid gap-5 items-start lg:grid-cols-[320px,1fr] xl:grid-cols-[360px,1fr]"
        >
        {/* Left: profile card */}
        <motion.section
          variants={fadeInUp}
          className="group relative overflow-hidden rounded-3xl border border-white/40 bg-gradient-to-br from-white/90 via-white/85 to-white/80 p-6 shadow-2xl backdrop-blur-xl transition-all duration-500 hover:shadow-3xl dark:border-white/20 dark:from-neutral-900/90 dark:via-neutral-900/85 dark:to-neutral-900/80"
        >
          {/* Animated gradient overlay */}
          <div className="absolute -left-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br from-lernex-blue/20 via-sky-400/15 to-transparent blur-3xl transition-all duration-700 group-hover:scale-125 dark:from-lernex-blue/30 dark:via-sky-400/20" />
          <div className="absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-gradient-to-tl from-lernex-purple/15 via-violet-400/10 to-transparent blur-2xl transition-all duration-700 group-hover:scale-125" />

          <div className="relative flex flex-col gap-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <motion.div
                  whileHover={{ scale: 1.05, rotate: 2 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  className="relative h-14 w-14 overflow-hidden rounded-full border-2 border-white/80 bg-white shadow-lg ring-2 ring-lernex-blue/20 transition-all hover:ring-4 hover:ring-lernex-blue/30 dark:border-white/20 dark:bg-neutral-950 dark:ring-sky-400/20 dark:hover:ring-sky-400/30"
                >
                  {avatar ? (
                    <Image src={avatar} alt="avatar" fill sizes="56px" className="object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-lernex-blue/30 via-sky-400/20 to-lernex-purple/30 text-lg font-bold text-lernex-blue dark:text-sky-300">
                      {email?.[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}
                </motion.div>
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
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="rounded-2xl border border-white/40 bg-gradient-to-br from-white/80 via-white/70 to-white/60 p-4 text-sm text-neutral-700 shadow-lg backdrop-blur-lg dark:border-white/20 dark:from-neutral-950/70 dark:via-neutral-950/60 dark:to-neutral-950/50 dark:text-neutral-300"
            >
              <div className="flex items-start gap-2">
                <span className="text-lg">💡</span>
                <p className="flex-1">
                  Keep your streak alive and your avatar fresh to stay visible on the leaderboard and in
                  study groups.
                </p>
              </div>
            </motion.div>

            <motion.div
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              className="grid grid-cols-1 gap-3 text-center sm:grid-cols-2"
            >
              <motion.div
                variants={fadeInUp}
                whileHover={{ y: -4, scale: 1.02 }}
                className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-200 via-orange-100 to-amber-50 p-5 shadow-lg transition-all dark:from-orange-500/30 dark:via-orange-500/20 dark:to-orange-500/10"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-orange-400/0 via-orange-400/0 to-orange-400/10 opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="relative">
                  <div className="flex items-center justify-center gap-2 text-sm font-medium text-orange-700 dark:text-orange-300">
                    <span className="text-xl">🔥</span>
                    Streak
                  </div>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
                    className="mt-2 text-3xl font-bold text-orange-800 dark:text-orange-200"
                  >
                    {streak}
                  </motion.div>
                  <div className="mt-1 text-xs text-orange-600/70 dark:text-orange-400/70">
                    days in a row
                  </div>
                </div>
              </motion.div>

              <motion.div
                variants={fadeInUp}
                whileHover={{ y: -4, scale: 1.02 }}
                className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-200 via-sky-100 to-indigo-50 p-5 shadow-lg transition-all dark:from-sky-500/30 dark:via-sky-500/20 dark:to-sky-500/10"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-sky-400/0 via-sky-400/0 to-sky-400/10 opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="relative">
                  <div className="flex items-center justify-center gap-2 text-sm font-medium text-sky-700 dark:text-sky-300">
                    <span className="text-xl">⭐</span>
                    Points
                  </div>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.6, type: "spring", stiffness: 200 }}
                    className="mt-2 text-3xl font-bold text-sky-800 dark:text-sky-200"
                  >
                    {points}
                  </motion.div>
                  <div className="mt-1 text-xs text-sky-600/70 dark:text-sky-400/70">
                    total earned
                  </div>
                </div>
              </motion.div>
            </motion.div>
            <motion.div
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              className="grid grid-cols-1 gap-3 text-sm font-semibold sm:grid-cols-2"
            >
              <motion.div variants={fadeInUp}>
                <Link
                  href="/"
                  className="group relative block overflow-hidden rounded-xl bg-gradient-to-r from-lernex-blue to-sky-500 px-4 py-2.5 text-center text-white shadow-lg shadow-lernex-blue/25 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-lernex-blue/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lernex-blue/50"
                >
                  <span className="relative z-10">Dashboard</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-sky-500 to-lernex-blue opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </motion.div>
              <motion.div variants={fadeInUp}>
                <Link
                  href="/leaderboard"
                  className="group relative block overflow-hidden rounded-xl border-2 border-white/50 bg-white/30 px-4 py-2.5 text-center backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-lernex-blue/50 hover:bg-lernex-blue/10 hover:shadow-lg dark:border-white/20 dark:bg-white/5 dark:hover:border-sky-400/50 dark:hover:bg-sky-400/10"
                >
                  <span className="relative z-10">Leaderboard</span>
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </motion.section>

        {/* Right: subjects + actions */}
        <motion.section
          variants={fadeInUp}
          className="group relative overflow-hidden rounded-3xl border border-white/40 bg-gradient-to-br from-white/90 via-white/85 to-white/80 p-6 shadow-2xl backdrop-blur-xl transition-all duration-500 hover:shadow-3xl dark:border-white/20 dark:from-neutral-900/90 dark:via-neutral-900/85 dark:to-neutral-900/80"
        >
          <div className="absolute inset-0 opacity-50 [background:radial-gradient(circle_at_top_right,_rgba(59,130,246,0.15),_transparent_60%)] transition-opacity group-hover:opacity-70 dark:opacity-40 dark:group-hover:opacity-60" />
          <div className="absolute -right-20 top-20 h-64 w-64 rounded-full bg-gradient-to-bl from-lernex-purple/10 via-violet-400/5 to-transparent blur-3xl transition-all duration-700 group-hover:scale-125" />
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
                    Let&apos;s get started
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
              <motion.button
                onClick={() => setShowAddModal(true)}
                className="group relative overflow-hidden rounded-2xl border border-lernex-blue/50 bg-gradient-to-r from-lernex-blue to-sky-500 px-4 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-lernex-blue/25 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-lernex-blue/30"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  <Plus className="h-4 w-4" />
                  Add Class
                </span>
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-sky-500 to-lernex-blue opacity-0 transition-opacity group-hover:opacity-100"
                  initial={false}
                />
              </motion.button>
              <motion.button
                onClick={() => setShowRemoveModal(true)}
                disabled={interests.length === 0}
                className="group relative overflow-hidden rounded-2xl border border-rose-500/50 bg-gradient-to-r from-rose-500 to-red-600 px-4 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-rose-500/25 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-rose-500/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                whileHover={{ scale: interests.length > 0 ? 1.02 : 1 }}
                whileTap={{ scale: interests.length > 0 ? 0.98 : 1 }}
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  Remove Class
                </span>
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-red-600 to-rose-500 opacity-0 transition-opacity group-hover:opacity-100"
                  initial={false}
                />
              </motion.button>
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
      </motion.div>

      {/* Account Settings Section */}
      <motion.section
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative mt-8 overflow-hidden rounded-3xl border border-white/40 bg-gradient-to-br from-white/90 via-white/85 to-white/80 p-8 shadow-2xl backdrop-blur-xl dark:border-white/20 dark:from-neutral-900/90 dark:via-neutral-900/85 dark:to-neutral-900/80"
      >
        {/* Decorative gradients */}
        <div className="absolute -left-20 top-1/4 h-72 w-72 rounded-full bg-gradient-to-br from-lernex-blue/15 via-sky-400/10 to-transparent blur-3xl" />
        <div className="absolute -right-20 bottom-1/4 h-72 w-72 rounded-full bg-gradient-to-tl from-lernex-purple/15 via-violet-400/10 to-transparent blur-3xl" />

        <div className="relative">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="bg-gradient-to-r from-lernex-blue to-lernex-purple bg-clip-text text-2xl font-bold text-transparent">
                Account Settings
              </h3>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                Manage how others see you and customize your Lernex experience
              </p>
            </div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 }}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-50/50 px-3 py-1.5 text-xs font-medium text-emerald-700 backdrop-blur-sm dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Changes save instantly
            </motion.div>
          </div>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="relative mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr),minmax(0,1.2fr)]"
        >
          {/* Left Column - Form Fields */}
          <div className="space-y-6 rounded-2xl border border-white/40 bg-gradient-to-br from-white/80 via-white/70 to-white/60 p-6 shadow-lg backdrop-blur-lg dark:border-white/20 dark:from-neutral-950/80 dark:via-neutral-950/70 dark:to-neutral-950/60">
            {/* Username Field */}
            <div className="group">
              <label
                htmlFor="username"
                className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-neutral-700 dark:text-neutral-300"
              >
                <span className="h-1 w-1 rounded-full bg-lernex-blue" />
                Username
              </label>
              <div className="relative">
                <input
                  id="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="your_name"
                  disabled={accountLoading}
                  className={`w-full rounded-xl border-2 bg-white/90 px-4 py-2.5 text-sm font-medium shadow-sm backdrop-blur-sm transition-all duration-300 placeholder:text-neutral-400 focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-neutral-900/90 dark:placeholder:text-neutral-500 ${
                    usernameStatus === "available"
                      ? "border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/20 dark:border-emerald-500 dark:focus:ring-emerald-500/30"
                      : usernameStatus === "taken" || usernameStatus === "invalid" || usernameStatus === "blocked"
                      ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20 dark:border-rose-500 dark:focus:ring-rose-500/30"
                      : "border-neutral-300 focus:border-lernex-blue focus:ring-lernex-blue/20 dark:border-neutral-600 dark:focus:border-sky-400 dark:focus:ring-sky-400/30"
                  }`}
                />
            {usernameStatus !== "idle" && usernameStatusMessage ? (
              <p
                className={`mt-2 text-xs font-medium ${
                  usernameStatus === "available"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : usernameStatus === "checking"
                    ? "text-neutral-500 dark:text-neutral-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {usernameStatusMessage}
              </p>
            ) : null}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleUsernameSave}
                disabled={
                  usernameSaving ||
                  !username.trim() ||
                  usernameStatus === "checking" ||
                  usernameStatus === "invalid" ||
                  usernameStatus === "taken" ||
                  usernameStatus === "blocked" ||
                  username.trim() === initialUsername.trim()
                }
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
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="group">
                <label
                  htmlFor="firstName"
                  className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-neutral-700 dark:text-neutral-300"
                >
                  <span className="h-1 w-1 rounded-full bg-lernex-green" />
                  First name
                </label>
                <input
                  id="firstName"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder="Ada"
                  disabled={accountLoading || preferencesSaving}
                  className="w-full rounded-xl border-2 border-neutral-300 bg-white/90 px-4 py-2.5 text-sm font-medium shadow-sm backdrop-blur-sm transition-all duration-300 placeholder:text-neutral-400 focus:border-lernex-green focus:outline-none focus:ring-4 focus:ring-lernex-green/20 disabled:cursor-not-allowed disabled:opacity-70 dark:border-neutral-600 dark:bg-neutral-900/90 dark:placeholder:text-neutral-500 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/30"
                />
              </div>
              <div className="group">
                <label
                  htmlFor="lastName"
                  className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-neutral-700 dark:text-neutral-300"
                >
                  <span className="h-1 w-1 rounded-full bg-lernex-green opacity-50" />
                  Last name{" "}
                  <span className="normal-case lowercase text-[0.7rem] tracking-normal text-neutral-500 dark:text-neutral-400">
                    (optional)
                  </span>
                </label>
                <input
                  id="lastName"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder="Lovelace"
                  disabled={accountLoading || preferencesSaving}
                  className="w-full rounded-xl border-2 border-neutral-300 bg-white/90 px-4 py-2.5 text-sm font-medium shadow-sm backdrop-blur-sm transition-all duration-300 placeholder:text-neutral-400 focus:border-lernex-green focus:outline-none focus:ring-4 focus:ring-lernex-green/20 disabled:cursor-not-allowed disabled:opacity-70 dark:border-neutral-600 dark:bg-neutral-900/90 dark:placeholder:text-neutral-500 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/30"
                />
              </div>
            </div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="mt-6 overflow-hidden rounded-2xl border-2 border-white/50 bg-gradient-to-br from-white/70 via-white/60 to-white/50 p-5 shadow-lg backdrop-blur-sm dark:border-white/20 dark:from-neutral-900/70 dark:via-neutral-900/60 dark:to-neutral-900/50"
            >
              <div className="flex items-start gap-4">
                <motion.button
                  type="button"
                  onClick={() => setShowRealName(!showRealName)}
                  disabled={accountLoading || preferencesSaving}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 shadow-sm transition-all duration-300 ${
                    showRealName
                      ? "border-lernex-blue bg-gradient-to-br from-lernex-blue to-sky-500 text-white shadow-lernex-blue/30"
                      : "border-neutral-300 bg-white hover:border-neutral-400 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:border-neutral-500"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <AnimatePresence mode="wait">
                    {showRealName && (
                      <motion.div
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={{ scale: 0, rotate: 180 }}
                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-neutral-900 dark:text-white">
                      Show real name on public profile
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold transition-all ${
                      showRealName
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                        : "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400"
                    }`}>
                      {showRealName ? "Visible" : "Hidden"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                    {showRealName
                      ? "Your full name is visible to other users on your public profile."
                      : "Only your username is shown. Your real name is kept private for enhanced privacy."}
                  </p>
                </div>
              </div>
            </motion.div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="group">
                <label
                  htmlFor="dob"
                  className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-neutral-700 dark:text-neutral-300"
                >
                  <span className="h-1 w-1 rounded-full bg-lernex-yellow" />
                  Date of birth
                </label>
                <input
                  id="dob"
                  type="date"
                  value={dob}
                  onChange={(event) => setDob(event.target.value)}
                  disabled={accountLoading || preferencesSaving}
                  className="w-full rounded-xl border-2 border-neutral-300 bg-white/90 px-4 py-2.5 text-sm font-medium shadow-sm backdrop-blur-sm transition-all duration-300 focus:border-lernex-yellow focus:outline-none focus:ring-4 focus:ring-lernex-yellow/20 disabled:cursor-not-allowed disabled:opacity-70 dark:border-neutral-600 dark:bg-neutral-900/90 dark:focus:border-amber-400 dark:focus:ring-amber-400/30"
                />
              </div>
              <div className="group">
                <label
                  htmlFor="themePref"
                  className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-neutral-700 dark:text-neutral-300"
                >
                  <span className="h-1 w-1 rounded-full bg-lernex-purple" />
                  Theme preference
                </label>
                <div className="relative">
                  <select
                    id="themePref"
                    value={themePreference}
                    onChange={(event) => {
                      const nextTheme = event.target.value as ThemePreference;
                      setThemePreference(nextTheme);
                      if (nextTheme !== savedThemePreference) {
                        setPreferencesFeedback({
                          message: "Save settings to apply theme changes.",
                          tone: "info",
                        });
                      } else {
                        setPreferencesFeedback((current) => {
                          if (
                            current?.tone === "info" &&
                            current?.message === "Save settings to apply theme changes."
                          ) {
                            return null;
                          }
                          return current;
                        });
                      }
                    }}
                    disabled={accountLoading || preferencesSaving}
                    className="w-full appearance-none rounded-xl border-2 border-neutral-300 bg-white/90 px-4 py-2.5 pr-10 text-sm font-medium shadow-sm backdrop-blur-sm transition-all duration-300 focus:border-lernex-purple focus:outline-none focus:ring-4 focus:ring-lernex-purple/20 disabled:cursor-not-allowed disabled:opacity-70 dark:border-neutral-600 dark:bg-neutral-900/90 dark:focus:border-violet-400 dark:focus:ring-violet-400/30"
                  >
                    <option value="auto">🔄 Auto (Browser Default)</option>
                    <option value="light">🌞 Light Mode</option>
                    <option value="dark">🌙 Dark Mode</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                    <svg className="h-5 w-5 text-neutral-400 dark:text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                {themePreference !== savedThemePreference && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400"
                  >
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-600 dark:bg-amber-400" />
                    Save to apply this theme
                  </motion.p>
                )}
              </div>
            </div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="mt-6 flex flex-wrap gap-3"
            >
              <motion.button
                type="button"
                onClick={handlePreferencesSave}
                disabled={preferencesSaving || accountLoading}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-lernex-blue via-sky-500 to-lernex-purple px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-lernex-blue/30 transition-all hover:shadow-xl hover:shadow-lernex-blue/40 disabled:pointer-events-none disabled:opacity-60"
              >
                <span className="relative z-10 flex items-center gap-2">
                  {preferencesSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Settings"
                  )}
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-lernex-purple via-violet-500 to-lernex-blue opacity-0 transition-opacity group-hover:opacity-100" />
              </motion.button>

              <motion.button
                type="button"
                onClick={() => router.push("/onboarding")}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center justify-center rounded-xl border-2 border-white/50 bg-white/30 px-5 py-2.5 text-sm font-semibold backdrop-blur-sm transition-all hover:border-lernex-blue/50 hover:bg-lernex-blue/10 hover:shadow-lg dark:border-white/20 dark:bg-white/5 dark:hover:border-sky-400/50 dark:hover:bg-sky-400/10"
              >
                Edit Subjects
              </motion.button>

              <motion.button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteBusy}
                whileHover={{ scale: deleteBusy ? 1 : 1.02, y: deleteBusy ? 0 : -2 }}
                whileTap={{ scale: deleteBusy ? 1 : 0.98 }}
                className="ml-auto inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-rose-500/30 transition-all hover:shadow-xl hover:shadow-rose-500/40 disabled:pointer-events-none disabled:opacity-60"
              >
                {deleteBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Delete Account
                  </>
                )}
              </motion.button>
            </motion.div>
            <AnimatePresence mode="wait">
              {preferencesFeedback ? (
                <motion.p
                  key={`${preferencesFeedback.tone}-${preferencesFeedback.message}`}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className={`mt-3 text-xs font-medium ${toneClass[preferencesFeedback.tone]}`}
                >
                  {preferencesFeedback.message}
                </motion.p>
              ) : null}
            </AnimatePresence>
            <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
              Tip: Keep your profile details current so recommendations stay relevant.
            </p>
          </div>
          {/* Right Column - Avatar Upload */}
          <div className="space-y-5">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              className={`group relative flex cursor-pointer flex-col items-center justify-center gap-5 overflow-hidden rounded-2xl border-2 border-dashed px-6 py-8 text-center backdrop-blur-lg transition-all duration-500 ${
                isDragActive
                  ? "scale-[1.02] border-lernex-blue bg-gradient-to-br from-lernex-blue/20 via-sky-400/15 to-lernex-blue/10 shadow-2xl shadow-lernex-blue/30 dark:border-sky-400 dark:from-sky-500/20 dark:via-sky-400/15 dark:to-sky-500/10"
                  : "border-white/50 bg-gradient-to-br from-white/80 via-white/70 to-white/60 hover:scale-[1.01] hover:border-lernex-blue/50 hover:shadow-xl dark:border-white/20 dark:from-neutral-950/80 dark:via-neutral-950/70 dark:to-neutral-950/60 dark:hover:border-sky-400/50"
              }`}
              onClick={triggerFileDialog}
              onDragOver={handleDragOver}
              onDragEnter={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              role="button"
              tabIndex={0}
            >
              {/* Animated background when dragging */}
              <AnimatePresence>
                {isDragActive && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-gradient-to-br from-lernex-blue/10 via-transparent to-sky-400/10"
                  >
                    <motion.div
                      animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.3, 0.6, 0.3],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                      className="absolute inset-0 rounded-full bg-lernex-blue/20 blur-3xl"
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="relative">
                <motion.div
                  whileHover={{ scale: 1.05, rotate: 3 }}
                  whileTap={{ scale: 0.95 }}
                  className="relative h-32 w-32 overflow-hidden rounded-full border-4 border-white/80 bg-white shadow-2xl ring-4 ring-lernex-blue/20 transition-all hover:ring-8 hover:ring-lernex-blue/30 dark:border-white/30 dark:bg-neutral-950 dark:ring-sky-400/20 dark:hover:ring-sky-400/40"
                >
                  {previewUrl ? (
                    <Image
                      src={previewUrl}
                      alt="Avatar preview"
                      fill
                      sizes="128px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : avatar ? (
                    <Image src={avatar} alt="Profile avatar" fill sizes="128px" className="object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-lernex-blue/30 via-sky-400/20 to-lernex-purple/30 text-4xl font-bold text-lernex-blue dark:text-sky-300">
                      {email?.[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}
                </motion.div>

                <motion.button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    triggerFileDialog();
                  }}
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  whileTap={{ scale: 0.9 }}
                  className="absolute -bottom-2 -right-2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-lernex-blue to-sky-500 text-white shadow-xl shadow-lernex-blue/40 transition-all hover:shadow-2xl hover:shadow-lernex-blue/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lernex-blue/50"
                  aria-label="Upload new avatar"
                >
                  {avatarSaving ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Camera className="h-5 w-5" />
                  )}
                </motion.button>
              </div>

              <div className="relative">
                <p className="text-base font-bold text-neutral-800 dark:text-neutral-100">
                  {isDragActive ? "Drop your photo here!" : "Upload Profile Photo"}
                </p>
                <p className="mt-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  {isDragActive ? "Release to upload" : "Drag & drop or click to browse"}
                </p>
                <div className="mt-3 flex items-center justify-center gap-2 text-xs text-neutral-500 dark:text-neutral-500">
                  <span className="rounded-full bg-neutral-200/80 px-2 py-0.5 dark:bg-neutral-700/80">JPG</span>
                  <span className="rounded-full bg-neutral-200/80 px-2 py-0.5 dark:bg-neutral-700/80">PNG</span>
                  <span className="rounded-full bg-neutral-200/80 px-2 py-0.5 dark:bg-neutral-700/80">WEBP</span>
                  <span className="rounded-full bg-neutral-200/80 px-2 py-0.5 dark:bg-neutral-700/80">Max 4MB</span>
                </div>
              </div>
            </motion.div>
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
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="rounded-2xl border-2 border-white/40 bg-gradient-to-br from-white/80 via-white/70 to-white/60 p-5 shadow-lg backdrop-blur-lg dark:border-white/20 dark:from-neutral-950/80 dark:via-neutral-950/70 dark:to-neutral-950/60"
            >
              <label
                htmlFor="avatarUrl"
                className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-neutral-700 dark:text-neutral-300"
              >
                <span className="h-1 w-1 rounded-full bg-sky-500" />
                Avatar URL
                <span className="normal-case lowercase text-[0.7rem] tracking-normal text-neutral-500 dark:text-neutral-400">
                  (optional)
                </span>
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  id="avatarUrl"
                  value={avatarUrlInput}
                  onChange={(event) => setAvatarUrlInput(event.target.value)}
                  placeholder="https://your-image-host.com/avatar.png"
                  className="w-full rounded-xl border-2 border-neutral-300 bg-white/90 px-4 py-2.5 text-sm font-medium shadow-sm backdrop-blur-sm transition-all duration-300 placeholder:text-neutral-400 focus:border-sky-500 focus:outline-none focus:ring-4 focus:ring-sky-500/20 dark:border-neutral-600 dark:bg-neutral-900/90 dark:placeholder:text-neutral-500 dark:focus:border-sky-400 dark:focus:ring-sky-400/30"
                />
                <motion.button
                  type="button"
                  onClick={handleAvatarUrlSave}
                  disabled={avatarSaving}
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border-2 border-white/50 bg-white/30 px-5 py-2.5 text-sm font-semibold backdrop-blur-sm transition-all hover:border-sky-500/50 hover:bg-sky-500/10 hover:shadow-lg disabled:pointer-events-none disabled:opacity-60 dark:border-white/20 dark:bg-white/5 dark:hover:border-sky-400/50 dark:hover:bg-sky-400/10"
                >
                  {avatarSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save URL"
                  )}
                </motion.button>
              </div>
              <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                <span className="text-sm">💡</span>
                <span>Use this if you host your avatar on an external service (Gravatar, CDN, etc.) or to clear your current avatar.</span>
              </p>
            </motion.div>
          </div>
        </motion.div>
      </motion.section>

      {/* TTS Settings Section */}
      <motion.section
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative mt-8 overflow-hidden rounded-3xl border border-white/40 bg-gradient-to-br from-white/90 via-white/85 to-white/80 p-8 shadow-2xl backdrop-blur-xl dark:border-white/20 dark:from-neutral-900/90 dark:via-neutral-900/85 dark:to-neutral-900/80"
      >
        {/* Decorative gradients */}
        <div className="absolute -left-20 top-1/4 h-72 w-72 rounded-full bg-gradient-to-br from-lernex-blue/15 via-sky-400/10 to-transparent blur-3xl" />
        <div className="absolute -right-20 bottom-1/4 h-72 w-72 rounded-full bg-gradient-to-tl from-lernex-purple/15 via-violet-400/10 to-transparent blur-3xl" />

        <div className="relative">
          <TTSSettings />
        </div>
      </motion.section>
    </div>

    {/* Modals */}
    <AddInterestModal
      isOpen={showAddModal}
      onClose={() => setShowAddModal(false)}
      currentInterests={interests}
      onSuccess={handleInterestsRefresh}
    />
    <RemoveInterestModal
      isOpen={showRemoveModal}
      onClose={() => setShowRemoveModal(false)}
      currentInterests={interests}
      levelMap={levelMap}
      onSuccess={handleInterestsRefresh}
    />
    </main>
  );
}

export default function SettingsPage() {
  return (
    <ErrorBoundary>
      <SettingsPageContent />
    </ErrorBoundary>
  );
}
