import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { normalizeProfile, RawProfile, ProfileSummary } from "../shared";

function buildSharedInterest(profile: ProfileSummary) {
  return (other: ProfileSummary | null) => {
    if (!other) return [] as string[];
    if (!profile.interests.length || !other.interests.length) return [] as string[];
    const mine = new Set(profile.interests.map((item) => item.toLowerCase()));
    const shared = new Set<string>();
    other.interests.forEach((interest) => {
      const key = interest.toLowerCase();
      if (mine.has(key)) shared.add(interest);
    });
    return Array.from(shared);
  };
}

export async function GET(req: Request) {
  try {
    const sb = await supabaseServer();
    const authState = await sb.auth.getUser();
    if (authState.error) throw authState.error;
    const user = authState.data.user;
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const url = new URL(req.url);
    const queryRaw = url.searchParams.get("q") ?? "";
    const query = queryRaw.trim();
    const limitParam = url.searchParams.get("limit");
    const parsedLimit = limitParam ? Number(limitParam) : NaN;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(24, Math.max(1, parsedLimit)) : 12;

    if (query.length < 2) {
      return NextResponse.json({ ok: true, results: [], fetchedAt: new Date().toISOString() });
    }

    const excludeParam = url.searchParams.get("exclude") ?? "";
    const excludeSet = new Set<string>([user.id]);
    excludeParam
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .forEach((item) => excludeSet.add(item));

    const profileRes = await sb
      .from("profiles")
      .select(
        "id, username, full_name, avatar_url, streak, points, last_study_date, interests, created_at, updated_at"
      )
      .eq("id", user.id)
      .maybeSingle();
    if (profileRes.error) throw profileRes.error;
    if (!profileRes.data) {
      return NextResponse.json({ error: "Profile missing" }, { status: 404 });
    }

    const me = normalizeProfile(profileRes.data as RawProfile);
    if (!me) {
      return NextResponse.json({ error: "Profile missing" }, { status: 404 });
    }

    const likePattern = "%" + query.replace(/[%_]/g, "") + "%";
    const searchFilter = "username.ilike." + likePattern + ",full_name.ilike." + likePattern;

    let builder = sb
      .from("profiles")
      .select(
        "id, username, full_name, avatar_url, streak, points, last_study_date, interests, created_at, updated_at"
      )
      .or(searchFilter)
      .order("username", { ascending: true })
      .limit(limit);

    if (excludeSet.size > 0) {
      const rawList = Array.from(excludeSet).join(",");
      builder = builder.not("id", "in", "(" + rawList + ")");
    }

    const resultsRes = await builder;
    if (resultsRes.error) throw resultsRes.error;

    const sharedInterest = buildSharedInterest(me);

    const results = (resultsRes.data ?? [])
      .map((row) => normalizeProfile(row as RawProfile))
      .filter((row): row is ProfileSummary => !!row)
      .map((profile) => ({
        id: profile.id,
        username: profile.username,
        fullName: profile.fullName,
        avatarUrl: profile.avatarUrl,
        streak: profile.streak,
        points: profile.points,
        sharedInterests: sharedInterest(profile),
        lastStudyDate: profile.lastStudyDate,
      }));

    return NextResponse.json({ ok: true, results, fetchedAt: new Date().toISOString() });
  } catch (error) {
    console.error("/api/friends/search GET error", error);
    return NextResponse.json({ error: "Unable to search" }, { status: 500 });
  }
}
