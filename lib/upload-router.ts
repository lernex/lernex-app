/**
 * Upload Router - Multi-Tier Processing Pipeline Selection
 *
 * Routes documents through different processing pipelines based on characteristics:
 * - FAST: Text-heavy, small files → Tesseract + cheap models (50-70% savings)
 * - BALANCED: Medium complexity → Hybrid OCR + balanced models (30-40% savings)
 * - PREMIUM: Image-heavy, complex → DeepSeek high-detail + better models (quality focus)
 *
 * This router sits ABOVE the existing smart-ocr system and provides document-level
 * routing strategy, while smart-ocr handles page-level OCR tier selection.
 */

import {
  type DocumentProfile,
  type DocumentFormat,
  type ContentType,
  type PipelineConfig,
  type PipelineTier,
  type RouterDecision,
} from './pipeline-types';

/**
 * Analyze a file and create a comprehensive document profile
 *
 * This function examines file metadata and applies heuristics to estimate
 * content characteristics without fully processing the document.
 */
export async function analyzeDocument(
  file: File,
  userTier?: 'free' | 'plus' | 'premium'
): Promise<DocumentProfile> {
  const fileType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();
  const fileSize = file.size;

  // Determine document format
  let format: DocumentFormat = 'document';
  if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
    format = 'pdf';
  } else if (fileType.startsWith('image/')) {
    format = 'image';
  } else if (fileType.startsWith('audio/')) {
    format = 'audio';
  }

  // Estimate page count (rough heuristics)
  let pageCount = 1;
  if (format === 'pdf') {
    // Average PDF page is ~50-200KB depending on content
    // Text-heavy: ~50KB/page, Image-heavy: ~200KB/page
    // Use middle ground: ~100KB/page
    pageCount = Math.max(1, Math.round(fileSize / 102400));
  } else if (format === 'audio') {
    // Audio "pages" = minutes (for progress tracking)
    // MP3: ~1MB/minute at 128kbps
    pageCount = Math.max(1, Math.round(fileSize / 1048576));
  }

  // Estimate content type based on file characteristics
  let contentType: ContentType = 'mixed';
  let estimatedTextDensity = 0.5;
  let estimatedComplexity = 0.5;

  if (format === 'pdf') {
    // PDFs with file extensions or names suggesting content type
    if (
      fileName.includes('scan') ||
      fileName.includes('image') ||
      fileName.includes('photo')
    ) {
      contentType = 'image-heavy';
      estimatedTextDensity = 0.2;
      estimatedComplexity = 0.7;
    } else if (
      fileName.includes('text') ||
      fileName.includes('doc') ||
      fileName.includes('book') ||
      fileName.includes('article')
    ) {
      contentType = 'text-heavy';
      estimatedTextDensity = 0.8;
      estimatedComplexity = 0.3;
    } else {
      // Use file size as proxy
      // Larger files per page = more images
      const bytesPerPage = fileSize / pageCount;
      if (bytesPerPage > 150000) {
        // >150KB/page = likely image-heavy
        contentType = 'image-heavy';
        estimatedTextDensity = 0.3;
        estimatedComplexity = 0.6;
      } else if (bytesPerPage < 80000) {
        // <80KB/page = likely text-heavy
        contentType = 'text-heavy';
        estimatedTextDensity = 0.7;
        estimatedComplexity = 0.4;
      }
    }
  } else if (format === 'image') {
    // Single image - assume medium complexity
    contentType = 'mixed';
    estimatedTextDensity = 0.5;
    estimatedComplexity = 0.5;
  } else if (format === 'audio') {
    // Audio is always "text-heavy" after transcription
    contentType = 'text-heavy';
    estimatedTextDensity = 1.0;
    estimatedComplexity = 0.2;
  } else {
    // Text documents (DOCX, TXT, etc.)
    contentType = 'text-heavy';
    estimatedTextDensity = 0.9;
    estimatedComplexity = 0.2;
  }

  // Detect language (default to English, could be enhanced with detection library)
  const language = 'en';

  // Additional flags
  const isCompressible = format === 'audio';
  const hasEmbeddedImages = format === 'pdf' && contentType !== 'text-heavy';
  const hasTableStructures = format === 'pdf' && estimatedComplexity > 0.5;

  return {
    format,
    fileSize,
    fileName: file.name,
    mimeType: file.type,
    pageCount,
    contentType,
    language,
    estimatedTextDensity,
    estimatedComplexity,
    isCompressible,
    hasEmbeddedImages,
    hasTableStructures,
    userTier,
  };
}

