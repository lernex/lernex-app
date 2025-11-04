/**
 * Aggressive Image Preprocessing for OCR Token Reduction
 *
 * This module implements intelligent image optimization to reduce vision token usage
 * by 30-50% while maintaining OCR accuracy. Optimizations include:
 *
 * 1. Whitespace Cropping: Remove empty margins (~15-30% size reduction)
 * 2. Adaptive Quality: Dynamic JPEG quality based on content type (~10-20% reduction)
 * 3. Smart Compression: Balance file size vs OCR accuracy
 *
 * Integration:
 * - Used by smart-ocr.ts before sending images to OCR APIs
 * - Applied to both cheap (low-detail) and premium (high-detail) OCR tiers
 * - Processes canvases rendered from PDFs at scale 2.5
 *
 * Expected Impact:
 * - 30-50% reduction in base64 payload size
 * - Faster API request/response times
 * - Minimal OCR accuracy impact (<2%)
 * - Reduced token costs for vision models
 */

export interface OptimizationResult {
  optimizedBase64: string;
  originalSize: number;
  optimizedSize: number;
  savings: number;
  croppedDimensions: {
    width: number;
    height: number;
  };
  quality: number;
}

/**
 * Crop whitespace and margins from image
 *
 * Analyzes pixel brightness to detect content boundaries and removes
 * empty whitespace around the edges. Adds 20px padding to avoid cutting
 * off content.
 *
 * Algorithm:
 * 1. Scan from edges inward to find first non-white pixels
 * 2. Define content boundaries (top, bottom, left, right)
 * 3. Add 20px padding for safety
 * 4. Create new canvas with cropped dimensions
 *
 * @param canvas - Original canvas with potential whitespace
 * @returns Cropped canvas with minimal margins
 */
function cropWhitespace(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.warn('[image-optimizer] No canvas context, skipping crop');
    return canvas;
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;

  let top = 0;
  let left = 0;
  let right = width;
  let bottom = height;

  const BRIGHTNESS_THRESHOLD = 250; // Pixels darker than this are considered content
  const PADDING = 20; // Add padding to avoid cutting off content

  // Find top edge (scan top to bottom)
  topLoop:
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx] || 0;
      const g = data[idx + 1] || 0;
      const b = data[idx + 2] || 0;
      const brightness = (r + g + b) / 3;

      if (brightness < BRIGHTNESS_THRESHOLD) {
        // Found content
        top = Math.max(0, y - PADDING);
        break topLoop;
      }
    }
  }

  // Find bottom edge (scan bottom to top)
  bottomLoop:
  for (let y = height - 1; y >= top; y--) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx] || 0;
      const g = data[idx + 1] || 0;
      const b = data[idx + 2] || 0;
      const brightness = (r + g + b) / 3;

      if (brightness < BRIGHTNESS_THRESHOLD) {
        // Found content
        bottom = Math.min(height, y + PADDING);
        break bottomLoop;
      }
    }
  }

  // Find left edge (scan left to right)
  leftLoop:
  for (let x = 0; x < width; x++) {
    for (let y = top; y < bottom; y++) {
      const idx = (y * width + x) * 4;
      const r = data[idx] || 0;
      const g = data[idx + 1] || 0;
      const b = data[idx + 2] || 0;
      const brightness = (r + g + b) / 3;

      if (brightness < BRIGHTNESS_THRESHOLD) {
        // Found content
        left = Math.max(0, x - PADDING);
        break leftLoop;
      }
    }
  }

  // Find right edge (scan right to left)
  rightLoop:
  for (let x = width - 1; x >= left; x--) {
    for (let y = top; y < bottom; y++) {
      const idx = (y * width + x) * 4;
      const r = data[idx] || 0;
      const g = data[idx + 1] || 0;
      const b = data[idx + 2] || 0;
      const brightness = (r + g + b) / 3;

      if (brightness < BRIGHTNESS_THRESHOLD) {
        // Found content
        right = Math.min(width, x + PADDING);
        break rightLoop;
      }
    }
  }

  // Calculate crop dimensions
  const cropWidth = right - left;
  const cropHeight = bottom - top;

  // If crop would be too small or invalid, return original canvas
  if (cropWidth <= 0 || cropHeight <= 0 || cropWidth < width * 0.3 || cropHeight < height * 0.3) {
    console.warn('[image-optimizer] Invalid crop dimensions, using original canvas');
    return canvas;
  }

  // Create cropped canvas
  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = cropWidth;
  croppedCanvas.height = cropHeight;
  const croppedCtx = croppedCanvas.getContext('2d');

  if (!croppedCtx) {
    console.warn('[image-optimizer] Failed to create cropped canvas context');
    return canvas;
  }

  // Draw cropped region onto new canvas
  croppedCtx.drawImage(
    canvas,
    left, top, cropWidth, cropHeight, // Source rectangle
    0, 0, cropWidth, cropHeight       // Destination rectangle
  );

  const reductionPct = ((1 - (cropWidth * cropHeight) / (width * height)) * 100).toFixed(1);
  console.log(`[image-optimizer] Cropped ${width}x${height} → ${cropWidth}x${cropHeight} (${reductionPct}% area reduction)`);

  return croppedCanvas;
}

