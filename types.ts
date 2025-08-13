export type Lesson = {
  id: string;
  subject: string;
  title: string;
  content: string; // micro-lesson text
  question: { prompt: string; choices: string[]; correctIndex: number };
};
