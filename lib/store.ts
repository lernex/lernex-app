import { create } from "zustand";
import { persist } from "zustand/middleware";

type State = { points: number; streak: number; lastStudyDate?: string;
  addPoints: (n:number)=>void; bumpStreakIfNewDay:()=>void; resetStreak:()=>void; };

const today = () => new Date().toISOString().slice(0,10);

export const useLernexStore = create<State>()(
  persist(
    (set, get) => ({
      points: 0,
      streak: 0,
      lastStudyDate: undefined,
      addPoints: (n) => set((s) => ({ points: s.points + n })),
      bumpStreakIfNewDay: () => {
        const t = today(); const { lastStudyDate, streak } = get();
        if (lastStudyDate === t) return;
        if (!lastStudyDate) return set({ streak: 1, lastStudyDate: t });
        const prev = new Date(lastStudyDate); const cur = new Date(t);
        const diff = Math.floor((+cur - +prev) / 86400000);
        set({ streak: diff === 1 ? streak + 1 : 1, lastStudyDate: t });
      },
      resetStreak: () => set({ streak: 0, lastStudyDate: undefined }),
    }),
    { name: "lernex-store" } // localStorage key
  )
);
