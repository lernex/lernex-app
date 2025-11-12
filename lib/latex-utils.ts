/**
 * LaTeX Utilities
 *
 * Shared utilities for handling LaTeX formatting in AI-generated content.
 * This prevents duplicate code and ensures consistent LaTeX handling across the app.
 */

/**
 * Fix common LaTeX escaping issues in AI-generated JSON
 *
 * The AI sometimes under-escapes LaTeX commands in JSON strings.
 * This function corrects these escaping issues to ensure proper rendering.
 *
 * @param str - String that may contain LaTeX commands
 * @returns String with properly escaped LaTeX commands
 */
export function fixLatexEscaping(str: string): string {
  let result = str;

  // Fix unescaped LaTeX delimiters: \( → \\(, \) → \\), \[ → \\[, \] → \\]
  // But don't double-escape if already escaped (\\( should stay \\()
  result = result.replace(/([^\\])\\([()[\]])/g, '$1\\\\$2');
  result = result.replace(/^\\([()[\]])/g, '\\\\$1');

  // Fix common LaTeX commands that appear unescaped
  // Pattern matches: \command but not \\command
  const latexCommands = [
    'frac', 'sqrt', 'sum', 'int', 'lim', 'sin', 'cos', 'tan', 'log', 'ln',
    'prod', 'alpha', 'beta', 'gamma', 'delta', 'theta', 'pi', 'infty',
    'leq', 'geq', 'neq', 'cdot', 'times', 'pm', 'to', 'partial', 'nabla',
    'mathbf', 'vec', 'hat', 'bar', 'underline', 'overline'
  ];
  const commandPattern = new RegExp(`([^\\\\])\\\\(${latexCommands.join('|')})\\b`, 'g');
  result = result.replace(commandPattern, '$1\\\\\\\\$2');
  const startPattern = new RegExp(`^\\\\(${latexCommands.join('|')})\\b`, 'g');
  result = result.replace(startPattern, '\\\\\\\\$1');

  return result;
}

/**
 * Try to parse JSON with automatic LaTeX escaping fixes
 *
 * This function attempts multiple parsing strategies, including fixing
 * LaTeX escaping issues that commonly occur in AI-generated JSON.
 *
 * @param text - JSON text that may contain LaTeX escaping issues
 * @returns Parsed object or null if parsing fails
 */
export function tryParseJsonWithLatex(text: string): unknown | null {
  const cleaned = text.trim();
  if (!cleaned) return null;

  const segments: string[] = [];

  // Try as-is first
  segments.push(cleaned);

  // Remove markdown code fences
  if (cleaned.startsWith("```")) {
    const withoutFence = cleaned.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    if (withoutFence) segments.push(withoutFence);
  }

  // Extract JSON object (greedy match)
  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objectMatch) segments.push(objectMatch[0]);

  // Try to find JSON after any preamble text
  const jsonStartIndex = cleaned.indexOf('{');
  if (jsonStartIndex > 0) {
    segments.push(cleaned.slice(jsonStartIndex));
  }

  // Add LaTeX-fixed versions
  const fixedCleaned = fixLatexEscaping(cleaned);
  if (fixedCleaned !== cleaned) {
    segments.push(fixedCleaned);
    const fixedObjectMatch = fixedCleaned.match(/\{[\s\S]*\}/);
    if (fixedObjectMatch) segments.push(fixedObjectMatch[0]);
  }

  for (const candidate of segments) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === "string") {
        try {
          return JSON.parse(parsed);
        } catch {
          continue;
        }
      }
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch {
      continue;
    }
  }

  return null;
}
