import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In production NGINX serves the built assets and proxies /api to the backend (Node now, Spring Boot later).
// Development: `npm run dev` = mock data; `npm run dev:db` = the real server in ./server.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:4000' }, // the Node/Postgres server in ./server (npm run dev:db uses it)
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
