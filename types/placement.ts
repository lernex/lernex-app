// @/types/placement.ts
export type Difficulty = "intro" | "easy" | "medium" | "hard";

export type PlacementState = {
  subject: string;
  course: string;
  step: number;
  maxSteps: number;
  difficulty: Difficulty;
  mistakes: number;
  correctStreak: number;
  done: boolean;
};

export type PlacementItem = {
  subject: string;
  course: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation?: string;
  difficulty: Difficulty;
};

// Returned by /api/placement/next
export type PlacementNextResponse = {
  state: PlacementState;      // current state (unchanged if just asking "next")
  item: PlacementItem | null; // the question to show now (or null if done)
  branches?: {
    right?: { state: PlacementState; item: PlacementItem | null };
    wrong?: { state: PlacementState; item: PlacementItem | null };
  };
  // Optional diagnostics
  // timings?: { nowMs: number; rightMs: number; wrongMs: number };
};
