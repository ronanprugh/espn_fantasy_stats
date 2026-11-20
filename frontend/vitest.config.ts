import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Two kinds of test:
// - `*.test.ts`: pure logic and stylesheet parsing (contrast math, token-name
//   stability, navigation destinations), in Node, fast and DOM-free.
// - `*.test.tsx`: components rendered with Testing Library, in jsdom.
export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        test: { name: 'unit', environment: 'node', include: ['src/**/*.test.ts'] },
      },
      {
        plugins: [react()],
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['src/test/setup.ts'],
        },
      },
    ],
  },
})
