import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select(
        "id, username, full_name, avatar_url, bio, interests, public_stats, show_real_name, streak, points, featured_achievements"
      )
      .eq("id", user.id)
      .single();

    if (error || !profile) {
      return new NextResponse("Profile not found", { status: 404 });
    }

    // Default public stats if not set
    const defaultPublicStats = {
      showStreak: true,
      showPoints: true,
      showAccuracy: true,
      showActivity: true,
    };

    // Count total quizzes (attempts)
    const { count: totalQuizzes } = await supabase
      .from("attempts")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    // Calculate average accuracy from attempts
    const { data: attempts } = await supabase
      .from("attempts")
      .select("correct_count, total")
      .eq("user_id", user.id)
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

    const response = {
      id: profile.id,
      username: profile.username,
      fullName: profile.full_name,
      avatarUrl: profile.avatar_url,
      bio: profile.bio || "",
      interests: Array.isArray(profile.interests) ? profile.interests : [],
      publicStats: profile.public_stats || defaultPublicStats,
      showRealName: profile.show_real_name ?? false,
      featuredAchievements: Array.isArray(profile.featured_achievements)
        ? profile.featured_achievements
        : [],
      stats: {
        streak: profile.streak || 0,
        points: profile.points || 0,
        averageAccuracy: averageAccuracy,
        totalQuizzes: totalQuizzes || 0,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching public profile:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await request.json();
    const { username, fullName, bio, interests, publicStats, avatarUrl, showRealName, featuredAchievements } = body;

    // Validate username (alphanumeric and underscores only)
    if (username && !/^[a-zA-Z0-9_]+$/.test(username)) {
      return new NextResponse(
        "Username can only contain letters, numbers, and underscores",
        { status: 400 }
      );
    }

    // Check if username is already taken
    if (username) {
      const { data: existingUser } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .neq("id", user.id)
        .maybeSingle();

      if (existingUser) {
        return new NextResponse("Username already taken", { status: 400 });
      }
    }

    // Validate bio length
    if (bio && bio.length > 280) {
      return new NextResponse("Bio must be 280 characters or less", {
        status: 400,
      });
    }

    // Validate interests (max 10)
    if (Array.isArray(interests) && interests.length > 10) {
      return new NextResponse("Maximum 10 interests allowed", { status: 400 });
    }

    // Validate featured achievements (max 6)
    if (Array.isArray(featuredAchievements)) {
      if (featuredAchievements.length > 6) {
        return new NextResponse("Maximum 6 featured achievements allowed", {
          status: 400
        });
      }
      // Validate that all items are strings
      if (!featuredAchievements.every(item => typeof item === "string")) {
        return new NextResponse("Featured achievements must be an array of strings", {
          status: 400
        });
      }
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        username,
        full_name: fullName,
        bio,
        interests,
        public_stats: publicStats,
        avatar_url: avatarUrl,
        show_real_name: typeof showRealName === "boolean" ? showRealName : undefined,
        featured_achievements: Array.isArray(featuredAchievements) ? featuredAchievements : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) {
      console.error("Error updating profile:", error);
      return new NextResponse("Failed to update profile", { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating public profile:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
