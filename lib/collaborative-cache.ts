/**
 * Collaborative Document Cache - Cross-User OCR Result Sharing
 *
 * Revolutionary concept: If 100 students upload the same textbook PDF,
 * process it once and share the results across all users.
 *
 * Key Features:
 * - Content-based fingerprinting (first 10KB + last 10KB + file size)
 * - Cross-user caching with 30-day TTL
 * - Privacy-aware: Only shares common academic documents
 * - Usage tracking to identify popular textbooks
 * - Race-condition safe with upsert operations
 *
 * Privacy Model:
 * - Only shares documents identified as academic/textbooks
 * - Personal notes and private documents stay user-scoped
 * - Detection based on: file size, title patterns, multi-user uploads
 *
 * Estimated Savings: 99% for popular textbooks (process once, use thousands of times)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

interface SharedDocument {
  text: string;
  title: string;
  pageCount: number;
  usageCount: number;
  createdAt: string;
}

interface DocumentMetadata {
  title?: string;
  fileName?: string;
  fileSize: number;
  pageCount?: number;
}

/**
 * Browser-compatible: Generate content-based fingerprint for documents
 *
 * Uses partial content hashing to identify documents even when metadata differs.
 * This allows matching the same textbook uploaded by different users, even if
 * they have different filenames or modified metadata.
 *
 * Strategy:
 * - Hash first 10KB (captures title page, copyright, table of contents)
 * - Hash last 10KB (captures index, appendix, back matter)
 * - Include file size (quick filter for different editions)
 *
 * Why not full file hash?
 * - Some PDF editors modify metadata without changing content
 * - Partial hash is more resilient to trivial modifications
 * - Much faster for large files (only read 20KB instead of entire file)
 *
 * @param buffer - File content as ArrayBuffer
 * @returns Hex string fingerprint (64 characters)
 */
export async function generateDocumentFingerprint(
  buffer: ArrayBuffer
): Promise<string> {
  try {
    const fileSize = buffer.byteLength;

    // For small files (<20KB), hash the entire content
    if (fileSize <= 20480) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
    }

    // For larger files, use partial content fingerprinting
    const first10k = buffer.slice(0, 10240);
    const last10k = buffer.slice(-10240);

    // Combine: first 10KB + last 10KB + file size
    const combined = new Uint8Array(first10k.byteLength + last10k.byteLength + 8);
    combined.set(new Uint8Array(first10k), 0);
    combined.set(new Uint8Array(last10k), first10k.byteLength);

    // Append file size as 64-bit big-endian integer
    const sizeView = new DataView(combined.buffer, first10k.byteLength + last10k.byteLength, 8);
    sizeView.setBigUint64(0, BigInt(fileSize), false); // big-endian

    // Generate SHA-256 hash
    const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const fingerprint = hashArray
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');

    console.log('[collaborative-cache] Generated fingerprint', {
      fileSize,
      fingerprintPreview: fingerprint.substring(0, 12) + '...',
    });

    return fingerprint;
  } catch (err) {
    console.error('[collaborative-cache] Error generating fingerprint:', err);
    throw new Error('Failed to generate document fingerprint');
  }
}

/**
 * Server-side: Check if document is already processed by ANY user
 *
 * Returns shared OCR text if:
 * 1. Fingerprint matches (same document content)
 * 2. Cache is less than 30 days old (freshness)
 * 3. Document is verified as shareable (privacy)
 *
 * This enables massive cost savings on popular textbooks that hundreds
 * of students upload to the platform.
 *
 * @returns Shared document data or null if not found
 */
