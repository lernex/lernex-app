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
 * Process images with DeepSeek OCR
 */
async function processWithDeepSeekOCR(
  images: string[],
  userId: string | null,
  ip: string | null
): Promise<string> {
  let fullText = '';
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  console.log(`[deepseek-ocr] Processing ${images.length} images`);

  for (let i = 0; i < images.length; i++) {
    console.log(`[deepseek-ocr] Processing image ${i + 1}/${images.length}`);

    try {
      const completion = await deepinfra.chat.completions.create({
        model: 'deepseek-ai/DeepSeek-OCR',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '<image>\n<|grounding|>Convert the document to markdown. Extract all text, headings, lists, tables, and formulas. Preserve the structure and formatting.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: images[i],
                  detail: 'high', // High detail for compression ratio 8-9x (high accuracy)
                },
              },
            ],
          },
        ],
        temperature: 0.0, // Deterministic for OCR accuracy
        max_tokens: 8192,
      });

      const pageText = completion.choices[0]?.message?.content || '';

      // Add page separator if there are multiple pages
      if (images.length > 1) {
        fullText += `## Page ${i + 1}\n\n${pageText}\n\n---\n\n`;
      } else {
        fullText += pageText;
      }

      // Track token usage
      const inputTokens = completion.usage?.prompt_tokens || 0;
      const outputTokens = completion.usage?.completion_tokens || 0;
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;

      console.log(
        `[deepseek-ocr] Page ${i + 1} complete: ${pageText.length} chars, ${inputTokens} input tokens, ${outputTokens} output tokens`
      );
    } catch (error) {
      console.error(`[deepseek-ocr] Error processing image ${i + 1}:`, error);
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
    } catch (logError) {
      console.error('[deepseek-ocr] Error logging usage:', logError);
      // Don't fail the request if logging fails
    }
  }

  console.log(
    `[deepseek-ocr] Complete! Total: ${totalInputTokens} input tokens, ${totalOutputTokens} output tokens, ${fullText.length} characters extracted`
  );

  return fullText;
}

export async function POST(request: NextRequest) {
  try {
    // Get user ID from Supabase session
    const authCookie = request.cookies.get('sb-wdoxbjhsiakjzebabpwm-auth-token');
    let userId: string | null = null;

    if (authCookie) {
      try {
        const { data: { user } } = await supabase.auth.getUser(authCookie.value);
        userId = user?.id || null;
      } catch (error) {
        console.log('[deepseek-ocr] Could not get user from session');
      }
    }

    const ip = request.headers.get('x-forwarded-for') ||
               request.headers.get('x-real-ip') ||
               null;

    const contentType = request.headers.get('content-type') || '';

    // Handle two formats: FormData (with file) or JSON (with base64 images array)
    let images: string[] = [];
    let fileName = 'document';
    let fileSize = 0;

    if (contentType.includes('application/json')) {
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
    } else {
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
    const extractedText = await processWithDeepSeekOCR(images, userId, ip);

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

    return NextResponse.json({
      success: true,
      text: extractedText,
      fileName: fileName,
      fileSize: fileSize,
      numPages: images.length,
    });
  } catch (error) {
    console.error('[deepseek-ocr] Error parsing file:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Failed to parse document';

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
