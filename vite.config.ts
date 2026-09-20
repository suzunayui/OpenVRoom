import { defineConfig } from 'vite';
import { existsSync, readFileSync } from 'node:fs';

export default defineConfig(({ mode }) => ({
  base: './',
  publicDir: mode === 'public' ? false : 'public',
  plugins: [{
    name: 'local-avatar-config',
    resolveId(id) { if (id === 'virtual:local-avatar') return '\0local-avatar'; },
    load(id) {
      if (id !== '\0local-avatar') return;
      const config = mode !== 'public' && existsSync('src/local-avatar.json')
        ? JSON.parse(readFileSync('src/local-avatar.json', 'utf8').replace(/^\uFEFF/, '')) : null;
      return `export default ${JSON.stringify(config)};`;
    },
  }],
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  server: {
    port: 5173, strictPort: true,
    // Packaging rewrites locked Windows executables; never watch build artifacts.
    watch: { ignored: ['**/release/**', '**/.cache/**', '**/test-results/**', '**/playwright-report/**', '**/*.log'] },
  },
}));
