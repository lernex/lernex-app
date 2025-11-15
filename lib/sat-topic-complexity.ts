/**
 * SAT Topic Complexity Mapping
 *
 * Defines which SAT topics require code_interpreter based on
 * computational complexity and calculation requirements.
 */

export type ToolChoiceLevel = 'required' | 'auto' | 'none';

export interface TopicComplexity {
  toolChoice: ToolChoiceLevel;
  reason: string;
}

/**
 * SAT Math Topic Complexity Map
 *
 * Maps SAT math topics to their code_interpreter requirements:
 * - 'required': Always use code_interpreter (complex calculations)
 * - 'auto': Let model decide (moderate complexity)
 * - 'none': Don't use code_interpreter (conceptual/basic)
 */
export const SAT_MATH_TOPIC_COMPLEXITY: Record<string, TopicComplexity> = {
  // HIGH COMPLEXITY - Require code_interpreter (complex calculations)
  'quadratic-equations': {
    toolChoice: 'required',
    reason: 'Requires solving ax²+bx+c=0, discriminant calculations',
  },
  'systems-of-equations': {
    toolChoice: 'required',
    reason: 'Multi-step solving with substitution/elimination',
  },
  'exponential-functions': {
    toolChoice: 'required',
    reason: 'Complex exponent calculations and logarithms',
  },
  'rational-expressions': {
    toolChoice: 'required',
    reason: 'Fraction simplification and algebraic manipulation',
  },
  'complex-numbers': {
    toolChoice: 'required',
    reason: 'i calculations, conjugates, operations',
  },
  'polynomial-operations': {
    toolChoice: 'required',
    reason: 'Factoring, expansion, long division',
  },
  'radical-expressions': {
    toolChoice: 'required',
    reason: 'Square root simplification, rationalization',
  },
  'trigonometry': {
    toolChoice: 'required',
    reason: 'Sin/cos/tan calculations, angle conversions',
  },
  'circle-equations': {
    toolChoice: 'required',
    reason: 'Center-radius form, completing the square',
  },
  'statistics-calculations': {
    toolChoice: 'required',
    reason: 'Mean, median, standard deviation, probability',
  },

  // MEDIUM COMPLEXITY - Auto (let model decide)
  'linear-equations': {
    toolChoice: 'auto',
    reason: 'Straightforward solving, model can handle',
  },
  'linear-inequalities': {
    toolChoice: 'auto',
    reason: 'Similar to equations with direction consideration',
  },
  'percentages': {
    toolChoice: 'auto',
    reason: 'Basic arithmetic, but accuracy matters',
  },
  'ratios-proportions': {
    toolChoice: 'auto',
    reason: 'Simple cross-multiplication',
  },
  'unit-conversions': {
    toolChoice: 'auto',
    reason: 'Multiplication/division by conversion factors',
  },
  'area-perimeter': {
    toolChoice: 'auto',
    reason: 'Formula application, mostly straightforward',
  },
  'volume-surface-area': {
    toolChoice: 'auto',
    reason: 'Formula-based but can get complex',
  },

  // LOW COMPLEXITY - None (conceptual understanding)
  'number-properties': {
    toolChoice: 'none',
    reason: 'Conceptual: even/odd, prime, divisibility rules',
  },
  'absolute-value': {
    toolChoice: 'none',
    reason: 'Conceptual understanding of distance',
  },
  'function-notation': {
    toolChoice: 'none',
    reason: 'Understanding f(x) notation and evaluation',
  },
  'graph-interpretation': {
    toolChoice: 'auto',
    reason: 'Reading values, understanding trends',
  },
  'table-interpretation': {
    toolChoice: 'none',
    reason: 'Reading and comparing table values',
  },
} as const;

/**
 * SAT Reading/Writing topics (mostly none, some auto)
 */
export const SAT_READING_TOPIC_COMPLEXITY: Record<string, TopicComplexity> = {
  // All reading topics are conceptual, no code_interpreter needed
  'main-idea': { toolChoice: 'none', reason: 'Comprehension skill' },
  'evidence-support': { toolChoice: 'none', reason: 'Textual analysis' },
  'inference': { toolChoice: 'none', reason: 'Reading between lines' },
  'vocabulary-context': { toolChoice: 'none', reason: 'Word meaning from context' },
  'author-purpose': { toolChoice: 'none', reason: 'Understanding intent' },
  'rhetorical-devices': { toolChoice: 'none', reason: 'Literary analysis' },
  'passage-structure': { toolChoice: 'none', reason: 'Organizational understanding' },
} as const;

/**
 * Get tool choice level for a SAT topic
 *
 * @param section - SAT section (math, reading, writing)
 * @param topic - Specific topic slug
 * @returns Tool choice level with reasoning
 */
export function getSATTopicComplexity(
  section: 'math' | 'reading' | 'writing',
  topic: string
): TopicComplexity {
  if (section === 'math') {
    return SAT_MATH_TOPIC_COMPLEXITY[topic] || {
      toolChoice: 'auto',
      reason: 'Unknown topic, defaulting to auto',
    };
  } else {
    return SAT_READING_TOPIC_COMPLEXITY[topic] || {
      toolChoice: 'none',
      reason: 'Reading/writing topic, no calculations needed',
    };
  }
}

/**
 * Check if a topic should require code_interpreter
 */
export function shouldRequireCodeInterpreter(
  section: 'math' | 'reading' | 'writing',
  topic: string
): boolean {
  const complexity = getSATTopicComplexity(section, topic);
  return complexity.toolChoice === 'required';
}

/**
 * Get all high-complexity SAT math topics
 * Useful for analytics and reporting
 */
export function getHighComplexityTopics(): string[] {
  return Object.entries(SAT_MATH_TOPIC_COMPLEXITY)
    .filter(([, config]) => config.toolChoice === 'required')
    .map(([topic]) => topic);
}
