import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Maximum file size: 18MB (same as client limit)
const MAX_FILE_SIZE = 18 * 1024 * 1024;

// LlamaParse API endpoint
const LLAMAPARSE_API_URL = 'https://api.cloud.llamaindex.ai/api/parsing/upload';

export async function POST(request: NextRequest) {
  try {
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

    console.log('[llamaparse] Parsing file:', file.name, 'Size:', file.size, 'bytes');

    // Create FormData for LlamaParse API
    const apiFormData = new FormData();
    apiFormData.append('file', file);

    // Send to LlamaParse API with agentic mode
    const response = await fetch(LLAMAPARSE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': process.env.LLAMAPARSE_API_KEY || '',
      },
      body: apiFormData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error('[llamaparse] API error:', errorText);
      throw new Error(`LlamaParse API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    // Get the job ID from the response
    const jobId = result.id;

    if (!jobId) {
      throw new Error('No job ID returned from LlamaParse');
    }

    console.log('[llamaparse] Job created:', jobId);

    // Poll for results (LlamaParse is async)
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds max wait
    let extractedText = '';

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second

      const resultResponse = await fetch(
        `https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}/result/markdown`,
        {
          headers: {
            'Authorization': process.env.LLAMAPARSE_API_KEY || '',
          },
        }
      );

      if (resultResponse.ok) {
        extractedText = await resultResponse.text();
        break;
      } else if (resultResponse.status === 404) {
        // Job still processing
        attempts++;
        continue;
      } else {
        const errorText = await resultResponse.text().catch(() => 'Unknown error');
        throw new Error(`Failed to get results: ${resultResponse.status} - ${errorText}`);
      }
    }

    if (!extractedText) {
      throw new Error('Parsing timeout - document took too long to process');
    }

    console.log('[llamaparse] Successfully parsed:', file.name, 'Extracted:', extractedText.length, 'characters');

    return NextResponse.json({
      success: true,
      text: extractedText,
      fileName: file.name,
      fileSize: file.size,
    });

  } catch (error) {
    console.error('[llamaparse] Error parsing file:', error);

    const errorMessage = error instanceof Error
      ? error.message
      : 'Failed to parse document';

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
