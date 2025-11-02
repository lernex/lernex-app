/**
 * Polyfills for Browser Compatibility
 *
 * This file loads polyfills conditionally based on browser support.
 * Only loads what's needed to minimize bundle size impact.
 */

// Core polyfills for ES6+ features
import 'core-js/stable';
import 'regenerator-runtime/runtime';

// Note: IntersectionObserver polyfill removed as it's been baseline since 2019
// and well-supported in all browsers we target (Chrome 70+, Safari 12+, etc.)

// Polyfill for matchMedia (used for theme detection)
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = function(query: string) {
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener: function() {},
      removeListener: function() {},
      addEventListener: function() {},
      removeEventListener: function() {},
      dispatchEvent: function() { return true; },
    } as MediaQueryList;
  };
}

// Note: Web Animations API polyfill removed as it's well-supported
// in all browsers we target (Chrome 70+, Safari 12+, Firefox 65+, etc.)
// Web Animations API has been baseline since Chrome 36, Firefox 48, Safari 13.1

// Initialize browser detection and add classes
if (typeof window !== 'undefined') {
  // Run browser detection after DOM is loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
      const { addBrowserClasses } = await import('./browser-detection');
      addBrowserClasses();
    });
  } else {
    // DOM already loaded, run immediately
    import('./browser-detection').then(({ addBrowserClasses }) => {
      addBrowserClasses();
    });
  }
}

// Export empty object to make this a module
export {};
