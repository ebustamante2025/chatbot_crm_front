import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/** Carpeta del CRM (donde están .env y vite.config), no el cwd del shell (p. ej. raíz del monorepo). */
const crmRoot = path.dirname(fileURLToPath(import.meta.url))

/** Origen del API para el proxy de dev (debe coincidir con VITE_API_URL en .env / .env.development). */
function apiProxyOrigin(env: Record<string, string>): string {
  const raw = (env.VITE_API_URL || '').trim()
  const m = raw.match(/^https?:\/\/[^/]+/i)
  return m ? m[0] : 'http://127.0.0.1:3004'
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, crmRoot)
  const target = apiProxyOrigin(env)

  return {
    plugins: [react()],
    base: '/',
    server: {
      port: 3009,
      strictPort: true,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
        },
        '/socket.io': {
          target,
          changeOrigin: true,
          ws: true,
          secure: false,
        },
      },
    },
  }
})
