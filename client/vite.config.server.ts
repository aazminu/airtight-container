// Library build for InvoiceTemplate consumed by server-side Puppeteer.
//
// Produces a server-consumable ESM bundle + a single compiled CSS file.
// server/lib/pdf.ts dynamic-imports the JS, reads the CSS, wraps both in
// an HTML document, and hands the result to headless Chromium.
//
// Asset inlining is set very high so the airtightfixed.png logo lands in
// the JS bundle as a data URI — Puppeteer's page.setContent has no base
// URL, so external asset references would 404.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: './src/components/templates/invoice/InvoiceTemplate.tsx',
      formats: ['es'],
      fileName: () => 'InvoiceTemplate.js',
    },
    outDir: '../server/template-dist',
    assetsInlineLimit: 10_000_000,
    cssCodeSplit: false,
    emptyOutDir: true,
    rollupOptions: {
      external: ['react', 'react/jsx-runtime', 'react-dom'],
      output: {
        assetFileNames: 'InvoiceTemplate[extname]',
      },
    },
    minify: false,
  },
});
