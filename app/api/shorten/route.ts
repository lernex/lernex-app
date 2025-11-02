import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { logUsage } from '@/lib/usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for large transcripts

/**
 * Audio Content Shortening Service
 *
 * This endpoint takes long-form transcribed text from audio recordings (lectures, meetings, etc.)
 * and intelligently condenses it using DeepInfra's gpt-oss-20b model.
 *
 * Purpose:
 * - Remove filler words, repetitions, and tangential discussions
 * - Extract key concepts, definitions, and important points
 * - Reduce token usage for downstream lesson generation
 * - Maintain educational value while reducing cost
 *
 * Model: deepinfra/gpt-oss-20b
 * - Small, fast, and cost-effective ($0.03 input / $0.14 output per 1M tokens)
 * - Optimized for summarization and content extraction tasks
 *
 * Flow:
 * 1. User uploads audio → Whisper transcribes → THIS endpoint shortens → Lesson generation
 */

// Initialize DeepInfra client
const deepinfra = new OpenAI({
  baseURL: process.env.DEEPINFRA_BASE_URL || 'https://api.deepinfra.com/v1/openai',
  apiKey: process.env.DEEPINFRA_API_KEY || '',
});

// Initialize Supabase client for usage logging
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    console.log('[shorten] POST request received');

    // Get user ID from Supabase session
    const authCookie = request.cookies.get('sb-wdoxbjhsiakjzebabpwm-auth-token');
    let userId: string | null = null;

    if (authCookie) {
      try {
        const { data: { user } } = await supabase.auth.getUser(authCookie.value);
        userId = user?.id || null;
        console.log('[shorten] User authenticated:', userId ? 'yes' : 'no');
      } catch (authError) {
        console.log('[shorten] Could not get user from session:', authError instanceof Error ? authError.message : 'Unknown error');
      }
    } else {
      console.log('[shorten] No auth cookie found');
    }

    const ip = request.headers.get('x-forwarded-for') ||
               request.headers.get('x-real-ip') ||
               null;

    // Parse request body
    const body = await request.json();
    const { text, context } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid text field' },
        { status: 400 }
      );
    }

    console.log('[shorten] Input text length:', text.length, 'characters');

    // If text is already short enough, return as-is
    if (text.length < 1000) {
      console.log('[shorten] Text is short enough, skipping shortening');
      return NextResponse.json({
        success: true,
        shortenedText: text,
        originalLength: text.length,
        shortenedLength: text.length,
        reductionPercent: 0,
      });
    }

    // Construct prompt for intelligent content extraction
    const systemPrompt = `You are an expert educational content extractor. Your task is to condense long-form lecture transcripts and audio recordings into concise, academically valuable summaries.

INSTRUCTIONS:
- Remove filler words, repetitions, tangents, and casual conversation
- Extract key concepts, definitions, important facts, examples, and formulas
- Preserve technical terms, dates, names, and numerical data
- Maintain logical flow and educational coherence
- Keep mathematical notation, equations, and scientific terminology intact
- Retain concrete examples that illustrate concepts
- Remove meta-commentary ("as I mentioned before", "let's move on", etc.)
- Aim for 40-60% reduction while keeping all essential information

OUTPUT FORMAT:
- Return clean, structured text
- Use clear paragraphs
- Preserve any LaTeX math notation
- No markdown headers or formatting unless in original content
- Focus on information density`;

    const userPrompt = context
      ? `Context: ${context}\n\nTranscript to condense:\n\n${text}`
      : `Transcript to condense:\n\n${text}`;

    // Call DeepInfra gpt-oss-20b for shortening
    console.log('[shorten] Calling DeepInfra gpt-oss-20b...');
    const startTime = Date.now();

    const completion = await deepinfra.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      temperature: 0.3, // Low temperature for consistent extraction
      max_tokens: 4096, // Enough for condensed output
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    const shortenedText = completion.choices[0]?.message?.content || '';
    const inputTokens = completion.usage?.prompt_tokens || 0;
    const outputTokens = completion.usage?.completion_tokens || 0;

    console.log('[shorten] Shortening complete:', {
      duration: `${duration}ms`,
      originalLength: text.length,
      shortenedLength: shortenedText.length,
      reductionPercent: Math.round((1 - shortenedText.length / text.length) * 100),
      inputTokens,
      outputTokens,
    });

    // Log usage to Supabase
    if (userId || ip) {
      try {
        await logUsage(
          supabase,
          userId,
          ip,
          'deepinfra/gpt-oss-20b',
          {
            input_tokens: inputTokens,
            output_tokens: outputTokens,
          },
          {
            metadata: {
              route: '/api/shorten',
              provider: 'deepinfra',
              original_length: text.length,
              shortened_length: shortenedText.length,
              reduction_percent: Math.round((1 - shortenedText.length / text.length) * 100),
              duration_ms: duration,
              context_provided: !!context,
            },
          }
        );
        console.log('[shorten] Usage logged successfully');
      } catch (logError) {
        console.error('[shorten] Error logging usage:', logError);
        // Don't fail the request if logging fails
      }
    }

    return NextResponse.json({
      success: true,
      shortenedText,
      originalLength: text.length,
      shortenedLength: shortenedText.length,
      reductionPercent: Math.round((1 - shortenedText.length / text.length) * 100),
      inputTokens,
      outputTokens,
    });

  } catch (error) {
    console.error('[shorten] Error:', error);
    console.error('[shorten] Error stack:', error instanceof Error ? error.stack : 'No stack trace');

    const errorMessage =
      error instanceof Error ? error.message : 'Failed to shorten content';

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
