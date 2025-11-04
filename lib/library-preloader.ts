/**
 * Smart Library Preloader
 *
 * Intelligently preloads heavy libraries (FFmpeg, PDF.js, Tesseract) to optimize UX:
 *
 * Strategy:
 * 1. Page loads instantly (libraries not in main bundle)
 * 2. Start preloading during browser idle time (requestIdleCallback)
 * 3. Prioritize PDF.js (80% of uploads) > Tesseract > FFmpeg (20% of uploads)
 * 4. Libraries ready when user needs them (0 wait time)
 *
 * This gives us the best of both worlds:
 * - Fast initial page load (< 1 second)
 * - No wait time when uploading (libraries already loaded)
 */

type LibraryStatus = 'idle' | 'loading' | 'loaded' | 'error';

interface LibraryState {
  status: LibraryStatus;
  startTime: number | null;
  loadTime: number | null;
  error: Error | null;
}

class LibraryPreloader {
  private pdfjs: LibraryState = { status: 'idle', startTime: null, loadTime: null, error: null };
  private ffmpeg: LibraryState = { status: 'idle', startTime: null, loadTime: null, error: null };
  private tesseract: LibraryState = { status: 'idle', startTime: null, loadTime: null, error: null };

  private listeners: Set<() => void> = new Set();

