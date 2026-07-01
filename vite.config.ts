import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Explicit content-hashed asset filenames so the browser is forced to
    // download new bundles on every deploy. index.html itself must never be
    // cached (see public/_headers) — as long as the HTML is fresh, the hashed
    // asset filenames it references guarantee no stale JS/CSS is served.
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
