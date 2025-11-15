/**
 * Math Content Detection and Complexity Analysis
 *
 * Analyzes text content to detect mathematical patterns and determine
 * whether code_interpreter should be used for accuracy.
 */

export type MathComplexity = 'none' | 'basic' | 'intermediate' | 'advanced';

export interface MathAnalysis {
  hasMath: boolean;
  complexity: MathComplexity;
  requiresCodeInterpreter: boolean;
  detectedPatterns: string[];
  mathScore: number;
}

/**
 * Mathematical pattern detection with complexity weights
 */
const MATH_PATTERNS = {
  // Basic patterns (weight: 1)
  basicArithmetic: {
    pattern: /\b\d+\s*[+\-×÷*/]\s*\d+/,
    weight: 1,
    name: 'basic-arithmetic',
  },
  percentages: {
    pattern: /\d+%|\bpercent/i,
    weight: 1,
    name: 'percentages',
  },

  // Intermediate patterns (weight: 2)
  equations: {
    pattern: /[=<>≤≥≠]+.*[xyz\d]|[xyz]\s*[=<>]/i,
    weight: 2,
    name: 'equations',
  },
  fractions: {
    pattern: /\\frac|\\dfrac|\\tfrac|\d+\/\d+/,
    weight: 2,
    name: 'fractions',
  },
  exponents: {
    pattern: /\^|x²|x³|x⁴|\d+²|\d+³|\\text\{sup\}|superscript/i,
    weight: 2,
    name: 'exponents',
  },
  squareRoots: {
    pattern: /\\sqrt|√|\bsquare root/i,
    weight: 2,
    name: 'square-roots',
  },

  // Advanced patterns (weight: 3)
  calculus: {
    pattern: /\\int|\\sum|\\lim|\\prod|derivative|integral|differentiat/i,
    weight: 3,
    name: 'calculus',
  },
  trigonometry: {
    pattern: /\\sin|\\cos|\\tan|\\theta|\\pi|sine|cosine|tangent/i,
    weight: 3,
    name: 'trigonometry',
  },
  matrices: {
    pattern: /\\begin\{matrix\}|\\begin\{bmatrix\}|\\begin\{pmatrix\}|matrix/i,
    weight: 3,
    name: 'matrices',
  },
  complexNumbers: {
    pattern: /\d+[+-]\d*i\b|complex number/i,
    weight: 3,
    name: 'complex-numbers',
  },
  logarithms: {
    pattern: /\\log|\\ln|\blog\b|\bln\b|logarithm/i,
    weight: 3,
    name: 'logarithms',
  },

  // Very Advanced patterns (weight: 4)
  systemsOfEquations: {
    pattern: /system of equations|simultaneous equations|\\begin\{cases\}/i,
    weight: 4,
    name: 'systems-of-equations',
  },
  polynomials: {
    pattern: /polynomial|quadratic|cubic|quartic/i,
    weight: 4,
    name: 'polynomials',
  },
  largeNumbers: {
    pattern: /\d{5,}/,
    weight: 2,
    name: 'large-numbers',
  },
} as const;

/**
 * Analyze text content for mathematical complexity
 *
 * @param text - The text content to analyze
 * @returns Detailed math analysis with complexity score
 */
export function analyzeMathComplexity(text: string): MathAnalysis {
  let mathScore = 0;
  const detectedPatterns: string[] = [];
  let hasAdvancedMath = false;

  // Check each pattern
  for (const [, config] of Object.entries(MATH_PATTERNS)) {
    if (config.pattern.test(text)) {
      mathScore += config.weight;
      detectedPatterns.push(config.name);

      // Mark as advanced if weight >= 3
      if (config.weight >= 3) {
        hasAdvancedMath = true;
      }
    }
  }

  // Determine complexity level based on score
  let complexity: MathComplexity;
  if (mathScore === 0) {
    complexity = 'none';
  } else if (mathScore <= 3) {
    complexity = 'basic';
  } else if (mathScore <= 7) {
    complexity = 'intermediate';
  } else {
    complexity = 'advanced';
  }

  // Require code interpreter for intermediate+ math or any advanced patterns
  const requiresCodeInterpreter = mathScore >= 4 || hasAdvancedMath;

  return {
    hasMath: mathScore > 0,
    complexity,
    requiresCodeInterpreter,
    detectedPatterns,
    mathScore,
  };
}

/**
 * Quick check if content contains math requiring code interpreter
 * Useful for quick decisions without full analysis
 */
export function shouldUseCodeInterpreter(text: string): boolean {
  const analysis = analyzeMathComplexity(text);
  return analysis.requiresCodeInterpreter;
}

/**
 * Analyze subject name for math content
 * Fallback when content isn't available
 */
export function isMathSubject(subject: string): boolean {
  return /math|algebra|geometry|calculus|trigonometry|statistics|physics|chemistry/i.test(subject);
}
