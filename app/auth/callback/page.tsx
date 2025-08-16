"use client";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function AuthCallback() {
  const router = useRouter();
  useEffect(() => {
    supabase.auth.getSession().then(() => router.replace("/"));
  }, [router]);
  return <div className="p-6">Signing you in…</div>;
}
