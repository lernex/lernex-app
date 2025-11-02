/**
 * Browser Detection and Feature Support Utilities
 *
 * This module provides comprehensive browser detection and feature support
 * checking to ensure compatibility across different browser versions.
 */

import { UAParser } from 'ua-parser-js';

// Cache for parser instance
let parser: UAParser | null = null;

/**
 * Get the UAParser instance (singleton pattern)
 */
function getParser(): UAParser {
  if (typeof window === 'undefined') {
    // Server-side: create a new parser without user agent
    return new UAParser();
  }

  if (!parser) {
    parser = new UAParser(window.navigator.userAgent);
  }
  return parser;
}

/**
 * Get browser information
 */
export function getBrowserInfo() {
  if (typeof window === 'undefined') {
    return {
      name: 'unknown',
      version: '0',
      major: '0',
    };
  }

  const result = getParser().getBrowser();
  return {
    name: result.name?.toLowerCase() || 'unknown',
    version: result.version || '0',
    major: result.major || '0',
  };
}

/**
 * Get OS information
 */
export function getOSInfo() {
  if (typeof window === 'undefined') {
    return {
      name: 'unknown',
      version: '0',
    };
  }

  const result = getParser().getOS();
  return {
    name: result.name?.toLowerCase() || 'unknown',
    version: result.version || '0',
  };
}

/**
 * Get device information
 */
export function getDeviceInfo() {
  if (typeof window === 'undefined') {
    return {
      type: 'unknown',
      vendor: 'unknown',
      model: 'unknown',
    };
  }

  const result = getParser().getDevice();
  return {
    type: result.type || 'desktop',
    vendor: result.vendor || 'unknown',
    model: result.model || 'unknown',
  };
}

/**
 * Check if the browser is a specific type
 */
export function isBrowser(browserName: string): boolean {
  const info = getBrowserInfo();
  return info.name.includes(browserName.toLowerCase());
}

/**
 * Check if browser version is at least the specified version
 */
export function isMinVersion(minVersion: number): boolean {
  const info = getBrowserInfo();
  const currentVersion = parseInt(info.major, 10);
  return currentVersion >= minVersion;
}

/**
 * Check if the current browser is considered "legacy" (older than 2020)
 */
export function isLegacyBrowser(): boolean {
  const info = getBrowserInfo();
  const version = parseInt(info.major, 10);

  // Define legacy versions for major browsers
  const legacyThresholds: Record<string, number> = {
    'chrome': 80,      // Released Feb 2020
    'safari': 13,      // Released Sep 2019
    'firefox': 74,     // Released Mar 2020
    'edge': 79,        // Released Jan 2020 (Chromium)
    'opera': 67,       // Released Apr 2020
    'samsung': 11,     // Released Apr 2020
  };

  const threshold = legacyThresholds[info.name];
  if (!threshold) {
    // Unknown browser, assume modern
    return false;
  }

  return version < threshold;
}

/**
 * CSS Feature Detection
 */
export const CSSFeatures = {
  /**
   * Check if backdrop-filter is supported
   */
  supportsBackdropFilter(): boolean {
    if (typeof window === 'undefined' || typeof CSS === 'undefined') {
      return false;
    }

    // Check CSS.supports API
    if (typeof CSS.supports === 'function') {
      return (
        CSS.supports('backdrop-filter', 'blur(1px)') ||
        CSS.supports('-webkit-backdrop-filter', 'blur(1px)')
      );
    }

    // Fallback: create a test element
    const test = document.createElement('div');
    const style = test.style as CSSStyleDeclaration & { webkitBackdropFilter?: string };
    test.style.backdropFilter = 'blur(1px)';
    style.webkitBackdropFilter = 'blur(1px)';

    return !!(test.style.backdropFilter || style.webkitBackdropFilter);
  },

  /**
   * Check if CSS Grid is supported
   */
  supportsGrid(): boolean {
    if (typeof window === 'undefined' || typeof CSS === 'undefined') {
      return false;
    }

    if (typeof CSS.supports === 'function') {
      return CSS.supports('display', 'grid');
    }

    return false;
  },

  /**
   * Check if CSS custom properties (variables) are supported
   */
  supportsCustomProperties(): boolean {
    if (typeof window === 'undefined' || typeof CSS === 'undefined') {
      return false;
    }

    if (typeof CSS.supports === 'function') {
      return CSS.supports('--test', '0');
    }

    return false;
  },

  /**
   * Check if modern image formats are supported
   */
  supportsWebP(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    const elem = document.createElement('canvas');
    if (!!(elem.getContext && elem.getContext('2d'))) {
      return elem.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    }

    return false;
  },

  /**
   * Check if AVIF is supported
   */
  async supportsAVIF(): Promise<boolean> {
    if (typeof window === 'undefined') {
      return false;
    }

    return new Promise((resolve) => {
      const avif = new Image();
      avif.onload = () => resolve(true);
      avif.onerror = () => resolve(false);
      avif.src = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=';
    });
  },
};

/**
 * JavaScript Feature Detection
 */
