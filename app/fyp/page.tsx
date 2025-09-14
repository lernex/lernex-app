'use client';

import FypFeed from '@/components/FypFeed';
import SubjectChips from '@/components/SubjectChips';

export default function FypPage() {
  return (
    <main className="min-h-[calc(100vh-56px)]">
      <div className="mx-auto max-w-md">
        <SubjectChips />
        <FypFeed />
      </div>
    </main>
  );
}
