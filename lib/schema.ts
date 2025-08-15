import { z } from "zod";

export const QuestionSchema = z.object({
  prompt: z.string().min(1),
  choices: z.array(z.string().min(1)).min(2).max(6),
  correctIndex: z.number().int().nonnegative(),
});

export const LessonSchema = z.object({
  id: z.string().min(1),
  subject: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(30),   // 30–100 words
  questions: z.array(QuestionSchema).min(3).max(3),
});
export type LessonOut = z.infer<typeof LessonSchema>;