export const JSFeatures = {
  /**
   * Check if optional chaining is supported
   * Note: This is always true in modern builds as it's transpiled by TypeScript
   */
  supportsOptionalChaining(): boolean {
    if (typeof window === 'undefined') return true;

    try {
      // Check by evaluating a function string
      return new Function('try { return (null)?.foo === undefined; } catch { return false; }')() as boolean;
    } catch {
      return false;
    }
  },

  /**
   * Check if nullish coalescing is supported
   * Note: This is always true in modern builds as it's transpiled by TypeScript
   */
  supportsNullishCoalescing(): boolean {
    if (typeof window === 'undefined') return true;

    try {
      // Check by evaluating a function string
      return new Function('try { const x = null ?? "test"; return x === "test"; } catch { return false; }')() as boolean;
    } catch {
      return false;
    }
  },

  /**
   * Check if async/await is supported
   * Note: This is always true in modern builds as it's transpiled by TypeScript
   */
  supportsAsyncAwait(): boolean {
    if (typeof window === 'undefined') return true;

    try {
      // Check by evaluating a function string
      return new Function('try { return typeof (async function(){})() === "object"; } catch { return false; }')() as boolean;
    } catch {
      return false;
    }
  },
};

/**
 * Web API Feature Detection
 */
export const WebAPIFeatures = {
  /**
   * Check if IntersectionObserver is supported
   */
  supportsIntersectionObserver(): boolean {
    return (
      typeof window !== 'undefined' &&
      'IntersectionObserver' in window
    );
  },

  /**
   * Check if MediaRecorder API is supported
   */
  supportsMediaRecorder(): boolean {
    return (
      typeof window !== 'undefined' &&
      'MediaRecorder' in window &&
      typeof window.MediaRecorder !== 'undefined'
    );
  },

  /**
   * Check if Web Audio API is supported
   */
  supportsWebAudio(): boolean {
    return (
      typeof window !== 'undefined' &&
      ('AudioContext' in window || 'webkitAudioContext' in window)
    );
  },

  /**
   * Check if localStorage is supported and accessible
   */
  supportsLocalStorage(): boolean {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return false;
      }
      const test = '__storage_test__';
      window.localStorage.setItem(test, test);
      window.localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Check if matchMedia is supported
   */
  supportsMatchMedia(): boolean {
    return (
      typeof window !== 'undefined' &&
      'matchMedia' in window &&
      typeof window.matchMedia === 'function'
    );
  },

  /**
   * Check if Web Animations API is supported
   */
  supportsWebAnimations(): boolean {
    return (
      typeof window !== 'undefined' &&
      'animate' in document.createElement('div')
    );
  },

  /**
   * Check if Intl API is supported
   */
  supportsIntl(): boolean {
    return typeof Intl !== 'undefined';
  },
};

/**
 * Get a comprehensive browser support report
 */
export function getBrowserSupportReport() {
  return {
    browser: getBrowserInfo(),
    os: getOSInfo(),
    device: getDeviceInfo(),
    isLegacy: isLegacyBrowser(),
    css: {
      backdropFilter: CSSFeatures.supportsBackdropFilter(),
      grid: CSSFeatures.supportsGrid(),
      customProperties: CSSFeatures.supportsCustomProperties(),
      webp: CSSFeatures.supportsWebP(),
    },
    js: {
      optionalChaining: JSFeatures.supportsOptionalChaining(),
      nullishCoalescing: JSFeatures.supportsNullishCoalescing(),
      asyncAwait: JSFeatures.supportsAsyncAwait(),
    },
    webAPI: {
      intersectionObserver: WebAPIFeatures.supportsIntersectionObserver(),
      mediaRecorder: WebAPIFeatures.supportsMediaRecorder(),
      webAudio: WebAPIFeatures.supportsWebAudio(),
      localStorage: WebAPIFeatures.supportsLocalStorage(),
      matchMedia: WebAPIFeatures.supportsMatchMedia(),
      webAnimations: WebAPIFeatures.supportsWebAnimations(),
      intl: WebAPIFeatures.supportsIntl(),
    },
  };
}

/**
 * Log browser support information to console (useful for debugging)
 */
export function logBrowserSupport() {
  if (typeof window === 'undefined') {
    return;
  }

  const report = getBrowserSupportReport();
  console.group('Browser Support Report');
  console.log('Browser:', report.browser);
  console.log('OS:', report.os);
  console.log('Device:', report.device);
  console.log('Legacy Browser:', report.isLegacy);
  console.group('CSS Features');
  console.table(report.css);
  console.groupEnd();
  console.group('JavaScript Features');
  console.table(report.js);
  console.groupEnd();
  console.group('Web API Features');
  console.table(report.webAPI);
  console.groupEnd();
  console.groupEnd();
}

/**
 * Add browser-specific class to document element
 * Useful for CSS targeting
 */
export function addBrowserClasses() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const info = getBrowserInfo();
  const os = getOSInfo();
  const device = getDeviceInfo();

  const classes: string[] = [];

  // Browser classes
  if (info.name) {
    classes.push(`browser-${info.name.replace(/\s+/g, '-')}`);
    classes.push(`browser-${info.name.replace(/\s+/g, '-')}-${info.major}`);
  }

  // Legacy browser class
  if (isLegacyBrowser()) {
    classes.push('legacy-browser');
  }

  // OS classes
  if (os.name) {
    classes.push(`os-${os.name.replace(/\s+/g, '-').toLowerCase()}`);
  }

  // Device classes
  if (device.type) {
    classes.push(`device-${device.type}`);
  }

  // Feature classes
  if (!CSSFeatures.supportsBackdropFilter()) {
    classes.push('no-backdrop-filter');
  }

  if (!CSSFeatures.supportsGrid()) {
    classes.push('no-grid');
  }

  // Add classes to document element
  document.documentElement.classList.add(...classes);
}
