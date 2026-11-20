import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Unmount whatever a test rendered, so the next starts from an empty page.
afterEach(cleanup)

// jsdom has no matchMedia (useIsMobile reads it): report a desktop-width
// window that never changes.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
