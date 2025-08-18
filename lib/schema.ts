import { z } from "zod";

// One MCQ with an optional short explanation
export const QuestionSchema = z.object({
  prompt: z.string().min(1),
  choices: z.array(z.string().min(1)).min(2).max(6),
  correctIndex: z.number().int().nonnegative(),
  explanation: z.string().min(3).max(280).optional(), // NEW
});

// Lesson includes 1–3 MCQs and metadata for adaptive learning
export const LessonSchema = z.object({
  id: z.string().min(1),
  subject: z.string().min(1),            // e.g., "Algebra 1"
  topic: z.string().min(1),              // e.g., "Slope of a line" (NEW)
  title: z.string().min(1),
  content: z.string().min(30).max(600),  // 30–100 words is typical
  difficulty: z.enum(["intro","easy","medium","hard"]).default("easy"), // NEW
  questions: z.array(QuestionSchema).min(1).max(3),
  // media optional; we’ll keep it off for now to control cost
  mediaUrl: z.string().url().optional(),
  mediaType: z.enum(["image","video"]).optional(),
});

export type LessonOut = z.infer<typeof LessonSchema>;
