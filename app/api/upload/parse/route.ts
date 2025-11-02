import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { logUsage } from '@/lib/usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for large documents

// Maximum file size: 18MB (same as client limit)
const MAX_FILE_SIZE = 18 * 1024 * 1024;
const MAX_IMAGES = 50; // Maximum number of pages/images to process
const MAX_TOKENS_PER_REQUEST = 4096; // Leave room for input tokens (context is 8192 total)
const PAGES_PER_BATCH = 5; // Process 5 pages at a time to avoid context limits

/**
 * DeepSeek OCR Configuration:
 * - Compression Ratio: 9x (configured via 'high' detail level)
 * - Accuracy: 97% OCR precision at 9x compression
 * - Vision Tokens: ~256-800 tokens per page at high resolution
 * - Context Window: 8192 tokens total (input + output)
 *
 * At 9x compression, text that would take 9 tokens is represented by 1 vision token.
 * A 1024×1024 image uses ~256 vision tokens after compression.
 * The scale 2.5 rendering creates larger images for better OCR accuracy.
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

/**
 * Convert an image file to base64 data URL
 */
async function imageToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const mimeType = file.type || 'image/jpeg';
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Process a batch of images with DeepSeek OCR
 * Uses 9x compression ratio for 97% accuracy
 */
async function processBatchWithDeepSeekOCR(
  images: string[],
  startIndex: number,
  totalImages: number
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  let batchText = '';
  let batchInputTokens = 0;
  let batchOutputTokens = 0;

  console.log(`[deepseek-ocr] Processing batch: images ${startIndex + 1}-${startIndex + images.length}`);

  for (let i = 0; i < images.length; i++) {
    const globalIndex = startIndex + i;
    console.log(`[deepseek-ocr] Processing page ${globalIndex + 1}/${totalImages}`);

    try {
      const completion = await deepinfra.chat.completions.create({
        model: 'deepseek-ai/DeepSeek-OCR',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '<image>\nExtract all text from this document. Return ONLY the plain text content without any bounding boxes, coordinates, or special formatting markers. Preserve paragraph structure, headings, lists, and tables using clean markdown format.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: images[i],
                  // High detail for 9x compression ratio (97% accuracy)
                  detail: 'high',
                },
              },
            ],
          },
        ],
        temperature: 0.0, // Deterministic for OCR accuracy
        max_tokens: MAX_TOKENS_PER_REQUEST, // 4096 to leave room for input
      });

      let pageText = completion.choices[0]?.message?.content || '';

      // Clean up bounding box annotations and other OCR artifacts
      // Remove patterns like: text[[99, 330, 937, 380]], sub_title[[66, 522, 473, 593]]
      pageText = pageText
        .replace(/\w+\[\[\d+,\s*\d+,\s*\d+,\s*\d+\]\]/g, '')
        .replace(/\[\[\d+,\s*\d+,\s*\d+,\s*\d+\]\]/g, '')
        .trim();

      // Only add page headers for multi-page documents
      if (totalImages > 1) {
        batchText += `## Page ${globalIndex + 1}\n\n${pageText}\n\n---\n\n`;
      } else {
        batchText += pageText;
      }

      // Track token usage
      const inputTokens = completion.usage?.prompt_tokens || 0;
      const outputTokens = completion.usage?.completion_tokens || 0;
      batchInputTokens += inputTokens;
      batchOutputTokens += outputTokens;

      console.log(
        `[deepseek-ocr] Page ${globalIndex + 1} complete: ${pageText.length} chars, ${inputTokens} input tokens, ${outputTokens} output tokens`
      );
    } catch (error) {
      console.error(`[deepseek-ocr] Error processing page ${globalIndex + 1}:`, error);
      throw error;
    }
  }

  return { text: batchText, inputTokens: batchInputTokens, outputTokens: batchOutputTokens };
}

/**
 * Process images with DeepSeek OCR in batches
 * Batching prevents exceeding context window limits for large documents
 */
