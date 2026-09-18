import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { persistencePlugin } from './server/persistencePlugin'

export default defineConfig({
  // GitHub Pages serves this project from /Seedream-T-lab/ instead of the domain root.
  base: process.env.GITHUB_ACTIONS ? '/Seedream-T-lab/' : '/',
  server: { host: '127.0.0.1', port: 5175, strictPort: true },
  plugins: [react(), persistencePlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
