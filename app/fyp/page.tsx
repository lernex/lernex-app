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
      <main className="relative min-h-[calc(100vh-56px)] overflow-x-hidden overflow-y-auto bg-gradient-to-br from-[#06060d] via-[#0b1223] to-[#05070f] pb-6">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-lernex-purple/35 blur-[160px]" />
          <div className="absolute -bottom-24 right-[-120px] h-[420px] w-[420px] rounded-full bg-lernex-blue/30 blur-[170px]" />
          <div className="absolute bottom-10 left-[-120px] h-[360px] w-[360px] rounded-full bg-lernex-green/20 blur-[150px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.07),transparent_58%)] opacity-60 dark:opacity-40" />
        </div>
        <div className="relative z-10 mx-auto w-full max-w-[640px]" style={{ maxWidth: "min(640px, 94vw)" }}>
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
