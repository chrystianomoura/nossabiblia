import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Web Analytics da Cloudflare (medida de visitas, sem cookie): o script só entra no site compilado, não no desenvolvimento, para o
// localhost não aparecer nas medidas. O token é público (aparece em qualquer página que usa o serviço); a política de conteúdo libera o endereço
// do script e o de envio (scripts/write-headers.mjs).
const webAnalytics = {
  name: 'web-analytics',
  apply: 'build',
  transformIndexHtml: () => [{
    tag: 'script',
    attrs: { defer: true, src: 'https://static.cloudflareinsights.com/beacon.min.js', 'data-cf-beacon': '{"token": "23cd4180235a4ee88c2424fea0a8c573"}' },
    injectTo: 'body',
  }],
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), webAnalytics],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
