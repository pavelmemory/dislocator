import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config. In dev, proxy /api to the backend so the SPA works without the
// reverse proxy. In production the app is served by nginx behind Caddy and
// VITE_API_BASE defaults to "/api" (same origin).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
