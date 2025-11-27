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
    // Include wasm files for TensorFlow.js WASM backend
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
            // Enhanced worker-src for ChromeOS/Crostini compatibility
            "script-src 'self' 'unsafe-eval' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://storage.googleapis.com",
            "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com",
            "img-src 'self' blob: data: https:",
            "media-src 'self' blob:",
            "connect-src 'self' ws: wss: https://cdn.jsdelivr.net https://storage.googleapis.com https:",
            // Allow workers from self and blob, plus specific worker sources for MediaPipe
            "worker-src 'self' blob: https://cdn.jsdelivr.net https://storage.googleapis.com",
            // Enhanced for TensorFlow.js WASM in workers
            "child-src 'self' blob:",
            "frame-src 'self' blob:",
          ].join('; '),
          'Cross-Origin-Embedder-Policy': 'credentialless',
          'Cross-Origin-Opener-Policy': 'same-origin',
          // Enhanced headers for ChromeOS/Crostini
          'Cross-Origin-Resource-Policy': 'cross-origin',
          'Permissions-Policy': 'camera=(self), microphone=(self), display-capture=(self)',
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
      // WORKER CONFIG: Simplified for better TensorFlow.js bundling
      // =========================================================================
      worker: {
        format: 'es',
        // Removed React plugin - not needed in worker context
        plugins: () => [],
        rollupOptions: {
          output: {
            entryFileNames: 'workers/[name].[hash].js',
            // Removed manual chunking - let Vite handle automatic code splitting
            // TF.js libraries are large and work better with automatic splitting
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
            id: '/',
            theme_color: '#1c1b1f',
            background_color: '#1c1b1f',
            display: 'standalone',
            orientation: 'any',
            scope: '/',
            start_url: '/',
            icons: [
              {
                src: 'pwa-192x192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any',
              },
              {
                src: 'pwa-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any',
              },
              {
                src: 'pwa-maskable-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
              },
              {
                src: 'pwa-192x192.svg',
                sizes: 'any',
                type: 'image/svg+xml',
                purpose: 'any',
              },
            ],
            screenshots: [
              {
                src: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4MCIgaGVpZ2h0PSI3MjAiIHZpZXdCb3g9IjAgMCAxMjgwIDcyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjEyODAiIGhlaWdodD0iNzIwIiBmaWxsPSIjMWMxYjFmIi8+Cjx0ZXh0IHg9IjY0MCIgeT0iMzYwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjZmZmZmZmIiBmb250LXNpemU9IjQ4IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC13ZWlnaHQ9IjUwMCI+Q2hyb21lQ2FtIFN0dWRpbzwvdGV4dD4KPHRleHQgeD0iNjQwIiB5PSI0MjAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IiM5OTk5OTkiIGZvbnQtc2l6ZT0iMjQiPkFkdmFuY2VkIHdlYmNhbSBzdHVkaW8gd2l0aCBsb2NhbCBBSSBlZmZlY3RzPC90ZXh0Pgo8L3N2Zz4K',
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
                ],
              },
            ],
          },
          workbox: {
            maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10MB to allow large WASM files
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,wasm}'],
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
            tfjs: [
              '@tensorflow/tfjs',
              '@tensorflow/tfjs-backend-wasm',
              '@tensorflow-models/body-pix',
              '@tensorflow-models/face-landmarks-detection',
            ],
            obs: ['obs-websocket-js'],
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
    // =========================================================================
    // PRODUCTION WORKER CONFIG: Simplified for better bundling
    // =========================================================================
    worker: {
      format: 'es',
      // Removed React plugin - not needed in worker context
      plugins: () => [],
      rollupOptions: {
        output: {
          entryFileNames: 'workers/[name].[hash].js',
          // Removed manual chunking - automatic splitting works better
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
