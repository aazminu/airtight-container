// Library build for the four printable report templates (delivery,
// in/out, P&L, S&H statement). Server-side report-pdf pipeline imports
// the produced ESM bundle and reads the compiled CSS. Mirrors the
// invoice config: assets inlined heavy so the logo data-URI ends up
// in the JS bundle (Puppeteer has no base URL after page.setContent).

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: './src/components/templates/report-templates.tsx',
      formats: ['es'],
      fileName: () => 'ReportTemplate.js',
    },
    outDir: '../server/report-template-dist',
    assetsInlineLimit: 10_000_000,
    cssCodeSplit: false,
    emptyOutDir: true,
    rollupOptions: {
      external: ['react', 'react/jsx-runtime', 'react-dom'],
      output: {
        assetFileNames: 'ReportTemplate[extname]',
      },
    },
    minify: false,
  },
});
