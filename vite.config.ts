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
      // Provide globals for workers
      global: 'globalThis',
    },
    plugins: [react()],
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
          port: 3001,
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
        esbuildOptions: {
          target: 'es2022',
          supported: {
            'top-level-await': true,
          },
        },
      },
      // =========================================================================
      // WORKER CONFIG: Use 'es' format for consistency with production
      // =========================================================================
      worker: {
        format: 'es',
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
      isProd &&
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
                purpose: 'any',
              },
              {
                src: 'pwa-512x512.svg',
                sizes: '512x512',
                type: 'image/svg+xml',
                purpose: 'any',
              },
              {
                src: 'masked-icon.svg',
                sizes: '512x512',
                type: 'image/svg+xml',
                purpose: 'maskable',
              },
              // Add square PNG icons for better compatibility
              {
                src: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyIiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDE5MiAxOTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxOTIiIGhlaWdodD0iMTkyIiByeD0iMjQiIGZpbGw9IiM0ZjQ2ZTUiLz4KPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMzIsIDMyKSI+CjxjaXJjbGUgY3g9IjY0IiBjeT0iNDgiIHI9IjM2IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iNiIvPgo8Y2lyY2xlIGN4PSI2NCIgY3k9IjQ4IiByPSIxMiIgZmlsbD0iI2ZmZmZmZiIvPgo8cGF0aCBkPSJNMjAgODAgTDY0IDExMiBMMTI4IDgwIEwxMjggMTA4IEMxMjggMTE2IDEyMCAxMjQgMTEyIDEyNCBMNTYgMTI0IEM0OCAxMjQgNDAgMTE2IDQwIDEwOCBaIiBmaWxsPSIjZmZmZmZmIi8+CjxyZWN0IHg9IjEwMCIgeT0iMjgiIHdpZHRoPSIxNiIgaGVpZ2h0PSIxMiIgcng9IjIiIGZpbGw9IiNmZmZmZmYiLz4KPGNpcmNsZSBjeD0iMTA4IiBjeT0iMzQiIHI9IjMiIGZpbGw9IiM0ZjQ2ZTUiLz4KPC9nPgo8L3N2Zz4K',
                sizes: '192x192',
                type: 'image/svg+xml',
                purpose: 'any',
              },
              {
                src: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgdmlld0JveD0iMCAwIDUxMiA1MTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI1MTIiIGhlaWdodD0iNTEyIiByeD0iNjQiIGZpbGw9IiM0ZjQ2ZTUiLz4KPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoODAsIDgwKSI+CjxjaXJjbGUgY3g9IjE3NiIgY3k9IjEzNiIgcj0iMTAwIiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMTYiLz4KPGNpcmNsZSBjeD0iMTc2IiBjeT0iMTM2IiByPSIzMiIgZmlsbD0iI2ZmZmZmYiIvPgo8cGF0aCBkPSJNMCAyMjQgTDE3NiAzMTYgTDM1MiAyMjQgTDM1MiAzMDQgQzM1MiAzMzYgMzM2IDM0NCAzMTIgMzQ0IEwxNDAgMzQ0IEMxMjggMzQ0IDEyMCAzMzYgMTIwIDMwNCBaIiBmaWxsPSIjZmZmZmZmIi8+CjxyZWN0IHg9IjI3MiIgeT0iNzYiIHdpZHRoPSI0NCIgaGVpZ2h0PSIzMiIgcng9IjUiIGZpbGw9IiNmZmZmZmYiLz4KPGNpcmNsZSBjeD0iMjkwIiBjeT0iOTIiIHI9IjgiIGZpbGw9IiM0ZjQ2ZTUiLz4KPC9nPgo8L3N2Zz4K',
                sizes: '512x512',
                type: 'image/svg+xml',
                purpose: 'any',
              },
            ],
            screenshots: [
              {
                src: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4MCIgaGVpZ2h0PSI3MjAiIHZpZXdCb3g9IjAgMCAxMjgwIDcyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjEyODAiIGhlaWdodD0iNzIwIiBmaWxsPSIjMWMxYjFmIi8+Cjx0ZXh0IHg9IjY0MCIgeT0iMzYwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjZmZmZmZmIiBmb250LXNpemU9IjQ4IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC13ZWlnaHQ9IjUwMCI+Q2hyb21lQ2FtIFN0dWRpbzwvdGV4dD4KPHRleHQgeD0iNjQwIiB5PSI0MjAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiM5OTk5OTkiIGZvbnQtc2l6ZT0iMjQi+EFkdmFuY2VkIHdlYmNhbSBzdHVkaW8gd2l0aCBsb2NhbCBBSSBlZmZlY3RzPC90ZXh0Pgo8L3N2Zz4K',
                sizes: '1280x720',
                type: 'image/svg+xml',
                form_factor: 'wide',
                label: 'ChromeCam Studio Interface',
              },
              {
                src: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzkwIiBoZWlnaHQ9Ijg0MCIgdmlld0JveD0iMCAwIDM5MCA4NDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzOTAiIGhlaWdodD0iODQwIiBmaWxsPSIjMWMxYjFmIi8+Cjx0ZXh0IHg9IjE5NSIgeT0iNDIwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjZmZmZmZmIiBmb250LXNpemU9IjI0IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC13ZWlnaHQ9IjUwMCI+Q2hyb21lQ2FtPC90ZXh0Pgo8dGV4dCB4PSIxOTUiIHk9IjQ2MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzk5OTk5OSIgZm9udC1zaXplPSIxNiI+QUkgV2ViY2FtIFN0dWRpbzwvdGV4dD4KPC9zdmc+Cg==',
                sizes: '390x840',
                type: 'image/svg+xml',
                label: 'ChromeCam Studio Mobile',
              },
            ],
            display_override: ['window-controls-overlay'],
            shortcuts: [
              {
                name: 'Open Settings',
                url: '/?settings=true',
                description: 'Open directly to camera settings',
                icons: [
                  {
                    src: 'pwa-192x192.svg',
                    sizes: '192x192',
                    type: 'image/svg+xml',
                  },
                  {
                    src: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iOTYiIGhlaWdodD0iOTYiIHZpZXdCb3g9IjAgMCA5NiA5NiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9Ijk2IiBoZWlnaHQ9Ijk2IiByeD0iMTIiIGZpbGw9IiM0ZjQ2ZTUiLz4KPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMTYsIDE2KSI+CjxjaXJjbGUgY3g9IjMyIiBjeT0iMjQiIHI9IjE4IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMyIvPgo8Y2lyY2xlIGN4PSIzMiIgY3k9IjI0IiByPSI2IiBmaWxsPSIjZmZmZmYiLz4KPHBhdGggZD0iTTEwIDQwIEwzMiA1NiBMNTQgNDAgTDU0IDUyIEM1NCA1NiA1MCA2MCA0NiA2MCBMMTggNjAgQzE0IDYwIDEwIDU2IDEwIDUyIFoiIGZpbGw9IiNmZmZmZmYiLz4KPHJlY3QgeD01MCB5PTE0IHdpZHRoPSI4IiBoZWlnaHQ9IjYiIHJ4PSIxIiBmaWxsPSIjZmZmZmYiLz4KPGNpcmNsZSBjeD01NCBjeT0iMTciIHI9IjEiIGZpbGw9IiM0ZjQ2ZTUiLz4KPC9nPgo8L3N2Zz4K',
                    sizes: '96x96',
                    type: 'image/svg+xml',
                  },
                ],
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
    ].filter(Boolean),
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
            tfjs: ['@tensorflow/tfjs', '@tensorflow-models/body-pix'],
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
      format: 'es',
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
