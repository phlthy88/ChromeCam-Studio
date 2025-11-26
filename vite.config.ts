import path from 'path';
import { defineConfig, loadEnv, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const isDev = mode === 'development';
  const isProd = mode === 'production';

  // Base configuration shared between dev and prod
  const baseConfig: UserConfig = {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        '@components': path.resolve(__dirname, 'components'),
        '@ui': path.resolve(__dirname, 'components/ui'),
        '@styles': path.resolve(__dirname, 'styles'),
      },
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
      __DEV__: JSON.stringify(isDev),
      __PROD__: JSON.stringify(isProd),
    },
    plugins: [react()],
    // =========================================================================
    // WORKER CONFIG: Use 'iife' format to ensure proper polyfill setup
    // This ensures imports are bundled sequentially and polyfills are available
    // =========================================================================
    worker: {
      format: 'iife',
      plugins: () => [react()],
      rollupOptions: {
        output: {
          entryFileNames: 'workers/[name].[hash].js',
        },
      },
    },
    // Only include wasm, as model files are now bundled.
    assetsInclude: ['**/*.wasm'],
  };

  // Development-specific configuration
  if (isDev) {
    return {
      ...baseConfig,
      mode: 'development',
      server: {
        port: 3001,
        strictPort: true,
        host: true,
        cors: true,
        
        hmr: {
          clientPort: 3001,
          timeout: 30000,
          overlay: false,
        },

        watch: {
          usePolling: false,
          ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
        },
        
        headers: {
          'Content-Security-Policy': [
            "default-src 'self'",
            "script-src 'self' 'unsafe-eval' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://storage.googleapis.com",
            "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com",
            "img-src 'self' blob: data:",
            "media-src 'self' blob:",
            "connect-src 'self' ws: wss: https://cdn.jsdelivr.net https://storage.googleapis.com https:",
            // Allow worker to be loaded as a blob
            "worker-src 'self' blob:",
          ].join('; '),
          // These headers are required for SharedArrayBuffer, which TF.js may use
          'Cross-Origin-Embedder-Policy': 'credentialless',
          'Cross-Origin-Opener-Policy': 'same-origin',
        },
      },
      css: {
        devSourcemap: true,
      },
      optimizeDeps: {
        include: ['react', 'react-dom'],
        exclude: [],
        force: isDev,
        esbuildOptions: {
          target: 'es2022',
          supported: {
            'top-level-await': true,
          },
        },
      },
      clearScreen: true,
      build: {
        sourcemap: true,
        minify: false,
      },
      logLevel: 'info',
      esbuild: {
        jsxDev: true,
        keepNames: true,
      },
    } satisfies UserConfig;
  }

  // Production-specific configuration
  return {
    ...baseConfig,
    mode: 'production',
    server: {
      headers: {
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://storage.googleapis.com",
          "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com",
          "img-src 'self' blob: data:",
          "media-src 'self' blob:",
          "connect-src 'self' ws: wss: https://cdn.jsdelivr.net https://storage.googleapis.com https:",
          "worker-src 'self' blob:",
        ].join('; '),
        'Cross-Origin-Embedder-Policy': 'credentialless',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
    },
    plugins: [
      ...baseConfig.plugins!,
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'apple-touch-icon.svg', 'masked-icon.svg'],
        manifest: {
          name: 'ChromeCam Studio',
          short_name: 'ChromeCam',
          description:
            'Advanced webcam studio with local AI effects for ChromeOS, macOS, and Windows.',
          theme_color: '#1c1b1f',
          background_color: '#1c1b1f',
          display: 'standalone',
          orientation: 'any',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: 'pwa-192x192.svg',
              sizes: '192x192',
              type: 'image/svg+xml',
            },
            {
              src: 'pwa-512x512.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
            },
            {
              src: 'masked-icon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'maskable',
            },
          ],
          display_override: ['window-controls-overlay'],
          shortcuts: [
            {
              name: 'Open Settings',
              url: '/?settings=true',
              description: 'Open directly to camera settings',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'cdn-cache',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/cdn\.tailwindcss\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'tailwind-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 7,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
        },
      }),
    ],
    build: {
      target: 'es2022',
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: false,
      minify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
             'tfjs': ['@tensorflow/tfjs', '@tensorflow-models/body-pix'],
          },
          chunkFileNames: 'assets/js/[name]-[hash].js',
          entryFileNames: 'assets/js/[name]-[hash].js',
          assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
        },
      },
      assetsInlineLimit: 0,
      reportCompressedSize: true,
      chunkSizeWarningLimit: 2000,
      cssCodeSplit: true,
      cssMinify: true,
    },
    worker: {
      format: 'iife',
      plugins: () => [react()],
       rollupOptions: {
        output: {
          entryFileNames: 'workers/[name].[hash].js',
          manualChunks: {
             'tfjs-worker': ['@tensorflow/tfjs', '@tensorflow-models/body-pix'],
          },
        },
      },
    },
    esbuild: {
      drop: ['console', 'debugger'],
      legalComments: 'none',
    },
    preview: {
      port: 4173,
      host: '0.0.0.0',
      strictPort: true,
      cors: true,
      headers: {
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://storage.googleapis.com",
          "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com",
          "img-src 'self' blob: data:",
          "media-src 'self' blob:",
          "connect-src 'self' ws: wss: https://cdn.jsdelivr.net https://storage.googleapis.com https:",
          "worker-src 'self' blob:",
        ].join('; '),
        'Cross-Origin-Embedder-Policy': 'credentialless',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
    },
  } satisfies UserConfig;
});
