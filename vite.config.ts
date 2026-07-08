import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

// A unique id per build. Baked into the bundle as __BUILD_ID__ and written to
// dist/version.json, so a long-running tab can poll and detect a new deploy.
const BUILD_ID = new Date().toISOString()

// Emit dist/version.json at the end of the build with the same id.
function emitVersion() {
  return {
    name: 'emit-version-json',
    apply: 'build' as const,
    closeBundle() {
      const outDir = resolve(__dirname, 'dist')
      mkdirSync(outDir, { recursive: true })
      writeFileSync(resolve(outDir, 'version.json'), JSON.stringify({ buildId: BUILD_ID }))
    },
  }
}

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [react(), emitVersion()],
  build: {
    // Explicit content-hashed asset filenames so the browser is forced to
    // download new bundles on every deploy. index.html itself must never be
    // cached (see public/_headers) — as long as the HTML is fresh, the hashed
    // asset filenames it references guarantee no stale JS/CSS is served. The
    // version.json check above covers the remaining case: a tab left open
    // across a deploy, which keeps running old JS until it is reloaded.
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
