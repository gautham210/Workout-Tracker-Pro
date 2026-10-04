import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Dev: /api/* is proxied to the serverless functions. Run `vercel dev` (default
// http://localhost:3000) in another terminal, or set VITE_API_PROXY to another origin.
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': { target: process.env.VITE_API_PROXY || 'http://localhost:3000', changeOrigin: true },
    },
  },
})
