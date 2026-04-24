import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
// Vite builds the React SPA directly into app/static/dist/ so FastAPI
// can serve it without extra plumbing. The dev server runs on :5173
// and proxies API calls to the FastAPI backend on :8000.
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    build: {
        // Write into the FastAPI static dir so `/static/dist/...` resolves
        // after `npm run build` with no additional copy step.
        outDir: '../app/static/dist',
        emptyOutDir: true,
        assetsDir: 'assets',
        // Hash filenames so browsers don't serve stale builds.
        rollupOptions: {
            output: {
                entryFileNames: 'assets/[name]-[hash].js',
                chunkFileNames: 'assets/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash].[ext]',
            },
        },
    },
    server: {
        port: 5173,
        proxy: {
            // FastAPI endpoints — forward everything non-frontend to :8000.
            '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
            '/runs': { target: 'http://127.0.0.1:8000', changeOrigin: true },
            '/static': { target: 'http://127.0.0.1:8000', changeOrigin: true },
            '/health': { target: 'http://127.0.0.1:8000', changeOrigin: true },
        },
    },
});
