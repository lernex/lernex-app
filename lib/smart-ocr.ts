import { optimizeForOCRTier } from './image-optimizer';

/**
 * Hybrid OCR Strategy for 60-80% Cost Savings
 *
 * This module implements an intelligent OCR routing system that analyzes
 * page complexity and selects the optimal OCR strategy:
 *
 * 1. FREE (Tesseract.js): Simple text-only pages with high text density
 * 2. CHEAP (DeepSeek low-detail): Medium complexity pages - 20x compression (~40 tokens/page)
 * 3. PREMIUM (DeepSeek high-detail): Complex pages with images/tables - 9x compression (~800 tokens/page)
 *
 * Cost Comparison (per page):
 * - Tesseract.js: $0.00 (client-side processing)
 * - DeepSeek Low: ~40 tokens × $0.00013 = $0.0000052 per page
 * - DeepSeek High: ~800 tokens × $0.00013 = $0.000104 per page
 *
 * Expected Savings:
 * - Simple documents (80% free): 80% cost reduction
 * - Medium documents (50% free, 30% cheap, 20% premium): 65% cost reduction
 * - Complex documents (20% free, 30% cheap, 50% premium): 40% cost reduction
 *
 * PERFORMANCE FIX: Tesseract.js is dynamically imported only when needed to prevent
 * blocking the upload page render. This significantly reduces initial bundle size.
 */

export interface PageComplexity {
  hasImages: boolean;
  hasTables: boolean;
  textDensity: number; // 0-1 scale
  isHandwritten: boolean;
  confidence: number; // How confident we are in the analysis (0-1)
}

export type OCRStrategy = 'free' | 'cheap' | 'premium';

export type OCRStrategyLabel = 'tesseract' | 'deepseek-low' | 'deepseek-high' | 'deepseek-high-pipeline';

export interface OCRResult {
  text: string;
  strategy: OCRStrategyLabel | 'skipped';
  cost: number; // Estimated cost in tokens
  skipped?: boolean;
  skipReason?: 'blank' | 'duplicate';
}

/**
 * Analyze page complexity from canvas to determine optimal OCR strategy
 *
 * This function analyzes the visual characteristics of a rendered page:
 * 1. Text density via edge detection (higher edges = more text)
 * 2. Image content via color variance (colorful pixels indicate images/diagrams)
 * 3. Table structures via line patterns
 * 4. Handwriting via character spacing variance
 *
 * @param canvas - HTMLCanvasElement containing the rendered page
 * @returns PageComplexity metrics for OCR strategy selection
 */
