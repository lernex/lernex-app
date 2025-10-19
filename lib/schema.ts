import { z } from "zod";

// One MCQ with a mandatory short explanation
export const QuestionSchema = z.object({
  prompt: z.string().min(1),
  choices: z.array(z.string().min(1)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().min(3).max(280),
});

export type Question = z.infer<typeof QuestionSchema>;

// Lesson includes 1-3 MCQs and metadata for adaptive learning
export const MIN_LESSON_WORDS = 80;
export const MAX_LESSON_WORDS = 105;

export const MAX_LESSON_CHARS = 720;

export const LessonSchema = z.object({
  id: z.string().min(1),
  subject: z.string().min(1),            // e.g., "Algebra 1"
  topic: z.string().min(1),              // e.g., "Slope of a line" (NEW)
  title: z.string().min(1),
  content: z.string().min(180).max(MAX_LESSON_CHARS),  // tuned for ~80-105 words at typical word length
  difficulty: z.enum(["intro","easy","medium","hard"]).default("easy"), // NEW
  questions: z.array(QuestionSchema).length(3),
  // media optional; we'll keep it off for now to control cost
  mediaUrl: z.string().url().optional(),
  mediaType: z.enum(["image","video"]).optional(),
}).passthrough().superRefine((lesson, ctx) => {
  const contentWords = lesson.content.trim().split(/\s+/).filter(Boolean).length;
  if (contentWords < MIN_LESSON_WORDS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["content"],
      message: `Lesson content is too short (${contentWords} words); target at least ${MIN_LESSON_WORDS}.`,
    });
  } else if (contentWords > MAX_LESSON_WORDS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["content"],
      message: `Lesson content is too long (${contentWords} words); keep under ${MAX_LESSON_WORDS}.`,
    });
  }

  lesson.questions.forEach((question, idx) => {
    if (question.correctIndex < 0 || question.correctIndex >= question.choices.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["questions", idx, "correctIndex"],
        message: "correctIndex must reference one of the four choices",
      });
    }
  });
});
export type Lesson = z.infer<typeof LessonSchema>;

