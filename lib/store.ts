import { create } from "zustand";
import { persist } from "zustand/middleware";
type LessonRef = {
  id: string;
  subject: string;
  topic?: string | null;
  nextTopicHint?: string | null;
  personaHash?: string | null;
};

type FypSnapshot = {
  subjectsKey: string;
  lessonRefs: LessonRef[];
  index: number;
  completed: Record<string, boolean>;
  updatedAt: number;
};
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
  fypSnapshot: FypSnapshot | null;
  setFypSnapshot: (snapshot: FypSnapshot | null) => void;
  clearFypSnapshot: () => void;
};

function cloneSnapshot(snapshot: FypSnapshot | null): FypSnapshot | null {
  if (!snapshot) return null;
  return {
    subjectsKey: snapshot.subjectsKey,
    index: snapshot.index,
    completed: { ...snapshot.completed },
    updatedAt: snapshot.updatedAt,
    lessonRefs: snapshot.lessonRefs.map((lesson) => ({ ...lesson })),
  };
}

export const useLernexStore = create<State>()(
  persist(
    (set) => ({
      selectedSubjects: [],
      accuracyBySubject: {},
      autoAdvanceEnabled: true,
      classPickerOpen: false,
      fypSnapshot: null,
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
      setFypSnapshot: (snapshot) => set({ fypSnapshot: cloneSnapshot(snapshot) }),
      clearFypSnapshot: () => set({ fypSnapshot: null }),
    }),
    { name: "lernex-store" }
  )
);

export type { FypSnapshot, LessonRef };