/**
 * Determine optimal JPEG quality based on content analysis
 *
 * Analyzes color variance to distinguish between:
 * - Text-heavy pages: Low variance, can use lower quality (0.7)
 * - Mixed content: Medium variance, use balanced quality (0.8)
 * - Image-heavy pages: High variance, need higher quality (0.9)
 *
 * This adaptive approach ensures OCR accuracy while minimizing file size.
 *
 * @param canvas - Canvas to analyze
 * @returns Optimal JPEG quality (0.7-0.9)
 */
function getOptimalQuality(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return 0.85; // Default quality
  }

  // Sample the image for performance (every 10th pixel)
  const sampleRate = 10;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  let variance = 0;
  let samples = 0;

  // Calculate color variance across sampled pixels
  for (let i = 0; i < data.length; i += 4 * sampleRate) {
    const r = data[i] || 0;
    const g = data[i + 1] || 0;
    const b = data[i + 2] || 0;

    // Calculate variance between RGB channels
    // High variance = colorful content (images/diagrams)
    // Low variance = grayscale/text content
    const diff = Math.abs(r - g) + Math.abs(g - b) + Math.abs(b - r);
    variance += diff;
    samples++;
  }

  const avgVariance = samples > 0 ? variance / samples : 0;

  // Quality selection based on content type
  if (avgVariance < 10) {
    // Pure text: Low color variance, can use aggressive compression
    console.log('[image-optimizer] Text-heavy content detected, using quality 0.7');
    return 0.7;
  } else if (avgVariance < 30) {
    // Mixed content: Moderate variance, use balanced compression
    console.log('[image-optimizer] Mixed content detected, using quality 0.8');
    return 0.8;
  } else {
    // Image-heavy: High variance, preserve quality
    console.log('[image-optimizer] Image-heavy content detected, using quality 0.9');
    return 0.9;
  }
}

/**
 * Optimize canvas for OCR processing
 *
 * Main optimization pipeline:
 * 1. Crop whitespace from edges (15-30% reduction)
 * 2. Analyze content to determine optimal quality
 * 3. Convert to JPEG with adaptive quality
 * 4. Return optimized base64 with metrics
 *
 * This function is called before sending images to OCR APIs to reduce
 * token usage while maintaining accuracy.
 *
 * @param canvas - Original canvas (typically 2560x3300px from PDF rendering)
 * @returns OptimizationResult with compressed base64 and metrics
 */
