import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Unmount every rendered tree between tests so effects (timers, abort
// controllers, storage writes) from one case cannot leak into the next.
afterEach(() => {
  cleanup()
})

// jsdom does not implement these; several product components read them.
if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    })
  }

  if (!window.scrollTo) window.scrollTo = () => {}

  // React Bits primitives (HoldButton, GlassSurface) measure themselves with
  // ResizeObserver, which jsdom does not implement.
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      constructor(callback) { this.callback = callback; }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }

  if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
  }

  // Default to online; individual tests override this when they need offline.
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => true,
  })
}