/**
 * Select the optimal processing pipeline based on document profile
 *
 * Decision Logic:
 * - FAST: Small, text-heavy documents that can benefit from aggressive free OCR usage
 * - BALANCED: Medium complexity documents that benefit from hybrid approach (default)
 * - PREMIUM: Large or complex documents requiring high-quality OCR and better models
 */
export function selectProcessingPipeline(profile: DocumentProfile): PipelineTier {
  // Special case: Audio always uses balanced (transcription quality matters)
  if (profile.format === 'audio') {
    return 'balanced';
  }

  // FAST pipeline criteria:
  // - Text-heavy content (high text density, low complexity)
  // - Small file size (<5MB)
  // - Not too many pages (<=10)
  const isFastEligible =
    profile.contentType === 'text-heavy' &&
    profile.fileSize < 5 * 1024 * 1024 &&
    profile.pageCount <= 10 &&
    profile.estimatedTextDensity > 0.7 &&
    profile.estimatedComplexity < 0.4;

  if (isFastEligible) {
    return 'fast';
  }

  // PREMIUM pipeline criteria:
  // - Image-heavy content (requires high-quality OCR)
  // - Large documents (>20 pages, quality matters for long reads)
  // - High complexity (tables, diagrams, etc.)
  // - Premium users (better experience for paying customers)
  const isPremiumEligible =
    profile.contentType === 'image-heavy' ||
    profile.pageCount > 20 ||
    profile.estimatedComplexity > 0.6 ||
    profile.hasTableStructures ||
    profile.userTier === 'premium';

  if (isPremiumEligible) {
    return 'premium';
  }

  // Default to BALANCED for everything else
  return 'balanced';
}

/**
 * Generate complete pipeline configuration for the selected tier
 */
export function buildPipelineConfig(
  profile: DocumentProfile,
  tier: PipelineTier
): PipelineConfig {
  let config: PipelineConfig;

  switch (tier) {
    case 'fast':
      config = buildFastPipelineConfig(profile);
      break;
    case 'premium':
      config = buildPremiumPipelineConfig(profile);
      break;
    case 'balanced':
    default:
      config = buildBalancedPipelineConfig(profile);
      break;
  }

  return config;
}

/**
 * Build FAST pipeline configuration (50-70% cost savings)
 *
 * Strategy:
 * - Aggressive free OCR usage (Tesseract for most pages)
 * - High cheap OCR threshold (prefer cheap over premium)
 * - Fast models for lesson generation
 * - Lower compression quality (faster processing)
 * - Larger batch sizes (more parallelization)
 */
