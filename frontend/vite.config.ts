import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    watch: {
      usePolling: true,
    },
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://backend:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: process.env.WS_PROXY_TARGET || 'ws://backend:8000',
        ws: true,
      },
      // Presenton editor proxy — routes /presenton-proxy/* to the Presenton container.
      // This keeps Presenton off the public network; the browser never needs port 7771.
      '/presenton-proxy': {
        target: process.env.PRESENTON_PROXY_TARGET || 'http://presenton:11000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/presenton-proxy/, ''),
      },
    },
  },
})