async function processWithDeepSeekOCR(
  images: string[],
  userId: string | null,
  ip: string | null
): Promise<string> {
  let fullText = '';
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  console.log(`[deepseek-ocr] Processing ${images.length} images in batches of ${PAGES_PER_BATCH}`);

  // Process images in batches to avoid context window limits
  for (let i = 0; i < images.length; i += PAGES_PER_BATCH) {
    const batch = images.slice(i, Math.min(i + PAGES_PER_BATCH, images.length));
    const batchNumber = Math.floor(i / PAGES_PER_BATCH) + 1;
    const totalBatches = Math.ceil(images.length / PAGES_PER_BATCH);

    console.log(`[deepseek-ocr] Processing batch ${batchNumber}/${totalBatches} (${batch.length} pages)`);

    try {
      const { text, inputTokens, outputTokens } = await processBatchWithDeepSeekOCR(batch, i, images.length);
      fullText += text;
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;

      console.log(
        `[deepseek-ocr] Batch ${batchNumber}/${totalBatches} complete: ${inputTokens} input tokens, ${outputTokens} output tokens`
      );
    } catch (error) {
      console.error(`[deepseek-ocr] Error processing batch ${batchNumber}:`, error);
      throw error;
    }
  }

  // Log usage to Supabase
  if (userId || ip) {
    try {
      await logUsage(
        supabase,
        userId,
        ip,
        'deepseek-ai/DeepSeek-OCR',
        {
          input_tokens: totalInputTokens,
          output_tokens: totalOutputTokens,
        },
        {
          metadata: {
            route: '/api/upload/parse',
            provider: 'deepinfra',
            num_pages: images.length,
          },
        }
      );
      console.log('[deepseek-ocr] Usage logged successfully');
    } catch (logError) {
      console.error('[deepseek-ocr] Error logging usage:', logError);
      console.error('[deepseek-ocr] Log error stack:', logError instanceof Error ? logError.stack : 'No stack');
      // Don't fail the request if logging fails
    }
  }

  console.log(
    `[deepseek-ocr] Complete! Total: ${totalInputTokens} input tokens, ${totalOutputTokens} output tokens, ${fullText.length} characters extracted`
  );

  console.log('[deepseek-ocr] Returning text, first 100 chars:', fullText.substring(0, 100));
  return fullText;
}

