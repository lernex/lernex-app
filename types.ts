export type Question = {
  prompt: string;
  choices: string[];
  correctIndex: number;
};

export type Lesson = {
  id: string;
  subject: string;
  title: string;
  content: string; // 30–80 words
  questions: Question[]; // 1–3
  mediaUrl?: string;     // optional image/gif/video
  mediaType?: "image" | "video";
};
