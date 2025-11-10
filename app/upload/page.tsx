"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import UploadLessonsClient from "./UploadLessonsClient";
import { normalizeProfileBasics } from "@/lib/profile-basics";
import type { ProfileBasics } from "@/lib/profile-basics";

export default function UploadHome() {
  const router = useRouter();
  const [initialProfile, setInitialProfile] = useState<ProfileBasics | null>(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        const sb = supabaseBrowser();
        const {
          data: { user },
        } = await sb.auth.getUser();

        if (!user) {
          router.push("/login");
          return;
        }

        const { data: profileRow } = await sb
          .from("profiles")
          .select("interests, level_map, placement_ready")
          .eq("id", user.id)
          .maybeSingle();

        const profile = normalizeProfileBasics(profileRow ?? null);
        setInitialProfile(profile);
      } catch (error) {
        console.error("[upload] Failed to load profile:", error);
      }
    }

    loadProfile();
  }, [router]);

  // Render immediately - profile data will be set once loaded
  // This prevents flickering with PageTransition animations
  return <UploadLessonsClient initialProfile={initialProfile} />;
}
