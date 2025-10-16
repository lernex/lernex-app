"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import PageTransition from "@/components/PageTransition";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Calendar,
  Edit3,
  Globe,
  Link2,
  ListChecks,
  Loader2,
  Lock,
  PlusCircle,
  Search,
  Share2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

type PlaylistRow = {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string | null;
};

type LessonLite = {
  id: string;
  title: string;
  subject: string | null;
};

type PlaylistItemRow = {
  id: string;
  position: number | null;
  lessons: LessonLite | null;
};

type RawLesson = Record<string, unknown> | null;
type RawItem = {
  id: unknown;
  position: unknown;
  lessons: RawLesson | RawLesson[] | null;
};

type FeedbackState = { type: "success" | "error"; message: string };

function toStr(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function toNum(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBool(value: unknown): boolean {
  return value == null ? false : Boolean(value);
}

function normalizeLesson(raw: RawLesson | RawLesson[] | null): LessonLite | null {
  const candidate = Array.isArray(raw) ? raw[0] ?? null : raw;
  if (!candidate || typeof candidate !== "object") return null;
  const record = candidate as Record<string, unknown>;
  return {
    id: toStr(record.id),
    title: toStr(record.title),
    subject: record.subject == null ? null : toStr(record.subject),
  };
}

function parseItem(row: RawItem): PlaylistItemRow {
  const record = row as Record<string, unknown>;
  return {
    id: toStr(record.id),
    position: toNum(record.position),
    lessons: normalizeLesson((record as RawItem).lessons),
  };
}

function computeNextPosition(list: PlaylistItemRow[]): number {
  return (
    list.reduce((acc, item) => {
      const pos = item.position ?? 0;
      return pos > acc ? pos : acc;
    }, 0) + 1
  );
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(parsed);
  } catch {
    return parsed.toLocaleDateString();
  }
}

const itemVariants = {
  initial: { opacity: 0, y: 10, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -10, scale: 0.98 },
};

export default function PlaylistDetail() {
  const { id } = useParams<{ id: string }>();
  const [playlist, setPlaylist] = useState<PlaylistRow | null>(null);
  const [items, setItems] = useState<PlaylistItemRow[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [savingDescription, setSavingDescription] = useState(false);

  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LessonLite[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const supabaseClient = useMemo(() => supabaseBrowser(), []);

  const loadAll = useCallback(async () => {
    if (!id) return;
    console.debug("[playlist-detail] loadAll:start", { playlistId: id });
    setLoadError(null);
    setLoadingMeta(true);
    setLoadingItems(true);
    try {
      const [playlistRes, itemsRes] = await Promise.all([
        supabaseClient
          .from("playlists")
          .select("id, name, description, is_public, created_at")
          .eq("id", id)
          .maybeSingle(),
        supabaseClient
          .from("playlist_items")
          .select("id, position, lessons(id, title, subject)")
          .eq("playlist_id", id)
          .order("position", { ascending: true }),
      ]);
      console.debug("[playlist-detail] loadAll:responses", {
        playlistError: playlistRes.error?.message ?? null,
        playlistFound: Boolean(playlistRes.data),
        itemsError: itemsRes.error?.message ?? null,
        itemCount: Array.isArray(itemsRes.data) ? itemsRes.data.length : null,
      });

      if (playlistRes.error) {
        throw playlistRes.error;
      }

      const playlistRow = playlistRes.data;
      if (!playlistRow) {
        console.warn("[playlist-detail] loadAll:not-found", { playlistId: id });
        setPlaylist(null);
        setItems([]);
        setLoadError("We could not find that playlist.");
        return;
      }

      setPlaylist({
        id: toStr((playlistRow as Record<string, unknown>).id),
        name: toStr((playlistRow as Record<string, unknown>).name),
        description:
          (playlistRow as Record<string, unknown>).description == null
            ? null
            : toStr((playlistRow as Record<string, unknown>).description),
        is_public: toBool((playlistRow as Record<string, unknown>).is_public),
        created_at:
          (playlistRow as Record<string, unknown>).created_at == null
            ? null
            : toStr((playlistRow as Record<string, unknown>).created_at),
      });

      if (itemsRes.error) {
        throw itemsRes.error;
      }

      const raw = (itemsRes.data ?? []) as RawItem[];
      setItems(raw.map(parseItem));
      console.debug("[playlist-detail] loadAll:success", {
        playlistId: id,
        itemCount: raw.length,
      });
    } catch (err) {
      console.error("Failed to load playlist", err);
      setLoadError("We could not load your playlist. Try again in a moment.");
    } finally {
      setLoadingMeta(false);
      setLoadingItems(false);
    }
  }, [id, supabaseClient]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 3200);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoadingSearch(false);
      return;
    }
    setLoadingSearch(true);
    const sanitized = query.trim().replace(/,/g, "\\,");
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const { data, error } = await supabaseClient
          .from("lessons")
          .select("id, title, subject")
          .or(`title.ilike.%${sanitized}%,subject.ilike.%${sanitized}%`)
          .order("title", { ascending: true })
          .limit(12);
        if (error) {
          throw error;
        }
        if (!active) return;
        setResults((data as LessonLite[]) ?? []);
      } catch (err) {
        if (!active) return;
        console.error("Search failed", err);
        setResults([]);
        setFeedback({
          type: "error",
          message: "Search failed. Please try again.",
        });
      } finally {
        if (active) setLoadingSearch(false);
      }
    }, 260);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, supabaseClient]);

  const createdAtLabel = useMemo(
    () => formatDate(playlist?.created_at ?? null),
    [playlist?.created_at]
  );

  const stats = useMemo(() => {
    const lessonCount = items.length;
    const uniqueSubjects = Array.from(
      new Set(
        items
          .map((item) => item.lessons?.subject)
          .filter((subject): subject is string => Boolean(subject))
      )
    );
    return { lessonCount, uniqueSubjects };
  }, [items]);

  const isInitialLoading = loadingMeta && !playlist;

  const handleRenameStart = () => {
    if (!playlist) return;
    setNameDraft(playlist.name);
    setIsEditingName(true);
  };

  const handleRenameCancel = () => {
    setIsEditingName(false);
    setNameDraft("");
  };

  const saveName = async () => {
    if (!id || !playlist) return;
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === playlist.name) {
      handleRenameCancel();
      return;
    }
    setSavingName(true);
    try {
      const { error } = await supabaseClient
        .from("playlists")
        .update({ name: trimmed })
        .eq("id", id);
      if (error) throw error;
      setPlaylist((prev) => (prev ? { ...prev, name: trimmed } : prev));
      setFeedback({ type: "success", message: "Playlist name updated." });
      handleRenameCancel();
    } catch (err) {
      console.error("Rename failed", err);
      setFeedback({ type: "error", message: "Could not update the name." });
    } finally {
      setSavingName(false);
    }
  };

  const handleDescriptionStart = () => {
    if (!playlist) return;
    setDescriptionDraft(playlist.description ?? "");
    setIsEditingDescription(true);
  };

  const handleDescriptionCancel = () => {
    setIsEditingDescription(false);
    setDescriptionDraft("");
  };

  const saveDescription = async () => {
    if (!id || !playlist) return;
    const trimmed = descriptionDraft.trim();
    if (trimmed === (playlist.description ?? "")) {
      handleDescriptionCancel();
      return;
    }
    setSavingDescription(true);
    try {
      const payload = trimmed ? { description: trimmed } : { description: null };
      const { error } = await supabaseClient
        .from("playlists")
        .update(payload)
        .eq("id", id);
      if (error) throw error;
      setPlaylist((prev) =>
        prev ? { ...prev, description: trimmed || null } : prev
      );
      setFeedback({
        type: "success",
        message: trimmed
          ? "Description updated."
          : "Description cleared.",
      });
      handleDescriptionCancel();
    } catch (err) {
      console.error("Description update failed", err);
      setFeedback({
        type: "error",
        message: "Could not update the description.",
      });
    } finally {
      setSavingDescription(false);
    }
  };

  const toggleVisibility = async () => {
    if (!id || !playlist) return;
    const nextValue = !playlist.is_public;
    setVisibilitySaving(true);
    try {
      const { error } = await supabaseClient
        .from("playlists")
        .update({ is_public: nextValue })
        .eq("id", id);
      if (error) throw error;
      setPlaylist((prev) =>
        prev ? { ...prev, is_public: nextValue } : prev
      );
      setFeedback({
        type: "success",
        message: nextValue
          ? "Playlist is now public."
          : "Playlist is now private.",
      });
    } catch (err) {
      console.error("Visibility toggle failed", err);
      setFeedback({
        type: "error",
        message: "Could not update playlist visibility.",
      });
    } finally {
      setVisibilitySaving(false);
    }
  };

  const handleShare = async () => {
    if (!playlist) return;
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setFeedback({
        type: "error",
        message: "Clipboard access is unavailable in this browser.",
      });
      return;
    }
    setShareLoading(true);
    try {
      if (!playlist.is_public) {
        const { error } = await supabaseClient
          .from("playlists")
          .update({ is_public: true })
          .eq("id", playlist.id);
        if (error) throw error;
        setPlaylist((prev) =>
          prev ? { ...prev, is_public: true } : prev
        );
      }
      await navigator.clipboard.writeText(window.location.href);
      setFeedback({ type: "success", message: "Playlist link copied!" });
    } catch (err) {
      console.error("Share failed", err);
      setFeedback({
        type: "error",
        message: "Could not copy the link. Please try again.",
      });
    } finally {
      setShareLoading(false);
    }
  };

  const addLesson = async (lesson: LessonLite) => {
    if (!id) return;
    if (items.some((item) => item.lessons?.id === lesson.id)) {
      setFeedback({
        type: "error",
        message: "That lesson is already in this playlist.",
      });
      return;
    }
    setAddingId(lesson.id);
    try {
      const nextPosition = computeNextPosition(items);
      const { data, error } = await supabaseClient
        .from("playlist_items")
        .insert({
          playlist_id: id,
          lesson_id: lesson.id,
          position: nextPosition,
        })
        .select("id, position, lessons(id, title, subject)")
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setItems((prev) => [...prev, parseItem(data as RawItem)]);
      } else {
        setItems((prev) => [
          ...prev,
          {
            id: `${lesson.id}-${nextPosition}`,
            position: nextPosition,
            lessons: lesson,
          },
        ]);
      }
      setFeedback({
        type: "success",
        message: "Lesson added to your playlist.",
      });
    } catch (err) {
      console.error("Add lesson failed", err);
      setFeedback({
        type: "error",
        message: "Could not add that lesson right now.",
      });
    } finally {
      setAddingId(null);
    }
  };

  const removeItem = async (itemId: string) => {
    setRemovingId(itemId);
    const previous = items;
    setItems((prev) => prev.filter((item) => item.id !== itemId));
    try {
      const { error } = await supabaseClient
        .from("playlist_items")
        .delete()
        .eq("id", itemId);
      if (error) throw error;
      setFeedback({
        type: "success",
        message: "Lesson removed from the playlist.",
      });
    } catch (err) {
      console.error("Remove lesson failed", err);
      setItems(previous);
      setFeedback({
        type: "error",
        message: "Could not remove that lesson.",
      });
    } finally {
      setRemovingId(null);
    }
  };

  const moveItem = async (itemId: string, offset: -1 | 1) => {
    if (reordering) return;
    const currentIndex = items.findIndex((item) => item.id === itemId);
    if (currentIndex === -1) return;
    const nextIndex = currentIndex + offset;
    if (nextIndex < 0 || nextIndex >= items.length) return;

    setReordering(true);
    const previous = items;
    const reordered = [...items];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(nextIndex, 0, moved);

    const normalized = reordered.map((item, index) => ({
      ...item,
      position: index + 1,
    }));
    setItems(normalized);

    try {
      const updates = normalized
        .map((item, index) => {
          const original = previous.find((orig) => orig.id === item.id);
          return original && original.position === index + 1
            ? null
            : { id: item.id, position: index + 1 };
        })
        .filter(
          (payload): payload is { id: string; position: number } =>
            payload !== null
        );

      await Promise.all(
        updates.map(({ id: targetId, position }) =>
          supabaseClient
            .from("playlist_items")
            .update({ position })
            .eq("id", targetId)
        )
      );
      if (updates.length > 0) {
        setFeedback({
          type: "success",
          message: "Lesson order updated.",
        });
      }
    } catch (err) {
      console.error("Reorder failed", err);
      setItems(previous);
      setFeedback({
        type: "error",
        message: "Could not reorder lessons.",
      });
    } finally {
      setReordering(false);
    }
  };

  const resultEmptyState =
    query.trim().length > 0 && !loadingSearch && results.length === 0;

  return (
    <PageTransition>
      <main className="relative min-h-[calc(100vh-56px)] bg-gradient-to-b from-white via-white to-lernex-gray/50 text-neutral-900 transition-colors dark:from-lernex-charcoal dark:via-lernex-charcoal/98 dark:to-lernex-charcoal/92 dark:text-white">
        <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-10 sm:px-6 lg:px-10">
          <div className="mb-6 flex items-center justify-between">
            <Link
              href="/playlists"
              className="group inline-flex items-center gap-2 rounded-full border border-neutral-200/80 bg-white/70 px-3 py-1.5 text-sm font-medium text-neutral-600 shadow-sm backdrop-blur transition hover:border-lernex-blue/50 hover:text-lernex-blue dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:border-lernex-blue/60 dark:hover:text-lernex-blue/90"
            >
              <ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-0.5" />
              Back to playlists
            </Link>
            {playlist && (
              <span className="hidden text-sm text-neutral-500 dark:text-neutral-400 sm:inline">
                {items.length} {items.length === 1 ? "lesson" : "lessons"}
              </span>
            )}
          </div>

          {loadError && !playlist ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="rounded-3xl border border-red-200/70 bg-red-50/70 p-8 text-red-800 shadow-sm dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200"
            >
              <h2 className="text-lg font-semibold">Playlist unavailable</h2>
              <p className="mt-2 text-sm text-red-700/80 dark:text-red-200/80">
                {loadError}
              </p>
              <button
                onClick={() => void loadAll()}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-red-500/90 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-red-500"
              >
                <Sparkles className="h-4 w-4" />
                Try again
              </button>
            </motion.div>
          ) : null}

          <AnimatePresence mode="wait">
            {isInitialLoading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                className="space-y-8"
              >
                <div className="relative overflow-hidden rounded-3xl border border-neutral-200/70 bg-white/80 p-8 shadow-lg shadow-lernex-blue/5 backdrop-blur dark:border-white/10 dark:bg-white/5">
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-4">
                      <div className="h-8 w-2/3 animate-pulse rounded-full bg-neutral-200/90 dark:bg-white/10" />
                      <div className="h-4 w-full animate-pulse rounded-full bg-neutral-200/80 dark:bg-white/5" />
                      <div className="h-4 w-5/6 animate-pulse rounded-full bg-neutral-200/80 dark:bg-white/5" />
                    </div>
                    <div className="flex flex-col gap-3">
                      {Array.from({ length: 3 }).map((_, idx) => (
                        <div
                          key={idx}
                          className="h-16 animate-pulse rounded-2xl bg-neutral-200/80 dark:bg-white/5"
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="rounded-3xl border border-neutral-200/70 bg-white/70 p-6 shadow-lg shadow-lernex-blue/5 backdrop-blur dark:border-white/10 dark:bg-white/5">
                  <div className="h-10 w-1/3 animate-pulse rounded-full bg-neutral-200/80 dark:bg-white/5" />
                  <div className="mt-6 space-y-3">
                    {Array.from({ length: 3 }).map((_, idx) => (
                      <div
                        key={idx}
                        className="h-20 animate-pulse rounded-2xl bg-neutral-200/80 dark:bg-white/5"
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            ) : playlist ? (
              <motion.div
                key="content"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                className="space-y-8"
              >
                <section className="relative overflow-hidden rounded-3xl border border-white/60 bg-gradient-to-br from-lernex-blue/15 via-white/80 to-lernex-purple/15 p-8 shadow-xl backdrop-blur-lg dark:border-white/10 dark:from-lernex-blue/15 dark:via-lernex-charcoal/40 dark:to-lernex-purple/15">
                  <motion.span
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 0.65, scale: 1 }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                    className="pointer-events-none absolute -top-20 -right-10 hidden h-56 w-56 rounded-full bg-lernex-blue/25 blur-3xl md:block dark:hidden"
                  />
                  <motion.span
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 0.55, scale: 1 }}
                    transition={{ duration: 1.4, delay: 0.1, ease: "easeOut" }}
                    className="pointer-events-none absolute -bottom-24 left-1/2 hidden h-64 w-64 -translate-x-1/2 rounded-full bg-lernex-purple/25 blur-3xl md:block dark:hidden"
                  />
                  <div className="relative z-10 flex flex-col gap-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        {isEditingName ? (
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <input
                              value={nameDraft}
                              onChange={(event) => setNameDraft(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void saveName();
                                }
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  handleRenameCancel();
                                }
                              }}
                              autoFocus
                              className="w-full rounded-2xl border border-lernex-blue/30 bg-white/90 px-4 py-2.5 text-lg font-semibold text-neutral-900 shadow-sm outline-none ring-lernex-blue/40 focus:ring dark:border-white/10 dark:bg-white/10 dark:text-white"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => void saveName()}
                                disabled={savingName}
                                className="inline-flex items-center gap-2 rounded-full bg-lernex-blue px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-lernex-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {savingName ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Sparkles className="h-4 w-4" />
                                )}
                                Save
                              </button>
                              <button
                                onClick={handleRenameCancel}
                                className="inline-flex items-center gap-2 rounded-full border border-neutral-200/70 bg-white/70 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-800 dark:border-white/10 dark:bg-white/5 dark:text-white/80"
                              >
                                <X className="h-4 w-4" />
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-3">
                            <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 drop-shadow-sm dark:text-white">
                              {playlist.name}
                            </h1>
                            <button
                              onClick={handleRenameStart}
                              className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/80 px-3 py-1.5 text-xs font-medium text-neutral-600 shadow-sm transition hover:border-lernex-blue/50 hover:text-lernex-blue dark:border-white/10 dark:bg-white/10 dark:text-white/80"
                            >
                              <Edit3 className="h-4 w-4" />
                              Rename
                            </button>
                          </div>
                        )}

                        {isEditingDescription ? (
                          <div className="space-y-3">
                            <textarea
                              value={descriptionDraft}
                              onChange={(event) =>
                                setDescriptionDraft(event.target.value)
                              }
                              rows={3}
                              className="w-full rounded-2xl border border-lernex-blue/30 bg-white/90 px-4 py-3 text-sm text-neutral-700 shadow-sm outline-none ring-lernex-blue/40 focus:ring dark:border-white/10 dark:bg-white/10 dark:text-white"
                              placeholder="Describe what this playlist helps you focus on..."
                            />
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => void saveDescription()}
                                disabled={savingDescription}
                                className="inline-flex items-center gap-2 rounded-full bg-lernex-blue px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-lernex-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {savingDescription ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Sparkles className="h-4 w-4" />
                                )}
                                Save description
                              </button>
                              <button
                                onClick={handleDescriptionCancel}
                                className="inline-flex items-center gap-2 rounded-full border border-neutral-200/70 bg-white/70 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-800 dark:border-white/10 dark:bg-white/5 dark:text-white/80"
                              >
                                <X className="h-4 w-4" />
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-600 dark:text-white/80">
                            {playlist.description ? (
                              <>
                                <p className="max-w-2xl leading-relaxed">
                                  {playlist.description}
                                </p>
                                <button
                                  onClick={handleDescriptionStart}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/80 px-3 py-1.5 text-xs font-medium text-neutral-600 shadow-sm transition hover:border-lernex-blue/50 hover:text-lernex-blue dark:border-white/10 dark:bg-white/10 dark:text-white/80"
                                >
                                  <Edit3 className="h-4 w-4" />
                                  Edit
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={handleDescriptionStart}
                                className="inline-flex items-center gap-2 rounded-full border border-dashed border-lernex-blue/50 bg-white/80 px-4 py-2 text-xs font-semibold text-lernex-blue transition hover:border-lernex-blue hover:bg-white dark:border-lernex-blue/50 dark:bg-white/5 dark:text-lernex-blue/80"
                              >
                                <Sparkles className="h-4 w-4" />
                                Add a description
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={() => void toggleVisibility()}
                          disabled={visibilitySaving}
                          className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm transition hover:border-lernex-blue/50 hover:text-lernex-blue disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/10 dark:text-white/80 dark:hover:border-lernex-blue/60 dark:hover:text-lernex-blue/90"
                        >
                          {visibilitySaving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : playlist.is_public ? (
                            <Globe className="h-4 w-4" />
                          ) : (
                            <Lock className="h-4 w-4" />
                          )}
                          {playlist.is_public ? "Public" : "Private"}
                        </button>
                        <button
                          onClick={() => void handleShare()}
                          disabled={shareLoading}
                          className="inline-flex items-center gap-2 rounded-full bg-lernex-blue px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-lernex-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {shareLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : playlist.is_public ? (
                            <Link2 className="h-4 w-4" />
                          ) : (
                            <Share2 className="h-4 w-4" />
                          )}
                          {playlist.is_public ? "Copy link" : "Share and copy link"}
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-white/10">
                        <div className="flex items-center justify-between text-sm text-neutral-500 dark:text-white/60">
                          <span>Lessons</span>
                          <BookOpen className="h-4 w-4" />
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-white">
                          {stats.lessonCount}
                        </div>
                        <p className="mt-1 text-xs text-neutral-500 dark:text-white/60">
                          Curate a flow that keeps you engaged.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-white/10">
                        <div className="flex items-center justify-between text-sm text-neutral-500 dark:text-white/60">
                          <span>Subjects</span>
                          <ListChecks className="h-4 w-4" />
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-white">
                          {stats.uniqueSubjects.length}
                        </div>
                        <p className="mt-1 text-xs text-neutral-500 dark:text-white/60">
                          {stats.uniqueSubjects.length > 0
                            ? `Featuring ${stats.uniqueSubjects.slice(0, 2).join(", ")}`
                            : "Add lessons to explore more topics."}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-white/10">
                        <div className="flex items-center justify-between text-sm text-neutral-500 dark:text-white/60">
                          <span>Created</span>
                          <Calendar className="h-4 w-4" />
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-white">
                          {createdAtLabel ?? "-"}
                        </div>
                        <p className="mt-1 text-xs text-neutral-500 dark:text-white/60">
                          Keep iterating - your updates stay in sync.
                        </p>
                      </div>
                    </div>
                  </div>
                </section>
                <section className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
                  <motion.div
                    layout
                    className="rounded-3xl border border-neutral-200/70 bg-white/80 p-6 shadow-lg shadow-lernex-blue/5 backdrop-blur dark:border-white/10 dark:bg-white/5"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                          Discover lessons
                        </h2>
                        <p className="mt-1 text-xs text-neutral-500 dark:text-white/60">
                          Search by title or subject to grow this playlist.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-3">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400 dark:text-white/40" />
                        <input
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                          placeholder="Try &quot;Calculus limits&quot; or &quot;World History&quot;"
                          className="w-full rounded-2xl border border-neutral-200 bg-white/90 py-2.5 pl-10 pr-3 text-sm text-neutral-700 shadow-sm outline-none transition focus:border-lernex-blue focus:ring-2 focus:ring-lernex-blue/30 dark:border-white/15 dark:bg-white/10 dark:text-white"
                        />
                      </div>

                      <AnimatePresence initial={false} mode="wait">
                        {loadingSearch ? (
                          <motion.div
                            key="search-loading"
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 6 }}
                            className="flex items-center gap-2 rounded-2xl border border-neutral-200/60 bg-white/80 px-3 py-2 text-sm text-neutral-500 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white/60"
                          >
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Searching...
                          </motion.div>
                        ) : null}
                      </AnimatePresence>

                      {resultEmptyState ? (
                        <motion.div
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="rounded-2xl border border-dashed border-neutral-300/80 bg-white/60 px-4 py-6 text-center text-sm text-neutral-500 dark:border-white/10 dark:bg-white/5 dark:text-white/60"
                        >
                          <p>No lessons match &quot;{query.trim()}&quot; yet.</p>
                          <p className="mt-1 text-xs">
                            Try a different keyword or explore other subjects.
                          </p>
                        </motion.div>
                      ) : null}

                      <div className="space-y-2">
                        <AnimatePresence initial={false}>
                          {results.map((lesson) => {
                            const alreadyAdded = items.some(
                              (item) => item.lessons?.id === lesson.id
                            );
                            return (
                              <motion.div
                                key={lesson.id}
                                layout
                                variants={itemVariants}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                transition={{ duration: 0.2 }}
                                className="group flex items-center justify-between gap-3 rounded-2xl border border-neutral-200/80 bg-white/80 px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:border-lernex-blue/60 hover:shadow-md dark:border-white/10 dark:bg-white/10"
                              >
                                <div>
                                  <p className="text-xs uppercase tracking-wide text-neutral-400 dark:text-white/50">
                                    {lesson.subject ?? "General"}
                                  </p>
                                  <p className="mt-1 text-sm font-medium text-neutral-800 dark:text-white/90">
                                    {lesson.title}
                                  </p>
                                </div>
                                <button
                                  onClick={() => void addLesson(lesson)}
                                  disabled={alreadyAdded || addingId === lesson.id}
                                  className="inline-flex items-center gap-2 rounded-full bg-lernex-blue px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-lernex-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {alreadyAdded ? (
                                    "Added"
                                  ) : addingId === lesson.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <>
                                      <PlusCircle className="h-3.5 w-3.5" />
                                      Add
                                    </>
                                  )}
                                  {addingId === lesson.id && !alreadyAdded ? (
                                    <span className="sr-only">Adding</span>
                                  ) : null}
                                </button>
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      </div>
                    </div>
                  </motion.div>

                  <motion.div
                    layout
                    className="rounded-3xl border border-neutral-200/70 bg-white/80 p-6 shadow-lg shadow-lernex-blue/5 backdrop-blur dark:border-white/10 dark:bg-white/5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                          Playlist lessons
                        </h2>
                        <p className="mt-1 text-xs text-neutral-500 dark:text-white/60">
                          Arrange your flow and remove anything you no longer need.
                        </p>
                      </div>
                      {loadingItems ? null : (
                        <span className="rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs font-medium text-neutral-600 dark:border-white/10 dark:bg-white/10 dark:text-white/70">
                          {items.length} {items.length === 1 ? "lesson" : "lessons"}
                        </span>
                      )}
                    </div>

                    <div className="mt-5 space-y-3">
                      {loadingItems ? (
                        <div className="flex flex-col gap-3">
                          {Array.from({ length: 3 }).map((_, idx) => (
                            <div
                              key={idx}
                              className="h-20 animate-pulse rounded-2xl bg-neutral-200/80 shadow-sm dark:bg-white/5"
                            />
                          ))}
                        </div>
                      ) : items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300/80 bg-white/60 px-6 py-10 text-center text-sm text-neutral-500 dark:border-white/10 dark:bg-white/5 dark:text-white/60">
                          <Sparkles className="h-6 w-6" />
                          <p className="mt-3 font-medium">
                            Your playlist is waiting for its first lesson.
                          </p>
                          <p className="mt-1 text-xs">
                            Use the search panel to add anything from your library.
                          </p>
                        </div>
                      ) : (
                        <AnimatePresence initial={false}>
                          {items.map((item, index) => {
                            const hasLesson = !!item.lessons;
                            return (
                              <motion.div
                                key={item.id}
                                layout
                                variants={itemVariants}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                transition={{ duration: 0.2 }}
                                className="flex flex-col gap-3 rounded-2xl border border-neutral-200/80 bg-white/90 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-lernex-blue/60 hover:shadow-md dark:border-white/10 dark:bg-white/10"
                              >
                                <div className="flex items-start gap-4">
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-lernex-blue/20 via-lernex-blue/10 to-lernex-purple/15 text-sm font-semibold text-lernex-blue dark:from-lernex-blue/20 dark:via-lernex-blue/15 dark:to-lernex-purple/20 dark:text-lernex-blue/80">
                                    {index + 1}
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-xs uppercase tracking-wide text-neutral-400 dark:text-white/50">
                                      {item.lessons?.subject ?? "No subject"}
                                    </p>
                                    <p className="mt-1 text-base font-medium text-neutral-900 dark:text-white">
                                      {hasLesson
                                        ? item.lessons?.title
                                        : "Lesson unavailable"}
                                    </p>
                                    {!hasLesson ? (
                                      <p className="mt-1 text-xs text-red-500 dark:text-red-300">
                                        This lesson was removed. Remove it from your playlist.
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
                                  <button
                                    onClick={() => void moveItem(item.id, -1)}
                                    disabled={reordering || index === 0}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white/80 px-3 py-1.5 font-medium text-neutral-600 transition hover:border-lernex-blue/50 hover:text-lernex-blue disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/10 dark:text-white/70"
                                  >
                                    <ArrowUp className="h-3.5 w-3.5" />
                                    Up
                                  </button>
                                  <button
                                    onClick={() => void moveItem(item.id, 1)}
                                    disabled={reordering || index === items.length - 1}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white/80 px-3 py-1.5 font-medium text-neutral-600 transition hover:border-lernex-blue/50 hover:text-lernex-blue disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/10 dark:text-white/70"
                                  >
                                    <ArrowDown className="h-3.5 w-3.5" />
                                    Down
                                  </button>
                                  <button
                                    onClick={() => void removeItem(item.id)}
                                    disabled={removingId === item.id}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-red-200/60 bg-red-50/80 px-3 py-1.5 font-medium text-red-600 transition hover:border-red-400 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/20 dark:bg-red-500/15 dark:text-red-200"
                                  >
                                    {removingId === item.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-3.5 w-3.5" />
                                    )}
                                    Remove
                                  </button>
                                </div>
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      )}
                    </div>
                  </motion.div>
                </section>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {feedback ? (
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className={`fixed bottom-8 left-1/2 z-50 w-[min(90vw,420px)] -translate-x-1/2 rounded-full px-5 py-3 text-sm font-medium shadow-lg backdrop-blur ${
                feedback.type === "success"
                  ? "bg-lernex-blue/90 text-white"
                  : "bg-red-500/95 text-white"
              }`}
            >
              {feedback.message}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </main>
    </PageTransition>
  );
}
