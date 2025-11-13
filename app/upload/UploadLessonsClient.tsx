"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Mic,
  NotebookPen,
  Sparkles,
  UploadCloud,
  Wand2,
} from "lucide-react";
import LessonCard from "@/components/LessonCard";
import QuizBlock from "@/components/QuizBlock";
import WelcomeTourOverlay from "@/components/WelcomeTourOverlay";
import { ProfileBasicsProvider } from "@/app/providers/ProfileBasicsProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useLernexStore } from "@/lib/store";
import type { Lesson } from "@/types";
import type { ProfileBasics } from "@/lib/profile-basics";
import { useUsageLimitCheck } from "@/lib/hooks/useUsageLimitCheck";
import UsageLimitModal from "@/components/UsageLimitModal";
// PERFORMANCE OPTIMIZATION: These imports are lightweight function definitions
// The heavy libraries (PDF.js, Tesseract) are dynamically imported inside these functions
import { convertPdfToImages, convertImageToBase64, convertPdfToCanvases } from "@/lib/pdf-to-images";
import { smartOCR, calculateCostSavings } from "@/lib/smart-ocr";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { getCachedDocument, cacheDocument, hashFile, timeAgo } from "@/lib/document-cache";
import {
  generateDocumentFingerprint,
  getSharedDocument,
  shareDocument,
  incrementUsageCount,
  isDocumentShareable,
  formatUsageCount,
} from "@/lib/collaborative-cache";
import { processDocument } from "@/lib/upload-router";
import type { PipelineConfig } from "@/lib/pipeline-types";
import { startBackgroundPreload, subscribeToLibraryStatus, getLibraryStatus } from "@/lib/library-preloader";
import { tryParseJsonWithLatex } from "@/lib/latex-utils";

type UploadLessonsClientProps = {
  initialProfile?: ProfileBasics | null;
};

type Stage = "idle" | "parsing" | "chunking" | "generating" | "complete" | "error";

type SourcePreview = {
  name: string;
  sizeLabel: string;
};

type PendingLesson = Lesson & {
  sourceIndex: number;
};

const MAX_FILE_SIZE_BYTES = 18 * 1024 * 1024;
const MAX_AUDIO_FILE_SIZE_BYTES = 250 * 1024 * 1024; // 250MB for audio - supports ~2 hours at high quality
const MAX_TEXT_LENGTH = 24_000;
const MIN_CHARS_REQUIRED = 220;

// OPTIMIZED INCREMENTAL LEARNING: Plan-first progressive lesson generation
// Uses lesson planning API to create structured lessons, not arbitrary chunks
const MAX_INCREMENTAL_LESSONS = 6; // Maximum lessons to generate incrementally
const ENABLE_INCREMENTAL_LEARNING = true; // Feature flag for plan-first incremental learning

// Process audio files with Whisper transcription + AI shortening
async function parseAudioFile(file: File): Promise<string> {
  if (file.size > MAX_AUDIO_FILE_SIZE_BYTES) {
    throw new Error(`"${file.name}" exceeds ${(MAX_AUDIO_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB audio limit.`);
  }

  // Step 1: Transcribe audio with Whisper
  // Whisper supports multiple formats: flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm
  console.log('[audio] Step 1/2: Transcribing audio with Whisper...');
  const formData = new FormData();
  formData.append('audio', file);

  // Estimate duration based on file size (rough estimate: 1MB ≈ 1 minute for compressed audio)
  const estimatedDuration = Math.round((file.size / (1024 * 1024)) * 60);
  formData.append('duration', estimatedDuration.toString());

  const transcribeResponse = await fetch('/api/transcribe', {
    method: 'POST',
    body: formData,
  });

  if (!transcribeResponse.ok) {
    const error = await transcribeResponse.json().catch(() => ({ error: 'Transcription failed' }));
    throw new Error(error.error || 'Failed to transcribe audio');
  }

  const transcribeResult = await transcribeResponse.json();
  const fullTranscript = transcribeResult.text || '';
  console.log('[audio] Transcription complete:', fullTranscript.length, 'characters');

  // Step 2: Shorten the transcript using gpt-oss-20b
  // This removes filler words, repetitions, and extracts key educational content
  console.log('[audio] Step 2/2: Condensing transcript with AI...');
  const shortenResponse = await fetch('/api/shorten', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: fullTranscript,
      context: `Audio lecture recording from file: ${file.name}`,
    }),
  });

  if (!shortenResponse.ok) {
    // If shortening fails, use original transcript as fallback
    console.warn('[audio] Shortening failed, using original transcript');
    return fullTranscript;
  }

  const shortenResult = await shortenResponse.json();
  const shortenedText = shortenResult.shortenedText || fullTranscript;

  console.log('[audio] Content condensed:', {
    original: shortenResult.originalLength,
    shortened: shortenResult.shortenedLength,
    reduction: `${shortenResult.reductionPercent}%`,
  });

  return shortenedText;
}

