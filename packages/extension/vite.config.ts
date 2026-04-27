import { crx } from '@crxjs/vite-plugin';
import { defineConfig } from 'vite';
import manifest from './manifest.json' with { type: 'json' };

export default defineConfig({
  plugins: [crx({ manifest })],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
  define: {
    __BACKEND_URL__: JSON.stringify(process.env.BACKEND_URL ?? 'http://localhost:3000'),
    __SHARED_SECRET__: JSON.stringify(process.env.EXTENSION_SHARED_SECRET ?? 'local-dev-secret'),
  },
});
