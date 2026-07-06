import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Keep in sync with BASE_PATH in src/base.ts and the paths in vercel.json.
const BASE_PATH = '/espn-fantasy-stats'

export default defineConfig({
  base: `${BASE_PATH}/`,
  plugins: [react()],
  server: {
    proxy: {
      // API calls carry the base path prefix (see src/api.ts); the local
      // FastAPI backend serves plain /api/*, so strip the prefix here.
      [`${BASE_PATH}/api`]: {
        target: 'http://localhost:8000',
        rewrite: (path) => path.replace(new RegExp(`^${BASE_PATH}`), ''),
      },
    },
  },
})
