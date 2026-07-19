import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BASE = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  plugins: [react()],
  base: BASE,
  server: {
    headers: { 'Cache-Control': 'no-store' }
  },
})
