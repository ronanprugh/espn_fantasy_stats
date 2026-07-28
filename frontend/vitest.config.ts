import { defineConfig } from 'vitest/config'

// Node environment on purpose: the suite covers pure logic and stylesheet
// parsing (contrast math, token-name stability, navigation destinations).
// Component render tests would need jsdom + Testing Library, which this spec
// deliberately does not add. Restricting `include` to .ts keeps Vitest from
// picking up .tsx components that would fail without a DOM.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
