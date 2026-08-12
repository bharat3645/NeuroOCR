import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    port: 3000,
  },
  build: {
    rollupOptions: {
      output: {
        // @tensorflow/tfjs alone accounts for the bulk of the bundle; split
        // it into its own chunk so it caches independently of app code.
        manualChunks: {
          tensorflow: ['@tensorflow/tfjs'],
        },
      },
    },
  },
});
