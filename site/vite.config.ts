import tailwindcss from '@tailwindcss/vite';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';

export default defineConfig({
  base: process.env.SITE_BASE_PATH || '/Proof/',
  plugins: [tailwindcss()],
  build: {
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        home: fileURLToPath(new URL('./index.html', import.meta.url)),
        docs: fileURLToPath(new URL('./docs/index.html', import.meta.url)),
      },
    },
  },
});