export async function POST(request: NextRequest) {
  try {
    console.log('[deepseek-ocr] POST request received');

    // Get user ID from Supabase session
    const authCookie = request.cookies.get('sb-wdoxbjhsiakjzebabpwm-auth-token');
    let userId: string | null = null;

    if (authCookie) {
      try {
        const { data: { user } } = await supabase.auth.getUser(authCookie.value);
        userId = user?.id || null;
        console.log('[deepseek-ocr] User authenticated:', userId ? 'yes' : 'no');
      } catch (authError) {
        console.log('[deepseek-ocr] Could not get user from session:', authError instanceof Error ? authError.message : 'Unknown error');
      }
    } else {
      console.log('[deepseek-ocr] No auth cookie found');
    }

    const ip = request.headers.get('x-forwarded-for') ||
               request.headers.get('x-real-ip') ||
               null;

    console.log('[deepseek-ocr] Client IP:', ip || 'unknown');

    const contentType = request.headers.get('content-type') || '';
    console.log('[deepseek-ocr] Content-Type:', contentType);

    // Handle two formats: FormData (with file) or JSON (with base64 images array)
    let images: string[] = [];
    let fileName = 'document';
    let fileSize = 0;

    if (contentType.includes('application/json')) {
      console.log('[deepseek-ocr] Processing JSON request');
      // JSON format: array of base64 images (for PDF pages converted client-side)
      const body = await request.json();
      images = body.images || [];
      fileName = body.fileName || 'document';
      fileSize = body.fileSize || 0;

      if (!Array.isArray(images) || images.length === 0) {
        return NextResponse.json(
          { error: 'No images provided in request body' },
          { status: 400 }
        );
      }

      if (images.length > MAX_IMAGES) {
        return NextResponse.json(
          { error: `Too many images. Maximum ${MAX_IMAGES} pages supported.` },
          { status: 400 }
        );
      }

      console.log('[deepseek-ocr] JSON request parsed:', images.length, 'images');
    } else {
      console.log('[deepseek-ocr] Processing FormData request');

      // FormData format: single image file
      const formData = await request.formData();
      const file = formData.get('file') as File;

      if (!file) {
        return NextResponse.json(
          { error: 'No file provided' },
          { status: 400 }
        );
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit` },
          { status: 400 }
        );
      }

      fileName = file.name;
      fileSize = file.size;

      const fileType = file.type.toLowerCase();
      const fileNameLower = file.name.toLowerCase();

      // Only support image files via FormData
      if (
        fileType.startsWith('image/') ||
        fileNameLower.match(/\.(png|jpg|jpeg|webp|gif|bmp)$/i)
      ) {
        const base64Image = await imageToBase64(file);
        images = [base64Image];
      } else {
        return NextResponse.json(
          {
            error: `Unsupported file format: ${fileType}. Please upload an image file or send PDF pages as base64 images via JSON.`,
          },
          { status: 400 }
        );
      }
    }

    console.log('[deepseek-ocr] Parsing:', fileName, 'Size:', fileSize, 'bytes', 'Images:', images.length);

    // Process with DeepSeek OCR
    console.log('[deepseek-ocr] Starting OCR processing...');
    const extractedText = await processWithDeepSeekOCR(images, userId, ip);
    console.log('[deepseek-ocr] OCR processing complete, got text:', extractedText ? 'yes' : 'no', 'length:', extractedText?.length || 0);

    if (!extractedText || extractedText.trim().length === 0) {
      return NextResponse.json(
        { error: 'No text could be extracted from the document' },
        { status: 500 }
      );
    }

    console.log(
      '[deepseek-ocr] Successfully parsed:',
      fileName,
      'Extracted:',
      extractedText.length,
      'characters from',
      images.length,
      'pages'
    );

    // Sanitize extracted text to remove any problematic characters
    // that might cause JSON serialization issues
    let sanitizedText = extractedText;
    try {
      // Remove null bytes and other control characters that might break JSON
      sanitizedText = extractedText.replace(/\0/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
      console.log('[deepseek-ocr] Text sanitized, length after sanitization:', sanitizedText.length);
    } catch (sanitizeError) {
      console.error('[deepseek-ocr] Error sanitizing text:', sanitizeError);
      // Continue with original text if sanitization fails
      sanitizedText = extractedText;
    }

    // Prepare response
    const responseData = {
      success: true,
      text: sanitizedText,
      fileName: fileName,
      fileSize: fileSize,
      numPages: images.length,
    };

    console.log('[deepseek-ocr] Preparing response:', {
      fileName: responseData.fileName,
      textLength: responseData.text.length,
      numPages: responseData.numPages,
    });

    try {
      // Test JSON serialization first
      const testJson = JSON.stringify(responseData);
      console.log('[deepseek-ocr] JSON serialization test successful, size:', testJson.length, 'bytes');
      console.log('[deepseek-ocr] First 200 chars of JSON:', testJson.substring(0, 200));

      // Create response with explicit headers
      const response = NextResponse.json(responseData, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log('[deepseek-ocr] NextResponse created successfully');
      console.log('[deepseek-ocr] Response status:', response.status);
      console.log('[deepseek-ocr] Response headers:', Object.fromEntries(response.headers.entries()));

      return response;
    } catch (serializationError) {
      console.error('[deepseek-ocr] JSON serialization error:', serializationError);
      console.error('[deepseek-ocr] Error details:', serializationError instanceof Error ? serializationError.stack : 'No stack');

      // Return a safe error response
      return NextResponse.json(
        {
          error: 'Failed to serialize response',
          details: serializationError instanceof Error ? serializationError.message : 'Unknown error'
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[deepseek-ocr] Error parsing file:', error);
    console.error('[deepseek-ocr] Error stack:', error instanceof Error ? error.stack : 'No stack trace');

    const errorMessage =
      error instanceof Error ? error.message : 'Failed to parse document';

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
