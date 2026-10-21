import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// The API runs inside the Vite dev server, so `npm run dev` is the only command.
export default defineConfig({
  plugins: [{
    name: 'animahou-api',
    async configureServer(server) {
      const { app } = await import('./server/app.js');
      server.middlewares.use((req, res, next) => (req.url.startsWith('/api') || req.url.startsWith('/uploads') ? app(req, res, next) : next()));
    },
  }],
  server: { watch: { ignored: ['**/server/animahou.db*', '**/server/uploads/**'] } },
  build: { rollupOptions: { input: { main: resolve('index.html'), admin: resolve('admin.html') } } },
});