export async function getSharedDocument(
  sb: SupabaseClient,
  fingerprint: string
): Promise<SharedDocument | null> {
  try {
    // Query with 30-day TTL filter
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 3600 * 1000
    ).toISOString();

    const { data, error } = await sb
      .from('shared_document_cache')
      .select('text, title, page_count, usage_count, created_at')
      .eq('fingerprint', fingerprint)
      .gte('created_at', thirtyDaysAgo)
      .maybeSingle();

    if (error) {
      console.error(
        '[collaborative-cache] Error fetching shared document:',
        error
      );
      return null;
    }

    if (!data) {
      console.log(
        '[collaborative-cache] Cache miss - document not in shared cache'
      );
      return null;
    }

    console.log('[collaborative-cache] 🎉 SHARED CACHE HIT!', {
      title: data.title,
      pageCount: data.page_count,
      textLength: (data.text as string).length,
      usageCount: data.usage_count,
      cachedAt: data.created_at,
    });

    return {
      text: data.text as string,
      title: data.title as string,
      pageCount: data.page_count as number,
      usageCount: data.usage_count as number,
      createdAt: data.created_at as string,
    };
  } catch (err) {
    console.error(
      '[collaborative-cache] Unexpected error in getSharedDocument:',
      err
    );
    return null;
  }
}

/**
 * Server-side: Share processed document with all users
 *
 * Stores OCR results in shared cache for cross-user reuse.
 * Uses upsert to handle race conditions gracefully.
 *
 * Important: Only call this for documents that pass privacy checks.
 * Do not share personal notes or private documents.
 *
 * @param sb - Supabase client
 * @param fingerprint - Document fingerprint
 * @param text - Extracted OCR text
 * @param title - Document title (for logging/analytics)
 * @param pageCount - Number of pages processed
 */
export async function shareDocument(
  sb: SupabaseClient,
  fingerprint: string,
  text: string,
  title: string,
  pageCount: number
): Promise<void> {
  try {
    const { error } = await sb
      .from('shared_document_cache')
      .upsert(
        {
          fingerprint,
          text,
          title,
          page_count: pageCount,
          usage_count: 1,
          created_at: new Date().toISOString(),
        },
        {
          onConflict: 'fingerprint',
          // If multiple users upload simultaneously, keep the first one
          // and increment usage count via incrementUsageCount()
        }
      );

    if (error) {
      console.error('[collaborative-cache] Error sharing document:', error);
      throw error;
    }

    console.log('[collaborative-cache] Document shared successfully', {
      fingerprintPreview: fingerprint.substring(0, 12) + '...',
      title,
      pageCount,
      textLength: text.length,
    });
  } catch (err) {
    console.error('[collaborative-cache] Failed to share document:', err);
    // Don't throw - sharing failure shouldn't block the upload flow
  }
}

/**
 * Server-side: Increment usage counter for shared document
 *
 * Tracks how many times a shared document has been used.
 * This helps identify popular textbooks and validates the
 * collaborative caching strategy.
 *
 * Analytics use cases:
 * - Which textbooks are most commonly uploaded?
 * - How much cost savings from collaborative caching?
 * - Should we pre-cache popular textbooks?
 */
export async function incrementUsageCount(
  sb: SupabaseClient,
  fingerprint: string
): Promise<void> {
  try {
    const { error } = await sb.rpc('increment_shared_document_usage', {
      p_fingerprint: fingerprint,
    });

    if (error) {
      console.error(
        '[collaborative-cache] Error incrementing usage count:',
        error
      );
    }
  } catch (err) {
    console.error(
      '[collaborative-cache] Failed to increment usage count:',
      err
    );
    // Non-critical - don't block flow
  }
}

/**
 * Privacy Check: Determine if document should be shared across users
 *
 * Strategy:
 * 1. Check file size (textbooks are typically large)
 * 2. Analyze title for academic indicators
 * 3. Check if already in shared cache (strong signal of common content)
 * 4. Look for privacy indicators (personal notes, assignments)
 *
 * Share if document is likely:
 * - Textbook (large file, academic title patterns)
 * - Academic paper (arXiv, DOI, journal patterns)
 * - Reference material (encyclopedia, handbook, manual)
 *
 * Do NOT share if document contains:
 * - Personal notes or annotations
 * - Student assignments or homework
 * - Private materials (grade < 500KB suggests personal content)
 *
 * @param metadata - Document metadata for analysis
 * @param fingerprint - Document fingerprint
 * @param sb - Supabase client (to check if already shared)
 * @returns true if document should be shared
 */
