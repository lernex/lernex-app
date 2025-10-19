"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Copy,
  Eye,
  Filter,
  Globe,
  Loader2,
  Lock,
  Plus,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCog,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";

type PlaylistRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_public: boolean | null;
  created_at: string | null;
};

type ProfileLite = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

type PlaylistCardMeta = PlaylistRow & {
  owner: ProfileLite | null;
  userRole: "owner" | "moderator" | "viewer";
  membershipId: string | null;
};

type FilterKey = "all" | "mine" | "shared" | "public";

type FeedbackState = { type: "success" | "error"; message: string };

type CollaboratorRow = {
  id: string;
  playlist_id: string;
  profile_id: string;
  role: "viewer" | "moderator";
  created_at: string | null;
  profile: ProfileLite | null;
};

type SharePanelProps = {
  isOpen: boolean;
  playlist: PlaylistCardMeta | null;
  onClose: () => void;
  supabase: ReturnType<typeof supabaseBrowser>;
  onRefresh: () => Promise<void>;
  pushFeedback: (feedback: FeedbackState) => void;
  currentUserId: string | null;
  onToggleVisibility: (playlist: PlaylistCardMeta) => Promise<void>;
};

type PlaylistCardProps = {
  playlist: PlaylistCardMeta;
  busy: boolean;
  deleting: boolean;
  onToggleVisibility: (playlist: PlaylistCardMeta) => Promise<void>;
  onOpenShare: (playlist: PlaylistCardMeta) => void;
  onDelete: (playlist: PlaylistCardMeta) => Promise<void>;
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All playlists" },
  { key: "mine", label: "Owned" },
  { key: "shared", label: "Shared with me" },
  { key: "public", label: "Public" },
];

