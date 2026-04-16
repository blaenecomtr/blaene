import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/admin/',
  build: {
    outDir: '../admin',
    emptyOutDir: true,
  },
  plugins: [react()],
})
