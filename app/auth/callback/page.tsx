"use client";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function AuthCallback() {
  const router = useRouter();
  useEffect(() => {
    // Use getUser() to verify session with server
    supabase.auth.getUser().then(() => router.replace("/post-auth"));
  }, [router]);
  return <div className="p-6">Signing you in…</div>;
}
