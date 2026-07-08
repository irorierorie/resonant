import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@resonant/shared': new URL('../shared/src/index.ts', import.meta.url).pathname,
    },
  },
  define: {
    __BUILD_ID__: JSON.stringify(process.env.BUILD_ID ?? 'dev'),
  },
  build: {
    outDir: 'build',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Split rarely-changing vendor code into long-cached chunks so
        // day-to-day deploys only invalidate the app chunk.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          markdown: ['marked', 'dompurify'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3099',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:3099',
        ws: true,
      },
    },
  },
});
