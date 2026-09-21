import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Each /api/* module is proxied to the microservice that owns it.
//   analytics..      -> intelligence   (8001)
//   auth/employees.. -> core           (8000)
//   attendance/kiosk -> attendance     (8003)
//   shifts           -> scheduling     (8004)
//   leaves/overtime  -> timeoff        (8005)
//   timesheets       -> payroll        (8006)
//   notifications    -> communications (8007)
//   settings         -> configuration  (8008)
//   anything else    -> core           (8000)
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Service-to-service endpoints must never be reachable from the browser side: they talk to each other
      // directly, guarded by a shared token, so the public proxy answers 404 for them.
      '/api/internal': {
        target: 'http://127.0.0.1:8000',
        bypass: (req, res) => {
          res.statusCode = 404;
          res.end('Not found');
          return false;
        },
      },
      '/api/analytics': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
      },
      '/api/attendance': {
        target: 'http://127.0.0.1:8003',
        changeOrigin: true,
      },
      '/api/kiosk': {
        target: 'http://127.0.0.1:8003',
        changeOrigin: true,
      },
      '/api/shifts': {
        target: 'http://127.0.0.1:8004',
        changeOrigin: true,
      },
      '/api/leaves': {
        target: 'http://127.0.0.1:8005',
        changeOrigin: true,
      },
      '/api/overtime': {
        target: 'http://127.0.0.1:8005',
        changeOrigin: true,
      },
      '/api/timesheets': {
        target: 'http://127.0.0.1:8006',
        changeOrigin: true,
      },
      '/api/notifications': {
        target: 'http://127.0.0.1:8007',
        changeOrigin: true,
      },
      '/api/settings': {
        target: 'http://127.0.0.1:8008',
        changeOrigin: true,
      },
      '/api/employees': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/api/departments': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/api/roles': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/api/profile': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/api/auth': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})