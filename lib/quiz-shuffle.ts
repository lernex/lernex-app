/**
 * Shuffles quiz question choices using Fisher-Yates algorithm
 * while maintaining the correct answer tracking
 */

export interface QuizQuestion {
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation?: string;
}

/**
 * Shuffles the choices array of a question and updates the correctIndex accordingly.
 * Uses Fisher-Yates algorithm for unbiased randomization.
 *
 * @param question - The question object to shuffle (will be modified in place)
 * @returns The same question object with shuffled choices
 */
export function shuffleQuestionChoices<T extends QuizQuestion>(question: T): T {
  if (!Array.isArray(question.choices) || question.choices.length < 2) {
    return question;
  }

  // Validate and normalize correctIndex
  let idx = question.correctIndex;
  if (!Number.isFinite(idx) || idx < 0 || idx >= question.choices.length) {
    idx = 0;
  }
  idx = Math.floor(idx);

  // Fisher-Yates shuffle with index tracking
  const decoratedChoices = question.choices.map((choice, i) => ({
    choice,
    originalIndex: i
  }));

  for (let i = decoratedChoices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [decoratedChoices[i], decoratedChoices[j]] = [decoratedChoices[j], decoratedChoices[i]];
  }

  // Update question with shuffled choices
  question.choices = decoratedChoices.map((entry) => entry.choice);

  // Find new position of correct answer
  const newIndex = decoratedChoices.findIndex((entry) => entry.originalIndex === idx);
  question.correctIndex = newIndex >= 0 ? newIndex : 0;

  return question;
}

/**
 * Shuffles all questions in a quiz/lesson
 *
 * @param questions - Array of questions to shuffle
 * @returns The same array with all questions shuffled
 */
export function shuffleQuizQuestions<T extends QuizQuestion>(questions: T[]): T[] {
  if (!Array.isArray(questions)) {
    return questions;
  }

  return questions.map(question => shuffleQuestionChoices(question));
}
