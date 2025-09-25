import { create } from "zustand";
import { persist } from "zustand/middleware";

type Accuracy = { correct: number; total: number };
type State = {
  selectedSubjects: string[];
  accuracyBySubject: Record<string, Accuracy>;
  setSelectedSubjects: (subs: string[]) => void;
  recordAnswer: (subject: string, correct: boolean) => void;
  autoAdvanceEnabled: boolean;
  setAutoAdvanceEnabled: (enabled: boolean) => void;
  classPickerOpen: boolean;
  setClassPickerOpen: (open: boolean) => void;
};

export const useLernexStore = create<State>()(
  persist(
    (set) => ({
      selectedSubjects: [],
      accuracyBySubject: {},
      autoAdvanceEnabled: true,
      classPickerOpen: false,
      setSelectedSubjects: (subs) => set({ selectedSubjects: subs }),
      recordAnswer: (subject, isCorrect) =>
        set((state) => {
          const current = state.accuracyBySubject[subject] ?? { correct: 0, total: 0 };
          return {
            accuracyBySubject: {
              ...state.accuracyBySubject,
              [subject]: {
                correct: current.correct + (isCorrect ? 1 : 0),
                total: current.total + 1,
              },
            },
          };
        }),
      setAutoAdvanceEnabled: (enabled) => set({ autoAdvanceEnabled: enabled }),
      setClassPickerOpen: (open) => set({ classPickerOpen: open }),
    }),
    { name: "lernex-store" }
  )
);