async function parseFileWithDeepSeekOCR(file: File): Promise<{ text: string; pipelineConfig?: PipelineConfig }> {
  const fileType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();

  // Check if it's an audio file first
  if (
    fileType.startsWith('audio/') ||
    fileName.match(/\.(mp3|wav|m4a|ogg|webm|flac|aac|wma)$/i)
  ) {
    console.log('[audio] Processing audio file...');
    const text = await parseAudioFile(file);
    return { text };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`"${file.name}" is larger than ${(MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB.`);
  }

  // MULTI-TIER CACHING: Collaborative cache (cross-user) + User cache
  // 1. Generate both fingerprint (collaborative) and hash (user-scoped)
  let fileHash: string | null = null;
  let fingerprint: string | null = null;
  let userId: string | null = null;
  const fileBuffer = await file.arrayBuffer();

  try {
    const supabase = supabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id || null;

    if (userId) {
      console.log('[cache] Generating file hashes for deduplication...');

      // Generate both hashes in parallel for efficiency
      [fileHash, fingerprint] = await Promise.all([
        hashFile(fileBuffer),
        generateDocumentFingerprint(fileBuffer),
      ]);

      console.log('[cache] File hash (user):', fileHash.substring(0, 16) + '...');
      console.log('[cache] Fingerprint (shared):', fingerprint.substring(0, 16) + '...');

      // 2. FIRST: Check collaborative cache (cross-user sharing)
      console.log('[collaborative-cache] Checking shared document cache...');
      const sharedDoc = await getSharedDocument(supabase, fingerprint);
      if (sharedDoc) {
        console.log(`[collaborative-cache] 🎉 SHARED CACHE HIT!`);
        console.log(`[collaborative-cache] └─ Document: "${sharedDoc.title}"`);
        console.log(`[collaborative-cache] └─ Pages: ${sharedDoc.pageCount}`);
        console.log(`[collaborative-cache] └─ ${formatUsageCount(sharedDoc.usageCount)}`);
        console.log(`[collaborative-cache] └─ Cached: ${timeAgo(sharedDoc.createdAt)}`);
        console.log('[collaborative-cache] ✅ Saved 100% of OCR cost via collaborative caching!');

        // Increment usage count (fire-and-forget, don't block)
        incrementUsageCount(supabase, fingerprint).catch(err =>
          console.warn('[collaborative-cache] Failed to increment usage count:', err)
        );

        return { text: sharedDoc.text };
      }
      console.log('[collaborative-cache] Not in shared cache');

      // 3. SECOND: Check user-scoped cache (personal duplicate uploads)
      console.log('[cache] Checking personal document cache...');
      const cached = await getCachedDocument(supabase, userId, fileHash);
      if (cached) {
        console.log(`[cache-hit] ✅ Using cached OCR result (${cached.pageCount} pages, saved from ${timeAgo(cached.extractedAt)})`);
        console.log('[cache-hit] Saved 100% of OCR processing cost!');
        return { text: cached.text };
      }

      console.log('[cache-miss] No cached result found in either cache, proceeding with OCR...');
    }
  } catch (cacheError) {
    console.warn('[cache] Cache check failed, proceeding with OCR:', cacheError);
    // Don't block processing if cache check fails
  }

  // Check if it's a PDF - Use HYBRID OCR for cost savings
  if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
    console.log('[hybrid-ocr] Converting PDF to canvases for smart OCR analysis...');
    const canvases = await convertPdfToCanvases(file);
    const numPages = canvases.length;

    // MULTI-TIER PROCESSING PIPELINE: Analyze document and select optimal processing strategy
    let pipelineConfig: PipelineConfig | null = null;
    let qualityOverride: 'cheap' | 'premium' | 'premium-pipeline' | undefined;

    try {
      // Get user tier for pipeline routing
      const supabase = supabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      let userTier: 'free' | 'plus' | 'premium' = 'free';

      if (user?.id) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('subscription_tier')
            .eq('id', user.id)
            .maybeSingle();

          if (profile) {
            const tier = (profile as { subscription_tier?: string | null }).subscription_tier?.toLowerCase();
            if (tier === 'premium') userTier = 'premium';
            else if (tier === 'plus') userTier = 'plus';
          }
        } catch (error) {
          console.warn('[multi-tier-pipeline] Failed to fetch user tier:', error);
          // Continue with default 'free' tier
        }
      }

      // Analyze document and get pipeline configuration
      pipelineConfig = await processDocument(file, userTier);

      // Determine quality override based on pipeline tier
      if (pipelineConfig.tier === 'premium' && pipelineConfig.ocr.imageCompressionQuality >= 0.95) {
        qualityOverride = 'premium-pipeline'; // Use 5-6x compression for maximum quality
      } else if (pipelineConfig.tier === 'fast') {
        qualityOverride = undefined; // Let smartOCR use default routing (will favor free/cheap)
      }

      console.log(`[multi-tier-pipeline] 📊 Document Analysis Complete:`);
      console.log(`[multi-tier-pipeline] └─ Selected: ${pipelineConfig.tier.toUpperCase()} pipeline`);
      console.log(`[multi-tier-pipeline] └─ Reason: ${pipelineConfig.routingReason}`);
      console.log(`[multi-tier-pipeline] └─ Estimated Cost: $${pipelineConfig.estimatedCost.total.toFixed(4)}`);
      console.log(`[multi-tier-pipeline] └─ Estimated Time: ${pipelineConfig.estimatedTime.total}s`);
    } catch (routerError) {
      console.warn('[multi-tier-pipeline] Router failed, using default hybrid OCR:', routerError);
      // Continue with default behavior if router fails
    }

    console.log(`[hybrid-ocr] Processing ${numPages} pages with hybrid OCR strategy...`);

    const allText: string[] = [];
    let totalCost = 0;
    const strategyStats = { cheap: 0, premium: 0, 'premium-pipeline': 0, skipped: 0 };
    const skipStats = { blank: 0, duplicate: 0 };
    const pageHashes = new Set<string>(); // Track page hashes for duplicate detection

    // Process each page with smart OCR (enhanced with pipeline quality override)
    for (let pageIdx = 0; pageIdx < canvases.length; pageIdx++) {
      const canvas = canvases[pageIdx];
      const pageNum = pageIdx + 1;

      try {
        console.log(`[hybrid-ocr] Processing page ${pageNum}/${numPages}...`);
        const { text, strategy, cost, skipped, skipReason } = await smartOCR(
          canvas,
          pageNum,
          numPages,
          pageHashes,
          qualityOverride // Pass quality override from pipeline config
        );

        // Only add text if page wasn't skipped
        if (!skipped) {
          allText.push(text);
        }

        totalCost += cost;

        // Track strategy usage
        if (strategy === 'skipped') {
          strategyStats.skipped++;
          if (skipReason === 'blank') {
            skipStats.blank++;
          } else if (skipReason === 'duplicate') {
            skipStats.duplicate++;
          }
        } else if (strategy === 'deepseek-low') {
          strategyStats.cheap++;
        } else if (strategy.includes('pipeline')) {
          strategyStats['premium-pipeline']++;
        } else {
          strategyStats.premium++;
        }

        console.log(`[hybrid-ocr] Page ${pageNum}/${numPages} complete: ${strategy} (${cost} tokens)`);
      } catch (pageError) {
        console.error(`[hybrid-ocr] Error processing page ${pageNum}:`, pageError);
        throw new Error(`Failed to process page ${pageNum}: ${pageError instanceof Error ? pageError.message : 'Unknown error'}`);
      }
    }

    // Calculate cost savings
    const processedPages = numPages - strategyStats.skipped;
    const savings = calculateCostSavings(processedPages, totalCost);

    console.log(`[hybrid-ocr] ✅ Processing complete!`);
    console.log(`[hybrid-ocr] Pages processed: ${processedPages}/${numPages} (skipped ${strategyStats.skipped}: ${skipStats.blank} blank, ${skipStats.duplicate} duplicate)`);
    console.log(`[hybrid-ocr] Strategy breakdown: ${strategyStats.cheap} cheap, ${strategyStats.premium} premium, ${strategyStats['premium-pipeline']} premium-pipeline`);
    console.log(`[hybrid-ocr] Total cost: ${totalCost} tokens (baseline: ${savings.baselineCost} tokens)`);
    console.log(`[hybrid-ocr] Savings: ${savings.savingsTokens} tokens (${savings.savingsPercent.toFixed(1)}%) = $${savings.savingsDollars.toFixed(4)}`);

    // Log pipeline performance if router was used
    if (pipelineConfig) {
      const actualCostUSD = (totalCost / 1000) * 0.00013; // Convert tokens to USD (DeepSeek pricing)
      const costAccuracy = pipelineConfig.estimatedCost.total > 0
        ? ((1 - Math.abs(actualCostUSD - pipelineConfig.estimatedCost.total) / pipelineConfig.estimatedCost.total) * 100).toFixed(1)
        : 'N/A';
      console.log(`[multi-tier-pipeline] 📈 Pipeline Performance:`);
      console.log(`[multi-tier-pipeline] └─ Estimated: $${pipelineConfig.estimatedCost.total.toFixed(4)}, Actual: $${actualCostUSD.toFixed(4)} (${costAccuracy}% accuracy)`);
      console.log(`[multi-tier-pipeline] └─ Pipeline: ${pipelineConfig.tier.toUpperCase()}`);
    }

    // Combine all page text
    const combinedText = allText.join('\n\n---\n\n');

    // 3. Cache the result for future uploads (both user-scoped and collaborative)
    if (userId && fileHash && fingerprint && combinedText) {
      try {
        const supabase = supabaseBrowser();

        // Always cache to user-scoped cache
        await cacheDocument(supabase, userId, fileHash, combinedText, numPages);
        console.log('[cache] ✅ Document cached to personal cache');

        // Check if document should be shared via collaborative cache
        const metadata = {
          title: file.name.replace(/\.(pdf|PDF)$/, ''),
          fileName: file.name,
          fileSize: file.size,
          pageCount: numPages,
        };

        const shareable = await isDocumentShareable(metadata, fingerprint, supabase);

        if (shareable) {
          console.log('[collaborative-cache] Document is shareable (academic/textbook), adding to shared cache...');
          await shareDocument(
            supabase,
            fingerprint,
            combinedText,
            metadata.title,
            numPages
          );
          console.log('[collaborative-cache] ✅ Document shared! Future students uploading this textbook will benefit.');
        } else {
          console.log('[collaborative-cache] Document is private, keeping user-scoped only');
        }
      } catch (cacheError) {
        console.warn('[cache] Failed to cache document:', cacheError);
        // Don't block the flow if caching fails
      }
    }

    return { text: combinedText, pipelineConfig: pipelineConfig || undefined };
  }
  // Check if it's an image - Use smart OCR for single images too
  else if (fileType.startsWith('image/') || fileName.match(/\.(png|jpg|jpeg|webp|gif|bmp)$/i)) {
    console.log('[hybrid-ocr] Processing single image with smart OCR...');

    // Create canvas from image
    const base64 = await convertImageToBase64(file);
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = base64;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }
    ctx.drawImage(img, 0, 0);

    // Process with smart OCR
    const { text, strategy, cost } = await smartOCR(canvas, 1, 1);
    console.log(`[hybrid-ocr] Image processed: ${strategy} (${cost} tokens)`);

    // 3. Cache the result for future uploads (both user-scoped and collaborative)
    if (userId && fileHash && fingerprint && text) {
      try {
        const supabase = supabaseBrowser();

        // Always cache to user-scoped cache
        await cacheDocument(supabase, userId, fileHash, text, 1);
        console.log('[cache] ✅ Image cached to personal cache');

        // Check if image should be shared via collaborative cache
        // Note: Most images are probably personal notes/screenshots, so shareability will be low
        const metadata = {
          title: file.name.replace(/\.(png|jpg|jpeg|webp|gif|bmp|PNG|JPG|JPEG|WEBP|GIF|BMP)$/i, ''),
          fileName: file.name,
          fileSize: file.size,
          pageCount: 1,
        };

        const shareable = await isDocumentShareable(metadata, fingerprint, supabase);

        if (shareable) {
          console.log('[collaborative-cache] Image is shareable, adding to shared cache...');
          await shareDocument(
            supabase,
            fingerprint,
            text,
            metadata.title,
            1
          );
          console.log('[collaborative-cache] ✅ Image shared!');
        } else {
          console.log('[collaborative-cache] Image is private, keeping user-scoped only');
        }
      } catch (cacheError) {
        console.warn('[cache] Failed to cache document:', cacheError);
        // Don't block the flow if caching fails
      }
    }

    return { text };
  }
  // For other file types (DOCX, PPTX, etc.), send as FormData to premium API
  else {
    console.log('[deepseek-ocr] Uploading file for server-side processing...');
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/upload/parse', {
      method: 'POST',
      body: formData,
    });

    console.log('[deepseek-ocr] FormData response received:', {
      status: response.status,
      ok: response.ok,
    });

    if (!response.ok) {
      console.error('[deepseek-ocr] FormData response not OK');
      const error = await response.json().catch((parseError) => {
        console.error('[deepseek-ocr] Failed to parse error response:', parseError);
        return { error: `Server returned ${response.status}: ${response.statusText}` };
      });
      throw new Error(error.error || 'Failed to parse file');
    }

    console.log('[deepseek-ocr] Parsing FormData response...');
    const result = await response.json();
    console.log('[deepseek-ocr] FormData result parsed successfully');

    const extractedText = result.text || '';
    const pageCount = result.numPages || 1;

    // 3. Cache the result for future uploads
    if (userId && fileHash && extractedText) {
      try {
        const supabase = supabaseBrowser();
        await cacheDocument(supabase, userId, fileHash, extractedText, pageCount);
        console.log('[cache] ✅ Document cached successfully for future uploads');
      } catch (cacheError) {
        console.warn('[cache] Failed to cache document:', cacheError);
        // Don't block the flow if caching fails
      }
    }

    return { text: extractedText };
  }
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = -1;
  do {
    size /= 1024;
    unitIndex += 1;
  } while (size >= 1024 && unitIndex < units.length - 1);
  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

function normalizeWhitespace(raw: string): string {
  return raw.replace(/\r/g, "\n").replace(/\t/g, " ").replace(/\u00a0/g, " ").replace(/[ ]{2,}/g, " ").trim();
}

function chunkTextPassages(text: string): string[] {
  const clean = normalizeWhitespace(text);
  if (!clean) return [];

  // Determine number of chunks based on content length
  // Short content (< 1000 chars): 2-3 lessons
  // Medium content (1000-3000 chars): 3-5 lessons
  // Long content (> 3000 chars): 5-6 lessons
  let targetChunks = 3;
  const textLength = clean.length;

  if (textLength < 1000) {
    targetChunks = Math.max(2, Math.min(3, Math.ceil(textLength / 400)));
  } else if (textLength < 3000) {
    targetChunks = Math.max(3, Math.min(5, Math.ceil(textLength / 700)));
  } else {
    targetChunks = Math.max(5, Math.min(6, Math.ceil(textLength / 900)));
  }

  const maxCharsPerChunk = Math.ceil(textLength / targetChunks);

  const paragraphs = clean
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    const trimmed = current.trim();
    if (trimmed.length >= MIN_CHARS_REQUIRED) {
      chunks.push(trimmed);
    }
    current = "";
  };

  for (const paragraph of paragraphs) {
    if (!current) {
      current = paragraph;
      continue;
    }
    const combinedLength = current.length + 2 + paragraph.length;
    if (combinedLength > maxCharsPerChunk * 0.95 && current.length >= MIN_CHARS_REQUIRED) {
      pushCurrent();
      current = paragraph;
    } else {
      current = `${current}\n\n${paragraph}`;
    }
    if (chunks.length >= targetChunks) break;
  }

  if (current && chunks.length < targetChunks) {
    pushCurrent();
  }

  if (chunks.length === 0 && clean.length >= MIN_CHARS_REQUIRED) {
    return [clean];
  }

  return chunks;
}

