import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 3003,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3004',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://127.0.0.1:3004',
        changeOrigin: true,
        ws: true,
        secure: false,
      },
    },
  },
})
