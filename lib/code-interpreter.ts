/**
 * Code Interpreter Tool Configuration
 *
 * This module provides utilities for integrating Python code execution (code_interpreter)
 * into AI model completions to improve accuracy for mathematical and computational tasks.
 *
 * Supported by Groq's gpt-oss-20b and gpt-oss-120b models.
 *
 * Features:
 * - Auto tool choice with guardrails for speed optimization
 * - Python code execution for accurate math calculations
 * - Token limit adjustments to account for tool calling overhead
 *
 * Response structure includes:
 * - response.choices[0].message.content - Final output
 * - response.choices[0].message.reasoning - Model's reasoning process
 * - response.choices[0].message.executed_tools - Code execution details
 */

/**
 * Configuration options for code interpreter integration
 */
export interface CodeInterpreterConfig {
  /**
   * Whether to enable code interpreter tool
   * @default true
   */
  enabled?: boolean;

  /**
   * Tool choice strategy
   * - "auto": Let the model decide when to use the tool (recommended)
   * - "none": Never use the tool
   * - "required": Always use the tool (not recommended for speed)
   * @default "auto"
   */
  toolChoice?: "auto" | "none" | "required";

  /**
   * Maximum execution time for code interpreter in milliseconds
   * If the code execution exceeds this, we'll use partial results
   * @default 8000 (8 seconds)
   */
  maxExecutionTime?: number;

  /**
   * Additional token allowance for tool calling overhead
   * This is added to the base max_tokens to account for tool use
   * @default 300
   */
  tokenOverhead?: number;
}

/**
 * Default configuration for code interpreter
 */
export const DEFAULT_CODE_INTERPRETER_CONFIG: Required<CodeInterpreterConfig> = {
  enabled: true,
  toolChoice: "auto",
  maxExecutionTime: 8000, // 8 seconds
  tokenOverhead: 300, // 300 extra tokens for tool calling
};

/**
 * Get code interpreter tool parameters for chat completion requests
 *
 * Groq supports code_interpreter for gpt-oss-20b and gpt-oss-120b models.
 * This enables Python code execution for accurate mathematical calculations.
 *
 * Note: Returns Record<string, never> when disabled, otherwise returns an object
 * that should be spread into chat.completions.create() with type assertion.
 * Groq's code_interpreter format differs from OpenAI SDK types.
 *
 * @param config - Optional configuration overrides
 * @returns Object with tools and tool_choice parameters, or empty if disabled
 */
export function getCodeInterpreterParams(
  config: CodeInterpreterConfig = {}
): { tools: Array<{ type: string }>; tool_choice: string } | Record<string, never> {
  const mergedConfig = { ...DEFAULT_CODE_INTERPRETER_CONFIG, ...config };

  if (!mergedConfig.enabled || mergedConfig.toolChoice === "none") {
    return {};
  }

  return {
    tools: [{ type: "code_interpreter" }],
    tool_choice: mergedConfig.toolChoice,
  };
}

/**
 * Adjust token limit to account for code interpreter overhead
 *
 * @param baseTokenLimit - The base token limit without tool calling
 * @param config - Optional configuration overrides
 * @returns Adjusted token limit
 */
export function adjustTokenLimitForCodeInterpreter(
  baseTokenLimit: number,
  config: CodeInterpreterConfig = {}
): number {
  const mergedConfig = { ...DEFAULT_CODE_INTERPRETER_CONFIG, ...config };

  if (!mergedConfig.enabled) {
    return baseTokenLimit;
  }

  return baseTokenLimit + mergedConfig.tokenOverhead;
}

/**
 * Extract code execution results from Groq's executed_tools field
 * This is useful for logging or displaying intermediate computational steps
 *
 * @param executedTools - executed_tools array from Groq response message
 * @returns Array of code execution results
 */
export function extractCodeExecutionResults(
  executedTools: Array<{
    type: string;
    code?: string;
    result?: string;
  }> | undefined
): Array<{ code: string; result: string }> {
  if (!executedTools || executedTools.length === 0) {
    return [];
  }

  return executedTools
    .filter((tool) => tool.type === "code_interpreter")
    .map((tool) => ({
      code: tool.code || "",
      result: tool.result || "",
    }));
}

/**
 * Check if a Groq completion response used the code interpreter tool
 *
 * @param message - Message from the completion response
 * @returns True if code interpreter was used
 */
export function usedCodeInterpreter(
  message: {
    executed_tools?: Array<{ type: string }>;
    reasoning?: string;
  } | undefined
): boolean {
  return (
    message?.executed_tools?.some((tool) => tool.type === "code_interpreter") ||
    false
  );
}

/**
 * Get detailed reasoning and code execution info from Groq response
 *
 * @param message - Message from the completion response
 * @returns Object with reasoning and executed code details
 */
export function getCodeInterpreterDetails(
  message: {
    content?: string;
    reasoning?: string;
    executed_tools?: Array<{
      type: string;
      code?: string;
      result?: string;
    }>;
  } | undefined
): {
  content: string;
  reasoning: string;
  executedCode: Array<{ code: string; result: string }>;
} {
  return {
    content: message?.content || "",
    reasoning: message?.reasoning || "",
    executedCode: extractCodeExecutionResults(message?.executed_tools),
  };
}