function deriveInsights(chunks: string[]): string[] {
  if (!chunks.length) return [];
  const highlights = new Set<string>();
  for (const chunk of chunks) {
    const sentences = chunk
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.replace(/\s+/g, " ").trim())
      .filter((sentence) => sentence.length > 0 && sentence.length < 160);
    for (const sentence of sentences.slice(0, 2)) {
      if (highlights.size >= 4) break;
      highlights.add(sentence);
    }
    if (highlights.size >= 4) break;
  }
  return Array.from(highlights);
}

function ensureSubjectLabel(label: string | undefined): string {
  const trimmed = (label ?? "").trim();
  if (trimmed.length === 0) return "General Studies";
  if (trimmed.length <= 1) return trimmed.toUpperCase();
  return trimmed
    .split(/\s+/)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

export default function UploadLessonsClient({ initialProfile }: UploadLessonsClientProps) {
  // ========================================
  // PERFORMANCE MONITORING
  // ========================================
  const componentMountTime = useRef(performance.now());
  const firstRenderTime = useRef<number | null>(null);

  // Log component initialization
  useEffect(() => {
    const mountDuration = performance.now() - componentMountTime.current;
    console.log(`[PERF] UploadLessonsClient mounted in ${mountDuration.toFixed(0)}ms`);

    // Track first render (when DOM is painted)
    requestAnimationFrame(() => {
      if (!firstRenderTime.current) {
        firstRenderTime.current = performance.now();
        const renderDuration = firstRenderTime.current - componentMountTime.current;
        console.log(`[PERF] UploadLessonsClient first render in ${renderDuration.toFixed(0)}ms`);

        // Log overall page load performance
        if (performance.getEntriesByType) {
          const navTiming = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
          if (navTiming) {
            console.log(`[PERF] Page load metrics:`, {
              domContentLoaded: `${(navTiming.domContentLoadedEventEnd - navTiming.domContentLoadedEventStart).toFixed(0)}ms`,
              totalPageLoad: `${(navTiming.loadEventEnd - navTiming.fetchStart).toFixed(0)}ms`,
              domInteractive: `${(navTiming.domInteractive - navTiming.fetchStart).toFixed(0)}ms`,
            });
          }
        }
      }
    });
  }, []);

  const { selectedSubjects } = useLernexStore();
  const preferredSubject = useMemo(() => {
    // Default to "Auto" for even distribution across content
    if (selectedSubjects.length > 0) {
      const label = ensureSubjectLabel(selectedSubjects[0]);
      // Skip overly broad subjects
      if (!["Math", "Science", "Computer Science"].includes(label)) {
        return label;
      }
    }
    if (initialProfile?.interests?.length) {
      const label = ensureSubjectLabel(initialProfile.interests[0]);
      // Skip overly broad subjects
      if (!["Math", "Science", "Computer Science"].includes(label)) {
        return label;
      }
    }
    return "Auto";
  }, [initialProfile?.interests, selectedSubjects]);

  const [subject, setSubject] = useState(() => preferredSubject);
  const [stage, setStage] = useState<Stage>("idle");
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [sourcePreview, setSourcePreview] = useState<SourcePreview[]>([]);
  const [insights, setInsights] = useState<string[]>([]);
  const [lessons, setLessons] = useState<PendingLesson[]>([]);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [pipelineConfig, setPipelineConfig] = useState<PipelineConfig | null>(null);
  const [librariesReady, setLibrariesReady] = useState(false);
  const [librariesLoading, setLibrariesLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const statusUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Usage limit check hook
  const { checkLimit, isModalOpen, closeModal, limitData } = useUsageLimitCheck();

  useEffect(() => {
    setSubject(preferredSubject);
  }, [preferredSubject]);

  // ========================================
  // SMART LIBRARY PRELOADING
  // ========================================
  // Start background preload of heavy libraries during idle time
  // This ensures libraries are ready when user uploads, with 0 wait time
  useEffect(() => {
    console.log('[library-preloader] Initiating smart background preload strategy...');

    // Subscribe to library status updates (debounced to prevent flickering)
    const unsubscribe = subscribeToLibraryStatus(() => {
      // Debounce status updates to prevent rapid re-renders (flickering)
      if (statusUpdateTimerRef.current) {
        clearTimeout(statusUpdateTimerRef.current);
      }

      statusUpdateTimerRef.current = setTimeout(() => {
        const status = getLibraryStatus();
        const newReady = status.criticalReady;
        const newLoading = status.pdfjs.status === 'loading';

        // Only update if values actually changed (prevent unnecessary re-renders)
        setLibrariesReady(prev => prev !== newReady ? newReady : prev);
        setLibrariesLoading(prev => prev !== newLoading ? newLoading : prev);

        // Log progress
        if (status.allReady) {
          console.log('[library-preloader] 🎉 All libraries ready! Upload will be instant.');
        }
      }, 100); // 100ms debounce
    });

    // Start preloading in background (during idle time)
    // This is idempotent and safe to call multiple times
    startBackgroundPreload();

    return () => {
      unsubscribe();
      if (statusUpdateTimerRef.current) {
        clearTimeout(statusUpdateTimerRef.current);
      }
    };
  }, []);

  // Helper function to generate quick lessons from first 3 pages
  const generateQuickLessons = useCallback(async (quickText: string, hasMorePages: boolean, totalPages: number) => {
    console.log('[progressive] Generating quick lessons from first 3 pages...');
    setStage("chunking");
    setStatusDetail("Creating quick lesson plan from first 3 pages…");
    setProgress(15);

    // Create a quick lesson plan (targeting 1-2 lessons for speed)
    type LessonPlanWithSection = {
      id: string;
      title: string;
      description: string;
      estimatedLength: number;
      textSection?: { start: number; end: number };
    };
    let quickPlans: LessonPlanWithSection[] = [];
    try {
      const planResponse = await fetch("/api/upload/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: quickText,
          subject,
          returnSections: true, // NEW: Request text sections for optimization
        }),
      });

      if (!planResponse.ok) {
        throw new Error('Quick planning failed');
      }

      const planData = await planResponse.json();
      quickPlans = (planData.lessons || []).slice(0, 2); // Take only first 2 lessons for quick display

      console.log('[progressive] Quick lesson plan created:', {
        totalLessons: quickPlans.length,
        subject: planData.subject
      });

      if (planData.subject && planData.subject !== subject) {
        setSubject(planData.subject);
      }
    } catch (err) {
      console.error('[progressive] Quick planning failed, falling back to standard flow:', err);
      return; // Fall back to standard processing
    }

    if (!quickPlans.length) {
      console.warn('[progressive] No quick plans generated, falling back to standard flow');
      return;
    }

    // Generate quick lessons
    setStage("generating");
    setStatusDetail(hasMorePages
      ? `Generating ${quickPlans.length} preview lessons (${totalPages - 3} more pages processing in background)…`
      : `Generating ${quickPlans.length} lessons from your content…`);
    setProgress(22);

    const quickLessons: PendingLesson[] = [];

    try {
      for (let index = 0; index < quickPlans.length; index += 1) {
        const plan = quickPlans[index];
        setStatusDetail(hasMorePages
          ? `Generating quick lesson ${index + 1} of ${quickPlans.length} (more coming from remaining pages)…`
          : `Generating lesson ${index + 1} of ${quickPlans.length}…`);
        setProgress(22 + Math.round((index / quickPlans.length) * 18));

        // OPTIMIZATION: Extract only the relevant text section for this lesson (95% token savings)
        const relevantText = plan.textSection
          ? quickText.slice(plan.textSection.start, plan.textSection.end)
          : quickText;

        console.log(`[progressive] Lesson ${index + 1} text optimization:`, {
          original: quickText.length,
          relevant: relevantText.length,
          savings: plan.textSection ? `${(100 - (relevantText.length / quickText.length) * 100).toFixed(1)}%` : 'N/A'
        });

        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text: relevantText, // OPTIMIZED: Send only relevant excerpt instead of full text
            subject,
            lessonPlan: {
              title: plan.title,
              description: plan.description,
            },
            isOptimizedExcerpt: !!plan.textSection, // Skip semantic compression for pre-extracted sections
            pipelineConfig, // OPTIMIZED: Use pipeline config from upload router for optimal processing
          }),
        });

        if (!response.ok) {
          console.error(`[progressive] Quick lesson ${index + 1} generation failed`);
          continue; // Skip this lesson but continue with others
        }

        const responseText = await response.text();
        let jsonText = responseText.trim();
        if (jsonText.startsWith('```json')) {
          jsonText = jsonText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        } else if (jsonText.startsWith('```')) {
          jsonText = jsonText.replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
        }

        const payload = JSON.parse(jsonText) as Lesson;
        quickLessons.push({
          ...payload,
          id: payload.id ?? plan.id ?? crypto.randomUUID(),
          sourceIndex: 0,
        });
      }
    } catch (err) {
      console.error('[progressive] Quick lesson generation failed:', err);
      return; // Fall back to standard processing
    }

    if (quickLessons.length > 0) {
      console.log(`[progressive] ✨ Quick lessons ready! Showing ${quickLessons.length} lessons to user`);
      setLessons(quickLessons);
      setInsights(quickPlans.map(p => p.title));
      setProgress(40);

      // If there are no more pages, we're done
      if (!hasMorePages) {
        setStage("complete");
        setStatusDetail(null);
        setProgress(100);
      }
    }
  }, [subject]);

  // KaTeX renders synchronously during component render, so no manual typesetting needed

  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
    },
    [],
  );

  const resetState = useCallback(() => {
    setStage("idle");
    setStatusDetail(null);
    setProgress(0);
    setError(null);
    setSourcePreview([]);
    setInsights([]);
    setLessons([]);
    setTextPreview(null);
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  const handleBrowse = useCallback(() => {
    if (stage === "generating") return;
    fileInputRef.current?.click();
  }, [stage]);

  // OPTIMIZED INCREMENTAL LEARNING: Plan-First Progressive Generation
  // This creates a lesson plan first, then generates lessons progressively as pages are processed
  const processFilesIncrementalLearning = useCallback(async (file: File) => {
    console.log('[incremental] Starting optimized plan-first incremental learning flow...');

    const fileType = file.type.toLowerCase();
    const fileName = file.name.toLowerCase();

    // Only applicable for PDFs
    if (!(fileType === 'application/pdf' || fileName.endsWith('.pdf'))) {
      console.log('[incremental] Not a PDF, falling back to standard flow');
      return null;
    }

    try {
      setStage("parsing");
      setStatusDetail("Processing initial pages for lesson planning...");
      setProgress(5);

      // Create abort controller for cancellation support
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Convert PDF to canvases
      const canvases = await convertPdfToCanvases(file);
      if (canvases.length === 0) return null;

      const totalPages = canvases.length;
      console.log(`[incremental] Processing ${totalPages} pages with plan-first incremental learning`);

      // Import smartOCR for processing
      const { smartOCR } = await import('@/lib/smart-ocr');

      // PHASE 1: Extract text from first 3-5 pages for quick planning
      const planningPageCount = Math.min(5, totalPages);
      let planningText = '';
      const pageHashes = new Set<string>();

      setStatusDetail(`Analyzing first ${planningPageCount} pages for lesson planning...`);

      for (let pageIdx = 0; pageIdx < planningPageCount; pageIdx++) {
        const canvas = canvases[pageIdx];
        const pageNum = pageIdx + 1;

        const pageProgress = Math.round((pageIdx / planningPageCount) * 10);
        setProgress(5 + pageProgress);

        console.log(`[incremental] Extracting text from page ${pageNum} for planning...`);
        const { text, skipped } = await smartOCR(canvas, pageNum, totalPages, pageHashes);

        if (!skipped && text.trim().length > 0) {
          planningText += text + '\n\n';
        }
      }

      // Check if we have enough text for planning
      if (planningText.trim().length < MIN_CHARS_REQUIRED) {
        console.log('[incremental] Insufficient text for planning, falling back to standard flow');
        return null;
      }

      console.log(`[incremental] Extracted ${planningText.length} chars from ${planningPageCount} pages for planning`);

      // PHASE 2: Create lesson plan from initial content
      setStatusDetail("Creating structured lesson plan...");
      setProgress(15);

      type LessonPlanWithSection = {
        id: string;
        title: string;
        description: string;
        estimatedLength: number;
        textSection?: { start: number; end: number };
      };

      let lessonPlans: LessonPlanWithSection[] = [];

      try {
        console.log('[incremental] Calling planning API...');
        const planResponse = await fetch("/api/upload/plan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text: planningText,
            subject,
            returnSections: true,
          }),
          signal: controller.signal,
        });

        if (!planResponse.ok) {
          throw new Error('Planning API failed');
        }

        const planData = await planResponse.json();
        lessonPlans = planData.lessons || [];

        console.log('[incremental] Lesson plan created:', {
          totalLessons: lessonPlans.length,
          subject: planData.subject
        });

        // Update subject if planning determined a better one
        if (planData.subject && planData.subject !== subject) {
          setSubject(planData.subject);
        }
      } catch (planError) {
        console.error('[incremental] Planning failed:', planError);
        console.log('[incremental] Falling back to standard flow');
        return null;
      }

      if (lessonPlans.length === 0) {
        console.log('[incremental] No lessons in plan, falling back to standard flow');
        return null;
      }

      // Update insights with lesson titles
      setInsights(lessonPlans.slice(0, 4).map(p => p.title));

      // PHASE 3: Generate lessons progressively based on the plan
      // Limit to MAX_INCREMENTAL_LESSONS to match the original behavior
      const lessonsToGenerate = lessonPlans.slice(0, MAX_INCREMENTAL_LESSONS);
      const generatedLessons: PendingLesson[] = [];
      let allPageText = planningText;

      setStatusDetail("Generating first lesson...");
      setProgress(20);

      // Generate lessons one by one, showing them immediately
      for (let lessonIdx = 0; lessonIdx < lessonsToGenerate.length; lessonIdx++) {
        const plan = lessonsToGenerate[lessonIdx];

        // Check if we need more pages for this lesson
        // If the lesson's text section is beyond what we've extracted, process more pages
        const needMoreText = plan.textSection && plan.textSection.end > allPageText.length;

        if (needMoreText && pageHashes.size < totalPages) {
          // Process additional pages until we have enough text
          const pagesNeeded = Math.min(
            Math.ceil((plan.textSection!.end - allPageText.length) / 500) + 2, // Estimate pages needed
            totalPages - pageHashes.size
          );

          setStatusDetail(`Loading content for lesson ${lessonIdx + 1}...`);

          for (let i = 0; i < pagesNeeded && pageHashes.size < totalPages; i++) {
            const pageIdx = pageHashes.size; // Next unprocessed page
            if (pageIdx >= totalPages) break;

            const canvas = canvases[pageIdx];
            const pageNum = pageIdx + 1;

            console.log(`[incremental] Processing page ${pageNum} for lesson ${lessonIdx + 1}...`);
            const { text, skipped } = await smartOCR(canvas, pageNum, totalPages, pageHashes);

            if (!skipped && text.trim().length > 0) {
              allPageText += text + '\n\n';
            }
          }
        }

        // Calculate progress for this lesson
        const lessonProgress = 20 + Math.round((lessonIdx / lessonsToGenerate.length) * 75);
        setProgress(lessonProgress);
        setStatusDetail(`Generating lesson ${lessonIdx + 1} of ${lessonsToGenerate.length}: ${plan.title}...`);

        console.log(`[incremental] Generating lesson ${lessonIdx + 1}/${lessonsToGenerate.length}: ${plan.title}...`);

        // Extract relevant text for this lesson
        const relevantText = plan.textSection
          ? allPageText.slice(plan.textSection.start, Math.min(plan.textSection.end, allPageText.length))
          : allPageText.slice(0, Math.min(1000, allPageText.length)); // Fallback to first 1000 chars

        console.log(`[incremental] Text optimization for lesson ${lessonIdx + 1}:`, {
          total: allPageText.length,
          relevant: relevantText.length,
          savings: plan.textSection ? `${(100 - (relevantText.length / allPageText.length) * 100).toFixed(1)}%` : 'N/A'
        });

        try {
          // Generate lesson using the plan context
          const response = await fetch("/api/generate", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              text: relevantText,
              subject,
              lessonPlan: {
                title: plan.title,
                description: plan.description,
              },
              isOptimizedExcerpt: !!plan.textSection, // Skip semantic compression for pre-extracted sections
              pipelineConfig, // OPTIMIZED: Use pipeline config from upload router for optimal processing
            }),
            signal: controller.signal,
          });

          if (!response.ok) {
            console.error(`[incremental] Lesson ${lessonIdx + 1} generation failed:`, response.status);
            // Continue to next lesson instead of breaking
            continue;
          }

          const responseText = await response.text();
          let jsonText = responseText.trim();

          // Handle markdown code fences
          if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
          } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
          }

          // Parse and validate lesson
          let payload: Lesson;
          try {
            const parsed = tryParseJsonWithLatex(jsonText);
            if (!parsed) {
              console.error(`[incremental] Failed to parse lesson ${lessonIdx + 1}`);
              continue;
            }
            payload = parsed as Lesson;
          } catch (parseError) {
            console.error(`[incremental] JSON parse error for lesson ${lessonIdx + 1}:`, parseError);
            continue;
          }

          // Validate required fields
          if (!payload.title || !payload.content || !payload.questions) {
            console.error(`[incremental] Incomplete lesson ${lessonIdx + 1}:`, payload);
            continue;
          }

          const newLesson: PendingLesson = {
            ...payload,
            id: payload.id ?? plan.id ?? crypto.randomUUID(),
            sourceIndex: 0,
          };

          // IMMEDIATE DISPLAY: Show lesson to user right away
          generatedLessons.push(newLesson);
          setLessons(prev => [...prev, newLesson]);

          console.log(`[incremental] ✨ Lesson ${lessonIdx + 1} (${plan.title}) generated and displayed!`);

          // Small delay between requests (500ms like standard flow, not 800ms)
          if (lessonIdx < lessonsToGenerate.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (err) {
          // Check if this was a user cancellation
          if ((err as DOMException)?.name === "AbortError") {
            console.log('[incremental] Generation cancelled by user');
            throw err;
          }

          console.error(`[incremental] Error generating lesson ${lessonIdx + 1}:`, err);
          // Continue to next lesson
          continue;
        }
      }

      console.log(`[incremental] ✅ Plan-first incremental learning complete! Generated ${generatedLessons.length} lessons with proper structure`);

      setStage("complete");
      setStatusDetail(null);
      setProgress(100);

      return {
        generatedLessons,
        fullText: allPageText,
        totalPages,
        lessonsGenerated: generatedLessons.length,
      };
    } catch (error) {
      // Handle user cancellation gracefully
      if ((error as DOMException)?.name === "AbortError") {
        console.log('[incremental] User cancelled incremental processing');
        setStage("idle");
        setStatusDetail(null);
        setProgress(0);
        return null;
      }

      console.error('[incremental] Incremental learning failed:', error);
      return null;
    } finally {
      // Clean up abort controller
      abortControllerRef.current = null;
    }
  }, [subject]);

  // Helper function to process first N pages of a PDF for progressive loading
  const processFirstPages = useCallback(async (file: File, maxPages: number = 3) => {
    const fileType = file.type.toLowerCase();
    const fileName = file.name.toLowerCase();

    // Only applicable for PDFs
    if (!(fileType === 'application/pdf' || fileName.endsWith('.pdf'))) {
      return null;
    }

    try {
      console.log(`[progressive] Extracting first ${maxPages} pages from PDF...`);
      const canvases = await convertPdfToCanvases(file);

      if (canvases.length === 0) return null;

      // Take only the first N pages
      const firstPages = canvases.slice(0, Math.min(maxPages, canvases.length));
      const totalPages = canvases.length;

      console.log(`[progressive] Processing ${firstPages.length} pages (${totalPages} total)`);

      // Import smartOCR for processing
      const { smartOCR } = await import('@/lib/smart-ocr');

      const allText: string[] = [];
      const pageHashes = new Set<string>(); // Track hashes for duplicate detection
      let skippedCount = 0;

      for (let pageIdx = 0; pageIdx < firstPages.length; pageIdx++) {
        const canvas = firstPages[pageIdx];
        const pageNum = pageIdx + 1;

        console.log(`[progressive] Processing quick page ${pageNum}/${firstPages.length}...`);
        const { text, skipped } = await smartOCR(canvas, pageNum, totalPages, pageHashes);

        if (!skipped) {
          allText.push(text);
        } else {
          skippedCount++;
        }
      }

      const combinedText = allText.join('\n\n---\n\n');
      console.log(`[progressive] Quick extraction complete: ${combinedText.length} chars from ${firstPages.length - skippedCount} pages (${skippedCount} skipped)`);

      return {
        text: combinedText,
        processedPages: firstPages.length,
        totalPages: totalPages,
        hasMorePages: totalPages > firstPages.length,
      };
    } catch (error) {
      console.error('[progressive] Failed to process first pages:', error);
      return null;
    }
  }, []);

  const processFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      // Check usage limit before starting generation
      const canGenerate = await checkLimit();
      if (!canGenerate) {
        return; // Modal will be shown by the hook
      }

      setError(null);
      setStage("parsing");
      setStatusDetail("Processing your content with AI…");
      setProgress(8);
      setLessons([]);
      setInsights([]);

      const previews: SourcePreview[] = [];
      const textFragments: string[] = [];

      // INCREMENTAL LEARNING: Check if this is a single PDF and use incremental processing
      const firstFile = files.item(0);
      if (ENABLE_INCREMENTAL_LEARNING && firstFile && files.length === 1) {
        const isPdf = firstFile.type.toLowerCase() === 'application/pdf' ||
                      firstFile.name.toLowerCase().endsWith('.pdf');

        if (isPdf) {
          console.log('[incremental] PDF detected, using INCREMENTAL LEARNING for 5-10x speed improvement!');
          previews.push({ name: firstFile.name, sizeLabel: formatBytes(firstFile.size) });
          setSourcePreview(previews);

          const incrementalResult = await processFilesIncrementalLearning(firstFile);

          if (incrementalResult) {
            console.log(`[incremental] ✨ INCREMENTAL LEARNING COMPLETE! Generated ${incrementalResult.lessonsGenerated} lessons progressively`);
            console.log('[incremental] User saw first lesson within seconds, not minutes!');
            // All lessons already displayed incrementally, we're done!
            return;
          } else {
            console.log('[incremental] Incremental learning failed or not applicable, falling back to standard flow');
            // Fall through to standard processing
          }
        }
      }

      // PROGRESSIVE LOADING: Check if first file is a PDF with multiple pages (FALLBACK)
      let quickStartData: { text: string; hasMorePages: boolean; totalPages: number } | null = null;

      if (firstFile && files.length === 1 && !ENABLE_INCREMENTAL_LEARNING) {
        const isPdf = firstFile.type.toLowerCase() === 'application/pdf' ||
                      firstFile.name.toLowerCase().endsWith('.pdf');

        if (isPdf) {
          console.log('[progressive] PDF detected, attempting quick start with first 3 pages...');
          setStatusDetail("Processing first 3 pages for quick preview…");
          const quickResult = await processFirstPages(firstFile, 3);

          if (quickResult && quickResult.text.length >= MIN_CHARS_REQUIRED) {
            quickStartData = {
              text: quickResult.text,
              hasMorePages: quickResult.hasMorePages,
              totalPages: quickResult.totalPages,
            };
            console.log(`[progressive] Quick start data ready: ${quickStartData.text.length} chars, ${quickResult.processedPages}/${quickResult.totalPages} pages`);
          }
        }
      }

      try {
        // If we have quick start data, generate quick lessons first
        if (quickStartData) {
          previews.push({ name: firstFile!.name, sizeLabel: formatBytes(firstFile!.size) });
          setSourcePreview(previews);

          // Generate 1-2 quick lessons from first 3 pages
          await generateQuickLessons(quickStartData.text, quickStartData.hasMorePages, quickStartData.totalPages);

          // If there are more pages, continue processing in background
          if (quickStartData.hasMorePages) {
            console.log('[progressive] Processing remaining pages in background...');
            setStatusDetail(`Processing remaining ${quickStartData.totalPages - 3} pages…`);
            setProgress(35);

            // Process full document
            const result = await parseFileWithDeepSeekOCR(firstFile!);
            if (result.text && result.text.trim().length) {
              textFragments.push(result.text);
            }
            // Store pipeline config for later use in lesson generation
            if (result.pipelineConfig) {
              setPipelineConfig(result.pipelineConfig);
            }
          } else {
            // All pages were in the quick start, we're done with parsing
            textFragments.push(quickStartData.text);
          }
        } else {
          // Standard processing for non-PDF or single-page files
          for (let index = 0; index < files.length; index += 1) {
            const file = files.item(index);
            if (!file) continue;
            previews.push({ name: file.name, sizeLabel: formatBytes(file.size) });

            // Determine if it's an audio file for appropriate status message
            const isAudio = file.type.toLowerCase().startsWith('audio/') ||
                            file.name.toLowerCase().match(/\.(mp3|wav|m4a|ogg|webm|flac|aac|wma)$/i);

            setStatusDetail(isAudio ? `Transcribing ${file.name}…` : `Processing ${file.name}…`);
            setProgress(8 + Math.round((index / files.length) * 12));

            const result = await parseFileWithDeepSeekOCR(file);
            if (result.text && result.text.trim().length) {
              textFragments.push(result.text);
            }
            // Store pipeline config from first file
            if (index === 0 && result.pipelineConfig) {
              setPipelineConfig(result.pipelineConfig);
            }
            if (textFragments.join("\n").length > MAX_TEXT_LENGTH) break;
          }
          setSourcePreview(previews);
        }
      } catch (err) {
        setStage("error");
        setError(err instanceof Error ? err.message : "Failed to process file.");
        setStatusDetail(null);
        setProgress(0);
        setSourcePreview(previews);
        return;
      }

      if (!quickStartData) {
        setSourcePreview(previews);
      }

      const combinedText = textFragments
        .join("\n\n")
        .split("\n")
        .map((line) => line.trimEnd())
        .join("\n");
      const normalized = normalizeWhitespace(combinedText).slice(0, MAX_TEXT_LENGTH);
      setTextPreview(normalized.slice(0, 1400));

      if (normalized.length < MIN_CHARS_REQUIRED) {
        setStage("error");
        setError("We couldn't find enough readable text. Try a clearer export or add more notes.");
        setStatusDetail(null);
        setProgress(0);
        return;
      }

      // Phase 1: Planning - Let AI analyze the full content and create a lesson plan
      // PROGRESSIVE LOADING: Skip planning if we already generated quick lessons
      type LessonPlanWithSection = {
        id: string;
        title: string;
        description: string;
        estimatedLength: number;
        textSection?: { start: number; end: number };
      };
      let lessonPlans: LessonPlanWithSection[] = [];
      let existingLessonCount = 0;

      if (quickStartData && quickStartData.hasMorePages && lessons.length > 0) {
        // We already showed quick lessons, now generate remaining lessons from full content
        console.log('[progressive] Skipping quick planning, generating remaining lessons from full content...');
        existingLessonCount = lessons.length;
        setProgress(50);
      } else {
        // Standard planning flow
        setStage("chunking");
        setStatusDetail("Analyzing content and creating lesson plan…");
        setProgress(20);
      }

      if (existingLessonCount === 0) {
        // Only do planning if we haven't already shown quick lessons
        try {
          console.log('[upload] Calling planning API with full text...');
          const planResponse = await fetch("/api/upload/plan", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              text: normalized,
              subject,
              returnSections: true, // NEW: Request text sections for optimization
            }),
          });

          if (!planResponse.ok) {
            const error = await planResponse.json().catch(() => ({ error: 'Planning failed' }));
            throw new Error(error.error || 'Failed to create lesson plan');
          }

          const planData = await planResponse.json();
          lessonPlans = planData.lessons || [];
          console.log('[upload] Lesson plan created:', {
            totalLessons: lessonPlans.length,
            subject: planData.subject
          });

          // Update subject if planning AI determined a better one
          if (planData.subject && planData.subject !== subject) {
            setSubject(planData.subject);
          }
        } catch (err) {
          console.error('[upload] Planning failed:', err);
          setStage("error");
          setError(err instanceof Error ? err.message : "Failed to create lesson plan");
          setStatusDetail(null);
          setProgress(0);
          return;
        }

        if (!lessonPlans.length) {
          setStage("error");
          setError("Could not create a lesson plan from this content.");
          setStatusDetail(null);
          setProgress(0);
          return;
        }

        // Derive insights from lesson titles
        setInsights(lessonPlans.slice(0, 4).map(p => p.title));
      } else {
        // For progressive loading with remaining pages, create plan from full content
        try {
          console.log('[progressive] Creating full lesson plan from all pages...');
          setStatusDetail("Creating comprehensive lesson plan from all pages…");
          const planResponse = await fetch("/api/upload/plan", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              text: normalized,
              subject,
              returnSections: true, // NEW: Request text sections for optimization
            }),
          });

          if (!planResponse.ok) {
            console.warn('[progressive] Full planning failed, keeping quick lessons only');
            setStage("complete");
            setStatusDetail(null);
            setProgress(100);
            return;
          }

          const planData = await planResponse.json();
          lessonPlans = planData.lessons || [];

          // Filter out lessons that are similar to what we already generated
          // (Simple heuristic: skip first 2 lessons as they likely overlap with quick lessons)
          lessonPlans = lessonPlans.slice(existingLessonCount);

          console.log('[progressive] Full lesson plan created:', {
            totalLessons: lessonPlans.length,
            alreadyShown: existingLessonCount,
            remaining: lessonPlans.length
          });

          if (!lessonPlans.length) {
            // No new lessons to generate, we're done
            console.log('[progressive] No additional lessons needed, quick lessons covered everything');
            setStage("complete");
            setStatusDetail(null);
            setProgress(100);
            return;
          }

          // Update insights with all lesson titles
          setInsights(prev => {
            const newInsights = lessonPlans.map(p => p.title);
            return [...prev, ...newInsights].slice(0, 8);
          });
        } catch (err) {
          console.error('[progressive] Full planning failed:', err);
          // Keep quick lessons, mark as complete
          setStage("complete");
          setStatusDetail(null);
          setProgress(100);
          return;
        }
      }

      // Phase 2: Generate each planned lesson individually
      setStage("generating");

      // PROGRESSIVE LOADING: Update status message based on context
      if (existingLessonCount > 0) {
        setStatusDetail(`Generating ${lessonPlans.length} additional lessons from remaining pages…`);
        setProgress(55);
      } else {
        setStatusDetail(`Generating ${lessonPlans.length} adaptive mini-lessons…`);
        setProgress(26);
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const generatedLessons: PendingLesson[] = [];

      try {
        // Generate each planned lesson individually with the full context
        for (let index = 0; index < lessonPlans.length; index += 1) {
          const plan = lessonPlans[index];

          // PROGRESSIVE LOADING: Update status messages based on context
          if (existingLessonCount > 0) {
            setStatusDetail(`Generating additional lesson ${index + 1} of ${lessonPlans.length}: ${plan.title}…`);
            setProgress(55 + Math.round((index / lessonPlans.length) * 40));
          } else {
            setStatusDetail(`Generating lesson ${index + 1} of ${lessonPlans.length}: ${plan.title}…`);
            setProgress(26 + Math.round((index / lessonPlans.length) * 60));
          }

          // Add a small delay between requests to avoid rate limiting (except for the first request)
          if (index > 0) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }

          // OPTIMIZATION: Extract only the relevant text section for this lesson (95% token savings)
          const relevantText = plan.textSection
            ? normalized.slice(plan.textSection.start, plan.textSection.end)
            : normalized;

          console.log(`[upload] Generating lesson ${index + 1}/${lessonPlans.length}: ${plan.title}...`);
          console.log(`[upload] Text optimization for lesson ${index + 1}:`, {
            original: normalized.length,
            relevant: relevantText.length,
            savings: plan.textSection ? `${(100 - (relevantText.length / normalized.length) * 100).toFixed(1)}%` : 'N/A (using full text)'
          });

          const response = await fetch("/api/generate", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              text: relevantText, // OPTIMIZED: Send only relevant excerpt instead of full text
              subject,
              lessonPlan: {
                title: plan.title,
                description: plan.description,
              },
              isOptimizedExcerpt: !!plan.textSection, // Skip semantic compression for pre-extracted sections
              pipelineConfig, // OPTIMIZED: Use pipeline config from upload router for optimal processing
            }),
            signal: controller.signal,
          });

          if (!response.ok) {
            const message = await response.text().catch(() => "");
            console.error(`[upload] Lesson ${index + 1} (${plan.title}) generation failed:`, {
              status: response.status,
              statusText: response.statusText,
              message
            });
            throw new Error(message || `Generation failed for "${plan.title}": ${response.status} ${response.statusText}`);
          }

          console.log(`[upload] Lesson ${index + 1} response OK, parsing...`);
          let payload: Lesson;
          try {
            const responseText = await response.text();
            console.log(`[upload] Lesson ${index + 1} response length:`, responseText.length);
            console.log(`[upload] Lesson ${index + 1} response preview:`, responseText.substring(0, 200));

            // Try to parse, handling potential markdown code fences
            let jsonText = responseText.trim();
            if (jsonText.startsWith('```json')) {
              jsonText = jsonText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
              console.log(`[upload] Removed markdown code fences from lesson ${index + 1}`);
            } else if (jsonText.startsWith('```')) {
              jsonText = jsonText.replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
              console.log(`[upload] Removed generic code fences from lesson ${index + 1}`);
            }

            payload = JSON.parse(jsonText) as Lesson;
            console.log(`[upload] Successfully parsed lesson ${index + 1}: ${plan.title}`);
          } catch (parseError) {
            console.error(`[upload] Failed to parse lesson ${index + 1} (${plan.title}):`, parseError);
            throw new Error(`Failed to parse "${plan.title}": ${parseError instanceof Error ? parseError.message : 'Invalid JSON'}`);
          }
          generatedLessons.push({
            ...payload,
            id: payload.id ?? plan.id ?? crypto.randomUUID(),
            sourceIndex: Math.min(index, previews.length - 1),
          });
        }
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") {
          setStage("idle");
          setStatusDetail(null);
          setProgress(0);
          return;
        }
        setStage("error");
        setError(err instanceof Error ? err.message : "Lesson generation failed.");
        setStatusDetail(null);
        setProgress(0);
        return;
      } finally {
        abortControllerRef.current = null;
      }

      // PROGRESSIVE LOADING: Append new lessons to existing ones or replace
      if (existingLessonCount > 0) {
        console.log(`[progressive] ✨ Adding ${generatedLessons.length} new lessons to existing ${existingLessonCount} lessons`);
        setLessons(prev => [...prev, ...generatedLessons]);
      } else {
        setLessons(generatedLessons);
      }

      setStage("complete");
      setStatusDetail(null);
      setProgress(100);
    },
    [subject, lessons.length, generateQuickLessons, processFirstPages, processFilesIncrementalLearning, checkLimit],
  );

  // ========================================
  // PREDICTIVE PRELOADING ON USER INTERACTION
  // ========================================
  // Aggressively preload critical libraries when user shows intent to upload
  // This provides instant upload experience
  const handleUploadIntent = useCallback(() => {
    const status = getLibraryStatus();

    // If PDF.js isn't loaded or loading, start loading it immediately
    if (status.pdfjs.status === 'idle') {
      console.log('[predictive-preload] User showing upload intent - preloading PDF.js now!');
      import('@/lib/library-preloader').then(({ preloadPDFjs }) => {
        preloadPDFjs();
      });
    }
  }, []);

  const handleFileInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const list = event.target.files;
      await processFiles(list);
      event.target.value = "";
    },
    [processFiles],
  );

  const handleDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (stage === "generating") return;
      setDragActive(false);
      const { files } = event.dataTransfer;
      await processFiles(files);
    },
    [processFiles, stage],
  );

  const subjectChips = useMemo(() => {
    const base = new Set<string>();

    // Always add "Auto" as the first option (default)
    base.add("Auto");

    // Add user's interests if available
    if (initialProfile?.interests?.length) {
      for (const item of initialProfile.interests) {
        if (typeof item === "string" && item.trim()) {
          const label = ensureSubjectLabel(item);
          // Filter out overly broad subjects
          if (!["Math", "Science", "Computer Science"].includes(label)) {
            base.add(label);
          }
        }
      }
    }
    if (selectedSubjects.length) {
      for (const item of selectedSubjects) {
        if (typeof item === "string" && item.trim()) {
          const label = ensureSubjectLabel(item);
          // Filter out overly broad subjects
          if (!["Math", "Science", "Computer Science"].includes(label)) {
            base.add(label);
          }
        }
      }
    }

    // Add relevant presets for high school to college students
    base.add("Exam Review");
    base.add("Homework Help");

    return Array.from(base).slice(0, 8);
  }, [initialProfile?.interests, selectedSubjects]);

  const statusAccent =
    stage === "error"
      ? "from-rose-500/20 via-red-500/10 to-transparent text-rose-500 dark:text-rose-300"
      : "from-lernex-blue/20 via-lernex-purple/20 to-transparent text-lernex-blue dark:text-lernex-blue/80";

  return (
    <ErrorBoundary>
      <ProfileBasicsProvider initialData={initialProfile ?? undefined}>
        <WelcomeTourOverlay />
        {limitData && (
          <UsageLimitModal
            isOpen={isModalOpen}
            onClose={closeModal}
            timeUntilResetMs={limitData.timeUntilResetMs}
            tier={limitData.tier}
            currentCost={limitData.currentCost}
            limitAmount={limitData.limitAmount}
            percentUsed={limitData.percentUsed}
          />
        )}

      <main className="relative isolate mx-auto flex min-h-[calc(100vh-56px)] w-full max-w-6xl flex-col gap-12 px-4 pb-16 pt-12 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-x-[-12%] top-[-18%] h-[420px] rounded-full bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_70%)] blur-3xl dark:bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.28),transparent_70%)]" />
          <div className="absolute left-[-6%] top-[32%] h-64 w-64 rounded-full bg-lernex-blue/20 blur-3xl opacity-80 dark:bg-lernex-blue/35" />
          <div className="absolute right-[-8%] bottom-[14%] h-72 w-72 rounded-full bg-lernex-purple/20 blur-3xl opacity-70 dark:bg-lernex-purple/35" />
        </div>

        <motion.header
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="relative z-10 overflow-hidden rounded-[32px] border border-white/60 bg-white/80 px-6 py-8 shadow-[0_42px_120px_-46px_rgba(47,128,237,0.55)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5"
        >
          <div className="pointer-events-none absolute inset-0 -z-10 rounded-[32px] bg-[linear-gradient(135deg,rgba(59,130,246,0.12),rgba(129,140,248,0.08),transparent)] dark:bg-[linear-gradient(135deg,rgba(47,128,237,0.3),rgba(129,140,248,0.15),transparent)]" />
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-4">
              <span className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-lernex-blue/10 to-lernex-purple/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-lernex-blue/80 dark:bg-gradient-to-r dark:from-lernex-blue/15 dark:to-lernex-purple/15 dark:text-lernex-blue/60 shadow-sm">
                Upload to learn
                <UploadCloud className="h-3.5 w-3.5" />
              </span>
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold leading-tight text-neutral-900 dark:text-white sm:text-4xl">
                  Turn your notes & lectures into{" "}
                  <span className="bg-gradient-to-r from-lernex-blue via-indigo-500 to-lernex-purple bg-clip-text text-transparent">
                    personalized mini-lessons
                  </span>
                </h1>
                <p className="max-w-2xl text-sm text-neutral-600 dark:text-neutral-300 sm:text-base">
                  Upload anything - lecture recordings, PDFs, slides, images, Word docs, or notes. Our advanced AI extracts and transforms your content into bite-sized, interactive lessons complete with adaptive quizzes. Perfect for busy students who learn on the go.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.28em] text-neutral-400 dark:text-neutral-500">
                {ENABLE_INCREMENTAL_LEARNING && (
                  <motion.span
                    whileHover={{ scale: 1.05 }}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5 }}
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-gradient-to-r from-emerald-500/10 to-green-500/10 px-3 py-1 dark:border-emerald-500/30 dark:bg-gradient-to-r dark:from-emerald-500/15 dark:to-green-500/15 hover:border-emerald-500/60 hover:from-emerald-500/20 hover:to-green-500/20 transition-all cursor-default shadow-sm"
                  >
                    <NotebookPen className="h-3 w-3 text-emerald-500" />
                    Smart incremental learning
                  </motion.span>
                )}
                <motion.span
                  whileHover={{ scale: 1.05 }}
                  className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-1 dark:border-white/10 dark:bg-white/10 hover:border-lernex-blue/40 hover:bg-lernex-blue/5 transition-all cursor-default"
                >
                  <Mic className="h-3 w-3 text-rose-500" />
                  Audio transcription
                </motion.span>
                <motion.span
                  whileHover={{ scale: 1.05 }}
                  className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-1 dark:border-white/10 dark:bg-white/10 hover:border-lernex-blue/40 hover:bg-lernex-blue/5 transition-all cursor-default"
                >
                  <Wand2 className="h-3 w-3 text-lernex-blue" />
                  Adaptive sequencing
                </motion.span>
                <motion.span
                  whileHover={{ scale: 1.05 }}
                  className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-1 dark:border-white/10 dark:bg-white/10 hover:border-lernex-blue/40 hover:bg-lernex-blue/5 transition-all cursor-default"
                >
                  <Sparkles className="h-3 w-3 text-lernex-purple" />
                  Quiz-ready outputs
                </motion.span>
              </div>
            </div>
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="relative isolate w-full max-w-xs overflow-hidden rounded-3xl border border-white/60 bg-white/70 p-6 text-sm shadow-[0_32px_90px_-64px_rgba(47,128,237,0.65)] backdrop-blur-lg dark:border-white/10 dark:bg-white/10"
            >
              <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-lernex-blue/15 via-transparent to-lernex-purple/15" />
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-lernex-blue/15 via-lernex-blue/10 to-lernex-purple/15 text-lernex-blue dark:text-lernex-blue/80">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-neutral-500 dark:text-neutral-400">
                    Quick tip
                  </p>
                  <p className="text-sm font-semibold text-neutral-800 dark:text-white">Best results</p>
                </div>
              </div>
              <ul className="mt-4 space-y-3 text-xs text-neutral-600 dark:text-neutral-300">
                <li className="flex gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lernex-blue" />
                  Upload lecture recordings, PDFs, slides, images, or documents - our AI extracts content with industry-leading accuracy.
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lernex-purple" />
                  Audio recordings get transcribed instantly, then transformed into structured lessons - perfect for recorded lectures.
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  Drop multiple files at once; we automatically merge and create a cohesive lesson sequence optimized for retention.
                </li>
              </ul>
            </motion.div>
          </div>
        </motion.header>

        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-12">
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06, duration: 0.5 }}
            className="flex-1 space-y-6"
          >
            <motion.div
              layout
              className="rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_40px_100px_-60px_rgba(47,128,237,0.55)] backdrop-blur-xl transition-all duration-300 hover:shadow-[0_40px_120px_-50px_rgba(47,128,237,0.65)] dark:border-white/10 dark:bg-white/5"
            >
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <motion.div layout="position">
                  <h2 className="text-lg font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                    Focus Subject
                    {subject === "Auto" && (
                      <motion.span
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-lernex-blue/10 to-lernex-purple/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-lernex-blue dark:bg-gradient-to-r dark:from-lernex-blue/15 dark:to-lernex-purple/15"
                      >
                        <Sparkles className="h-2.5 w-2.5" />
                        Default
                      </motion.span>
                    )}
                  </h2>
                  <motion.p
                    key={subject}
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="text-sm text-neutral-500 dark:text-neutral-400 mt-1"
                  >
                    {subject === "Auto"
                      ? "AI will evenly distribute lessons across all topics in your content."
                      : `AI will primarily focus on ${subject}-related concepts from your content.`}
                  </motion.p>
                </motion.div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  {subjectChips.map((chip, index) => {
                    const active = chip === subject;
                    return (
                      <motion.button
                        key={chip}
                        initial={{ opacity: 0, scale: 0.8, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{
                          duration: 0.3,
                          delay: index * 0.05,
                          type: "spring",
                          stiffness: 300,
                          damping: 20,
                        }}
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setSubject(chip)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                          active
                            ? "border-lernex-blue/80 bg-gradient-to-r from-lernex-blue to-lernex-purple text-white shadow-lg shadow-lernex-blue/30"
                            : "border-white/60 bg-white/70 text-neutral-600 hover:border-lernex-blue/40 hover:text-lernex-blue hover:shadow-md dark:border-white/10 dark:bg-white/10 dark:text-neutral-300 dark:hover:border-lernex-blue/50 dark:hover:text-lernex-blue/80"
                        }`}
                        type="button"
                      >
                        {chip}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
              <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-center">
                <label className="flex-1 text-sm text-neutral-600 dark:text-neutral-300">
                  <motion.span
                    key={subject}
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="mb-1 inline-block text-xs uppercase tracking-[0.25em] text-neutral-400 dark:text-neutral-500"
                  >
                    {subject === "Auto" ? "Auto Focus - Even distribution" : "Custom Focus"}
                  </motion.span>
                  <motion.input
                    whileFocus={{ scale: 1.01 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    placeholder="e.g., L'Hopital's Rule, Organic Chemistry, Linear Algebra"
                    className="w-full rounded-2xl border border-white/70 bg-white/90 px-4 py-3 text-sm font-medium text-neutral-800 shadow-inner outline-none transition-all duration-200 focus:border-lernex-blue/60 focus:ring-2 focus:ring-lernex-blue/30 focus:shadow-lg dark:border-white/10 dark:bg-white/10 dark:text-white"
                  />
                </label>
                <button
                  type="button"
                  onClick={resetState}
                  className="inline-flex items-center justify-center rounded-2xl border border-white/60 bg-white/80 px-4 py-3 text-sm font-semibold text-neutral-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lernex-blue/40 dark:border-white/10 dark:bg-white/10 dark:text-neutral-200"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Reset
                </button>
              </div>
            </motion.div>

            <div
              onMouseEnter={handleUploadIntent} // Predictive preload on hover
              onFocus={handleUploadIntent} // Predictive preload on focus
              onDragEnter={(event) => {
                event.preventDefault();
                if (stage === "generating") return;
                setDragActive(true);
                handleUploadIntent(); // Predictive preload when dragging file over
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (stage === "generating") return;
                setDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                if (stage === "generating") return;
                if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) {
                  setDragActive(false);
                }
              }}
              onDrop={handleDrop}
              className={`relative overflow-hidden rounded-[28px] border-2 border-dashed ${
                dragActive
                  ? "border-lernex-blue/60 bg-lernex-blue/10"
                  : "border-white/70 bg-white/80 dark:border-white/10 dark:bg-white/5"
              } px-6 py-12 text-center shadow-[0_32px_90px_-64px_rgba(47,128,237,0.65)] backdrop-blur-xl transition-colors`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.docx,.pptx,.txt,.md,.markdown,.csv,.json,.rtf,.html,.htm,.mp3,.wav,.m4a,.ogg,.webm,.flac,.aac,.wma"
                multiple
                hidden
                onChange={handleFileInputChange}
              />
              <motion.div
                initial={{ opacity: 0.85, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="mx-auto flex max-w-xl flex-col items-center gap-6"
              >
                <motion.span
                  animate={
                    stage === "generating" || stage === "parsing"
                      ? {
                          scale: [1, 1.05, 1],
                          rotate: [0, 5, -5, 0],
                        }
                      : {}
                  }
                  transition={{
                    duration: 2,
                    repeat: stage === "generating" || stage === "parsing" ? Infinity : 0,
                    ease: "easeInOut",
                  }}
                  className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-lernex-blue/15 via-lernex-blue/10 to-lernex-purple/20 text-lernex-blue dark:text-lernex-blue/80"
                >
                  {stage === "generating" || stage === "parsing" ? (
                    <Loader2 className="h-10 w-10 animate-spin" />
                  ) : (
                    <UploadCloud className="h-10 w-10" />
                  )}
                </motion.span>
                <div className="space-y-3 text-neutral-700 dark:text-neutral-200">
                  <p className="text-xl font-semibold">
                    {stage === "parsing"
                      ? "Processing your content..."
                      : stage === "generating"
                      ? "Crafting your lessons..."
                      : "Drop files or click to upload"}
                  </p>
                  <motion.p
                    key={`${stage}-${subject}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4 }}
                    className="text-sm text-neutral-500 dark:text-neutral-400"
                  >
                    {stage === "parsing" || stage === "generating" ? (
                      <>
                        Our advanced AI is extracting and structuring your content into personalized, bite-sized mini-lessons tailored to your learning style.
                      </>
                    ) : (
                      <>
                        Upload lecture audio (MP3, WAV), PDFs, images, DOCX, PPTX, and more. We intelligently process your content and create interactive mini-lessons with quizzes
                        {subject === "Auto" ? (
                          <> evenly distributed across all topics in your content.</>
                        ) : (
                          <> focused on <span className="font-semibold text-lernex-blue dark:text-lernex-blue/80">{subject}</span>.</>
                        )}
                      </>
                    )}
                  </motion.p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/70 bg-white/70 px-3 py-1 dark:border-white/10 dark:bg-white/10">
                    <FileText className="h-3.5 w-3.5 text-lernex-blue" />
                    Audio, PDFs, Images, Docs
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/70 bg-white/70 px-3 py-1 dark:border-white/10 dark:bg-white/10">
                    <Sparkles className="h-3.5 w-3.5 text-lernex-purple" />
                    AI-Powered Learning
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleBrowse}
                  onMouseEnter={handleUploadIntent}
                  disabled={stage === "generating"}
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-lernex-blue to-lernex-purple px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-lernex-blue/30 transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lernex-blue/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <UploadCloud className="h-4 w-4" />
                  Choose files
                </button>

                {/* Smart loading indicator - shows when libraries are preloading */}
                <AnimatePresence>
                  {librariesLoading && !librariesReady && stage === "idle" && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400"
                    >
                      <Loader2 className="h-3 w-3 animate-spin text-lernex-blue" />
                      Optimizing for instant upload...
                    </motion.div>
                  )}
                  {librariesReady && stage === "idle" && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Ready for instant upload
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
              {(stage === "parsing" || stage === "generating" || stage === "chunking") && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-10 flex flex-col items-center gap-3"
                >
                  <div className="relative h-3 w-full max-w-lg overflow-hidden rounded-full bg-white/40 shadow-inner dark:bg-white/10">
                    <motion.div
                      animate={{
                        backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                      className="h-full rounded-full bg-gradient-to-r from-lernex-blue via-lernex-purple to-lernex-blue bg-[length:200%_100%] transition-[width] duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <motion.p
                    animate={{ opacity: [1, 0.7, 1] }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="text-xs font-semibold uppercase tracking-[0.25em] text-neutral-600 dark:text-neutral-400"
                  >
                    {statusDetail ?? "Processing"}
                  </motion.p>
                  <button
                    type="button"
                    onClick={() => abortControllerRef.current?.abort()}
                    className="text-xs font-semibold text-rose-500 transition hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40 dark:text-rose-300"
                  >
                    Cancel
                  </button>
                </motion.div>
              )}
            </div>

            <AnimatePresence>
              {(stage === "error" || (stage !== "idle" && statusDetail)) && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  transition={{ duration: 0.24 }}
                  className={`overflow-hidden rounded-3xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur-lg dark:border-white/10 dark:bg-white/10 ${
                    stage === "error" ? "border-rose-400/50 dark:border-rose-500/50" : ""
                  }`}
                >
                  <div className={`flex items-center gap-3 bg-gradient-to-r ${statusAccent} rounded-2xl px-4 py-3`}>
                    {stage === "error" ? (
                      <Loader2 className="h-4 w-4 rotate-45" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/80">
                      {stage === "error" ? "Upload issue" : "Processing"}
                    </p>
                  </div>
                  <div className="mt-4 text-sm text-neutral-600 dark:text-neutral-300">
                    {stage === "error" ? <p>{error}</p> : <p>{statusDetail ?? "Preparing your content..."}</p>}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {sourcePreview.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-3xl border border-white/60 bg-white/80 p-6 text-sm shadow-sm backdrop-blur-lg dark:border-white/10 dark:bg-white/10"
              >
                <h3 className="text-sm font-semibold text-neutral-800 dark:text-white">Source files</h3>
                <ul className="mt-4 space-y-3">
                  {sourcePreview.map((file) => (
                    <li
                      key={`${file.name}-${file.sizeLabel}`}
                      className="flex items-center justify-between rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-neutral-600 shadow-sm dark:border-white/10 dark:bg-white/10 dark:text-neutral-300"
                    >
                      <span className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-lernex-blue" />
                        <span className="font-medium text-neutral-700 dark:text-neutral-200">{file.name}</span>
                      </span>
                      <span className="text-xs uppercase tracking-[0.22em] text-neutral-400 dark:text-neutral-500">
                        {file.sizeLabel}
                      </span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}

            {textPreview && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-sm backdrop-blur-lg dark:border-white/10 dark:bg-white/10"
              >
                <div className="flex items-center justify-between text-sm text-neutral-500 dark:text-neutral-400">
                  <span className="font-semibold text-neutral-800 dark:text-white">Preview snapshot</span>
                  <span>{textPreview.length} characters</span>
                </div>
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
                  {textPreview.length < MAX_TEXT_LENGTH ? textPreview : `${textPreview}...`}
                </p>
              </motion.div>
            )}
          </motion.section>

          <motion.aside
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.55 }}
            className="w-full space-y-6 lg:w-[min(400px,40%)]"
          >
            <motion.div
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 240, damping: 24 }}
              className="rounded-3xl border border-white/60 bg-white/80 p-6 text-sm shadow-[0_32px_90px_-64px_rgba(47,128,237,0.65)] backdrop-blur-lg dark:border-white/10 dark:bg-white/10"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-lernex-blue/15 text-lernex-blue dark:bg-lernex-blue/20 dark:text-lernex-blue/70">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-neutral-800 dark:text-white">Generation status</h2>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Track lesson creation and highlights from your upload.
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm dark:border-white/10 dark:bg-white/10">
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.22em] text-neutral-400 dark:text-neutral-500">
                    <span>Status</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/50 dark:bg-white/10">
                    <div
                      className={`h-full rounded-full ${
                        stage === "complete"
                          ? "bg-emerald-500"
                          : stage === "error"
                          ? "bg-rose-500"
                          : "bg-gradient-to-r from-lernex-blue to-lernex-purple"
                      } transition-[width]`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <motion.p
                    animate={
                      stage === "complete"
                        ? {
                            scale: [1, 1.05, 1],
                            color: ["rgb(34, 197, 94)", "rgb(22, 163, 74)", "rgb(34, 197, 94)"],
                          }
                        : {}
                    }
                    transition={{ duration: 1.5, repeat: stage === "complete" ? 3 : 0 }}
                    className="mt-3 text-xs font-medium text-neutral-500 dark:text-neutral-400"
                  >
                    {stage === "complete"
                      ? "✨ All lessons ready! Scroll down to start learning!"
                      : stage === "error"
                      ? error ?? "Upload failed."
                      : statusDetail ?? "Waiting for upload..."}
                  </motion.p>
                </div>
                {insights.length > 0 && (
                  <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm dark:border-white/10 dark:bg-white/10">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-neutral-400 dark:text-neutral-500">
                      Key takeaways detected
                    </p>
                    <ul className="mt-3 space-y-3 text-sm text-neutral-600 dark:text-neutral-300">
                      {insights.map((insight) => (
                        <li key={insight} className="flex gap-3">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-lernex-blue" />
                          <span>{insight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </motion.div>

            <motion.div
              whileHover={{ y: -6 }}
              transition={{ type: "spring", stiffness: 220, damping: 26 }}
              className="rounded-3xl border border-white/60 bg-white/80 p-6 text-sm shadow-[0_32px_90px_-64px_rgba(47,128,237,0.65)] backdrop-blur-lg dark:border-white/10 dark:bg-white/10"
            >
              <h2 className="text-sm font-semibold text-neutral-800 dark:text-white">Why it works</h2>
              <ul className="mt-4 space-y-3 text-neutral-600 dark:text-neutral-300">
                {ENABLE_INCREMENTAL_LEARNING && (
                  <li>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">Smart incremental learning:</span> creates a structured lesson plan from your content, then generates high-quality lessons progressively. Get your first lesson in seconds while maintaining coherent structure and logical progression.
                  </li>
                )}
                <li>
                  <span className="font-semibold text-neutral-700 dark:text-white">Multi-format processing:</span> advanced AI handles audio transcription, optical character recognition, and document parsing to extract content with industry-leading accuracy.
                </li>
                <li>
                  <span className="font-semibold text-neutral-700 dark:text-white">Smart adaptation:</span> our intelligent system creates personalized lessons tailored to your learning pace and subject matter.
                </li>
                <li>
                  <span className="font-semibold text-neutral-700 dark:text-white">Interactive learning:</span> every lesson includes comprehension quizzes to reinforce understanding and track your progress.
                </li>
              </ul>
            </motion.div>
          </motion.aside>
        </div>

        <AnimatePresence>
          {lessons.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 26 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ delay: 0.14, duration: 0.55 }}
              className="relative mx-auto max-w-2xl"
            >
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-neutral-900 dark:text-white">Your Personalized Lessons</h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Scroll through your custom-generated mini-lessons
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-white/60 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-neutral-600 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/10 dark:text-neutral-300">
                  <Sparkles className="h-3.5 w-3.5 text-lernex-blue" />
                  {lessons.length} Lessons
                </div>
              </div>

              {/* Scrollable lesson container - FYP style */}
              <div className="relative">
                <div className="space-y-6 max-h-[80vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-lernex-blue/20 scrollbar-track-transparent">
                  {lessons.map((lesson, index) => (
                    <motion.article
                      key={lesson.id}
                      initial={{ opacity: 0, x: -30, scale: 0.95 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      transition={{
                        duration: 0.5,
                        delay: index * 0.1,
                        type: "spring",
                        stiffness: 100,
                        damping: 15,
                      }}
                      whileHover={{ scale: 1.01, y: -4 }}
                      className="group relative overflow-visible rounded-[32px] border border-white/60 bg-white/90 p-6 shadow-[0_20px_70px_-30px_rgba(47,128,237,0.4)] backdrop-blur-xl transition-all dark:border-white/10 dark:bg-white/5 dark:shadow-[0_20px_70px_-30px_rgba(47,128,237,0.6)]"
                    >
                      {/* Gradient overlay */}
                      <div className="pointer-events-none absolute inset-0 -z-10 rounded-[32px] bg-[linear-gradient(135deg,rgba(59,130,246,0.08),rgba(129,140,248,0.05),transparent)] opacity-0 transition-opacity group-hover:opacity-100 dark:bg-[linear-gradient(135deg,rgba(47,128,237,0.2),rgba(129,140,248,0.1),transparent)]" />

                      {/* Lesson number badge */}
                      <div className="absolute -right-2 -top-2 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-lernex-blue to-lernex-purple text-sm font-bold text-white shadow-lg">
                        {index + 1}
                      </div>

                      <div className="space-y-4">
                        <LessonCard lesson={lesson} className="border-0 shadow-none" />

                        {lesson.questions?.length ? (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 + 0.2 }}
                            className="rounded-2xl border border-white/60 bg-white/70 p-4 text-sm shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/10"
                          >
                            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-lernex-purple">
                              <Sparkles className="h-3.5 w-3.5" />
                              Quiz Challenge
                            </div>
                            <QuizBlock lesson={lesson} onDone={() => {}} showSummary={false} />
                          </motion.div>
                        ) : null}
                      </div>
                    </motion.article>
                  ))}
                </div>

                {/* Scroll indicator gradient at bottom */}
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-white/80 to-transparent dark:from-neutral-950/80" />
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Empty state when no lessons */}
        {lessons.length === 0 && stage === "idle" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col items-center justify-center rounded-[32px] border border-dashed border-white/60 bg-white/40 px-8 py-20 text-center backdrop-blur dark:border-white/10 dark:bg-white/5"
          >
            <motion.div
              animate={{
                y: [0, -10, 0],
                rotate: [0, 5, -5, 0],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <Sparkles className="mb-4 h-12 w-12 text-lernex-blue/60" />
            </motion.div>
            <h3 className="text-xl font-semibold text-neutral-700 dark:text-neutral-200">
              Ready to Transform Your Notes
            </h3>
            <p className="mt-2 max-w-md text-sm text-neutral-500 dark:text-neutral-400">
              Upload your documents above to see AI-generated lessons appear here. Each lesson is tailored to help you
              learn faster and retain more.
            </p>
          </motion.div>
        )}
      </main>
    </ProfileBasicsProvider>
    </ErrorBoundary>
  );
}
