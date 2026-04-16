import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/admin/',
  build: {
    outDir: '../admin',
    emptyOutDir: false,
  },
  plugins: [react(), tailwindcss()],
});