export function optimizeForOCR(canvas: HTMLCanvasElement): OptimizationResult {
  // Capture original size for comparison
  const originalDataURL = canvas.toDataURL('image/jpeg', 0.95);
  const originalSize = originalDataURL.length;

  // Step 1: Crop whitespace
  const croppedCanvas = cropWhitespace(canvas);

  // Step 2: Determine optimal quality
  const quality = getOptimalQuality(croppedCanvas);

  // Step 3: Generate optimized image
  const optimizedBase64 = croppedCanvas.toDataURL('image/jpeg', quality);
  const optimizedSize = optimizedBase64.length;

  // Calculate savings
  const savings = originalSize > 0 ? 1 - (optimizedSize / originalSize) : 0;
  const savingsPct = (savings * 100).toFixed(1);

  console.log(`[image-optimizer] Optimization complete: ${originalSize} → ${optimizedSize} bytes (${savingsPct}% reduction, quality: ${quality})`);

  return {
    optimizedBase64,
    originalSize,
    optimizedSize,
    savings,
    croppedDimensions: {
      width: croppedCanvas.width,
      height: croppedCanvas.height,
    },
    quality,
  };
}

/**
 * Optimize canvas with tier-specific settings
 *
 * Different OCR tiers have different quality requirements:
 * - Cheap tier (low-detail): More aggressive compression acceptable
 * - Premium tier (high-detail): Preserve more quality (standard 8-9x compression)
 * - Premium-pipeline tier: Maximum quality for premium pipeline (5-6x compression)
 *
 * This function applies tier-specific overrides to the optimization process.
 *
 * @param canvas - Canvas to optimize
 * @param tier - OCR tier ('cheap' | 'premium' | 'premium-pipeline')
 * @returns OptimizationResult with tier-optimized compression
 */
export function optimizeForOCRTier(
  canvas: HTMLCanvasElement,
  tier: 'cheap' | 'premium' | 'premium-pipeline'
): OptimizationResult {
  // Get base optimization
  const result = optimizeForOCR(canvas);

  // For cheap tier, apply additional compression if quality is high
  if (tier === 'cheap' && result.quality > 0.75) {
    console.log('[image-optimizer] Applying cheap-tier compression override');

    const croppedCanvas = cropWhitespace(canvas);
    const overrideQuality = 0.7; // Force lower quality for cheap tier

    const recompressedBase64 = croppedCanvas.toDataURL('image/jpeg', overrideQuality);
    const recompressedSize = recompressedBase64.length;
    const newSavings = result.originalSize > 0 ? 1 - (recompressedSize / result.originalSize) : 0;

    return {
      ...result,
      optimizedBase64: recompressedBase64,
      optimizedSize: recompressedSize,
      savings: newSavings,
      quality: overrideQuality,
    };
  }

  // For premium-pipeline tier, use maximum quality (5-6x compression ratio)
  if (tier === 'premium-pipeline') {
    console.log('[image-optimizer] Applying premium-pipeline quality override (5-6x compression)');

    const croppedCanvas = cropWhitespace(canvas);
    const overrideQuality = 0.95; // Maximum quality for premium pipeline

    const recompressedBase64 = croppedCanvas.toDataURL('image/jpeg', overrideQuality);
    const recompressedSize = recompressedBase64.length;
    const newSavings = result.originalSize > 0 ? 1 - (recompressedSize / result.originalSize) : 0;

    return {
      ...result,
      optimizedBase64: recompressedBase64,
      optimizedSize: recompressedSize,
      savings: newSavings,
      quality: overrideQuality,
    };
  }

  // For standard premium tier, ensure minimum quality (standard 8-9x compression)
  if (tier === 'premium' && result.quality < 0.8) {
    console.log('[image-optimizer] Applying premium-tier quality override');

    const croppedCanvas = cropWhitespace(canvas);
    const overrideQuality = 0.85; // Ensure good quality for premium tier

    const recompressedBase64 = croppedCanvas.toDataURL('image/jpeg', overrideQuality);
    const recompressedSize = recompressedBase64.length;
    const newSavings = result.originalSize > 0 ? 1 - (recompressedSize / result.originalSize) : 0;

    return {
      ...result,
      optimizedBase64: recompressedBase64,
      optimizedSize: recompressedSize,
      savings: newSavings,
      quality: overrideQuality,
    };
  }

  return result;
}
