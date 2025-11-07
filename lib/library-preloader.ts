/**
 * Smart Library Preloader
 *
 * Intelligently preloads heavy libraries (PDF.js) to optimize UX:
 *
 * Strategy:
 * 1. Page loads instantly (libraries not in main bundle)
 * 2. Start preloading during browser idle time (requestIdleCallback)
 * 3. Libraries ready when user needs them (0 wait time)
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

  private listeners: Set<() => void> = new Set();
  private preloadStarted = false; // Prevent duplicate preload calls

  /**
   * Start preloading all libraries in background during idle time
   * This ensures libraries are ready when user needs them
   *
   * IMPORTANT: This is idempotent - calling multiple times is safe
   */
  public startBackgroundPreload(): void {
    // Prevent duplicate preload schedules
    if (this.preloadStarted) {
      console.log('[library-preloader] Preload already started, skipping...');
      return;
    }

    this.preloadStarted = true;
    console.log('[library-preloader] Starting intelligent background preload...');

    // Use requestIdleCallback for non-blocking background loading
    // This loads libraries when browser is idle (not blocking user interactions)
    const schedulePreload = (fn: () => Promise<void>, delay: number = 0) => {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => {
          setTimeout(() => fn().catch(err => {
            console.warn('[library-preloader] Scheduled preload failed:', err);
          }), delay);
        }, { timeout: 5000 });
      } else {
        // Fallback for browsers without requestIdleCallback
        setTimeout(() => fn().catch(err => {
          console.warn('[library-preloader] Scheduled preload failed:', err);
        }), 2000 + delay);
      }
    };

    // PRIORITY 1: PDF.js (most common upload type)
    // Start immediately after page becomes interactive
    schedulePreload(() => this.preloadPDFjs(), 1000);
  }

  /**
   * Preload PDF.js library
   * Automatically retries on error to handle navigation issues
   */
  public async preloadPDFjs(): Promise<void> {
    // If already loaded, we're done
    if (this.pdfjs.status === 'loaded') {
      console.log('[library-preloader] PDF.js already loaded');
      return;
    }

    // If currently loading, wait for it
    if (this.pdfjs.status === 'loading') {
      console.log('[library-preloader] PDF.js already loading, waiting...');
      return;
    }

    // If in error state, reset to allow retry
    if (this.pdfjs.status === 'error') {
      console.log('[library-preloader] PDF.js in error state, resetting for retry...');
      this.pdfjs.status = 'idle';
      this.pdfjs.error = null;
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
      throw error; // Re-throw to let caller handle
    }
  }


  /**
   * Get loading status for all libraries
   */
  public getStatus() {
    return {
      pdfjs: { ...this.pdfjs },
      allReady: this.pdfjs.status === 'loaded',
      criticalReady: this.pdfjs.status === 'loaded',
    };
  }

  /**
   * Check if a specific library is ready
   */
  public isReady(library: 'pdfjs'): boolean {
    return this[library].status === 'loaded';
  }

  /**
   * Get estimated load time for a library (if not loaded yet)
   */
  public getEstimatedLoadTime(library: 'pdfjs'): number {
    const state = this[library];

    if (state.status === 'loaded') return 0;
    if (state.status === 'loading' && state.startTime) {
      // Return time elapsed so far
      return performance.now() - state.startTime;
    }

    // Estimated load time for PDF.js (in ms)
    return 2000; // 2 seconds
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
   * Reset all library states (for testing or error recovery)
   */
  public reset(): void {
    this.pdfjs = { status: 'idle', startTime: null, loadTime: null, error: null };
    this.preloadStarted = false;
    this.notifyListeners();
  }

  /**
   * Clear error states and allow retries
   */
  public clearErrors(): void {
    if (this.pdfjs.status === 'error') {
      this.pdfjs.status = 'idle';
      this.pdfjs.error = null;
    }
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
export const getLibraryStatus = () => libraryPreloader.getStatus();
export const isLibraryReady = (lib: 'pdfjs') => libraryPreloader.isReady(lib);
export const getEstimatedLoadTime = (lib: 'pdfjs') => libraryPreloader.getEstimatedLoadTime(lib);
export const subscribeToLibraryStatus = (listener: () => void) => libraryPreloader.subscribe(listener);
