import { create } from "zustand";
import { persist } from "zustand/middleware";

type Accuracy = { correct: number; total: number };
type State = {
  points: number;
  streak: number;
  lastStudyDate?: string;
  selectedSubjects: string[];
  accuracyBySubject: Record<string, Accuracy>;
  addPoints: (n: number) => void;
  bumpStreakIfNewDay: () => void;
  setSelectedSubjects: (subs: string[]) => void;
  recordAnswer: (subject: string, correct: boolean) => void;
  resetStreak: () => void;
};

const today = () => new Date().toISOString().slice(0,10);

export const useLernexStore = create<State>()(
  persist(
    (set, get) => ({
      points: 0,
      streak: 0,
      lastStudyDate: undefined,
      selectedSubjects: [],
      accuracyBySubject: {},
      addPoints: (n) => set((s) => ({ points: s.points + n })),
      bumpStreakIfNewDay: () => {
        const t = today(); const { lastStudyDate, streak } = get();
        if (lastStudyDate === t) return;
        if (!lastStudyDate) return set({ streak: 1, lastStudyDate: t });
        const diff = Math.floor((+new Date(t) - +new Date(lastStudyDate))/86400000);
        set({ streak: diff === 1 ? streak + 1 : 1, lastStudyDate: t });
      },
      setSelectedSubjects: (subs) => set({ selectedSubjects: subs }),
      recordAnswer: (subject, isCorrect) =>
        set((s) => {
          const cur = s.accuracyBySubject[subject] ?? { correct: 0, total: 0 };
          return {
            accuracyBySubject: {
              ...s.accuracyBySubject,
              [subject]: { correct: cur.correct + (isCorrect ? 1 : 0), total: cur.total + 1 }
            }
          };
        }),
      resetStreak: () => set({ streak: 0, lastStudyDate: undefined }),
    }),
    { name: "lernex-store" }
  )
);