function buildFastPipelineConfig(profile: DocumentProfile): PipelineConfig {
  return {
    tier: 'fast',
    ocr: {
      freeThreshold: 0.10, // Use free OCR for pages with >10% text density (aggressive!)
      cheapThreshold: 0.08, // Use cheap OCR for pages with >8% text density
      imageCompressionQuality: 0.70, // 70% quality (more compression)
      enableBlankPageSkip: true,
      enableDuplicateSkip: true,
      pagesPerBatch: 5,
      parallelBatches: 4, // More parallel processing
    },
    generation: {
      modelSpeed: 'fast',
      enableSemanticCompression: true,
      compressionRate: 0.60, // More aggressive compression (40% reduction)
      maxTokensPerLesson: 1200, // Lower token limit
      enableBatchGeneration: true,
      maxBatchSize: 5,
      temperature: 0.5,
      requireHighQuality: false,
    },
    estimatedCost: {
      ocr: profile.pageCount * 0.000002, // Mostly free OCR (~$0.000002/page average)
      generation: 0.01, // Fast models are cheaper
      total: profile.pageCount * 0.000002 + 0.01,
    },
    estimatedTime: {
      processing: profile.pageCount * 3, // ~3 seconds per page (Tesseract)
      generation: 5, // Fast model generation
      total: profile.pageCount * 3 + 5,
    },
    routingReason: `Fast pipeline selected: Text-heavy document with ${profile.pageCount} pages and ${(profile.fileSize / 1024 / 1024).toFixed(1)}MB size. Using aggressive free OCR and fast models for maximum cost savings.`,
    confidence: 0.85,
  };
}

/**
 * Build BALANCED pipeline configuration (30-40% cost savings)
 *
 * Strategy:
 * - Hybrid OCR (current smart-ocr default behavior)
 * - Balanced cheap/premium thresholds
 * - Mix of fast/slow models based on user tier
 * - Standard compression and batch settings
 * - Optimal balance of cost and quality
 */
function buildBalancedPipelineConfig(profile: DocumentProfile): PipelineConfig {
  return {
    tier: 'balanced',
    ocr: {
      freeThreshold: 0.20, // Use free OCR for pages with >20% text density
      cheapThreshold: 0.15, // Use cheap OCR for pages with >15% text density
      imageCompressionQuality: 0.85, // 85% quality (balanced)
      enableBlankPageSkip: true,
      enableDuplicateSkip: true,
      pagesPerBatch: 5,
      parallelBatches: 3, // Standard parallelization
    },
    generation: {
      modelSpeed: profile.userTier === 'free' ? 'fast' : 'slow', // Tier-based
      enableSemanticCompression: true,
      compressionRate: 0.65, // Standard compression (35% reduction)
      maxTokensPerLesson: 1400, // Standard token limit
      enableBatchGeneration: true,
      maxBatchSize: 4,
      temperature: 0.4,
      requireHighQuality: false,
    },
    estimatedCost: {
      ocr: profile.pageCount * 0.00004, // Hybrid OCR average (~$0.00004/page)
      generation: profile.userTier === 'free' ? 0.01 : 0.02,
      total: profile.pageCount * 0.00004 + (profile.userTier === 'free' ? 0.01 : 0.02),
    },
    estimatedTime: {
      processing: profile.pageCount * 4, // ~4 seconds per page (mixed OCR)
      generation: profile.userTier === 'free' ? 5 : 8,
      total: profile.pageCount * 4 + (profile.userTier === 'free' ? 5 : 8),
    },
    routingReason: `Balanced pipeline selected: Standard document with ${profile.pageCount} pages. Using hybrid OCR strategy and tier-appropriate models for optimal cost-quality balance.`,
    confidence: 0.90,
  };
}

/**
 * Build PREMIUM pipeline configuration (quality-focused)
 *
 * Strategy:
 * - Prefer premium OCR (lower compression, 5-6x instead of 8-9x)
 * - Conservative free/cheap thresholds
 * - Slow (better quality) models
 * - Minimal compression (preserve detail)
 * - Smaller batches (better quality control)
 * - Higher temperature for more creative lessons
 */