export default function Playlists() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [sessionReady, setSessionReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistCardMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [busyMap, setBusyMap] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!active) return;
        if (sessionError) {
          console.error("[playlists] session fetch failed", sessionError);
        }

        setUserId(data?.session?.user?.id ?? null);
        setSessionReady(true);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: playlistData, error: playlistError } = await supabase
        .from("playlists")
        .select("id, user_id, name, description, is_public, created_at")
        .order("created_at", { ascending: false });

      if (playlistError) {
        throw playlistError;
      }

      const rows = (playlistData ?? []) as PlaylistRow[];
      const ownerIds = Array.from(
        new Set(rows.map((row) => row.user_id).filter(Boolean))
      );

      let ownerMap: Record<string, ProfileLite> = {};
      if (ownerIds.length > 0) {
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("id, full_name, username, avatar_url")
          .in("id", ownerIds);

        if (profileError) {
          throw profileError;
        }

        ownerMap = Object.fromEntries(
          ((profileData ?? []) as ProfileLite[]).map((profile) => [
            profile.id,
            profile,
          ])
        );
      }

      let membershipMap: Record<
        string,
        { membershipId: string; role: "moderator" | "viewer" }
      > = {};

      if (userId) {
        const {
          data: membershipData,
          error: membershipError,
        } = await supabase
          .from("playlist_memberships")
          .select("id, playlist_id, role")
          .eq("profile_id", userId);

      if (membershipError) {
        if (isMissingTableError(membershipError)) {
          console.info(
            "[playlists] playlist_memberships table not found; sharing features unavailable"
          );
        } else {
          throw membershipError;
        }
      } else if (membershipData) {
          membershipMap = Object.fromEntries(
            (
              membershipData as {
                id: string;
                playlist_id: string;
                role: "moderator" | "viewer";
              }[]
            ).map((entry) => [
              entry.playlist_id,
              { membershipId: entry.id, role: entry.role },
            ])
          );
        }
      }

      const mapped: PlaylistCardMeta[] = rows.map((row) => {
        const normalizedIsPublic = Boolean(row.is_public);
        const membership = membershipMap[row.id] ?? null;
        let userRole: "owner" | "moderator" | "viewer" = "viewer";

        if (row.user_id === userId) {
          userRole = "owner";
        } else if (membership?.role === "moderator") {
          userRole = "moderator";
        } else if (membership?.role === "viewer") {
          userRole = "viewer";
        } else if (normalizedIsPublic) {
          userRole = "viewer";
        }

        return {
          ...row,
          is_public: normalizedIsPublic,
          owner: ownerMap[row.user_id] ?? null,
          userRole,
          membershipId: membership?.membershipId ?? null,
        };
      });

      setPlaylists(mapped);
    } catch (err) {
      console.error("Failed to load playlists", err);
      setError("We couldn't load playlists right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [supabase, userId]);

  useEffect(() => {
    if (!sessionReady) return;
    void refresh();
  }, [refresh, sessionReady]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 3600);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (shareOpen && !selectedId) {
      setShareOpen(false);
    }
  }, [shareOpen, selectedId]);

  const filterCounts = useMemo<Record<FilterKey, number>>(() => {
    const mine = playlists.filter((item) => item.userRole === "owner").length;
    const shared = playlists.filter(
      (item) => item.userRole !== "owner" && Boolean(item.membershipId)
    ).length;
    const publicCount = playlists.filter((item) => item.is_public).length;

    return {
      all: playlists.length,
      mine,
      shared,
      public: publicCount,
    };
  }, [playlists]);

  const filteredPlaylists = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return playlists.filter((playlist) => {
      const matchesSearch =
        !normalizedSearch ||
        [
          playlist.name,
          playlist.description ?? "",
          playlist.owner?.full_name ?? "",
          playlist.owner?.username ?? "",
        ]
          .map((value) => value.toLowerCase())
          .some((value) => value.includes(normalizedSearch));

      if (!matchesSearch) return false;

      if (activeFilter === "mine") {
        return playlist.userRole === "owner";
      }
      if (activeFilter === "shared") {
        return playlist.userRole !== "owner" && Boolean(playlist.membershipId);
      }
      if (activeFilter === "public") {
        return Boolean(playlist.is_public);
      }
      return true;
    });
  }, [playlists, searchTerm, activeFilter]);

  const selectedPlaylist = useMemo(
    () => playlists.find((playlist) => playlist.id === selectedId) ?? null,
    [playlists, selectedId]
  );

  const deleteCandidate = useMemo(
    () => (deleteTarget ? playlists.find((item) => item.id === deleteTarget) ?? null : null),
    [deleteTarget, playlists]
  );

  const isDeletingSelected = deleteCandidate
    ? deletingId === deleteCandidate.id
    : false;

  useEffect(() => {
    if (!deleteConfirmOpen) {
      setDeleteError(null);
      return;
    }
    if (!deleteCandidate) {
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
    }
  }, [deleteConfirmOpen, deleteCandidate]);

  const handleCreate = async () => {
    const trimmed = createName.trim();
    if (!trimmed || creating) return;

    setCreating(true);
    try {
      if (!userId) {
        setFeedback({
          type: "error",
          message: "Sign in to create playlists.",
        });
        return;
      }

      const { error: insertError } = await supabase
        .from("playlists")
        .insert({ name: trimmed, user_id: userId });

      if (insertError) throw insertError;

      setCreateName("");
      setFeedback({
        type: "success",
        message: "Playlist created.",
      });
      await refresh();
    } catch (err) {
      console.error("Failed to create playlist", err);
      const code = isPostgrestError(err) ? err.code : undefined;
      setFeedback({
        type: "error",
        message:
          code === "42501"
            ? "Sign in to create playlists."
            : "Could not create playlist. Please try again.",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleToggleVisibility = useCallback(
    async (playlist: PlaylistCardMeta) => {
      setBusyMap((prev) => ({ ...prev, [playlist.id]: true }));
      const nextVisibility = !playlist.is_public;

      try {
        const { error: updateError } = await supabase
          .from("playlists")
          .update({ is_public: nextVisibility })
          .eq("id", playlist.id);

        if (updateError) throw updateError;

        setPlaylists((prev) =>
          prev.map((item) =>
            item.id === playlist.id ? { ...item, is_public: nextVisibility } : item
          )
        );

        setFeedback({
          type: "success",
          message: nextVisibility
            ? "Playlist is now public."
            : "Playlist is now private.",
        });
      } catch (err) {
        console.error("Failed to toggle visibility", err);
        setFeedback({
          type: "error",
          message: "Could not update visibility. Please try again.",
        });
      } finally {
        setBusyMap((prev) => {
          const next = { ...prev };
          delete next[playlist.id];
          return next;
        });
      }
    },
    [supabase]
  );

  const handleOpenShare = (playlist: PlaylistCardMeta) => {
    setSelectedId(playlist.id);
    setShareOpen(true);
  };

  const handleDeleteRequest = async (playlist: PlaylistCardMeta) => {
    if (playlist.userRole !== "owner") return;
    setDeleteTarget(playlist.id);
    setDeleteConfirmOpen(true);
    setDeleteError(null);
  };

  const handleDeleteCancel = () => {
    if (deletingId) return;
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
    setDeleteError(null);
  };

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteCandidate) return;
    if (!userId) {
      setDeleteError("Sign in to delete playlists.");
      return;
    }
    if (deleteCandidate.userRole !== "owner") {
      setDeleteError("Only the owner can delete this playlist.");
      return;
    }

    setDeleteError(null);
    setDeletingId(deleteCandidate.id);
    try {
      const { error: deleteErrorResponse } = await supabase
        .from("playlists")
        .delete()
        .eq("id", deleteCandidate.id)
        .eq("user_id", userId);
      if (deleteErrorResponse) throw deleteErrorResponse;

      setPlaylists((prev) =>
        prev.filter((item) => item.id !== deleteCandidate.id)
      );
      setFeedback({ type: "success", message: "Playlist deleted." });
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
      if (selectedId === deleteCandidate.id) {
        setShareOpen(false);
        setSelectedId(null);
      }
    } catch (err) {
      console.error("Delete playlist failed", err);
      if (isPostgrestError(err) && err.code === "42501") {
        setDeleteError("You need to own this playlist to delete it.");
      } else {
        setDeleteError("Could not delete this playlist. Please try again.");
      }
    } finally {
      setDeletingId(null);
    }
  }, [deleteCandidate, selectedId, supabase, userId]);
  const handleCloseShare = () => {
    setShareOpen(false);
  };
  return (
    <main className="min-h-[calc(100vh-56px)] text-neutral-900 transition-colors dark:text-white">
      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 lg:px-8">
        <div className="space-y-8">
        <section className="relative overflow-hidden rounded-3xl border border-white/70 bg-gradient-to-br from-white via-[#f6f9ff] to-white p-8 shadow-[0_32px_75px_-48px_rgba(47,128,237,0.45)] backdrop-blur-xl dark:border-white/10 dark:bg-gradient-to-br dark:from-[#101a2c] dark:via-[#0d1524] dark:to-[#090f1c]">
            <motion.span
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 0.6, scale: 1 }}
              transition={{ duration: 1.2, ease: "easeOut" }}
              className="pointer-events-none absolute -top-24 -left-20 hidden h-52 w-52 rounded-full bg-lernex-blue/25 blur-3xl md:block dark:hidden"
            />
            <motion.span
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 0.55, scale: 1 }}
              transition={{ duration: 1.4, delay: 0.1, ease: "easeOut" }}
              className="pointer-events-none absolute -bottom-24 right-10 hidden h-60 w-60 rounded-full bg-lernex-purple/25 blur-3xl md:block dark:hidden"
            />
            <div className="relative z-10 flex flex-col gap-6">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-lernex-blue shadow-sm dark:bg-white/10 dark:text-lernex-blue/80">
                  <Users className="h-4 w-4" />
                  Playlist hub
                </span>
                <h1 className="mt-4 text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white sm:text-4xl">
                  Curate, discover, and share playlists
                </h1>
                <p className="mt-3 max-w-2xl text-sm text-neutral-600 dark:text-white/70">
                  Search across your personal study sets, collaborate with trusted moderators, and explore public playlists shared by the Lernex community.
                </p>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400 dark:text-white/40" />
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search by playlist name, topic, or creator..."
                    className="w-full rounded-full border border-neutral-200/70 bg-white/85 px-12 py-3 text-sm text-neutral-800 shadow-sm outline-none transition focus:border-lernex-blue/60 focus:ring-2 focus:ring-lernex-blue/30 dark:border-white/10 dark:bg-white/10 dark:text-white"
                  />
                </div>
                <div className="flex flex-col gap-2 sm:flex-row lg:w-auto">
                  <input
                    value={createName}
                    onChange={(event) => setCreateName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleCreate();
                      }
                    }}
                    placeholder="Name your next playlist"
                    className="w-full rounded-full border border-neutral-200/70 bg-white/85 px-4 py-3 text-sm text-neutral-800 shadow-sm outline-none transition focus:border-lernex-blue/60 focus:ring-2 focus:ring-lernex-blue/30 dark:border-white/10 dark:bg-white/10 dark:text-white"
                  />
                  <button
                    onClick={() => void handleCreate()}
                    disabled={creating}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-lernex-blue px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-lernex-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {creating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    {creating ? "Creating..." : "Create playlist"}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {FILTERS.map((filter, index) => {
                  const active = activeFilter === filter.key;
                  return (
                    <button
                      key={filter.key}
                      onClick={() => setActiveFilter(filter.key)}
                      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition ${
                        active
                          ? "border-lernex-blue/60 bg-lernex-blue/10 text-lernex-blue shadow-sm dark:border-lernex-blue/60 dark:bg-lernex-blue/20 dark:text-lernex-blue/80"
                          : "border-neutral-200/80 bg-white/75 text-neutral-600 hover:border-lernex-blue/40 hover:text-lernex-blue dark:border-white/10 dark:bg-white/10 dark:text-white/70"
                      }`}
                    >
                      {index === 0 ? (
                        <Filter className="h-3.5 w-3.5" />
                      ) : null}
                      <span>{filter.label}</span>
                      <span
                        className={`h-5 min-w-[20px] rounded-full px-1 text-center text-[11px] ${
                          active
                            ? "bg-lernex-blue/90 text-white"
                            : "bg-neutral-100 text-neutral-600 dark:bg-white/10 dark:text-white/60"
                        }`}
                      >
                        {filterCounts[filter.key]}
                      </span>
                    </button>
                  );
                })}
              </div>

              {error ? (
                <div className="rounded-2xl border border-red-200/70 bg-red-50/80 px-4 py-3 text-sm text-red-700 shadow-sm dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
                  {error}
                </div>
              ) : null}
            </div>
          </section>
        <section className="rounded-3xl border border-[var(--surface-border)] bg-gradient-to-br from-white via-white to-[#f5f9ff] p-6 shadow-[0_24px_80px_-50px_rgba(47,128,237,0.42)] backdrop-blur dark:bg-gradient-to-br dark:from-[#0f172a] dark:via-[#0b1220] dark:to-[#080d18]">
            {loading ? (
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-64 animate-pulse rounded-3xl border border-neutral-200/70 bg-white/80 shadow-sm dark:border-white/10 dark:bg-white/10"
                  />
                ))}
              </div>
            ) : filteredPlaylists.length > 0 ? (
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {filteredPlaylists.map((playlist) => (
                  <PlaylistCard
                    key={playlist.id}
                    playlist={playlist}
                    busy={Boolean(busyMap[playlist.id])}
                    deleting={deletingId === playlist.id}
                    onToggleVisibility={handleToggleVisibility}
                    onOpenShare={handleOpenShare}
                    onDelete={handleDeleteRequest}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-neutral-300/80 bg-white/70 px-8 py-16 text-center dark:border-white/10 dark:bg-white/10">
                <Sparkles className="h-8 w-8 text-lernex-blue" />
                <h2 className="mt-4 text-lg font-semibold text-neutral-900 dark:text-white">
                  No playlists matched your filters
                </h2>
                <p className="mt-2 max-w-md text-sm text-neutral-500 dark:text-white/60">
                  Try adjusting the search, switch the filter, or create something new to kick off your next study streak.
                </p>
                <button
                  onClick={() => {
                    setActiveFilter("all");
                    setSearchTerm("");
                  }}
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-lernex-blue px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-lernex-blue/90"
                >
                  <Sparkles className="h-4 w-4" />
                  Reset filters
                </button>
              </div>
            )}
          </section>
        </div>
      </div>

      <SharePanel
        isOpen={shareOpen && Boolean(selectedPlaylist)}
        playlist={selectedPlaylist}
        onClose={handleCloseShare}
        supabase={supabase}
        onRefresh={refresh}
        pushFeedback={setFeedback}
        currentUserId={userId}
        onToggleVisibility={handleToggleVisibility}
      />

      <AnimatePresence>
        {deleteConfirmOpen && deleteCandidate ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4 py-10"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-neutral-900/70 backdrop-blur-sm"
              onClick={handleDeleteCancel}
            />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              role="dialog"
              aria-modal="true"
              className="relative z-10 w-full max-w-md rounded-3xl border border-[var(--surface-border)] bg-gradient-to-br from-white via-[#f7f9ff] to-white p-6 shadow-2xl backdrop-blur-lg dark:bg-gradient-to-br dark:from-[#111a2c] dark:via-[#0d1524] dark:to-[#0a101d]"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-500 dark:bg-red-500/15 dark:text-red-200">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                    Delete &quot;{deleteCandidate.name}&quot;?
                  </h2>
                  <p className="mt-2 text-sm text-neutral-500 dark:text-white/60">
                    This removes the playlist and any shared access for everyone. This action cannot be undone.
                  </p>
                </div>
              </div>
              {deleteError ? (
                <div className="mt-4 rounded-2xl border border-red-200/70 bg-red-50/80 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                  {deleteError}
                </div>
              ) : null}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={handleDeleteCancel}
                  disabled={isDeletingSelected}
                  className="inline-flex items-center gap-2 rounded-full border border-neutral-200/80 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 transition hover:border-neutral-300 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/10 dark:text-white/80"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleDeleteConfirm()}
                  disabled={isDeletingSelected}
                  className="inline-flex items-center gap-2 rounded-full bg-red-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-red-500/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isDeletingSelected ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  {isDeletingSelected ? "Deleting..." : "Delete playlist"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {feedback ? (
          <motion.div
            key={feedback.message}
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
  );
}
function PlaylistCard({
  playlist,
  busy,
  deleting,
  onToggleVisibility,
  onOpenShare,
  onDelete,
}: PlaylistCardProps) {
  const isOwner = playlist.userRole === "owner";
  const isModerator = playlist.userRole === "moderator";

  const roleBadgeClass = isOwner
    ? "bg-lernex-blue/10 text-lernex-blue dark:bg-lernex-blue/20 dark:text-lernex-blue/80"
    : isModerator
    ? "bg-lernex-purple/10 text-lernex-purple dark:bg-lernex-purple/25 dark:text-lernex-purple/90"
    : playlist.is_public
    ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-200"
    : "bg-neutral-900/5 text-neutral-600 dark:bg-white/10 dark:text-white/60";

  const roleIcon = isOwner ? (
    <ShieldCheck className="h-3.5 w-3.5" />
  ) : isModerator ? (
    <UserCog className="h-3.5 w-3.5" />
  ) : (
    <Eye className="h-3.5 w-3.5" />
  );

  const roleLabel = isOwner
    ? "You own this"
    : isModerator
    ? "Moderator access"
    : playlist.is_public
    ? "Public viewer"
    : "Private viewer";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="group flex h-full flex-col justify-between rounded-3xl border border-[var(--surface-border)] bg-gradient-to-br from-white via-white to-[#f6f9ff] p-6 shadow-[0_20px_60px_-40px_rgba(47,128,237,0.38)] transition-all hover:-translate-y-1 hover:border-lernex-blue/60 hover:shadow-[0_32px_80px_-42px_rgba(47,128,237,0.55)] dark:bg-gradient-to-br dark:from-[#101a2c] dark:via-[#0d1524] dark:to-[#090f1c]"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              playlist.is_public
                ? "bg-lernex-blue/15 text-lernex-blue dark:bg-lernex-blue/25 dark:text-lernex-blue/80"
                : "bg-neutral-900/5 text-neutral-600 dark:bg-white/10 dark:text-white/70"
            }`}
          >
            {playlist.is_public ? (
              <Globe className="h-3.5 w-3.5" />
            ) : (
              <Lock className="h-3.5 w-3.5" />
            )}
            {playlist.is_public ? "Public" : "Private"}
          </span>
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${roleBadgeClass}`}
          >
            {roleIcon}
            {roleLabel}
          </span>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
            {playlist.name}
          </h2>
          {playlist.description ? (
            <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-white/70">
              {playlist.description}
            </p>
          ) : (
            <p className="mt-2 text-sm italic text-neutral-500 dark:text-white/50">
              No description yet. Add one to set the vibe.
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-neutral-200/80 bg-white/80 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-lernex-blue/10 text-sm font-semibold text-lernex-blue dark:bg-lernex-blue/20 dark:text-lernex-blue/80">
            {getInitials(playlist.owner)}
          </div>
          <div className="flex flex-col">
            <span className="font-medium text-neutral-800 dark:text-white">
              {playlist.owner?.full_name ??
                playlist.owner?.username ??
                "Unknown creator"}
            </span>
            <span className="text-xs text-neutral-500 dark:text-white/50">
              {describeTimestamp(playlist.created_at)}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Link
          href={`/playlists/${playlist.id}`}
          className="inline-flex items-center gap-2 rounded-full border border-neutral-200/80 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 transition hover:border-lernex-blue/40 hover:text-lernex-blue dark:border-white/10 dark:bg-white/10 dark:text-white/80"
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
          Open playlist
        </Link>
        {(isOwner || isModerator) && (
          <button
            onClick={() => onOpenShare(playlist)}
            disabled={deleting}
            className="inline-flex items-center gap-2 rounded-full bg-lernex-blue px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-lernex-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Share2 className="h-3.5 w-3.5" />
            Manage access
          </button>
        )}
        {isOwner ? (
          <button
            onClick={() => void onToggleVisibility(playlist)}
            disabled={busy || deleting}
            className="inline-flex items-center gap-2 rounded-full border border-neutral-200/80 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 transition hover:border-lernex-blue/40 hover:text-lernex-blue disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/10 dark:text-white/80"
          >
            {busy || deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : playlist.is_public ? (
              <Lock className="h-3.5 w-3.5" />
            ) : (
              <Globe className="h-3.5 w-3.5" />
            )}
            {busy || deleting
              ? "Saving..."
              : playlist.is_public
              ? "Make private"
              : "Make public"}
          </button>
        ) : null}
        {isOwner ? (
          <button
            onClick={() => onDelete(playlist)}
            disabled={deleting}
            className="inline-flex items-center gap-2 rounded-full border border-red-200/60 bg-red-50 px-4 py-2 text-xs font-semibold text-red-600 transition hover:border-red-300 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200"
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            {deleting ? "Deleting..." : "Delete"}
          </button>
        ) : null}
      </div>
    </motion.div>
  );
}
function SharePanel({
  isOpen,
  playlist,
  onClose,
  supabase,
  onRefresh,
  pushFeedback,
  currentUserId,
  onToggleVisibility,
}: SharePanelProps) {
  const [collaborators, setCollaborators] = useState<CollaboratorRow[]>([]);
  const [loadingCollaborators, setLoadingCollaborators] = useState(false);
  const [collaboratorError, setCollaboratorError] = useState<string | null>(null);
  const [personQuery, setPersonQuery] = useState("");
  const [searchingPeople, setSearchingPeople] = useState(false);
  const [peopleResults, setPeopleResults] = useState<ProfileLite[]>([]);
  const [actionId, setActionId] = useState<string | null>(null);
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [copying, setCopying] = useState(false);
  const playlistId = playlist?.id ?? null;

  const loadCollaborators = useCallback(async () => {
    if (!playlist) return;
    setLoadingCollaborators(true);
    setCollaboratorError(null);

    try {
      const { data, error } = await supabase
        .from("playlist_memberships")
        .select(
          "id, playlist_id, profile_id, role, created_at, profiles(id, full_name, username, avatar_url)"
        )
        .eq("playlist_id", playlist.id)
        .order("created_at", { ascending: true });

      if (error) {
        if (isMissingTableError(error)) {
          console.info(
            "[share-panel] playlist_memberships table missing; skipping collaborator load"
          );
          setCollaborators([]);
          return;
        }
        throw error;
      }

      const rawRows = Array.isArray(data) ? data : [];
      const mapped = rawRows
        .map((row) => normalizeCollaboratorRow(row))
        .filter(
          (row): row is CollaboratorRow => row !== null
        );

      setCollaborators(mapped);
    } catch (err) {
      console.error("Failed to load collaborators", err);
      setCollaboratorError("We couldn't load collaborators right now.");
    } finally {
      setLoadingCollaborators(false);
    }
  }, [playlist, supabase]);

  useEffect(() => {
    if (!isOpen || !playlistId) return;
    void loadCollaborators();
  }, [isOpen, playlistId, loadCollaborators]);

  useEffect(() => {
    if (!isOpen) {
      setCollaborators([]);
      setCollaboratorError(null);
      setPersonQuery("");
      setPeopleResults([]);
      setSearchingPeople(false);
      setActionId(null);
      setVisibilityBusy(false);
      setCopying(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !playlist) return;
    if (!personQuery.trim()) {
      setPeopleResults([]);
      setSearchingPeople(false);
      return;
    }

    setSearchingPeople(true);
    const sanitized = personQuery.trim().replace(/,/g, "\\,");
    let active = true;

    const timer = window.setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, full_name, username, avatar_url")
          .or(`full_name.ilike.%${sanitized}%,username.ilike.%${sanitized}%`)
          .limit(8);

        if (error) throw error;
        if (!active) return;

        const rows = (data ?? []) as ProfileLite[];
        const filtered = rows.filter(
          (profile) =>
            profile.id !== playlist.user_id &&
            profile.id !== currentUserId &&
            !collaborators.some((collab) => collab.profile_id === profile.id)
        );
        setPeopleResults(filtered);
      } catch (err) {
        console.error("User search failed", err);
        if (active) setPeopleResults([]);
      } finally {
        if (active) setSearchingPeople(false);
      }
    }, 260);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [personQuery, supabase, collaborators, playlist, currentUserId, isOpen]);

  const handleAddCollaborator = async (
    profile: ProfileLite,
    role: "viewer" | "moderator"
  ) => {
    if (!playlist) return;
    setActionId(profile.id);

    try {
      const { data, error } = await supabase
        .from("playlist_memberships")
        .upsert(
          { playlist_id: playlist.id, profile_id: profile.id, role },
          { onConflict: "playlist_id,profile_id" }
        )
        .select(
          "id, playlist_id, profile_id, role, created_at, profiles(id, full_name, username, avatar_url)"
        )
        .maybeSingle();

      if (error) {
        if (isMissingTableError(error)) {
          pushFeedback({
            type: "error",
            message:
              "Sharing is not available yet. Run the latest database migration to add playlist_memberships.",
          });
          return;
        }
        throw error;
      }

      if (data) {
        const normalized = normalizeCollaboratorRow(data);
        if (normalized) {
          setCollaborators((prev) => {
            const index = prev.findIndex(
              (item) => item.profile_id === normalized.profile_id
            );
            if (index >= 0) {
              const copy = [...prev];
              copy[index] = normalized;
              return copy;
            }
            return [...prev, normalized];
          });
        }
      }

      pushFeedback({
        type: "success",
        message:
          role === "moderator"
            ? "Moderator access granted."
            : "Viewer added to the playlist.",
      });
      setPersonQuery("");
      setPeopleResults([]);
      await onRefresh();
    } catch (err) {
      console.error("Add collaborator failed", err);
      if (isMissingTableError(err)) {
        pushFeedback({
          type: "error",
          message:
            "Sharing is not available yet. Run the playlist_memberships migration first.",
        });
      } else {
        pushFeedback({
          type: "error",
          message: "Could not update sharing. Try again in a moment.",
        });
      }
    } finally {
      setActionId(null);
    }
  };

  const handleRoleChange = async (
    membershipId: string,
    nextRole: "viewer" | "moderator"
  ) => {
    if (!playlist) return;
    setActionId(membershipId);

    try {
      const { data, error } = await supabase
        .from("playlist_memberships")
        .update({ role: nextRole })
        .eq("id", membershipId)
        .select(
          "id, playlist_id, profile_id, role, created_at, profiles(id, full_name, username, avatar_url)"
        )
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const normalized = normalizeCollaboratorRow(data);
        if (normalized) {
          setCollaborators((prev) =>
            prev.map((item) => (item.id === membershipId ? normalized : item))
          );
        }
      }

      pushFeedback({
        type: "success",
        message:
          nextRole === "moderator"
            ? "Member promoted to moderator."
            : "Member set to viewer.",
      });
      await onRefresh();
    } catch (err) {
      console.error("Role update failed", err);
      if (isMissingTableError(err)) {
        pushFeedback({
          type: "error",
          message:
            "Sharing is not available yet. Run the playlist_memberships migration first.",
        });
      } else {
        pushFeedback({
          type: "error",
          message: "Could not update that member. Please try again.",
        });
      }
    } finally {
      setActionId(null);
    }
  };

  const handleRemoveCollaborator = async (membershipId: string) => {
    if (!playlist) return;
    setActionId(membershipId);

    try {
      const { error } = await supabase
        .from("playlist_memberships")
        .delete()
        .eq("id", membershipId);

      if (error) throw error;

      setCollaborators((prev) =>
        prev.filter((item) => item.id !== membershipId)
      );
      pushFeedback({
        type: "success",
        message: "Removed shared access.",
      });
      await onRefresh();
    } catch (err) {
      console.error("Remove collaborator failed", err);
      if (isMissingTableError(err)) {
        pushFeedback({
          type: "error",
          message:
            "Sharing is not available yet. Run the playlist_memberships migration first.",
        });
      } else {
        pushFeedback({
          type: "error",
          message: "Could not remove that member right now.",
        });
      }
    } finally {
      setActionId(null);
    }
  };

  const handleToggleVisibility = async () => {
    if (!playlist) return;
    setVisibilityBusy(true);
    try {
      await onToggleVisibility(playlist);
      await onRefresh();
    } finally {
      setVisibilityBusy(false);
    }
  };

  const handleCopyLink = async () => {
    if (!playlist) return;
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      pushFeedback({
        type: "error",
        message: "Clipboard access is unavailable in this browser.",
      });
      return;
    }
    setCopying(true);
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/playlists/${playlist.id}`
      );
      pushFeedback({
        type: "success",
        message: "Playlist link copied.",
      });
    } catch (err) {
      console.error("Copy link failed", err);
      pushFeedback({
        type: "error",
        message: "Could not copy the link. Please try again.",
      });
    } finally {
      setCopying(false);
    }
  };
  return (
    <AnimatePresence>
      {isOpen && playlist ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-10"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-neutral-900/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-2xl rounded-3xl border border-[var(--surface-border)] bg-gradient-to-br from-white via-[#f7f9ff] to-white p-6 shadow-2xl backdrop-blur-lg dark:bg-gradient-to-br dark:from-[#111a2c] dark:via-[#0d1524] dark:to-[#0a101d]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
                  Share “{playlist.name}”
                </h2>
                <p className="mt-1 text-sm text-neutral-500 dark:text-white/60">
                  Invite moderators to curate with you or share read-only access with friends. Only owners and moderators can edit lessons.
                </p>
              </div>
              <button
                onClick={onClose}
                className="rounded-full border border-neutral-200/60 bg-white/80 p-2 text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-700 dark:border-white/10 dark:bg-white/10 dark:text-white/70"
                aria-label="Close share sheet"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 space-y-6">
              <div className="rounded-2xl border border-neutral-200/70 bg-white/80 p-4 dark:border-white/10 dark:bg-white/5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-lernex-blue/10 text-sm font-semibold text-lernex-blue dark:bg-lernex-blue/20 dark:text-lernex-blue/80">
                    {getInitials(playlist.owner)}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-neutral-800 dark:text-white">
                      {playlist.owner?.full_name ??
                        playlist.owner?.username ??
                        "Playlist owner"}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-white/60">
                      Owner
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-lernex-blue/10 px-3 py-1 text-[11px] font-semibold text-lernex-blue dark:bg-lernex-blue/20 dark:text-lernex-blue/80">
                    <ShieldCheck className="h-3 w-3" />
                    Full control
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-neutral-800 dark:text-white">
                  Collaborators
                </h3>
                <div className="space-y-3">
                  {loadingCollaborators ? (
                    <div className="space-y-2">
                      {Array.from({ length: 2 }).map((_, idx) => (
                        <div
                          key={idx}
                          className="h-14 animate-pulse rounded-2xl border border-neutral-200/70 bg-white/70 dark:border-white/10 dark:bg-white/10"
                        />
                      ))}
                    </div>
                  ) : collaborators.length > 0 ? (
                    collaborators.map((collab) => {
                      const isModerator = collab.role === "moderator";
                      const isPending = actionId === collab.id;
                      return (
                        <div
                          key={collab.id}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200/70 bg-white/80 px-4 py-3 text-sm shadow-sm dark:border-white/10 dark:bg-white/10"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900/5 text-sm font-semibold text-neutral-600 dark:bg-white/10 dark:text-white/70">
                              {getInitials(collab.profile)}
                            </div>
                            <div>
                              <p className="font-medium text-neutral-800 dark:text-white">
                                {collab.profile?.full_name ??
                                  collab.profile?.username ??
                                  "Shared member"}
                              </p>
                              <p className="text-xs text-neutral-500 dark:text-white/60">
                                {isModerator ? "Moderator" : "Viewer"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() =>
                                void handleRoleChange(
                                  collab.id,
                                  isModerator ? "viewer" : "moderator"
                                )
                              }
                              disabled={isPending}
                              className="inline-flex items-center gap-1 rounded-full border border-neutral-200/70 bg-white px-3 py-1 text-[11px] font-semibold text-neutral-600 transition hover:border-lernex-blue/40 hover:text-lernex-blue disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/10 dark:text-white/70"
                            >
                              {isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : isModerator ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : (
                                <ShieldCheck className="h-3.5 w-3.5" />
                              )}
                              {isModerator ? "Set viewer" : "Promote"}
                            </button>
                            <button
                              onClick={() => void handleRemoveCollaborator(collab.id)}
                              disabled={isPending}
                              className="inline-flex items-center gap-1 rounded-full border border-red-200/60 bg-red-50 px-3 py-1 text-[11px] font-semibold text-red-600 transition hover:border-red-300 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200"
                            >
                              {isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <X className="h-3.5 w-3.5" />
                              )}
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-2xl border border-dashed border-neutral-300/80 bg-white/70 px-4 py-5 text-sm text-neutral-500 dark:border-white/10 dark:bg-white/10 dark:text-white/60">
                      You have not shared this playlist yet. Invite someone below to start collaborating.
                    </div>
                  )}
                  {collaboratorError ? (
                    <div className="rounded-2xl border border-red-200/70 bg-red-50/80 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                      {collaboratorError}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-neutral-800 dark:text-white">
                  Invite people
                </h3>
                <div className="rounded-2xl border border-neutral-200/70 bg-white/80 p-4 dark:border-white/10 dark:bg-white/10">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-300 dark:text-white/40" />
                    <input
                      value={personQuery}
                      onChange={(event) => setPersonQuery(event.target.value)}
                      placeholder="Search by name or username..."
                      className="w-full rounded-full border border-neutral-200/70 bg-white/90 px-12 py-2.5 text-sm text-neutral-700 outline-none transition focus:border-lernex-blue/50 focus:ring-2 focus:ring-lernex-blue/20 dark:border-white/10 dark:bg-white/10 dark:text-white"
                    />
                  </div>
                  <div className="mt-4 space-y-2">
                    {searchingPeople ? (
                      <div className="space-y-2">
                        {Array.from({ length: 2 }).map((_, idx) => (
                          <div
                            key={idx}
                            className="h-12 animate-pulse rounded-full bg-neutral-200/60 dark:bg-white/10"
                          />
                        ))}
                      </div>
                    ) : peopleResults.length > 0 ? (
                      peopleResults.map((profile) => {
                        const pending = actionId === profile.id;
                        return (
                          <div
                            key={profile.id}
                            className="flex items-center justify-between gap-3 rounded-full border border-neutral-200/70 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/10"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900/5 text-xs font-semibold text-neutral-600 dark:bg-white/10 dark:text-white/70">
                                {getInitials(profile)}
                              </div>
                              <div>
                                <p className="font-medium text-neutral-700 dark:text-white">
                                  {profile.full_name ?? profile.username ?? "User"}
                                </p>
                                <p className="text-[11px] text-neutral-400 dark:text-white/50">
                                  {profile.username ?? "No username"}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() =>
                                  void handleAddCollaborator(profile, "viewer")
                                }
                                disabled={pending}
                                className="inline-flex items-center gap-1 rounded-full border border-neutral-200/70 bg-white px-3 py-1 text-[11px] font-semibold text-neutral-600 transition hover:border-lernex-blue/40 hover:text-lernex-blue disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/10 dark:text-white/70"
                              >
                                {pending ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <UserPlus className="h-3.5 w-3.5" />
                                )}
                                Add viewer
                              </button>
                              <button
                                onClick={() =>
                                  void handleAddCollaborator(profile, "moderator")
                                }
                                disabled={pending}
                                className="inline-flex items-center gap-1 rounded-full bg-lernex-blue px-3 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:bg-lernex-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {pending ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                )}
                                Add moderator
                              </button>
                            </div>
                          </div>
                        );
                      })
                    ) : personQuery.trim() ? (
                      <div className="rounded-full border border-dashed border-neutral-300/80 bg-white/60 px-3 py-2 text-center text-xs text-neutral-500 dark:border-white/10 dark:bg-white/10 dark:text-white/60">
                        No accounts found. Double-check spelling and try again.
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-400 dark:text-white/40">
                        Start typing to find Lernex users to share with.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200/70 bg-white/80 p-4 dark:border-white/10 dark:bg-white/10">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-800 dark:text-white">
                      Shareable link
                    </h3>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-white/60">
                      Anyone with this link can view the playlist if it is public.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => void handleCopyLink()}
                      disabled={copying}
                      className="inline-flex items-center gap-2 rounded-full border border-neutral-200/70 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 transition hover:border-lernex-blue/40 hover:text-lernex-blue disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/10 dark:text-white/80"
                    >
                      {copying ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      Copy link
                    </button>
                    <button
                      onClick={() => void handleToggleVisibility()}
                      disabled={visibilityBusy}
                      className="inline-flex items-center gap-2 rounded-full bg-lernex-blue px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-lernex-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {visibilityBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : playlist.is_public ? (
                        <Lock className="h-3.5 w-3.5" />
                      ) : (
                        <Globe className="h-3.5 w-3.5" />
                      )}
                      {visibilityBusy
                        ? "Saving..."
                        : playlist.is_public
                        ? "Make private"
                        : "Make public"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
function toStringOrNull(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function normalizeProfileLiteRecord(value: unknown): ProfileLite | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalized = normalizeProfileLiteRecord(entry);
      if (normalized) return normalized;
    }
    return null;
  }

  if (typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = toStringOrNull(record.id);
  if (!id) return null;
  return {
    id,
    full_name: toStringOrNull(record.full_name),
    username: toStringOrNull(record.username),
    avatar_url: toStringOrNull(record.avatar_url),
  };
}

function normalizeCollaboratorRow(value: unknown): CollaboratorRow | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = toStringOrNull(record.id);
  const playlistId = toStringOrNull(record.playlist_id);
  const profileId = toStringOrNull(record.profile_id);

  if (!id || !playlistId || !profileId) return null;

  const roleRaw = toStringOrNull(record.role);
  const role: "viewer" | "moderator" =
    roleRaw === "moderator" ? "moderator" : "viewer";

  const created =
    typeof record.created_at === "string" ? record.created_at : null;
  const profileSource =
    "profile" in record
      ? (record as Record<string, unknown>).profile
      : (record as Record<string, unknown>).profiles;
  const profile = normalizeProfileLiteRecord(profileSource ?? null);

  return {
    id,
    playlist_id: playlistId,
    profile_id: profileId,
    role,
    created_at: created,
    profile,
  };
}

function getInitials(profile: ProfileLite | null): string {
  if (!profile) return "??";
  const source = profile.full_name ?? profile.username ?? "";
  if (!source) return "??";
  const trimmed = source.trim();
  if (!trimmed) return "??";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function describeTimestamp(value: string | null): string {
  if (!value) return "Created recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Created recently";

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    return "Created today";
  }
  if (diffDays === 1) {
    return "Created yesterday";
  }
  if (diffDays < 7) {
    return `Created ${diffDays} days ago`;
  }
  const diffWeeks = Math.round(diffDays / 7);
  if (diffWeeks < 5) {
    return `Created ${diffWeeks} week${diffWeeks === 1 ? "" : "s"} ago`;
  }

  try {
    return `Created ${new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date)}`;
  } catch {
    return date.toLocaleDateString();
  }
}

type PostgrestErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  status?: number;
};

function isPostgrestError(value: unknown): value is PostgrestErrorLike {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    "code" in record ||
    "message" in record ||
    "details" in record ||
    "hint" in record
  );
}

function isMissingTableError(value: unknown): boolean {
  if (!isPostgrestError(value)) return false;
  const code = (value.code ?? "").toUpperCase();
  if (code === "42P01" || code === "PGRST302" || code === "PGRST114") {
    return true;
  }
  const status =
    typeof value.status === "number" ? value.status : Number(value.status);
  if (status === 404) return true;
  const message = (value.message ?? "").toLowerCase();
  if (message.includes("not found") || message.includes("does not exist")) {
    return true;
  }
  const details = typeof value.details === "string" ? value.details.toLowerCase() : "";
  if (details.includes("not found") || details.includes("does not exist")) {
    return true;
  }
  return false;
}


