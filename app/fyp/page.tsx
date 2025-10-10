'use client';

import FypFeed from '@/components/FypFeed';
import SubjectChips from '@/components/SubjectChips';
import ClassPicker from '@/components/ClassPicker';
import FypProgress from '@/components/FypProgress';
import { ProfileBasicsProvider } from '@/app/providers/ProfileBasicsProvider';
import WelcomeTourOverlay from '@/components/WelcomeTourOverlay';
import { usePrefersReducedMotion } from '@/lib/use-prefers-reduced-motion';

export default function FypPage() {
  const prefersReducedMotion = usePrefersReducedMotion();
  return (
    <ProfileBasicsProvider>
      <WelcomeTourOverlay />
      <main
        data-aurora-motion={prefersReducedMotion ? 'pause' : 'play'}
        className="relative min-h-[calc(100vh-56px)] overflow-x-hidden overflow-y-auto bg-gradient-to-br from-[#111d4d] via-[#0b1645] to-[#03051a] pb-6"
      >
        <div className="pointer-events-none absolute inset-0 -z-40 bg-[radial-gradient(circle_at_20%_24%,rgba(109,184,255,0.6),transparent_58%),radial-gradient(circle_at_84%_20%,rgba(226,102,213,0.48),transparent_62%),radial-gradient(circle_at_50%_86%,rgba(74,226,197,0.32),transparent_70%)]" />
        <div className="pointer-events-none absolute inset-0 -z-30 bg-[linear-gradient(118deg,rgba(255,255,255,0.2)_0%,rgba(255,255,255,0)_36%),linear-gradient(304deg,rgba(140,177,255,0.16)_0%,rgba(255,255,255,0)_48%)] opacity-52" />
        <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(rgba(255,255,255,0.16)_1px,transparent_1px)] bg-[size:160px_160px] opacity-[0.26]" />
        <div className="aurora-field" style={{ zIndex: -15 }}>
          <div className="aurora-layer aurora-layer--one" />
          <div className="aurora-layer aurora-layer--two" />
          <div className="aurora-layer aurora-layer--three" />
        </div>
        <div className="pointer-events-none absolute -left-[35%] top-1/2 -z-10 h-[880px] w-[880px] -translate-y-1/2 rounded-full bg-[conic-gradient(from_120deg_at_50%_50%,rgba(59,130,246,0.36)_0deg,rgba(236,72,153,0.26)_160deg,rgba(56,189,248,0.32)_320deg,rgba(59,130,246,0.36)_360deg)] blur-[190px] opacity-82 animate-[spin_90s_linear_infinite]" />
        <div className="pointer-events-none absolute right-[-10%] top-[12%] -z-10 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(236,72,153,0.5),transparent_68%)] blur-[150px] opacity-72" />
        <div className="pointer-events-none absolute left-[-12%] bottom-[8%] -z-10 h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,rgba(34,197,94,0.36),transparent_70%)] blur-[140px] opacity-68" />
        <div className="relative z-10 mx-auto w-full max-w-[640px]" style={{ maxWidth: "min(640px, 94vw)" }}>
          <div className="pointer-events-none absolute -left-28 -right-28 -top-24 bottom-[-22%] -z-10 bg-[radial-gradient(circle_at_24%_18%,rgba(94,180,255,0.62),transparent_64%),radial-gradient(circle_at_76%_72%,rgba(183,112,255,0.5),transparent_70%),radial-gradient(circle_at_48%_104%,rgba(64,229,168,0.32),transparent_78%)] blur-[120px]" />
          <div className="pointer-events-none absolute inset-0 -z-20 rounded-[38px] border border-white/20 bg-white/10 opacity-52 blur-3xl backdrop-blur-2xl" />
          {/* Top controls */}
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <div className="text-sm font-medium text-neutral-500 dark:text-neutral-400">Your Feed</div>
            <div className="shrink-0"><ClassPicker /></div>
          </div>
          <FypProgress />
          <SubjectChips />
          <FypFeed />
        </div>
      </main>
    </ProfileBasicsProvider>
  );
}
