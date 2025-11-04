"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { User } from "@supabase/supabase-js";

export default function SidebarOffsetWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null | undefined>(undefined);

  // Routes that should always use the top nav (no sidebar)
  const marketingRoutes = [
    "/login",
    "/placement",
    "/welcome",
    "/onboarding",
    "/post-auth",
    "/auth/callback",
  ];

  const showSideNav =
    !!user &&
    pathname !== "/" &&
    !marketingRoutes.some((p) => pathname.startsWith(p));

  useEffect(() => {
    const supabase = supabaseBrowser();
    // Use getUser() for initial load to verify session with server
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <div className={showSideNav ? "sidebar-offset" : ""}>
      {children}
    </div>
  );
}
