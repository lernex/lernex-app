import { optimizeForOCR } from './image-optimizer';

/**
 * PERFORMANCE FIX: PDF.js is dynamically imported only when needed to prevent
 * blocking the upload page render. This significantly reduces initial bundle size.
 */

/**
 * Convert a PDF file to an array of base64-encoded images (one per page)
 *
 * Configuration for DeepSeek OCR:
 * - Scale: 2.5 for high-resolution rendering (better OCR accuracy)
 * - Compression Ratio: 9x (97% accuracy)
 * - Output Format: JPEG at 0.95 quality
 *
 * At scale 2.5, a standard page (~8.5x11) renders at approximately 2560x3300 pixels
 * This high resolution enables DeepSeek OCR to achieve 97% accuracy with 9x compression
 */
export async function convertPdfToImages(file: File): Promise<string[]> {
  const loadStart = performance.now();
  console.log('[pdf-to-images] [PERF] Dynamically importing PDF.js library...');

  // CRITICAL: Dynamic import to prevent blocking page render
  const pdfjsLib = await import('pdfjs-dist');

  // Configure PDF.js worker - use file from public directory
  if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  }

  console.log(`[pdf-to-images] [PERF] PDF.js library imported in ${(performance.now() - loadStart).toFixed(0)}ms`);

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  const images: string[] = [];

  console.log(`[pdf-to-images] Converting PDF with ${numPages} pages`);

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);

    // Scale 2.5 provides high-resolution images for optimal DeepSeek OCR accuracy
    // Higher resolution = better OCR quality with 9x compression ratio
    const scale = 2.5;
    const viewport = page.getViewport({ scale });

    // Create canvas
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('Could not get canvas context');
    }

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    // Render PDF page to canvas
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };

    await page.render(renderContext).promise;

    // Apply aggressive image optimization (30-50% token reduction)
    const optimizationResult = optimizeForOCR(canvas);
    images.push(optimizationResult.optimizedBase64);

    console.log(`[pdf-to-images] Converted page ${pageNum}/${numPages} (${viewport.width.toFixed(0)}x${viewport.height.toFixed(0)}px) - optimized ${(optimizationResult.savings * 100).toFixed(1)}%`);
  }

  return images;
}

/**
 * Convert a PDF file to an array of canvas elements (for smart OCR analysis)
 *
 * This function is used by the hybrid OCR system to analyze page complexity
 * before selecting the optimal OCR strategy.
 *
 * @param file - PDF file to convert
 * @returns Array of HTMLCanvasElement (one per page)
 */
export async function convertPdfToCanvases(file: File): Promise<HTMLCanvasElement[]> {
  const loadStart = performance.now();
  console.log('[pdf-to-canvases] [PERF] Dynamically importing PDF.js library...');

  // CRITICAL: Dynamic import to prevent blocking page render
  const pdfjsLib = await import('pdfjs-dist');

  // Configure PDF.js worker - use file from public directory
  if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  }

  console.log(`[pdf-to-canvases] [PERF] PDF.js library imported in ${(performance.now() - loadStart).toFixed(0)}ms`);

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  const canvases: HTMLCanvasElement[] = [];

  console.log(`[pdf-to-canvases] Converting PDF with ${numPages} pages to canvases`);

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);

    // Scale 2.5 provides high-resolution images for optimal OCR accuracy
    const scale = 2.5;
    const viewport = page.getViewport({ scale });

    // Create canvas
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('Could not get canvas context');
    }

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    // Render PDF page to canvas
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };

    await page.render(renderContext).promise;

    canvases.push(canvas);

    console.log(`[pdf-to-canvases] Rendered page ${pageNum}/${numPages} (${viewport.width.toFixed(0)}x${viewport.height.toFixed(0)}px)`);
  }

  return canvases;
}

/**
 * Convert an image file to base64 data URL
 */
export async function convertImageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert image to base64'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}
