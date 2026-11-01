// Dev server without HMR/file watching, so long scripted runs (playtests,
// trailer capture) never get reloaded by edits made while they run.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  root: path.resolve(__dirname, '../..'),
  plugins: [react()],
  server: { port: 5174, strictPort: true, hmr: false, watch: null },
})
