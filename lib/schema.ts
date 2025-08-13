import { z } from "zod";

export const LessonSchema = z.object({
  id: z.string().min(1),
  subject: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(20), // short micro-lesson text
  question: z.object({
    prompt: z.string().min(1),
    choices: z.array(z.string().min(1)).min(2).max(6),
    correctIndex: z.number().int().nonnegative(),
  }),
});

export type LessonOut = z.infer<typeof LessonSchema>;
