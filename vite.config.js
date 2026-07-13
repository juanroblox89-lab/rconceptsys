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
  },

  // Exclude project source files from Vite's dep optimization
  // to prevent es-module-lexer from failing on complex JS patterns
  optimizeDeps: {
    exclude: ['@supabase/supabase-js', '@supabase/ssr'],
    esbuildOptions: {
      target: 'es2020'
    }
  }
})
