'use client';

import FypFeed from '@/components/FypFeed';
import SubjectChips from '@/components/SubjectChips';
import ClassPicker from '@/components/ClassPicker';
import FypProgress from '@/components/FypProgress';
import { ProfileBasicsProvider } from '@/app/providers/ProfileBasicsProvider';
import WelcomeTourOverlay from '@/components/WelcomeTourOverlay';

export default function FypPage() {
  return (
    <ProfileBasicsProvider>
      <WelcomeTourOverlay />
      <main className="relative min-h-[calc(100vh-56px)] overflow-x-hidden overflow-y-auto bg-gradient-to-br from-[#0c133a] via-[#090f2c] to-[#04061a] pb-6">
        <div className="pointer-events-none absolute inset-0 -z-40 bg-[radial-gradient(circle_at_18%_20%,rgba(80,140,255,0.44),transparent_55%),radial-gradient(circle_at_88%_22%,rgba(171,99,255,0.36),transparent_62%),radial-gradient(circle_at_52%_88%,rgba(40,214,176,0.28),transparent_70%)]" />
        <div className="pointer-events-none absolute inset-0 -z-30 bg-[linear-gradient(120deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0)_32%),linear-gradient(300deg,rgba(255,255,255,0.1)_0%,rgba(255,255,255,0)_40%)] opacity-50" />
        <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(rgba(255,255,255,0.14)_1px,transparent_1px)] bg-[size:160px_160px] opacity-[0.22]" />
        <div className="pointer-events-none absolute -left-[35%] top-1/2 -z-10 h-[880px] w-[880px] -translate-y-1/2 rounded-full bg-[conic-gradient(from_120deg_at_50%_50%,rgba(59,130,246,0.36)_0deg,rgba(236,72,153,0.26)_160deg,rgba(56,189,248,0.32)_320deg,rgba(59,130,246,0.36)_360deg)] blur-[190px] opacity-82 animate-[spin_90s_linear_infinite]" />
        <div className="pointer-events-none absolute right-[-10%] top-[12%] -z-10 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(236,72,153,0.5),transparent_68%)] blur-[150px] opacity-72" />
        <div className="pointer-events-none absolute left-[-12%] bottom-[8%] -z-10 h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,rgba(34,197,94,0.36),transparent_70%)] blur-[140px] opacity-68" />
        <div className="relative z-10 mx-auto w-full max-w-[640px]" style={{ maxWidth: "min(640px, 94vw)" }}>
          <div className="pointer-events-none absolute -left-28 -right-28 -top-24 bottom-[-22%] -z-10 bg-[radial-gradient(circle_at_22%_18%,rgba(56,189,248,0.62),transparent_65%),radial-gradient(circle_at_76%_72%,rgba(147,51,234,0.52),transparent_68%),radial-gradient(circle_at_48%_104%,rgba(34,197,94,0.3),transparent_75%)] blur-[120px]" />
          <div className="pointer-events-none absolute inset-0 -z-20 rounded-[38px] border border-white/15 bg-white/10 opacity-48 blur-3xl backdrop-blur-2xl" />
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
