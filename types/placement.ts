export type Difficulty = "intro" | "easy" | "medium" | "hard";

export type PlacementItem = {
  subject: string;        // e.g., "Math"
  course: string;         // e.g., "Algebra 1"
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation?: string;
  difficulty: Difficulty;
};

export type PlacementState = {
  subject: string;
  course: string;
  difficulty: Difficulty;     // current step difficulty
  step: number;               // 1..N
  correctStreak: number;      // consecutive correct
  mistakes: number;           // total mistakes
  done: boolean;
  maxSteps: number;
};