function buildPremiumPipelineConfig(profile: DocumentProfile): PipelineConfig {
  return {
    tier: 'premium',
    ocr: {
      freeThreshold: 0.30, // Very conservative - only simplest pages use free OCR
      cheapThreshold: 0.25, // Conservative - prefer premium OCR
      imageCompressionQuality: 0.95, // 95% quality (minimal compression, 5-6x ratio)
      enableBlankPageSkip: true,
      enableDuplicateSkip: true,
      pagesPerBatch: 5,
      parallelBatches: 3, // Standard parallelization (quality over speed)
    },
    generation: {
      modelSpeed: 'slow', // Better quality models
      enableSemanticCompression: false, // Preserve all details
      compressionRate: 0.80, // Minimal compression if needed (20% reduction)
      maxTokensPerLesson: 1800, // Higher token limit
      enableBatchGeneration: true,
      maxBatchSize: 3, // Smaller batches for better quality
      temperature: 0.5,
      requireHighQuality: true, // Retry on failures
    },
    estimatedCost: {
      ocr: profile.pageCount * 0.00008, // Mostly premium OCR (~$0.00008/page)
      generation: 0.03, // Slow models cost more
      total: profile.pageCount * 0.00008 + 0.03,
    },
    estimatedTime: {
      processing: profile.pageCount * 5, // ~5 seconds per page (premium OCR)
      generation: 12, // Slow model generation
      total: profile.pageCount * 5 + 12,
    },
    routingReason: `Premium pipeline selected: ${
      profile.contentType === 'image-heavy'
        ? 'Image-heavy content'
        : profile.pageCount > 20
        ? 'Large document'
        : profile.userTier === 'premium'
        ? 'Premium user'
        : 'Complex content'
    } requiring high-quality processing. Using premium OCR with lower compression (5-6x ratio) and better models for maximum quality.`,
    confidence: 0.95,
  };
}

/**
 * Main entry point: Analyze document and return processing configuration
 *
 * This is the primary function called by the upload client to determine
 * how to process a document.
 */
export async function processDocument(
  file: File,
  userTier?: 'free' | 'plus' | 'premium'
): Promise<PipelineConfig> {
  // Step 1: Analyze document to create profile
  const profile = await analyzeDocument(file, userTier);

  console.log('[upload-router] Document profile:', {
    format: profile.format,
    size: `${(profile.fileSize / 1024 / 1024).toFixed(1)}MB`,
    pages: profile.pageCount,
    contentType: profile.contentType,
    textDensity: profile.estimatedTextDensity.toFixed(2),
    complexity: profile.estimatedComplexity.toFixed(2),
  });

  // Step 2: Select optimal pipeline
  const pipeline = selectProcessingPipeline(profile);

  console.log(`[upload-router] Selected pipeline: ${pipeline.toUpperCase()}`);

  // Step 3: Build complete configuration
  const config = buildPipelineConfig(profile, pipeline);

  console.log('[upload-router] Pipeline config:', {
    tier: config.tier,
    estimatedCost: `$${config.estimatedCost.total.toFixed(4)}`,
    estimatedTime: `${config.estimatedTime.total}s`,
    reason: config.routingReason,
  });

  return config;
}

/**
 * Track router decision for analytics and optimization
 *
 * Call this after processing completes to track accuracy of estimates
 */
export function recordRouterDecision(
  profile: DocumentProfile,
  config: PipelineConfig,
  actualCost: number,
  actualTime: number,
  success: boolean
): RouterDecision {
  const decision: RouterDecision = {
    timestamp: new Date(),
    profile,
    config,
    actualCost,
    actualTime,
    success,
  };

  console.log('[upload-router] Decision recorded:', {
    pipeline: config.tier,
    estimatedCost: `$${config.estimatedCost.total.toFixed(4)}`,
    actualCost: `$${actualCost.toFixed(4)}`,
    costAccuracy: `${((1 - Math.abs(actualCost - config.estimatedCost.total) / config.estimatedCost.total) * 100).toFixed(1)}%`,
    estimatedTime: `${config.estimatedTime.total}s`,
    actualTime: `${actualTime}s`,
    timeAccuracy: `${((1 - Math.abs(actualTime - config.estimatedTime.total) / config.estimatedTime.total) * 100).toFixed(1)}%`,
    success,
  });

  return decision;
}
