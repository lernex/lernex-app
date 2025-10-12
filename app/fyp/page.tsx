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
      <main className="relative min-h-[calc(100vh-56px)] overflow-x-hidden overflow-y-auto text-neutral-900 dark:text-white pb-6">
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
