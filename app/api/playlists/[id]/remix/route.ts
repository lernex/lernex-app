import { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { createModelClient, fetchUserTier } from "@/lib/model-config";
import { logUsage } from "@/lib/usage";
import { getCodeInterpreterParams, adjustTokenLimitForCodeInterpreter } from "@/lib/code-interpreter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Token-optimized lesson summary for efficient AI processing
type LessonSummary = {
  subject: string;
  topic: string;
  difficulty: "intro" | "easy" | "medium" | "hard";
  concepts: string[]; // Key concepts extracted from content
  questionTypes: string[]; // Types of questions (e.g., "multiple choice", "problem solving")
};

// Extract key concepts from lesson content using advanced NLP heuristics
function extractConcepts(content: string, title: string, maxConcepts = 3): string[] {
  // Split into sentences and clean
  const sentences = content
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 15 && s.length < 200); // Filter out too short/long

  // Multi-factor scoring algorithm
  const scoreSentence = (sentence: string, index: number): number => {
    let score = 0;
    const lower = sentence.toLowerCase();

    // 1. Academic keywords (high value)
    const academicKeywords = [
      'theorem', 'formula', 'law', 'principle', 'concept', 'definition',
      'equation', 'rule', 'property', 'method', 'theory', 'model',
      'hypothesis', 'postulate', 'axiom', 'corollary', 'lemma'
    ];
    score += academicKeywords.filter(k => lower.includes(k)).length * 3;

    // 2. Explanatory phrases (medium value)
    const explanatory = [
      'this means', 'in other words', 'for example', 'specifically',
      'that is', 'such as', 'which means', 'defined as', 'refers to'
    ];
    score += explanatory.filter(p => lower.includes(p)).length * 2;

    // 3. Numeric/mathematical content (high value for STEM)
    if (/\d+/.test(sentence) || /[=+\-*/^()]/.test(sentence)) {
      score += 2;
    }

    // 4. Title overlap (concepts mentioned in title are key)
    const titleWords = title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    score += titleWords.filter(w => lower.includes(w)).length * 2;

    // 5. Position bonus (earlier sentences often introduce key concepts)
    if (index < 3) score += 1;

    // 6. Length sweet spot (not too short, not too long)
    const wordCount = sentence.split(/\s+/).length;
    if (wordCount >= 8 && wordCount <= 20) score += 1;

    // 7. Contains capitalized terms (proper nouns, important concepts)
    const capitalizedTerms = sentence.match(/[A-Z][a-z]+/g) || [];
    score += Math.min(capitalizedTerms.length, 3);

    return score;
  };

  // Score all sentences
  const scored = sentences.map((text, index) => ({
    text,
    score: scoreSentence(text, index)
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Take top concepts and compress intelligently
  return scored
    .slice(0, maxConcepts)
    .map(s => {
      // Compress while preserving meaning
      let compressed = s.text;

      // Remove filler words
      compressed = compressed.replace(/\b(very|really|actually|basically|simply|just|quite|rather)\b/gi, '');

      // Compact whitespace
      compressed = compressed.replace(/\s+/g, ' ').trim();

      // Truncate if still too long, but preserve complete thought
      if (compressed.length > 120) {
        const truncated = compressed.substring(0, 120);
        const lastSpace = truncated.lastIndexOf(' ');
        compressed = lastSpace > 80 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
      }

      return compressed;
    })
    .filter(s => s.length > 20);
}

// Compress playlist lessons to minimize tokens
function compressPlaylistLessons(lessons: Array<{
  subject: string;
  topic: string;
  title: string;
  content: string;
  difficulty: string | null;
  questions: unknown;
}>): LessonSummary[] {
  const summaries: LessonSummary[] = [];

  for (const lesson of lessons) {
    const concepts = extractConcepts(lesson.content, lesson.title, 3);

    // Determine question types from questions array
    const questionTypes: string[] = [];
    if (Array.isArray(lesson.questions) && lesson.questions.length > 0) {
      const hasMultipleChoice = lesson.questions.some((q: { choices?: unknown }) =>
        Array.isArray(q.choices) && q.choices.length > 0
      );
      if (hasMultipleChoice) questionTypes.push("multiple-choice");
    }

    summaries.push({
      subject: lesson.subject,
      topic: lesson.topic || "General",
      difficulty: (lesson.difficulty as "intro" | "easy" | "medium" | "hard") || "medium",
      concepts,
      questionTypes: questionTypes.length > 0 ? questionTypes : ["conceptual"],
    });
  }

  return summaries;
}

// Analyze summaries to extract common patterns
function analyzePlaylistPatterns(summaries: LessonSummary[]): {
  subjects: string[];
  topics: string[];
  difficultyRange: string[];
  conceptThemes: string[];
} {
  const subjects = [...new Set(summaries.map(s => s.subject))];
  const topics = [...new Set(summaries.map(s => s.topic))];
  const difficulties = [...new Set(summaries.map(s => s.difficulty))];

  // Extract common concept themes (words that appear in multiple lessons)
  const conceptWords = new Map<string, number>();
  summaries.forEach(s => {
    s.concepts.forEach(concept => {
      const words = concept.toLowerCase().split(/\s+/).filter(w => w.length > 4);
      words.forEach(word => {
        conceptWords.set(word, (conceptWords.get(word) || 0) + 1);
      });
    });
  });

  // Get words that appear in at least 2 lessons
  const conceptThemes = Array.from(conceptWords.entries())
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);

  return {
    subjects,
    topics,
    difficultyRange: difficulties,
    conceptThemes,
  };
}

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" }
    });
  }

  const playlistId = params.id;
  const url = new URL(req.url);
  const count = Math.min(Math.max(parseInt(url.searchParams.get("count") || "10"), 1), 20);

  console.log("[remix] Starting remix generation", { playlistId, count, userId: user.id });

  // Declare these outside try block for error logging
  let modelIdentifier = 'unknown';
  let provider: 'groq' | 'deepinfra' | 'cerebras' | 'lightningai' | 'fireworksai' = 'groq';
  let userTier: 'free' | 'plus' | 'premium' = 'free';

  try {
    // 1. Get playlist and verify access
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: playlist, error: playlistError } = await (sb as any)
      .from("playlists")
      .select("id, user_id, name")
      .eq("id", playlistId)
      .maybeSingle();

    if (playlistError) throw playlistError;
    if (!playlist) {
      return new Response(JSON.stringify({ error: "Playlist not found" }), {
        status: 404,
        headers: { "content-type": "application/json" }
      });
    }

    // Check access (owner or member)
    const isOwner = playlist.user_id === user.id;
    if (!isOwner) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: membership } = await (sb as any)
        .from("playlist_memberships")
        .select("role")
        .eq("playlist_id", playlistId)
        .eq("profile_id", user.id)
        .maybeSingle();

      if (!membership) {
        return new Response(JSON.stringify({ error: "Access denied" }), {
          status: 403,
          headers: { "content-type": "application/json" }
        });
      }
    }

    // 2. Get playlist items
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: items, error: itemsError } = await (sb as any)
      .from("playlist_items")
      .select("lesson_id")
      .eq("playlist_id", playlistId)
      .order("position", { ascending: true });

    if (itemsError) throw itemsError;
    if (!items || items.length === 0) {
      return new Response(JSON.stringify({
        error: "Playlist has no lessons. Add some lessons first."
      }), {
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }

    const lessonIds = (items as Array<{ lesson_id: string }>).map(item => item.lesson_id);

    // 3. Get lesson data from saved_lessons
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: savedLessons, error: lessonsError } = await (sb as any)
      .from("saved_lessons")
      .select("lesson_id, subject, topic, title, content, difficulty, questions")
      .eq("user_id", user.id)
      .in("lesson_id", lessonIds);

    if (lessonsError) throw lessonsError;
    if (!savedLessons || savedLessons.length === 0) {
      return new Response(JSON.stringify({
        error: "No saved lesson data found"
      }), {
        status: 404,
        headers: { "content-type": "application/json" }
      });
    }

    console.log("[remix] Found lessons to analyze", { count: savedLessons.length });

    // 4. Compress lessons to minimize tokens
    const summaries = compressPlaylistLessons(savedLessons);
    const patterns = analyzePlaylistPatterns(summaries);

    console.log("[remix] Analyzed patterns", patterns);

    // 5. Get user tier for model selection
    userTier = await fetchUserTier(sb, user.id);

    // 6. Generate remix lessons using OpenAI with token-optimized prompt
    const modelClient = createModelClient(userTier, "fast"); // Use fast for reliable generation
    const openai = modelClient.client;
    const modelName = modelClient.model;
    modelIdentifier = modelClient.modelIdentifier;
    provider = modelClient.provider;

    const systemPrompt = `You are an expert educational content generator. Your task is to create ${count} new lessons that follow similar patterns to an existing playlist, but with fresh content and variations.

PLAYLIST ANALYSIS:
- Subjects: ${patterns.subjects.join(", ")}
- Topics: ${patterns.topics.join(", ")}
- Difficulty Range: ${patterns.difficultyRange.join(", ")}
- Common Themes: ${patterns.conceptThemes.join(", ")}

SAMPLE LESSONS (compressed for efficiency):
${summaries.slice(0, 3).map((s, i) => `
${i + 1}. ${s.subject} - ${s.topic} (${s.difficulty})
   Key Concepts: ${s.concepts.join(" | ")}
`).join("")}

INSTRUCTIONS:
1. Generate ${count} NEW lessons that maintain similar subject matter, difficulty, and conceptual depth
2. Each lesson should be DIFFERENT from the originals but follow similar patterns
3. Mix up the topics and concepts while staying in the same subject areas
4. Include exactly 3 multiple-choice questions per lesson (4 choices each)
5. Content should be 80-105 words (max 900 chars)

CRITICAL: You MUST respond with ONLY a valid JSON object with a "lessons" array. No markdown, no code blocks, just pure JSON.

FORMAT:
{
  "lessons": [
    {
      "id": "unique-slug-id",
      "subject": "subject name",
      "topic": "specific topic",
      "title": "engaging lesson title (3-7 words)",
      "content": "detailed explanation (80-105 words, max 900 chars)",
      "difficulty": "intro|easy|medium|hard",
      "questions": [
        {
          "prompt": "question text",
          "choices": ["option A", "option B", "option C", "option D"],
          "correctIndex": 0,
          "explanation": "why correct (max 15 words)"
        }
      ]
    }
  ]
}`;

    console.log("[remix] Calling OpenAI API...");

    // Adjust token limits for code_interpreter tool overhead (+300 tokens)
    const baseMaxTokens = 16000;
    const maxTokens = adjustTokenLimitForCodeInterpreter(baseMaxTokens);

    // Get code interpreter params for accurate content generation
    const codeInterpreterParams = getCodeInterpreterParams({
      enabled: true,
      toolChoice: "auto", // May help with math/science content accuracy
      maxExecutionTime: 8000,
      tokenOverhead: 300, // Already accounted for in maxTokens
    });

    const completion = await openai.chat.completions.create({
      model: modelName,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: "Generate the remix lessons as a JSON array. Output ONLY the JSON array, nothing else."
        }
      ],
      temperature: 0.8, // Higher temperature for creative variations
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(codeInterpreterParams as any), // Add code_interpreter tool
    });

    const responseText = completion.choices[0]?.message?.content || "";

    console.log("[remix] Received response from API");

    // Parse JSON response
    let lessons;
    try {
      const parsed = JSON.parse(responseText);
      // Handle both direct array and object with lessons key
      lessons = Array.isArray(parsed) ? parsed : (parsed.lessons || []);
    } catch (parseError) {
      console.error("[remix] Failed to parse JSON:", parseError);
      // Try to extract JSON array from text
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error("Failed to parse AI response as JSON");
      }
      lessons = JSON.parse(jsonMatch[0]);
    }

    if (!Array.isArray(lessons) || lessons.length === 0) {
      throw new Error("No lessons generated");
    }

    console.log("[remix] Successfully generated lessons", { count: lessons.length });

    // Log API usage for cost tracking
    const usage = completion?.usage;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
    if (usage && (user.id || ip)) {
      try {
        await logUsage(sb, user.id, ip, modelIdentifier, {
          input_tokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
          output_tokens: typeof usage.completion_tokens === "number" ? usage.completion_tokens : null,
        }, {
          metadata: {
            route: "playlist-remix",
            playlistId,
            lessonsGenerated: lessons.length,
            provider,
            tier: userTier
          },
        });
        console.log('[remix] Usage logged successfully');
      } catch (logError) {
        console.error('[remix] Failed to log usage:', logError);
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      lessons,
      playlistName: playlist.name,
      tokensUsed: completion.usage?.prompt_tokens || null,
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });

  } catch (error) {
    console.error("[remix] Failed", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Log failed attempt for cost tracking
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
    if (user.id || ip) {
      try {
        await logUsage(sb, user.id, ip, modelIdentifier, {
          input_tokens: null,
          output_tokens: null,
        }, {
          metadata: {
            route: "playlist-remix",
            error: errorMessage,
            errorType: error instanceof Error ? error.name : typeof error,
            provider,
            tier: userTier
          },
        });
        console.log('[remix] Error usage logged');
      } catch (logError) {
        console.error('[remix] Failed to log error usage:', logError);
      }
    }

    return new Response(JSON.stringify({
      error: "Failed to generate remix lessons",
      details: errorMessage
    }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
}
