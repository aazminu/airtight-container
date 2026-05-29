// Library build for QuoteTemplate consumed by server-side Puppeteer.
// Mirrors vite.config.server.ts (the invoice build) but emits a separate
// bundle so the invoice render path is never touched. server/lib/
// quote-pdf.ts dynamic-imports the JS, reads the CSS, wraps both in an
// HTML document, and hands the result to headless Chromium.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: './src/components/templates/quote/QuoteTemplate.tsx',
      formats: ['es'],
      fileName: () => 'QuoteTemplate.js',
    },
    outDir: '../server/quote-template-dist',
    assetsInlineLimit: 10_000_000,
    cssCodeSplit: false,
    emptyOutDir: true,
    rollupOptions: {
      external: ['react', 'react/jsx-runtime', 'react-dom'],
      output: {
        assetFileNames: 'QuoteTemplate[extname]',
      },
    },
    minify: false,
  },
});
