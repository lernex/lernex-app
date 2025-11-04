/**
 * Multi-Tier Processing Pipeline Types
 *
 * Defines types for document profiling, pipeline selection, and processing configuration.
 * Used by upload-router.ts and processing-pipelines.ts.
 */

/**
 * Document format types supported by the system
 */
export type DocumentFormat = 'pdf' | 'image' | 'audio' | 'document';

/**
 * Content type classification for routing decisions
 */
export type ContentType = 'text-heavy' | 'image-heavy' | 'mixed';

/**
 * Processing pipeline tiers
 */
export type PipelineTier = 'fast' | 'balanced' | 'premium';

/**
 * Comprehensive document profile used for routing decisions
 */
export interface DocumentProfile {
  // File metadata
  format: DocumentFormat;
  fileSize: number; // in bytes
  fileName: string;
  mimeType: string;

  // Content characteristics
  pageCount: number;
  contentType: ContentType;
  language: string; // ISO 639-1 code (e.g., 'en')

  // Complexity metrics (0-1 scale)
  estimatedTextDensity: number; // Higher = more text, less images
  estimatedComplexity: number; // Higher = more complex (tables, diagrams, etc.)

  // Additional flags
  isCompressible: boolean; // For audio files
  hasEmbeddedImages: boolean;
  hasTableStructures: boolean;

  // User context
  userTier?: 'free' | 'plus' | 'premium';
}

/**
 * OCR strategy configuration for a pipeline
 */
export interface OCRStrategyConfig {
  // Thresholds for routing pages to different OCR tiers
  freeThreshold: number; // Text density threshold for free OCR (0-1)
  cheapThreshold: number; // Text density threshold for cheap OCR (0-1)
  // Above cheapThreshold goes to premium

  // Compression ratios for image optimization
  imageCompressionQuality: number; // 0-1, lower = more compression

  // Skip optimization settings
  enableBlankPageSkip: boolean;
  enableDuplicateSkip: boolean;

  // Batch processing
  pagesPerBatch: number; // How many pages to process in parallel
  parallelBatches: number; // How many batches to run concurrently
}

/**
 * Lesson generation strategy configuration
 */
export interface LessonGenerationConfig {
  // Model selection
  modelSpeed: 'fast' | 'slow'; // Which model tier to use

  // Token optimization
  enableSemanticCompression: boolean;
  compressionRate: number; // 0-1, lower = more aggressive
  maxTokensPerLesson: number;

  // Batch generation
  enableBatchGeneration: boolean;
  maxBatchSize: number; // How many lessons to generate in one call

  // Quality settings
  temperature: number; // Model temperature (0-1)
  requireHighQuality: boolean; // Retry on validation failures
}

/**
 * Complete pipeline configuration returned by the router
 */
export interface PipelineConfig {
  // Selected pipeline
  tier: PipelineTier;

  // Processing strategies
  ocr: OCRStrategyConfig;
  generation: LessonGenerationConfig;

  // Cost estimates (in USD)
  estimatedCost: {
    ocr: number;
    transcription?: number; // For audio files
    generation: number;
    total: number;
  };

  // Performance estimates
  estimatedTime: {
    processing: number; // seconds
    generation: number; // seconds
    total: number; // seconds
  };

  // Routing metadata
  routingReason: string; // Human-readable explanation of why this pipeline was selected
  confidence: number; // 0-1, how confident the router is in this decision
}

/**
 * Router decision history for analytics and debugging
 */
export interface RouterDecision {
  timestamp: Date;
  profile: DocumentProfile;
  config: PipelineConfig;
  actualCost?: number; // Actual cost after processing (for tracking accuracy)
  actualTime?: number; // Actual time after processing
  success: boolean;
}

/**
 * Processing result from a pipeline
 */
export interface PipelineResult {
  success: boolean;
  extractedText?: string;
  pageResults?: Array<{
    pageNum: number;
    strategy: string;
    tokens: number;
    skipped: boolean;
  }>;
  totalTokensUsed: number;
  totalTimeMs: number;
  error?: string;
}
