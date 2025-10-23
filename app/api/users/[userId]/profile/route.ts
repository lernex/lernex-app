import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const supabase = await createClient();

    // Get the requesting user (to ensure they're authenticated)
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { userId: targetUserId } = await params;

    // Fetch the target user's public profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "id, username, full_name, avatar_url, bio, streak, points, last_study_date, interests, created_at, public_stats, show_real_name"
      )
      .eq("id", targetUserId)
      .single();

    if (profileError || !profile) {
      return new NextResponse("User not found", { status: 404 });
    }

    // Get public stats visibility settings
    const publicStats = profile.public_stats || {
      showStreak: true,
      showPoints: true,
      showAccuracy: true,
      showActivity: true,
    };

    // Count total quizzes (attempts)
    const { count: totalQuizzes } = await supabase
      .from("attempts")
      .select("*", { count: "exact", head: true })
      .eq("user_id", targetUserId);

    // Count total lessons (we can use attempts or create a separate lessons table)
    const { count: totalLessons } = await supabase
      .from("attempts")
      .select("*", { count: "exact", head: true })
      .eq("user_id", targetUserId);

    // Calculate average accuracy from attempts
    const { data: attempts } = await supabase
      .from("attempts")
      .select("correct_count, total")
      .eq("user_id", targetUserId)
      .limit(100);

    let averageAccuracy = 0;
    if (attempts && attempts.length > 0) {
      const totalCorrect = attempts.reduce(
        (sum, a) => sum + (a.correct_count || 0),
        0
      );
      const totalQuestions = attempts.reduce((sum, a) => sum + (a.total || 0), 0);
      averageAccuracy =
        totalQuestions > 0
          ? Math.round((totalCorrect / totalQuestions) * 100)
          : 0;
    }

    // Get longest streak (for now, use current streak - in production you'd track this separately)
    const longestStreak = profile.streak || 0;

    // Count total friends
    const { count: totalFriends } = await supabase
      .from("friendships")
      .select("*", { count: "exact", head: true })
      .or(`user_a.eq.${targetUserId},user_b.eq.${targetUserId}`);

    // Calculate days since joined
    const joinedDaysAgo = profile.created_at
      ? Math.floor(
          (Date.now() - new Date(profile.created_at).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 0;

    // Get recent activity
    const { data: recentActivity } = await supabase
      .from("attempts")
      .select("subject, level, correct_count, total, created_at")
      .eq("user_id", targetUserId)
      .order("created_at", { ascending: false })
      .limit(5);

    const formattedActivity = (recentActivity || []).map((activity) => ({
      subject: activity.subject || "Quiz",
      level: activity.level || "N/A",
      accuracy:
        activity.total > 0
          ? Math.round(((activity.correct_count || 0) / activity.total) * 100)
          : 0,
      createdAt: activity.created_at,
    }));

    // Respect the show_real_name privacy setting
    const showRealName = profile.show_real_name ?? false;

    const response = {
      id: profile.id,
      username: profile.username,
      fullName: showRealName ? profile.full_name : null,
      avatarUrl: profile.avatar_url,
      bio: profile.bio || "",
      streak: publicStats.showStreak ? profile.streak || 0 : null,
      points: publicStats.showPoints ? profile.points || 0 : null,
      lastStudyDate: profile.last_study_date,
      interests: Array.isArray(profile.interests) ? profile.interests : [],
      createdAt: profile.created_at,
      stats: {
        totalQuizzes: publicStats.showActivity ? totalQuizzes || 0 : null,
        totalLessons: publicStats.showActivity ? totalLessons || 0 : null,
        averageAccuracy: publicStats.showAccuracy ? averageAccuracy : null,
        longestStreak: publicStats.showStreak ? longestStreak : null,
        totalFriends: totalFriends || 0,
        joinedDaysAgo,
      },
      recentActivity: publicStats.showActivity ? formattedActivity : [],
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