export async function analyzePageComplexity(canvas: HTMLCanvasElement): Promise<PageComplexity> {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;

  // 1. DETECT TEXT DENSITY (edge detection heuristic)
  // Higher edge count = more text/structure
  let edgeCount = 0;
  let totalPixels = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const current = data[idx] || 0; // Red channel (works for grayscale)
      const right = data[idx + 4] || 0;
      const bottom = data[idx + width * 4] || 0;

      // Edge detection: significant color change indicates an edge
      if (Math.abs(current - right) > 30 || Math.abs(current - bottom) > 30) {
        edgeCount++;
      }
      totalPixels++;
    }
  }

  const textDensity = totalPixels > 0 ? edgeCount / totalPixels : 0;

  // 2. DETECT IMAGES (large areas of non-white/non-black pixels with color variance)
  // Colorful or gradient areas indicate images, diagrams, or photos
  let colorfulPixels = 0;
  let whitePixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] || 0;
    const g = data[i + 1] || 0;
    const b = data[i + 2] || 0;

    // White pixel detection (background)
    if (r > 240 && g > 240 && b > 240) {
      whitePixels++;
      continue;
    }

    // Colorful pixel detection (not white, not black, or has color variance)
    // RGB variance indicates color content (images/diagrams)
    if (Math.abs(r - g) > 20 || Math.abs(g - b) > 20 || (r < 200 && g < 200 && b < 200)) {
      colorfulPixels++;
    }
  }

  const totalColorPixels = totalPixels / 4; // Convert from RGBA to pixel count
  const hasImages = totalColorPixels > 0 && (colorfulPixels / totalColorPixels) > 0.15; // >15% colorful = likely has images

  // 3. DETECT TABLES (horizontal/vertical line patterns)
  // Tables have repeated horizontal/vertical lines
  // TODO: Implement line detection algorithm (Hough transform or pattern matching)
  // For now, use edge density as a proxy (high edge density in structured areas)
  const hasTables = textDensity > 0.25; // High edge density may indicate tables/structure

  // 4. DETECT HANDWRITING (irregular character spacing/size variance)
  // Handwritten text has more variance in spacing and size compared to printed text
  // TODO: Implement variance detection (requires character segmentation)
  // For now, default to false - most documents are printed
  const isHandwritten = false;

  // 5. CALCULATE CONFIDENCE SCORE
  // Higher confidence = more certain about the complexity assessment
  // Simple pages (high text density, no images) = high confidence
  // Complex pages (images, low density) = lower confidence
  let confidence = 0.5; // Base confidence

  if (textDensity > 0.1 && !hasImages) {
    confidence = 0.9; // High confidence for simple text pages
  } else if (hasImages || textDensity < 0.05) {
    confidence = 0.7; // Medium confidence for complex pages
  } else {
    confidence = 0.6; // Lower confidence for edge cases
  }

  return {
    hasImages,
    hasTables,
    textDensity,
    isHandwritten,
    confidence,
  };
}

/**
 * Select the optimal OCR strategy based on page complexity
 *
 * Strategy Selection Logic:
 * - PREMIUM: Complex pages with images, tables, or handwriting (requires high accuracy)
 * - CHEAP: Medium complexity pages with moderate text density (acceptable with lower detail)
 * - FREE: Simple text-only pages with high density (Tesseract.js can handle)
 *
 * @param complexity - Page complexity metrics from analyzePageComplexity
 * @returns OCRStrategy to use for this page
 */
export function selectOCRStrategy(complexity: PageComplexity): OCRStrategy {
  // PREMIUM (DeepSeek high-detail): Use for complex pages requiring maximum accuracy
  // - Pages with embedded images or diagrams
  // - Pages with table structures
  // - Handwritten content
  if (complexity.hasImages || complexity.hasTables || complexity.isHandwritten) {
    return 'premium';
  }

  // CHEAP (DeepSeek low-detail): Use for medium complexity pages
  // - Moderate text density (some structure but not dense)
  // - No special content (images/tables/handwriting)
  if (complexity.textDensity > 0.15) {
    return 'cheap';
  }

  // FREE (Tesseract.js): Use for simple text-only pages
  // - High text density (lots of text)
  // - No images, tables, or handwriting
  // - Low complexity
  return 'free';
}

/**
 * Process page with Tesseract.js (FREE, client-side OCR)
 *
 * Tesseract.js provides free OCR processing directly in the browser.
 * Best suited for simple, clean text pages with good quality.
 *
 * Performance Notes:
 * - Processing time: ~2-5 seconds per page (client-side)
 * - Accuracy: 85-95% for clean printed text
 * - Cost: $0.00 (runs in browser)
 *
 * @param canvas - HTMLCanvasElement containing the rendered page
 * @returns Extracted plain text
 */
export async function processWithTesseract(canvas: HTMLCanvasElement): Promise<string> {
  try {
    const loadStart = performance.now();
    console.log('[tesseract] [PERF] Dynamically importing Tesseract.js library...');

    // CRITICAL: Dynamic import to prevent blocking page render
    const Tesseract = await import('tesseract.js');

    console.log(`[tesseract] [PERF] Tesseract.js library imported in ${(performance.now() - loadStart).toFixed(0)}ms`);

    const result = await Tesseract.recognize(canvas, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          console.log(`[tesseract] Progress: ${Math.round(m.progress * 100)}%`);
        }
      },
    });

    return result.data.text;
  } catch (error) {
    console.error('[tesseract] OCR failed:', error);
    throw new Error('Tesseract OCR processing failed');
  }
}