  /**
   * Start preloading all libraries in background during idle time
   * This ensures libraries are ready when user needs them
   */
  public startBackgroundPreload(): void {
    console.log('[library-preloader] Starting intelligent background preload...');

    // Use requestIdleCallback for non-blocking background loading
    // This loads libraries when browser is idle (not blocking user interactions)
    const schedulePreload = (fn: () => Promise<void>, delay: number = 0) => {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => {
          setTimeout(() => fn(), delay);
        }, { timeout: 5000 });
      } else {
        // Fallback for browsers without requestIdleCallback
        setTimeout(() => fn(), 2000 + delay);
      }
    };

    // PRIORITY 1: PDF.js (most common - 80% of uploads)
    // Start immediately after page becomes interactive
    schedulePreload(() => this.preloadPDFjs(), 1000);

    // PRIORITY 2: Tesseract (medium priority - 30% of PDFs need OCR)
    // Start after PDF.js has time to load
    schedulePreload(() => this.preloadTesseract(), 8000);

    // PRIORITY 3: FFmpeg (lowest priority - 20% of uploads)
    // Start last, as audio uploads are less common
    schedulePreload(() => this.preloadFFmpeg(), 15000);
  }

  /**
   * Preload PDF.js library
   */
  public async preloadPDFjs(): Promise<void> {
    if (this.pdfjs.status !== 'idle') {
      console.log(`[library-preloader] PDF.js already ${this.pdfjs.status}`);
      return;
    }

    this.pdfjs.status = 'loading';
    this.pdfjs.startTime = performance.now();
    console.log('[library-preloader] [PRIORITY 1] Preloading PDF.js...');
    this.notifyListeners();

    try {
      // Dynamic import PDF.js
      const pdfjsLib = await import('pdfjs-dist');

      // Configure worker
      if (typeof window !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      }

      this.pdfjs.status = 'loaded';
      this.pdfjs.loadTime = performance.now() - (this.pdfjs.startTime || 0);
      console.log(`[library-preloader] ✅ PDF.js preloaded in ${this.pdfjs.loadTime.toFixed(0)}ms`);
      this.notifyListeners();
    } catch (error) {
      this.pdfjs.status = 'error';
      this.pdfjs.error = error instanceof Error ? error : new Error('Failed to preload PDF.js');
      console.error('[library-preloader] ❌ PDF.js preload failed:', error);
      this.notifyListeners();
    }
  }

  /**
   * Preload FFmpeg library
   */
  public async preloadFFmpeg(): Promise<void> {
    if (this.ffmpeg.status !== 'idle') {
      console.log(`[library-preloader] FFmpeg already ${this.ffmpeg.status}`);
      return;
    }

    this.ffmpeg.status = 'loading';
    this.ffmpeg.startTime = performance.now();
    console.log('[library-preloader] [PRIORITY 3] Preloading FFmpeg (31MB, may take 10-30s)...');
    this.notifyListeners();

    try {
      // Use the existing preloadFFmpeg function from audio-processor
      const { preloadFFmpeg } = await import('./audio-processor');
      await preloadFFmpeg();

      this.ffmpeg.status = 'loaded';
      this.ffmpeg.loadTime = performance.now() - (this.ffmpeg.startTime || 0);
      console.log(`[library-preloader] ✅ FFmpeg preloaded in ${(this.ffmpeg.loadTime / 1000).toFixed(1)}s`);
      this.notifyListeners();
    } catch (error) {
      this.ffmpeg.status = 'error';
      this.ffmpeg.error = error instanceof Error ? error : new Error('Failed to preload FFmpeg');
      console.error('[library-preloader] ❌ FFmpeg preload failed:', error);
      this.notifyListeners();
    }
  }

  /**
   * Preload Tesseract.js library
   */
  public async preloadTesseract(): Promise<void> {
    if (this.tesseract.status !== 'idle') {
      console.log(`[library-preloader] Tesseract already ${this.tesseract.status}`);
      return;
    }

    this.tesseract.status = 'loading';
    this.tesseract.startTime = performance.now();
    console.log('[library-preloader] [PRIORITY 2] Preloading Tesseract.js...');
    this.notifyListeners();

    try {
      // Dynamic import Tesseract
      await import('tesseract.js');

      this.tesseract.status = 'loaded';
      this.tesseract.loadTime = performance.now() - (this.tesseract.startTime || 0);
      console.log(`[library-preloader] ✅ Tesseract.js preloaded in ${this.tesseract.loadTime.toFixed(0)}ms`);
      this.notifyListeners();
    } catch (error) {
      this.tesseract.status = 'error';
      this.tesseract.error = error instanceof Error ? error : new Error('Failed to preload Tesseract');
      console.error('[library-preloader] ❌ Tesseract.js preload failed:', error);
      this.notifyListeners();
    }
  }

  /**
   * Get loading status for all libraries
   */
  public getStatus() {
    return {
      pdfjs: { ...this.pdfjs },
      ffmpeg: { ...this.ffmpeg },
      tesseract: { ...this.tesseract },
      allReady: this.pdfjs.status === 'loaded' &&
                this.ffmpeg.status === 'loaded' &&
                this.tesseract.status === 'loaded',
      criticalReady: this.pdfjs.status === 'loaded', // PDF.js is most critical
    };
  }

  /**
   * Check if a specific library is ready
   */
  public isReady(library: 'pdfjs' | 'ffmpeg' | 'tesseract'): boolean {
    return this[library].status === 'loaded';
  }

  /**
   * Get estimated load time for a library (if not loaded yet)
   */
  public getEstimatedLoadTime(library: 'pdfjs' | 'ffmpeg' | 'tesseract'): number {
    const state = this[library];

    if (state.status === 'loaded') return 0;
    if (state.status === 'loading' && state.startTime) {
      // Return time elapsed so far
      return performance.now() - state.startTime;
    }

    // Estimated load times (in ms)
    const estimates = {
      pdfjs: 2000,      // 2 seconds
      tesseract: 3000,  // 3 seconds
      ffmpeg: 15000,    // 15 seconds (31MB download)
    };

    return estimates[library];
  }

  /**
   * Subscribe to status changes
   */
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener());
  }

  /**
   * Reset all library states (for testing)
   */
  public reset(): void {
    this.pdfjs = { status: 'idle', startTime: null, loadTime: null, error: null };
    this.ffmpeg = { status: 'idle', startTime: null, loadTime: null, error: null };
    this.tesseract = { status: 'idle', startTime: null, loadTime: null, error: null };
    this.notifyListeners();
  }
}

// Singleton instance
const libraryPreloader = new LibraryPreloader();

// Export singleton
export default libraryPreloader;

// Named exports for convenience
export const startBackgroundPreload = () => libraryPreloader.startBackgroundPreload();
export const preloadPDFjs = () => libraryPreloader.preloadPDFjs();
export const preloadFFmpeg = () => libraryPreloader.preloadFFmpeg();
export const preloadTesseract = () => libraryPreloader.preloadTesseract();
export const getLibraryStatus = () => libraryPreloader.getStatus();
export const isLibraryReady = (lib: 'pdfjs' | 'ffmpeg' | 'tesseract') => libraryPreloader.isReady(lib);
export const getEstimatedLoadTime = (lib: 'pdfjs' | 'ffmpeg' | 'tesseract') => libraryPreloader.getEstimatedLoadTime(lib);
export const subscribeToLibraryStatus = (listener: () => void) => libraryPreloader.subscribe(listener);
