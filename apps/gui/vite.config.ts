import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const guiRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: `${guiRoot}src`,
  build: {
    outDir: `${guiRoot}dist`,
    emptyOutDir: true,
  },
});