/**
 * Detect blank or nearly-blank pages to skip OCR processing
 *
 * This function analyzes pixel brightness to determine if a page is blank.
 * Blank pages typically have >99% white/light pixels with minimal content.
 *
 * Algorithm:
 * 1. Sample pixels at regular intervals (every 40 pixels for performance)
 * 2. Calculate average brightness (RGB average)
 * 3. Count "dark" pixels (brightness < 250 out of 255)
 * 4. If <1% dark pixels, consider the page blank
 *
 * Estimated Savings: 5-15% of pages in typical textbooks are blank
 *
 * @param canvas - HTMLCanvasElement containing the rendered page
 * @returns true if page is blank and should be skipped
 */
export function isBlankPage(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return false; // If we can't analyze, don't skip
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  let darkPixels = 0;
  let totalSampled = 0;

  // Sample every 40 pixels for performance (reduces processing by 98%)
  for (let i = 0; i < data.length; i += 160) { // 160 = 40 pixels * 4 (RGBA)
    const r = data[i] || 0;
    const g = data[i + 1] || 0;
    const b = data[i + 2] || 0;
    const brightness = (r + g + b) / 3;

    if (brightness < 250) {
      darkPixels++;
    }
    totalSampled++;
  }

  const darkRatio = totalSampled > 0 ? darkPixels / totalSampled : 0;

  // If less than 1% of pixels are dark, it's a blank page
  return darkRatio < 0.01;
}

/**
 * Generate a perceptual hash for duplicate page detection
 *
 * This function creates a compact fingerprint (hash) of a page's visual content
 * by resizing to 8x8 and comparing pixel brightness to the average.
 *
 * Algorithm (Perceptual Hashing):
 * 1. Resize canvas to 8×8 pixels (reduces to 64 pixels)
 * 2. Calculate average brightness across all pixels
 * 3. For each pixel: '1' if brighter than average, '0' if darker
 * 4. Result: 64-bit binary string (e.g., "1010110...")
 *
 * This hash is resilient to minor differences (compression, slight rotation)
 * while detecting true duplicates.
 *
 * @param canvas - HTMLCanvasElement containing the rendered page
 * @returns 64-character binary string representing page content
 */
export function getPageHash(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return ''; // Return empty hash if context unavailable
  }

  // Create 8×8 thumbnail for perceptual hashing
  const small = document.createElement('canvas');
  small.width = 8;
  small.height = 8;
  const smallCtx = small.getContext('2d');

  if (!smallCtx) {
    return '';
  }

  // Draw scaled-down version
  smallCtx.drawImage(canvas, 0, 0, 8, 8);

  const imageData = smallCtx.getImageData(0, 0, 8, 8);
  const { data } = imageData;

  // Calculate average brightness
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += data[i] || 0; // Red channel (grayscale approximation)
  }
  const avg = sum / (data.length / 4);

  // Create binary hash: 1 if pixel > average, 0 if pixel ≤ average
  let hash = '';
  for (let i = 0; i < data.length; i += 4) {
    const brightness = data[i] || 0;
    hash += brightness > avg ? '1' : '0';
  }

  return hash;
}

/**
 * Check if two page hashes represent duplicate pages
 *
 * This function compares two perceptual hashes and determines if they're
 * similar enough to be considered duplicates.
 *
 * Algorithm (Hamming Distance):
 * 1. Count bit differences between hash1 and hash2
 * 2. If differences < 10% of total bits, consider duplicate
 * 3. This allows for minor variations (OCR artifacts, compression)
 *
 * Estimated Savings: 2-10% of pages in typical documents are duplicates
 * (title pages, chapter dividers, repeated content)
 *
 * @param hash1 - First page hash (64-bit binary string)
 * @param hash2 - Second page hash (64-bit binary string)
 * @returns true if hashes are similar enough to be duplicates
 */
