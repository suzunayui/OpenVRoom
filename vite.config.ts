import { defineConfig } from 'vite';
import { existsSync, readFileSync } from 'node:fs';

export default defineConfig(({ mode, command }) => ({
  base: './',
  publicDir: mode === 'public' ? false : 'public',
  plugins: [{
    name: 'local-avatar-config',
    transformIndexHtml(html) {
      const base = mode === 'public' ? '/room/' : command === 'serve' ? '/' : undefined;
      return base ? html.replace('<head>', `<head><base href="${base}">`) : html;
    },
    resolveId(id) { if (id === 'virtual:local-avatar') return '\0local-avatar'; },
    load(id) {
      if (id !== '\0local-avatar') return;
      const config = !['public', 'test'].includes(mode) && existsSync('src/local-avatar.json')
        ? JSON.parse(readFileSync('src/local-avatar.json', 'utf8').replace(/^\uFEFF/, '')) : null;
      return `export default ${JSON.stringify(config)};`;
    },
  }],
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  server: {
    port: 5173, strictPort: true,
    proxy: { '/room/signal': { target: 'ws://127.0.0.1:8080', ws: true } },
    // Packaging rewrites locked Windows executables; never watch build artifacts.
    watch: { ignored: ['**/release/**', '**/.cache/**', '**/test-results/**', '**/playwright-report/**', '**/*.log'] },
  },
}));
