export type Question = {
  prompt: string;
  choices: string[];
  correctIndex: number;
};

export type Lesson = {
  id: string;
  subject: string;
  title: string;
  content: string;
  questions: { prompt: string; choices: string[]; correctIndex: number; explanation?: string }[];
  difficulty?: "intro" | "easy" | "medium" | "hard";
  topic?: string; // <- add this if you want it
};
