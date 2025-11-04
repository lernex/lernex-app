/**
 * Document Cache - Hash-Based Deduplication System
 *
 * Prevents users from paying for duplicate document uploads by caching
 * OCR results using SHA-256 file hashes.
 *
 * Key Features:
 * - Browser-compatible file hashing using Web Crypto API
 * - 7-day cache TTL for freshness
 * - User-scoped caching for privacy
 * - Automatic cleanup via database policies
 *
 * Estimated Savings: 100% on duplicate uploads
 */

import type { SupabaseClient } from '@supabase/supabase-js';

interface CachedDocument {
  text: string;
  pageCount: number;
  extractedAt: string;
}

/**
 * Server-side: Fetch cached document from Supabase
 *
 * Returns cached OCR text if:
 * 1. Hash matches exactly (same file content)
 * 2. Cache is less than 7 days old
 * 3. User owns the cache entry (privacy)
 */
export async function getCachedDocument(
  sb: SupabaseClient,
  userId: string,
  fileHash: string
): Promise<CachedDocument | null> {
  try {
    // Query with 7-day TTL filter
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    const { data, error } = await sb
      .from('document_cache')
      .select('text, page_count, extracted_at')
      .eq('user_id', userId)
      .eq('file_hash', fileHash)
      .gte('extracted_at', sevenDaysAgo)
      .maybeSingle();

    if (error) {
      console.error('[document-cache] Error fetching cached document:', error);
      return null;
    }

    if (!data) {
      console.log('[document-cache] Cache miss - no cached document found');
      return null;
    }

    console.log('[document-cache] Cache hit!', {
      pageCount: data.page_count,
      textLength: (data.text as string).length,
      cachedAt: data.extracted_at,
    });

    return {
      text: data.text as string,
      pageCount: data.page_count as number,
      extractedAt: data.extracted_at as string,
    };
  } catch (err) {
    console.error('[document-cache] Unexpected error in getCachedDocument:', err);
    return null;
  }
}

/**
 * Server-side: Cache document OCR result
 *
 * Uses upsert to handle race conditions (multiple uploads of same file)
 */
export async function cacheDocument(
  sb: SupabaseClient,
  userId: string,
  fileHash: string,
  text: string,
  pageCount: number
): Promise<void> {
  try {
    const { error } = await sb
      .from('document_cache')
      .upsert({
        user_id: userId,
        file_hash: fileHash,
        text,
        page_count: pageCount,
        extracted_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,file_hash',
        // Update existing cache if re-uploading same file
      });

    if (error) {
      console.error('[document-cache] Error caching document:', error);
      throw error;
    }

    console.log('[document-cache] Document cached successfully', {
      fileHash: fileHash.substring(0, 12) + '...',
      pageCount,
      textLength: text.length,
    });
  } catch (err) {
    console.error('[document-cache] Failed to cache document:', err);
    // Don't throw - caching failure shouldn't block the upload flow
  }
}

/**
 * Browser-compatible: Generate SHA-256 hash for file content
 *
 * Uses Web Crypto API (SubtleCrypto) for browser compatibility.
 * Creates deterministic hash - same file always produces same hash.
 *
 * @param buffer - File content as ArrayBuffer
 * @returns Hex string hash (64 characters)
 */
export async function hashFile(buffer: ArrayBuffer): Promise<string> {
  try {
    // Use SubtleCrypto (Web Crypto API) for browser compatibility
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);

    // Convert ArrayBuffer to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');

    return hashHex;
  } catch (err) {
    console.error('[document-cache] Error hashing file:', err);
    throw new Error('Failed to generate file hash');
  }
}

/**
 * Format relative time for cache hit logging
 * e.g., "2 hours ago", "3 days ago"
 */
export function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}
