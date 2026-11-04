import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Mesmos cabeçalhos do nginx de produção (nginx.conf.template) no servidor local.
// A CSP fica só no nginx: o servidor de dev do Vite injeta scripts inline (HMR / React Refresh).
const securityHeaders = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}

// Não expõe o relógio da máquina no cabeçalho Date
const disableDateHeader = (req, res, next) => {
  res.sendDate = false
  next()
}

const noDateHeader = {
  name: 'no-date-header',
  configureServer(server) {
    server.middlewares.use(disableDateHeader)
  },
  configurePreviewServer(server) {
    server.middlewares.use(disableDateHeader)
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), noDateHeader],
  server: {
    host: '0.0.0.0',
    port: 5173,
    headers: securityHeaders,
    // O front não é consumido por outras origens: sem CORS (o padrão do Vite libera qualquer origem localhost)
    cors: false,
    hmr: {
      clientPort: 8080,
    },
    watch: {
      usePolling: true,
    },
  },
  preview: {
    headers: securityHeaders,
    cors: false,
  },
})
