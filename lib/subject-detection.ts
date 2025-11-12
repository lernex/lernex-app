/**
 * Early Subject Detection
 *
 * Detects the subject/topic from filename and first page text without requiring
 * full document processing. This enables:
 * - Better pipeline routing (20% into process → 0% into process)
 * - Faster user feedback
 * - More accurate processing configuration
 */

export interface SubjectDetectionResult {
  subject: string;
  confidence: number; // 0-1
  source: 'filename' | 'firstPage' | 'default';
}

/**
 * Subject keywords and patterns for detection
 */
const SUBJECT_PATTERNS = {
  // Mathematics
  'Algebra': /\b(algebra|algebraic|polynomial|equation|quadratic|linear|expression)\b/i,
  'Geometry': /\b(geometry|geometric|triangle|circle|angle|theorem|proof)\b/i,
  'Calculus': /\b(calculus|derivative|integral|limit|differential|taylor|series)\b/i,
  'Trigonometry': /\b(trigonometry|sine|cosine|tangent|trig|radian)\b/i,
  'Statistics': /\b(statistics|probability|distribution|variance|mean|median|standard\s+deviation)\b/i,

  // Sciences
  'Biology': /\b(biology|cell|organism|DNA|genetics|evolution|ecology|anatomy)\b/i,
  'Chemistry': /\b(chemistry|chemical|molecule|atom|reaction|compound|element|periodic\s+table)\b/i,
  'Physics': /\b(physics|force|energy|momentum|velocity|acceleration|newton|quantum)\b/i,

  // Languages
  'English': /\b(english|literature|grammar|writing|shakespeare|novel|essay)\b/i,
  'Spanish': /\b(spanish|español|castellano)\b/i,
  'French': /\b(french|français|francais)\b/i,

  // Social Sciences
  'History': /\b(history|historical|century|war|revolution|empire|civilization)\b/i,
  'Geography': /\b(geography|geographic|continent|country|map|climate|region)\b/i,
  'Psychology': /\b(psychology|psychological|behavior|cognitive|freud|brain)\b/i,
  'Economics': /\b(economics|economic|market|supply|demand|GDP|inflation)\b/i,

  // Computer Science
  'Computer Science': /\b(computer\s+science|programming|algorithm|data\s+structure|software|coding)\b/i,

  // Other
  'Art': /\b(art|painting|sculpture|renaissance|impressionism|aesthetic)\b/i,
  'Music': /\b(music|musical|melody|harmony|rhythm|composer|symphony)\b/i,
};

/**
 * Grade level patterns in filenames
 */
const GRADE_PATTERNS = {
  'High School': /\b(high\s+school|hs|grade\s+(9|10|11|12)|freshman|sophomore|junior|senior)\b/i,
  'Middle School': /\b(middle\s+school|ms|grade\s+(6|7|8))\b/i,
  'College': /\b(college|university|undergraduate|101|201|301)\b/i,
  'AP': /\b(AP|advanced\s+placement)\b/i,
};

/**
 * Detect subject from filename
 *
 * Analyzes filename for subject keywords and patterns.
 * Fast and works before any file processing.
 */
export function detectSubjectFromFilename(filename: string): SubjectDetectionResult {
  // Clean filename: remove extension and normalize
  const cleanName = filename
    .replace(/\.(pdf|docx|pptx|txt|md)$/i, '')
    .replace(/[_-]/g, ' ')
    .trim();

  // Check each subject pattern
  for (const [subject, pattern] of Object.entries(SUBJECT_PATTERNS)) {
    if (pattern.test(cleanName)) {
      // Higher confidence if subject is explicitly mentioned
      const isExplicit = new RegExp(`\\b${subject}\\b`, 'i').test(cleanName);
      return {
        subject,
        confidence: isExplicit ? 0.9 : 0.7,
        source: 'filename',
      };
    }
  }

  // Check for grade level indicators
  for (const [level, pattern] of Object.entries(GRADE_PATTERNS)) {
    if (pattern.test(cleanName)) {
      // Grade level found but no specific subject
      return {
        subject: `${level} Studies`,
        confidence: 0.5,
        source: 'filename',
      };
    }
  }

  // No subject detected from filename
  return {
    subject: 'General Studies',
    confidence: 0.3,
    source: 'default',
  };
}

/**
 * Detect subject from first page text
 *
 * Analyzes the beginning of document content for subject indicators.
 * More accurate than filename but requires some text extraction.
 *
 * @param text - First page or opening text (ideally 500-2000 chars)
 */
export function detectSubjectFromText(text: string): SubjectDetectionResult {
  if (!text || text.trim().length < 50) {
    return {
      subject: 'General Studies',
      confidence: 0.2,
      source: 'default',
    };
  }

  // Analyze first ~2000 chars (usually enough to identify subject)
  const sample = text.slice(0, 2000);

  // Count matches for each subject
  const scores: Record<string, number> = {};

  for (const [subject, pattern] of Object.entries(SUBJECT_PATTERNS)) {
    const matches = sample.match(new RegExp(pattern, 'gi'));
    if (matches) {
      scores[subject] = matches.length;
    }
  }

  // Find subject with highest score
  const entries = Object.entries(scores);
  if (entries.length === 0) {
    return {
      subject: 'General Studies',
      confidence: 0.3,
      source: 'default',
    };
  }

  entries.sort((a, b) => b[1] - a[1]);
  const [topSubject, topScore] = entries[0];

  // Calculate confidence based on match frequency
  // More matches = higher confidence
  const confidence = Math.min(0.95, 0.5 + (topScore * 0.1));

  return {
    subject: topSubject,
    confidence,
    source: 'firstPage',
  };
}

/**
 * Combine filename and text detection for best results
 *
 * Uses both filename and first page text to make the best guess.
 * Prefers higher confidence results.
 */
export function detectSubject(filename: string, firstPageText?: string): SubjectDetectionResult {
  const filenameResult = detectSubjectFromFilename(filename);

  // If we have high confidence from filename, use it
  if (filenameResult.confidence >= 0.85) {
    return filenameResult;
  }

  // If we have first page text, analyze it
  if (firstPageText) {
    const textResult = detectSubjectFromText(firstPageText);

    // Prefer text result if it has higher confidence
    if (textResult.confidence > filenameResult.confidence) {
      return textResult;
    }

    // If both agree, boost confidence
    if (textResult.subject === filenameResult.subject) {
      return {
        ...textResult,
        confidence: Math.min(0.98, textResult.confidence + 0.15),
      };
    }
  }

  // Default to filename result
  return filenameResult;
}

/**
 * Format subject detection result for logging
 */
export function formatDetectionResult(result: SubjectDetectionResult): string {
  const confidencePercent = (result.confidence * 100).toFixed(0);
  return `${result.subject} (${confidencePercent}% confidence from ${result.source})`;
}
