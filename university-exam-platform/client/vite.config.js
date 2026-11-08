
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import process from 'node:process'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')

  return {
    base: '/Group_N/',

    plugins: [react()],

    server: {
      proxy: {
        '/api': {
          target:
            env.VITE_API_PROXY_TARGET ||
            process.env.VITE_API_PROXY_TARGET ||
            'http://localhost:5000',
          changeOrigin: true,
        },
      },
    },
  }
})
