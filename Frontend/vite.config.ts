import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import packageJson from './package.json' with { type: 'json' };
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  legacy: {
    // react-use-websocket exposes its hook via CJS `exports.default`; Rolldown's
    // stricter interop in Vite 8 returns undefined. Drop when the lib ships ESM.
    inconsistentCjsInterop: true,
  },
  server: {
    port: 2882,
  },
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  build: {
    // Add cache busting for assets with content hashing
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]',
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return;
          if (id.includes('framer-motion')) return 'framer-motion';
          if (id.includes('mp4box')) return 'mp4box';
          if (id.includes('react-dom')) return 'react-dom';
          if (id.includes('react-dnd')) return 'react-dnd';
          if (id.includes('lucide')) return 'lucide';
          return 'vendor';
        },
      },
    },
    // Ensure no caching issues by generating proper cache headers
    manifest: true,
  },
});