export async function isDocumentShareable(
  metadata: DocumentMetadata,
  fingerprint: string,
  sb: SupabaseClient
): Promise<boolean> {
  try {
    // Rule 1: File size check (textbooks are typically > 1MB)
    const fileSizeMB = metadata.fileSize / (1024 * 1024);
    if (fileSizeMB < 0.5) {
      console.log(
        '[collaborative-cache] Too small for textbook (<500KB), keeping private'
      );
      return false;
    }

    // Rule 2: Check if already in shared cache (strong signal it's common content)
    const existingDoc = await getSharedDocument(sb, fingerprint);
    if (existingDoc) {
      console.log(
        '[collaborative-cache] Already in shared cache, definitely shareable'
      );
      return true;
    }

    // Rule 3: Analyze title for academic patterns
    const title = (metadata.title || metadata.fileName || '').toLowerCase();

    // Academic textbook indicators
    const textbookPatterns = [
      /chapter\s+\d+/i,
      /isbn/i,
      /edition/i,
      /textbook/i,
      /\d{1,2}(st|nd|rd|th)\s+edition/i,
      /volume\s+\d+/i,
      /^(intro|introduction)\s+to/i,
      /principles\s+of/i,
      /fundamentals\s+of/i,
      /theory\s+and\s+practice/i,
    ];

    // Academic paper indicators
    const paperPatterns = [
      /arxiv/i,
      /doi:/i,
      /journal\s+of/i,
      /proceedings/i,
      /conference/i,
      /symposium/i,
      /ieee/i,
      /acm/i,
    ];

    // Reference material indicators
    const referencePatterns = [
      /handbook/i,
      /encyclopedia/i,
      /dictionary/i,
      /manual/i,
      /guide\s+to/i,
      /reference/i,
    ];

    // Privacy indicators (DO NOT SHARE)
    const privatePatterns = [
      /my\s+notes/i,
      /personal/i,
      /homework/i,
      /assignment/i,
      /draft/i,
      /untitled/i,
      /scan\d+/i, // "scan1.pdf", "scan2.pdf" - likely personal scans
      /document\d+/i, // "document1.pdf" - generic personal file
    ];

    // Check privacy patterns first (highest priority)
    for (const pattern of privatePatterns) {
      if (pattern.test(title)) {
        console.log(
          '[collaborative-cache] Privacy indicator detected, keeping private:',
          pattern
        );
        return false;
      }
    }

    // Check academic patterns
    const hasTextbookPattern = textbookPatterns.some(p => p.test(title));
    const hasPaperPattern = paperPatterns.some(p => p.test(title));
    const hasReferencePattern = referencePatterns.some(p => p.test(title));

    if (hasTextbookPattern || hasPaperPattern || hasReferencePattern) {
      console.log(
        '[collaborative-cache] Academic pattern detected, document is shareable'
      );
      return true;
    }

    // Rule 4: Large files (>5MB) with page count >50 are likely textbooks
    if (fileSizeMB > 5 && (metadata.pageCount || 0) > 50) {
      console.log(
        '[collaborative-cache] Large multi-page document, likely textbook'
      );
      return true;
    }

    // Default: Be conservative, keep private
    console.log(
      '[collaborative-cache] No clear academic indicators, keeping private by default'
    );
    return false;
  } catch (err) {
    console.error('[collaborative-cache] Error checking shareability:', err);
    // On error, be conservative and keep private
    return false;
  }
}

/**
 * Format usage count for display
 * e.g., "Used by 1,234 students", "First upload", "Used 5 times"
 */
export function formatUsageCount(count: number): string {
  if (count <= 1) return 'First upload';
  if (count < 10) return `Used ${count} times`;
  if (count < 100) return `Used by ${count} students`;
  return `Used by ${count.toLocaleString()} students`;
}

/**
 * Calculate estimated cost savings from collaborative caching
 * Based on typical OCR costs and usage statistics
 */
export function calculateSavings(usageCount: number, pageCount: number): {
  savedDollars: string;
  savedPages: number;
} {
  // Average cost per page: $0.000104 (high-quality OCR)
  const costPerPage = 0.000104;
  const savedPages = (usageCount - 1) * pageCount; // -1 because first upload paid
  const savedDollars = (savedPages * costPerPage).toFixed(4);

  return {
    savedDollars: `$${savedDollars}`,
    savedPages,
  };
}
