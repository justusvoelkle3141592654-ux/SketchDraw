import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** The React refresh preamble is an inline script; allow it only for the dev server. */
function devCsp(): Plugin {
  return {
    name: 'cforge-dev-csp',
    apply: 'serve',
    transformIndexHtml: (html) => html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"),
  };
}

export default defineConfig({
  plugins: [react(), devCsp()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome130',
    sourcemap: false,
  },
  server: { port: 5183, strictPort: true },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
