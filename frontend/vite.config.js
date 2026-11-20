var _a;
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Keep in sync with BASE_PATH in src/base.ts and the paths in vercel.json.
var BASE_PATH = '/espn-fantasy-stats';
export default defineConfig({
    base: "".concat(BASE_PATH, "/"),
    plugins: [react()],
    server: {
        proxy: (_a = {},
            // API calls carry the base path prefix (see src/api.ts); the local
            // FastAPI backend serves plain /api/*, so strip the prefix here.
            _a["".concat(BASE_PATH, "/api")] = {
                target: 'http://localhost:8000',
                rewrite: function (path) { return path.replace(new RegExp("^".concat(BASE_PATH)), ''); },
            },
            _a),
    },
});
