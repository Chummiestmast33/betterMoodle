import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
      },
      manifest: {
        name: 'BetterMoodle — Catedig ITL',
        short_name: 'BetterMoodle',
        description: 'Cliente PWA ultrarrápido y alertas en tiempo real para Moodle ITL.',
        start_url: '/',
        display: 'standalone',
        background_color: '#141414',
        theme_color: '#0f6cbd',
        lang: 'es-MX',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@fluentui/') || id.includes('@griffel/')) {
            return 'vendor-fluent';
          }
          if (id.includes('react-dom') || id.includes('react/') || id.includes('@tanstack/react-query')) {
            return 'vendor-react';
          }
        },
      },
    },
  },
});
