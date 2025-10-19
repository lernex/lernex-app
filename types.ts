export type Question = {
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
};

export type Lesson = {
  id: string;
  subject: string;
  title: string;
  content: string;
  mediaUrl?: string;
  mediaType?: "image" | "video";
  questions: { prompt: string; choices: string[]; correctIndex: number; explanation: string }[];
  difficulty?: "intro" | "easy" | "medium" | "hard";
  topic?: string; // <- add this if you want it
  nextTopicHint?: string | null;
  context?: Record<string, unknown> | null;
  knowledge?: {
    definition?: string;
    applications?: string[];
    prerequisites?: string[];
    reminders?: string[];
  } | null;
};
