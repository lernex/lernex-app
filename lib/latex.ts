export const TEX_PREAMBLE = `\\documentclass{article}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\begin{document}
`;

export const TEX_POSTAMBLE = `\n\\end{document}\n`;

export interface ParsedQuiz {
  title?: string;
  subject?: string;
  difficulty?: string;
  questions: {
    prompt: string;
    choices: string[];
    correctIndex: number;
    explanation?: string;
  }[];
}

// Barrier that buffers incoming tokens until a full line is available.
// Prevents partial LaTeX commands from leaking to the client.
export class TexLineBarrier {
  private buffer = "";

  push(token: string): string[] {
    this.buffer += token;
    const out: string[] = [];
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) !== -1) {
      out.push(this.buffer.slice(0, idx + 1));
      this.buffer = this.buffer.slice(idx + 1);
    }
    return out;
  }

  flush(): string | null {
    if (this.buffer) {
      const rem = this.buffer;
      this.buffer = "";
      return rem;
    }
    return null;
  }
}

// Build a full .tex document combining lesson content and quiz.
export function buildLessonTex(content: string, quizTex: string): string {
  return (
    TEX_PREAMBLE +
    content.trim() +
    "\n\\bigskip\n" +
    quizTex.trim() +
    TEX_POSTAMBLE
  );
}

// Parse a LaTeX quiz snippet into structured questions and metadata
export function parseQuizTex(tex: string): ParsedQuiz {
  const lines = tex.split("\n");
  const meta: Record<string, string> = {};

  // pull leading comment lines like "% Title: ..."
  while (lines.length && lines[0].startsWith("%")) {
    const line = lines.shift()!;
    const idx = line.indexOf(":");
    if (idx !== -1) {
      const key = line.slice(1, idx).trim().toLowerCase();
      const val = line.slice(idx + 1).trim();
      if (key) meta[key] = val;
    }
  }

  const body = lines.join("\n");

  const questions: ParsedQuiz["questions"] = [];

  const blocks = body.split("\\item ").slice(1);
  for (const block of blocks) {
    const [promptPart, rest1] = block.split("\\begin{enumerate}");
    const prompt = (promptPart || "").trim();
    if (!rest1) continue;

    const [choicesPart, rest2 = ""] = rest1.split("\\end{enumerate}");
    const choices = choicesPart
      .split("\\item ")
      .slice(1)
      .map((c) => c.split("\n")[0].trim());

    let correctIndex = 0;
    let explanation: string | undefined;

    const ansMatch = rest2.match(/\\textbf{Answer:}\s*([A-Z])/);
    if (ansMatch) {
      correctIndex = ansMatch[1].charCodeAt(0) - 65;
    }

    const afterAnswer = rest2.split(/\\textbf{Answer:}[^\\n]*\\n?/)[1];
    if (afterAnswer) {
      const expl = afterAnswer.trim();
      if (expl) explanation = expl;
    }

    questions.push({ prompt, choices, correctIndex, ...(explanation ? { explanation } : {}) });
  }

  return { ...(meta as Partial<ParsedQuiz>), questions };
}