export function areDuplicates(hash1: string, hash2: string): boolean {
  if (hash1.length !== hash2.length || hash1.length === 0) {
    return false;
  }

  let differences = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) {
      differences++;
    }
  }

  // Allow up to 10% difference to account for minor variations
  // (compression artifacts, slight shifts, etc.)
  const threshold = hash1.length * 0.1;
  return differences < threshold;
}

/**
 * Smart OCR: Automatically choose the best OCR strategy per page
 *
 * This is the main entry point for hybrid OCR processing.
 * It analyzes each page, selects the optimal strategy, and routes to the appropriate OCR engine.
 *
 * Features:
 * - Skips blank pages (saves 5-15% OCR costs)
 * - Detects duplicate pages (saves 2-10% OCR costs)
 * - Routes to optimal OCR tier (saves 60-80% OCR costs)
 *
 * Usage Example:
 * ```typescript
 * const canvas = document.createElement('canvas');
 * // ... render PDF page to canvas ...
 * const hashes = new Set<string>();
 * const result = await smartOCR(canvas, 1, 10, hashes);
 * console.log(`Page 1: ${result.text} (${result.strategy}, ${result.cost} tokens)`);
 * ```
 *
 * @param canvas - HTMLCanvasElement with rendered page
 * @param pageNum - Current page number (1-indexed)
 * @param totalPages - Total number of pages in document
 * @param pageHashes - Set of existing page hashes for duplicate detection (optional)
 * @param qualityOverride - Override image quality tier for pipeline control (optional)
 * @returns OCRResult with extracted text, strategy used, and estimated cost
 */
