"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import {
  BellRing,
  Check,
  Compass,
  Flame,
  Link as LinkIcon,
  Loader2,
  Search,
  Sparkles,
  Star,
  UserMinus,
  UserPlus,
  Users,
  X,
  Send,
  RefreshCcw,
} from "lucide-react";

type Friend = {
  id: string;
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  streak: number;
  points: number;
  lastStudyDate: string | null;
  createdAt: string | null;
  friendSince: string | null;
  lastInteractionAt: string | null;
  mutualFriends: number;
  sharedInterests: string[];
};

type FriendRequest = {
  id: string;
  senderId: string;
  receiverId: string;
  status: "pending" | "accepted" | "declined";
  message: string | null;
  createdAt: string | null;
  resolvedAt: string | null;
  direction: "incoming" | "outgoing";
  counterpart: {
    id: string;
    username: string | null;
    fullName: string | null;
    avatarUrl: string | null;
    streak: number;
    points: number;
    sharedInterests: string[];
  };
};

type Suggestion = {
  id: string;
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  streak: number;
  points: number;
  sharedInterests: string[];
  lastStudyDate: string | null;
};

type Activity = {
  userId: string;
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  createdAt: string | null;
  subject: string | null;
  level: string | null;
  accuracy: number | null;
};

type FriendsData = {
  profile: {
    id: string;
    username: string | null;
    fullName: string | null;
    avatarUrl: string | null;
    streak: number;
    points: number;
    lastStudyDate: string | null;
    interests: string[];
  };
  friends: Friend[];
  requests: {
    incoming: FriendRequest[];
    outgoing: FriendRequest[];
  };
  suggestions: Suggestion[];
  recentActivity: Activity[];
  counts: {
    totalFriends: number;
    pendingIncoming: number;
    pendingOutgoing: number;
  };
  fetchedAt: string;
};

type SearchResult = {
  id: string;
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  streak: number;
  points: number;
  sharedInterests: string[];
  lastStudyDate: string | null;
};

type ToastState = {
  message: string;
  tone: "success" | "error" | "neutral";
};

const fullDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function cn(...classes: Array<string | null | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

function formatRelative(dateString: string | null) {
  if (!dateString) return "—";
  const value = new Date(dateString);
  if (Number.isNaN(value.getTime())) return "—";
  const diff = Date.now() - value.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return minutes + "m ago";
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours + "h ago";
  const days = Math.round(hours / 24);
  if (days < 7) return days + "d ago";
  const weeks = Math.round(days / 7);
  if (weeks < 5) return weeks + "w ago";
  const months = Math.round(days / 30);
  if (months < 12) return months + "mo ago";
  const years = Math.round(days / 365);
  return years + "y ago";
}

function formatDate(dateString: string | null) {
  if (!dateString) return "—";
  const value = new Date(dateString);
  if (Number.isNaN(value.getTime())) return "—";
  return fullDateFormatter.format(value);
}

function displayName(username: string | null, fullName: string | null, fallback: string) {
  if (fullName && fullName.trim().length > 0) return fullName;
  if (username && username.trim().length > 0) return username;
  return fallback;
}

const avatarPalette = [
  "bg-gradient-to-br from-lernex-blue/80 to-lernex-purple/70",
  "bg-gradient-to-br from-emerald-500/80 to-teal-500/70",
  "bg-gradient-to-br from-amber-400/80 to-orange-500/70",
  "bg-gradient-to-br from-rose-400/80 to-pink-500/70",
  "bg-gradient-to-br from-sky-400/80 to-cyan-500/70",
  "bg-gradient-to-br from-indigo-400/80 to-blue-600/70",
];

function Avatar(props: { name: string; src: string | null; size?: number }) {
  const { name, src, size = 44 } = props;
  const label = name && name.trim().length > 0 ? name.trim() : "Learner";
  const initial = label.charAt(0).toUpperCase();
  const paletteIndex = label.charCodeAt(0) % avatarPalette.length;
  if (src) {
    return (
      <div
        className="relative overflow-hidden rounded-full"
        style={{ width: size, height: size }}
      >
        <Image
          src={src}
          alt={label}
          width={size}
          height={size}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full text-sm font-semibold text-white shadow-inner",
        avatarPalette[paletteIndex]
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}

function StatCard(props: { icon: ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-neutral-800 dark:bg-white/5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-lernex-blue/10 text-lernex-blue dark:bg-lernex-blue/20">
          {props.icon}
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{props.label}</div>
          <div className="text-xl font-semibold text-neutral-900 dark:text-white">{props.value}</div>
          {props.hint && (
            <div className="text-xs text-neutral-500 dark:text-neutral-400">{props.hint}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FriendsPage() {
  const [data, setData] = useState<FriendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchPending, setSearchPending] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<"recent" | "streak" | "points" | "mutual">("recent");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    const silent = !!options && !!options.silent;
    if (silent) setRefreshing(true);
    else {
      setLoading(true);
      setError(null);
    }
    try {
      const response = await fetch("/api/friends", { method: "GET", cache: "no-store" });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Unable to load friends");
      }
      const json = (await response.json()) as FriendsData;
      setData(json);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to load friends");
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!data) return;
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }
    let active = true;
    setSearchPending(true);
    const timer = window.setTimeout(() => {
      (async () => {
        try {
          const excludeSet = new Set<string>([data.profile.id]);
          data.friends.forEach((friend) => excludeSet.add(friend.id));
          data.requests.incoming.forEach((req) => excludeSet.add(req.counterpart.id));
          data.requests.outgoing.forEach((req) => excludeSet.add(req.counterpart.id));
          const params = new URLSearchParams();
          params.set("q", trimmed);
          params.set("limit", "10");
          params.set("exclude", Array.from(excludeSet).join(","));
          const response = await fetch("/api/friends/search?" + params.toString(), {
            cache: "no-store",
          });
          if (!active) return;
          if (!response.ok) {
            const text = await response.text();
            throw new Error(text || "Search failed");
          }
          const json = await response.json();
          const rows = Array.isArray(json?.results) ? (json.results as SearchResult[]) : [];
          setSearchResults(rows);
          setSearchError(null);
        } catch (err) {
          if (!active) return;
          console.error(err);
          setSearchError(err instanceof Error ? err.message : "Search failed");
          setSearchResults([]);
        } finally {
          if (active) setSearchPending(false);
        }
      })();
    }, 280);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [data, searchQuery]);

  const sortedFriends = useMemo(() => {
    if (!data) return [] as Friend[];
    const copy = [...data.friends];
    copy.sort((a, b) => {
      if (sortKey === "streak") {
        return (b.streak ?? 0) - (a.streak ?? 0);
      }
      if (sortKey === "points") {
        return (b.points ?? 0) - (a.points ?? 0);
      }
      if (sortKey === "mutual") {
        return (b.mutualFriends ?? 0) - (a.mutualFriends ?? 0);
      }
      const dateA = new Date(a.lastInteractionAt || a.friendSince || "1970-01-01").getTime();
      const dateB = new Date(b.lastInteractionAt || b.friendSince || "1970-01-01").getTime();
      return dateB - dateA;
    });
    return copy;
  }, [data, sortKey]);

  const handleRespond = useCallback(
    async (requestId: string, action: "accept" | "decline") => {
      setPendingAction(requestId + ":" + action);
      try {
        const response = await fetch("/api/friends/respond", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId, action }),
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Unable to update request");
        }
        await load({ silent: true });
        setToast({
          message: action === "accept" ? "Friend request accepted" : "Request declined",
          tone: action === "accept" ? "success" : "neutral",
        });
      } catch (err) {
        console.error(err);
        setToast({
          message: err instanceof Error ? err.message : "Unable to update request",
          tone: "error",
        });
      } finally {
        setPendingAction(null);
      }
    },
    [load]
  );

  const handleSendRequest = useCallback(
    async (targetId: string, display?: string) => {
      setPendingAction("add:" + targetId);
      try {
        const response = await fetch("/api/friends/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetId }),
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Unable to send request");
        }
        await load({ silent: true });
        setToast({
          message: "Request sent" + (display ? " to " + display : ""),
          tone: "success",
        });
      } catch (err) {
        console.error(err);
        setToast({
          message: err instanceof Error ? err.message : "Unable to send request",
          tone: "error",
        });
      } finally {
        setPendingAction(null);
      }
    },
    [load]
  );

  const handleCancelOutgoing = useCallback(
    async (requestId: string) => {
      setPendingAction("cancel:" + requestId);
      try {
        const response = await fetch("/api/friends/request/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId }),
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Unable to cancel request");
        }
        await load({ silent: true });
        setToast({ message: "Request cancelled", tone: "neutral" });
      } catch (err) {
        console.error(err);
        setToast({
          message: err instanceof Error ? err.message : "Unable to cancel request",
          tone: "error",
        });
      } finally {
        setPendingAction(null);
      }
    },
    [load]
  );

  const handleRemoveFriend = useCallback(
    async (friendId: string, name: string) => {
      if (typeof window !== "undefined") {
        const confirmRemoval = window.confirm("Remove " + name + " from your friends?");
        if (!confirmRemoval) return;
      }
      setPendingAction("remove:" + friendId);
      try {
        const response = await fetch("/api/friends/remove", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ friendId }),
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Unable to remove friend");
        }
        await load({ silent: true });
        setToast({ message: "Friend removed", tone: "neutral" });
      } catch (err) {
        console.error(err);
        setToast({
          message: err instanceof Error ? err.message : "Unable to remove friend",
          tone: "error",
        });
      } finally {
        setPendingAction(null);
      }
    },
    [load]
  );

  const handleCopyInvite = useCallback(async () => {
    if (!data) return;
    const fallback = data.profile.id;
    const origin = typeof window !== "undefined" && window.location ? window.location.origin : "";
    const inviteLink = origin ? origin + "/join?friend=" + fallback : fallback;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(inviteLink);
      } else {
        const temp = document.createElement("textarea");
        temp.value = inviteLink;
        temp.style.position = "fixed";
        temp.style.opacity = "0";
        document.body.appendChild(temp);
        temp.focus();
        temp.select();
        document.execCommand("copy");
        document.body.removeChild(temp);
      }
      setCopyState("copied");
      setToast({ message: "Invite link copied", tone: "success" });
      window.setTimeout(() => setCopyState("idle"), 3000);
    } catch (err) {
      console.error(err);
      setCopyState("error");
      setToast({ message: "Could not copy link", tone: "error" });
      window.setTimeout(() => setCopyState("idle"), 3000);
    }
  }, [data]);

  if (loading) {
    return (
      <main className="min-h-[calc(100vh-56px)] mx-auto flex w-full max-w-4xl items-center justify-center px-4 py-24 text-neutral-600 dark:text-neutral-200">
        <div className="flex items-center gap-3 rounded-2xl border border-neutral-200/60 bg-white/80 px-6 py-4 text-sm shadow-sm backdrop-blur dark:border-neutral-800 dark:bg-white/5">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your friends...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-[calc(100vh-56px)] mx-auto flex w-full max-w-3xl flex-col items-center justify-center px-4 py-24 text-center text-neutral-700 dark:text-neutral-200">
        <Sparkles className="mb-4 h-10 w-10 text-lernex-blue" />
        <h1 className="text-2xl font-semibold">We could not load your friends (yet)</h1>
        <p className="mt-2 max-w-md text-sm text-neutral-500 dark:text-neutral-400">{error}</p>
        <button
          onClick={() => load()}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-lernex-blue px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-lernex-blue/90"
        >
          <RefreshCcw className="h-4 w-4" />
          Try again
        </button>
      </main>
    );
  }

  if (!data) return null;

  const incoming = data.requests.incoming;
  const outgoing = data.requests.outgoing;
  const totalPending = incoming.length + outgoing.length;

  return (
    <main className="min-h-[calc(100vh-56px)] mx-auto w-full max-w-5xl px-4 py-8 text-neutral-900 dark:text-white">
      {toast && (
        <div
          className={cn(
            "mb-4 flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm shadow-sm backdrop-blur",
            toast.tone === "success" && "border-emerald-200 bg-emerald-50/80 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200",
            toast.tone === "error" && "border-rose-200 bg-rose-50/80 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200",
            toast.tone === "neutral" && "border-neutral-200 bg-white/80 text-neutral-700 dark:border-neutral-700 dark:bg-white/10 dark:text-neutral-200"
          )}
        >
          <BellRing className="h-4 w-4" />
          <span>{toast.message}</span>
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Friends & Study Buddies</h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-600 dark:text-neutral-300">
            Build your accountability circle, plan study sessions, and celebrate milestones together. We surface people who share your pace, interests, and streak energy.
          </p>
        </div>
        <button
          onClick={handleCopyInvite}
          className="inline-flex items-center gap-2 rounded-full border border-lernex-blue/40 bg-lernex-blue/10 px-4 py-2 text-sm font-medium text-lernex-blue transition hover:bg-lernex-blue/15 dark:border-lernex-blue/60 dark:bg-lernex-blue/20 dark:text-lernex-blue/90"
        >
          <LinkIcon className="h-4 w-4" />
          {copyState === "copied" ? "Link copied" : copyState === "error" ? "Copy failed" : "Copy invite link"}
        </button>
      </div>

      {refreshing && (
        <div className="mt-4 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Syncing latest changes...
        </div>
      )}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label="Friends"
          value={String(data.counts.totalFriends)}
          hint={incoming.length > 0 ? incoming.length + " waiting to connect" : "All caught up"}
        />
        <StatCard
          icon={<BellRing className="h-5 w-5" />}
          label="Requests"
          value={String(totalPending)}
          hint={outgoing.length > 0 ? outgoing.length + " sent" : ""}
        />
        <StatCard
          icon={<Flame className="h-5 w-5 text-orange-500" />}
          label="Your streak"
          value={String(data.profile.streak ?? 0)}
          hint={data.profile.lastStudyDate ? "Last studied " + formatRelative(data.profile.lastStudyDate) : "Keep the fire going"}
        />
        <StatCard
          icon={<Star className="h-5 w-5 text-amber-500" />}
          label="Points"
          value={String(data.profile.points ?? 0)}
          hint="Earned from lessons and quizzes"
        />
      </section>

      <section className="mt-8 rounded-3xl border border-neutral-200 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-neutral-800 dark:bg-white/5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Find classmates</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Search by username or name to add someone directly.</p>
          </div>
          <button
            onClick={() => load({ silent: true })}
            className="inline-flex items-center gap-2 rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-300"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Refresh list
          </button>
        </div>
        <div className="relative mt-4">
          <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur dark:border-neutral-800 dark:bg-white/10">
            <Search className="h-4 w-4 text-neutral-400" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by username or name"
              className="h-10 w-full border-none bg-transparent text-sm outline-none placeholder:text-neutral-400"
            />
            {searchPending && <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />}
          </div>
          {searchQuery.trim().length >= 2 && (
            <div className="absolute left-0 right-0 z-20 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-neutral-200 bg-white/95 shadow-lg backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/90">
              {searchError && (
                <div className="px-4 py-3 text-sm text-rose-500">{searchError}</div>
              )}
              {!searchError && searchResults.length === 0 && !searchPending && (
                <div className="px-4 py-3 text-sm text-neutral-500 dark:text-neutral-300">No matches yet. Try another name.</div>
              )}
              {!searchError && searchResults.map((match) => {
                const label = displayName(match.username, match.fullName, "Learner");
                const pendingKey = pendingAction === "add:" + match.id;
                return (
                  <div
                    key={match.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition hover:bg-lernex-blue/5 dark:hover:bg-lernex-blue/20"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={label} src={match.avatarUrl} size={40} />
                      <div>
                        <div className="font-medium text-neutral-800 dark:text-white">{label}</div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">
                          {match.sharedInterests.length > 0
                            ? "Shared focus: " + match.sharedInterests.slice(0, 3).join(", ")
                            : match.lastStudyDate
                            ? "Active " + formatRelative(match.lastStudyDate)
                            : "Ready to learn"}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleSendRequest(match.id, label)}
                      disabled={pendingKey}
                      className="inline-flex items-center gap-2 rounded-full bg-lernex-blue px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-lernex-blue/90 disabled:cursor-not-allowed disabled:bg-lernex-blue/70"
                    >
                      {pendingKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                      Connect
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Incoming & Outgoing</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Respond quickly to keep momentum. Accept to sync streaks and unlock friend leaderboards.</p>
          </div>
          <div className="flex gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <div className="flex items-center gap-1 rounded-full bg-neutral-200/40 px-3 py-1 dark:bg-white/10">
              <BellRing className="h-3.5 w-3.5" /> {incoming.length} incoming
            </div>
            <div className="flex items-center gap-1 rounded-full bg-neutral-200/40 px-3 py-1 dark:bg-white/10">
              <Send className="h-3.5 w-3.5" /> {outgoing.length} outgoing
            </div>
          </div>
        </div>
        {totalPending === 0 && (
          <div className="mt-4 rounded-3xl border border-dashed border-neutral-300 bg-white/70 p-6 text-sm text-neutral-500 shadow-sm backdrop-blur dark:border-neutral-700 dark:bg-white/5 dark:text-neutral-300">
            No pending requests. Your friends tab is calm and ready.
          </div>
        )}
        {totalPending > 0 && (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              {incoming.map((req) => {
                const label = displayName(req.counterpart.username, req.counterpart.fullName, "Learner");
                const acceptKey = pendingAction === req.id + ":accept";
                const declineKey = pendingAction === req.id + ":decline";
                return (
                  <div
                    key={req.id}
                    className="rounded-2xl border border-neutral-200 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-neutral-800 dark:bg-white/5"
                  >
                    <div className="flex items-start gap-3">
                      <Avatar name={label} src={req.counterpart.avatarUrl} size={44} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-neutral-900 dark:text-white">{label}</div>
                            <div className="text-xs text-neutral-500 dark:text-neutral-400">Sent {formatRelative(req.createdAt)}</div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleRespond(req.id, "decline")}
                              disabled={declineKey || acceptKey}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 text-rose-500 transition hover:bg-rose-50 disabled:cursor-not-allowed dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/10"
                              title="Decline"
                            >
                              {declineKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                            </button>
                            <button
                              onClick={() => handleRespond(req.id, "accept")}
                              disabled={acceptKey || declineKey}
                              className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500/90 disabled:cursor-not-allowed"
                            >
                              {acceptKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                              Accept
                            </button>
                          </div>
                        </div>
                        {req.message && (
                          <div className="mt-3 rounded-xl bg-neutral-100/70 px-3 py-2 text-xs text-neutral-600 dark:bg-white/10 dark:text-neutral-300">“{req.message}”</div>
                        )}
                        {req.counterpart.sharedInterests.length > 0 && (
                          <div className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
                            Shared focus: {req.counterpart.sharedInterests.join(", ")}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="space-y-4">
              {outgoing.map((req) => {
                const label = displayName(req.counterpart.username, req.counterpart.fullName, "Learner");
                const cancelKey = pendingAction === "cancel:" + req.id;
                return (
                  <div
                    key={req.id}
                    className="rounded-2xl border border-neutral-200 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-neutral-800 dark:bg-white/5"
                  >
                    <div className="flex items-start gap-3">
                      <Avatar name={label} src={req.counterpart.avatarUrl} size={44} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-neutral-900 dark:text-white">{label}</div>
                            <div className="text-xs text-neutral-500 dark:text-neutral-400">Awaiting response • {formatRelative(req.createdAt)}</div>
                          </div>
                          <button
                            onClick={() => handleCancelOutgoing(req.id)}
                            disabled={cancelKey}
                            className="inline-flex items-center gap-2 rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:border-neutral-400 hover:text-neutral-800 disabled:cursor-not-allowed dark:border-neutral-700 dark:text-neutral-300"
                          >
                            {cancelKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                            Cancel
                          </button>
                        </div>
                        {req.counterpart.sharedInterests.length > 0 && (
                          <div className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
                            Shared focus: {req.counterpart.sharedInterests.join(", ")}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
      <section className="mt-12">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Smart suggestions</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">We look at shared interests, similar streaks, and complementary study subjects.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.suggestions.slice(0, 6).map((candidate) => {
            const label = displayName(candidate.username, candidate.fullName, "Learner");
            const pendingKey = pendingAction === "add:" + candidate.id;
            return (
              <div
                key={candidate.id}
                className="rounded-2xl border border-neutral-200 bg-white/80 p-4 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:shadow-md dark:border-neutral-800 dark:bg-white/5"
              >
                <div className="flex items-start gap-3">
                  <Avatar name={label} src={candidate.avatarUrl} size={44} />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-neutral-900 dark:text-white">{label}</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">
                      {candidate.sharedInterests.length > 0
                        ? "Shared: " + candidate.sharedInterests.slice(0, 3).join(", ")
                        : candidate.lastStudyDate
                        ? "Active " + formatRelative(candidate.lastStudyDate)
                        : "Consistent learner"}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                  <span className="inline-flex items-center gap-1"><Flame className="h-3.5 w-3.5 text-orange-500" /> {candidate.streak} day streak</span>
                  <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5 text-amber-500" /> {candidate.points} pts</span>
                </div>
                <button
                  onClick={() => handleSendRequest(candidate.id, label)}
                  disabled={pendingKey}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-lernex-blue px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-lernex-blue/90 disabled:cursor-not-allowed"
                >
                  {pendingKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                  Add to circle
                </button>
              </div>
            );
          })}
          {data.suggestions.length === 0 && (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-white/70 p-6 text-sm text-neutral-500 shadow-sm backdrop-blur dark:border-neutral-700 dark:bg-white/5 dark:text-neutral-300">
              No tailored suggestions right now. Add interests in your profile to help us recommend peers.
            </div>
          )}
        </div>
      </section>

      <section className="mt-12">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Friend network</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Track everyone’s streak and study rhythm. Sort to plan your next session.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              onClick={() => setSortKey("recent")}
              className={cn(
                "rounded-full border border-neutral-300 px-3 py-1.5 transition hover:border-neutral-400 dark:border-neutral-700",
                sortKey === "recent" && "bg-lernex-blue/10 text-lernex-blue border-lernex-blue/40"
              )}
            >
              Recent
            </button>
            <button
              onClick={() => setSortKey("streak")}
              className={cn(
                "rounded-full border border-neutral-300 px-3 py-1.5 transition hover:border-neutral-400 dark:border-neutral-700",
                sortKey === "streak" && "bg-lernex-blue/10 text-lernex-blue border-lernex-blue/40"
              )}
            >
              Streak
            </button>
            <button
              onClick={() => setSortKey("points")}
              className={cn(
                "rounded-full border border-neutral-300 px-3 py-1.5 transition hover:border-neutral-400 dark:border-neutral-700",
                sortKey === "points" && "bg-lernex-blue/10 text-lernex-blue border-lernex-blue/40"
              )}
            >
              Points
            </button>
            <button
              onClick={() => setSortKey("mutual")}
              className={cn(
                "rounded-full border border-neutral-300 px-3 py-1.5 transition hover:border-neutral-400 dark:border-neutral-700",
                sortKey === "mutual" && "bg-lernex-blue/10 text-lernex-blue border-lernex-blue/40"
              )}
            >
              Mutual
            </button>
          </div>
        </div>
        {sortedFriends.length === 0 && (
          <div className="mt-4 rounded-3xl border border-dashed border-neutral-300 bg-white/70 p-6 text-sm text-neutral-500 shadow-sm backdrop-blur dark:border-neutral-700 dark:bg-white/5 dark:text-neutral-300">
            No friends yet. Start by sending a request or inviting someone with your link.
          </div>
        )}
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {sortedFriends.map((friend) => {
            const label = displayName(friend.username, friend.fullName, "Learner");
            const removeKey = pendingAction === "remove:" + friend.id;
            return (
              <article
                key={friend.id}
                className="rounded-2xl border border-neutral-200 bg-white/85 p-4 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:shadow-md dark:border-neutral-800 dark:bg-white/5"
              >
                <div className="flex items-start gap-3">
                  <Avatar name={label} src={friend.avatarUrl} size={48} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-neutral-900 dark:text-white">{label}</div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">
                          Friends since {formatDate(friend.friendSince)}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveFriend(friend.id, label)}
                        disabled={removeKey}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-300 text-neutral-500 transition hover:border-rose-300 hover:text-rose-500 disabled:cursor-not-allowed dark:border-neutral-700 dark:text-neutral-300"
                        title="Remove friend"
                      >
                        {removeKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
                      </button>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-neutral-500 dark:text-neutral-400">
                      <div className="rounded-xl bg-neutral-100/70 px-3 py-2 dark:bg-white/10">
                        <div className="flex items-center gap-2"><Flame className="h-3.5 w-3.5 text-orange-500" /> {friend.streak} day streak</div>
                        <div className="mt-1 text-[11px] text-neutral-400">Last studied {formatRelative(friend.lastStudyDate)}</div>
                      </div>
                      <div className="rounded-xl bg-neutral-100/70 px-3 py-2 dark:bg-white/10">
                        <div className="flex items-center gap-2"><Star className="h-3.5 w-3.5 text-amber-500" /> {friend.points} pts</div>
                        <div className="mt-1 text-[11px] text-neutral-400">Mutual {friend.mutualFriends}</div>
                      </div>
                    </div>
                    {friend.sharedInterests.length > 0 && (
                      <div className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
                        Shared focus: {friend.sharedInterests.join(", ")}
                      </div>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                      <button
                        onClick={() => setToast({ message: "Nudge sent to " + label + " (coming soon)", tone: "neutral" })}
                        className="inline-flex items-center gap-2 rounded-full border border-neutral-300 px-3 py-1.5 text-neutral-600 transition hover:border-neutral-400 hover:text-neutral-800 dark:border-neutral-700 dark:text-neutral-300"
                      >
                        <Send className="h-3.5 w-3.5" /> Send nudge
                      </button>
                      <button
                        onClick={() => setToast({ message: "Study session planner launching soon", tone: "neutral" })}
                        className="inline-flex items-center gap-2 rounded-full border border-transparent bg-lernex-blue/10 px-3 py-1.5 text-lernex-blue transition hover:bg-lernex-blue/15 dark:bg-lernex-blue/20 dark:text-lernex-blue/90"
                      >
                        <Compass className="h-3.5 w-3.5" /> Plan session
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-12">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Recent activity</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">See what your circle has been studying and keep each other accountable.</p>
          </div>
        </div>
        <div className="mt-4 rounded-3xl border border-neutral-200 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-neutral-800 dark:bg-white/5">
          {data.recentActivity.length === 0 && (
            <div className="text-sm text-neutral-500 dark:text-neutral-300">No recent study logs from friends yet. Encourage them to complete a lesson!</div>
          )}
          {data.recentActivity.length > 0 && (
            <ul className="space-y-3">
              {data.recentActivity.slice(0, 12).map((item, index) => {
                const label = displayName(item.username, item.fullName, "Learner");
                const accuracyText = typeof item.accuracy === "number" ? item.accuracy + "%" : "—";
                return (
                  <li
                    key={item.userId + ":" + index}
                    className="flex items-center gap-4 rounded-2xl border border-transparent px-2 py-2 transition hover:border-neutral-200 hover:bg-neutral-100/60 dark:hover:border-neutral-700 dark:hover:bg-white/10"
                  >
                    <Avatar name={label} src={item.avatarUrl} size={40} />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-neutral-800 dark:text-white">{label}</div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        {item.subject ? "Practised " + item.subject : "Completed a session"}
                        {item.level ? " • level " + item.level : ""}
                        {" • Accuracy " + accuracyText}
                      </div>
                    </div>
                    <div className="text-xs text-neutral-400">{formatRelative(item.createdAt)}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
