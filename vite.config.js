import { defineConfig } from 'vite'

export default defineConfig({
  // Root is the project folder (index.html is here)
  root: '.',
  
  // Dev server config
  server: {
    port: 5173,
    open: true,           // Auto-open browser
    cors: true,
    headers: {
      'Cache-Control': 'no-cache'  // Prevent stale module caching
    }
  },

  // Build output
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
})