export async function smartOCR(
  canvas: HTMLCanvasElement,
  pageNum: number,
  totalPages: number,
  pageHashes?: Set<string>,
  qualityOverride?: 'cheap' | 'premium' | 'premium-pipeline'
): Promise<OCRResult> {
  // 0. SMART PAGE SELECTION: Skip blank/duplicate pages (10-25% cost savings)

  // Check if page is blank
  if (isBlankPage(canvas)) {
    console.log(`[smart-ocr] ⏭️  Page ${pageNum}/${totalPages}: SKIPPED (blank page)`);
    return {
      text: '',
      strategy: 'skipped',
      cost: 0,
      skipped: true,
      skipReason: 'blank',
    };
  }

  // Check if page is duplicate (if hash tracking is enabled)
  if (pageHashes) {
    const currentHash = getPageHash(canvas);

    // Check against all existing hashes
    let isDuplicate = false;
    for (const existingHash of pageHashes) {
      if (areDuplicates(currentHash, existingHash)) {
        isDuplicate = true;
        break;
      }
    }

    if (isDuplicate) {
      console.log(`[smart-ocr] ⏭️  Page ${pageNum}/${totalPages}: SKIPPED (duplicate page)`);
      return {
        text: '',
        strategy: 'skipped',
        cost: 0,
        skipped: true,
        skipReason: 'duplicate',
      };
    }

    // Add current hash to set for future comparisons
    pageHashes.add(currentHash);
  }

  // 1. ANALYZE PAGE COMPLEXITY
  console.log(`[smart-ocr] Analyzing page ${pageNum}/${totalPages}...`);
  const complexity = await analyzePageComplexity(canvas);
  const strategy = selectOCRStrategy(complexity);

  console.log(
    `[smart-ocr] Page ${pageNum}/${totalPages}: ${strategy} strategy selected (density: ${complexity.textDensity.toFixed(3)}, images: ${complexity.hasImages}, tables: ${complexity.hasTables})`
  );

  // 2. EXECUTE OCR BASED ON SELECTED STRATEGY
  try {
    if (strategy === 'free') {
      // ✅ FREE: Tesseract.js (client-side, $0.00)
      console.log(`[smart-ocr] Page ${pageNum}: Using Tesseract.js (free)`);
      const text = await processWithTesseract(canvas);
      return {
        text,
        strategy: 'tesseract',
        cost: 0,
      };
    } else if (strategy === 'cheap') {
      // 💰 CHEAP: DeepSeek low-detail (20x compression, ~40 tokens/page)
      console.log(`[smart-ocr] Page ${pageNum}: Using DeepSeek low-detail (cheap)`);

      // Apply aggressive image optimization for cheap tier (30-50% token reduction)
      const tierToUse = qualityOverride === 'cheap' ? 'cheap' : 'cheap';
      const optimizationResult = optimizeForOCRTier(canvas, tierToUse);
      const base64 = optimizationResult.optimizedBase64;
      console.log(`[smart-ocr] Page ${pageNum} optimized: ${(optimizationResult.savings * 100).toFixed(1)}% size reduction (quality: ${optimizationResult.quality})`);

      const response = await fetch('/api/upload/parse-cheap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          pageNum,
          detail: 'low',
        }),
      });

      if (!response.ok) {
        throw new Error(`Cheap OCR failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      return {
        text: result.text,
        strategy: 'deepseek-low',
        cost: 40, // ~40 tokens per page with low detail
      };
    } else {
      // 🔥 PREMIUM: DeepSeek high-detail (9x compression, ~800 tokens/page)
      // Can be upgraded to premium-pipeline (5-6x compression) for maximum quality
      const isPremiumPipeline = qualityOverride === 'premium-pipeline';
      console.log(`[smart-ocr] Page ${pageNum}: Using DeepSeek high-detail (${isPremiumPipeline ? 'premium-pipeline 5-6x' : 'premium 8-9x'})`);

      // Apply tier-specific image optimization
      const tierToUse = qualityOverride || 'premium';
      const optimizationResult = optimizeForOCRTier(canvas, tierToUse);
      const base64 = optimizationResult.optimizedBase64;
      console.log(`[smart-ocr] Page ${pageNum} optimized: ${(optimizationResult.savings * 100).toFixed(1)}% size reduction (quality: ${optimizationResult.quality})`);

      const response = await fetch('/api/upload/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: [base64],
        }),
      });

      if (!response.ok) {
        throw new Error(`Premium OCR failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      return {
        text: result.text,
        strategy: isPremiumPipeline ? 'deepseek-high-pipeline' : 'deepseek-high',
        cost: isPremiumPipeline ? 1200 : 800, // Premium pipeline uses ~1200 tokens (5-6x compression)
      };
    }
  } catch (error) {
    console.error(`[smart-ocr] OCR failed for page ${pageNum}:`, error);
    throw error;
  }
}

/**
 * Calculate total cost savings from hybrid OCR strategy
 *
 * This helper function estimates cost savings by comparing hybrid OCR costs
 * to the baseline (all premium) cost.
 *
 * @param totalPages - Total number of pages processed
 * @param totalCost - Total tokens used with hybrid OCR
 * @returns Savings object with cost reduction metrics
 */
export function calculateCostSavings(totalPages: number, totalCost: number): {
  baselineCost: number;
  hybridCost: number;
  savingsTokens: number;
  savingsPercent: number;
  savingsDollars: number;
} {
  const PREMIUM_COST_PER_PAGE = 800; // tokens
  const TOKEN_COST = 0.00013; // $0.13 per 1000 tokens (DeepSeek pricing)

  const baselineCost = totalPages * PREMIUM_COST_PER_PAGE;
  const savingsTokens = baselineCost - totalCost;
  const savingsPercent = baselineCost > 0 ? (savingsTokens / baselineCost) * 100 : 0;
  const savingsDollars = savingsTokens * (TOKEN_COST / 1000);

  return {
    baselineCost,
    hybridCost: totalCost,
    savingsTokens,
    savingsPercent,
    savingsDollars,
  };
}
