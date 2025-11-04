import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { logUsage } from '@/lib/usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 1 minute for single-page cheap OCR

/**
 * DeepSeek OCR - CHEAP TIER (Low-Detail Processing)
 *
 * This route provides cost-optimized OCR for medium-complexity pages using DeepSeek's
 * low-detail mode with 20x compression (vs. 9x for high-detail).
 *
 * Cost Comparison (per page):
 * - High-detail (9x compression): ~800 tokens/page
 * - Low-detail (20x compression): ~40 tokens/page
 * - Cost reduction: ~95% per page for medium-complexity content
 *
 * Ideal For:
 * - Medium text density pages (no images/tables)
 * - Documents where 90-95% accuracy is acceptable
 * - Batch processing where cost savings are critical
 *
 * Configuration:
 * - Compression Ratio: 20x (low-detail mode)
 * - Accuracy: ~90-95% OCR precision
 * - Vision Tokens: ~40 tokens per page (estimated)
 * - Processing: Single page per request (optimized for speed)
 */

// Initialize DeepInfra client with OpenAI SDK
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
    console.log('[deepseek-ocr-cheap] POST request received');

    // Get user ID from Supabase session
    const authCookie = request.cookies.get('sb-wdoxbjhsiakjzebabpwm-auth-token');
    let userId: string | null = null;

    if (authCookie) {
      try {
        const { data: { user } } = await supabase.auth.getUser(authCookie.value);
        userId = user?.id || null;
        console.log('[deepseek-ocr-cheap] User authenticated:', userId ? 'yes' : 'no');
      } catch (authError) {
        console.log('[deepseek-ocr-cheap] Could not get user from session:', authError instanceof Error ? authError.message : 'Unknown error');
      }
    } else {
      console.log('[deepseek-ocr-cheap] No auth cookie found');
    }

    const ip = request.headers.get('x-forwarded-for') ||
               request.headers.get('x-real-ip') ||
               null;

    console.log('[deepseek-ocr-cheap] Client IP:', ip || 'unknown');

    // Parse request body (expects JSON with single image)
    const body = await request.json();
    const { image, pageNum, detail = 'low' } = body;

    if (!image) {
      return NextResponse.json(
        { error: 'No image provided in request body' },
        { status: 400 }
      );
    }

    console.log('[deepseek-ocr-cheap] Processing page', pageNum || 'unknown', 'with detail level:', detail);

    // Process with DeepSeek OCR in LOW-DETAIL mode
    try {
      const completion = await deepinfra.chat.completions.create({
        model: 'deepseek-ai/DeepSeek-OCR',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '<image>\nExtract all text from this document. Return ONLY the plain text content without any bounding boxes, coordinates, or special formatting markers. Preserve paragraph structure, headings, and lists using clean markdown format.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: image,
                  // LOW DETAIL for 20x compression ratio (90-95% accuracy, ~40 tokens/page)
                  detail: detail as 'low' | 'high',
                },
              },
            ],
          },
        ],
        temperature: 0.0, // Deterministic for OCR accuracy
        max_tokens: 2048, // Lower token limit for cheap tier
      });

      let pageText = completion.choices[0]?.message?.content || '';

      // Clean up bounding box annotations and other OCR artifacts
      pageText = pageText
        .replace(/\w+\[\[\d+,\s*\d+,\s*\d+,\s*\d+\]\]/g, '')
        .replace(/\[\[\d+,\s*\d+,\s*\d+,\s*\d+\]\]/g, '')
        .trim();

      // Track token usage
      const inputTokens = completion.usage?.prompt_tokens || 0;
      const outputTokens = completion.usage?.completion_tokens || 0;

      console.log(
        `[deepseek-ocr-cheap] Page ${pageNum || '?'} complete: ${pageText.length} chars, ${inputTokens} input tokens, ${outputTokens} output tokens`
      );

      // Log usage to Supabase
      if (userId || ip) {
        try {
          await logUsage(
            supabase,
            userId,
            ip,
            'deepseek-ai/DeepSeek-OCR',
            {
              input_tokens: inputTokens,
              output_tokens: outputTokens,
            },
            {
              metadata: {
                route: '/api/upload/parse-cheap',
                provider: 'deepinfra',
                detail_level: detail,
                page_num: pageNum || null,
              },
            }
          );
          console.log('[deepseek-ocr-cheap] Usage logged successfully');
        } catch (logError) {
          console.error('[deepseek-ocr-cheap] Error logging usage:', logError);
          // Don't fail the request if logging fails
        }
      }

      // Return extracted text
      return NextResponse.json({
        success: true,
        text: pageText,
        pageNum: pageNum || null,
        inputTokens,
        outputTokens,
        strategy: 'deepseek-low',
      });
    } catch (ocrError) {
      console.error('[deepseek-ocr-cheap] OCR processing error:', ocrError);
      throw ocrError;
    }
  } catch (error) {
    console.error('[deepseek-ocr-cheap] Error processing request:', error);
    console.error('[deepseek-ocr-cheap] Error stack:', error instanceof Error ? error.stack : 'No stack trace');

    const errorMessage =
      error instanceof Error ? error.message : 'Failed to process image with cheap OCR';

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
