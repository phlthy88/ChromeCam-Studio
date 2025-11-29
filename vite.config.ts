import path from 'path';
import { defineConfig, loadEnv, type UserConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Plugin to configure MIME types for MediaPipe and TensorFlow.js files
const mimeTypesPlugin = (): Plugin => ({
  name: 'configure-mime-types',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = req.url || '';

      // Set MIME types for specific file extensions
      if (url.endsWith('.tflite')) {
        res.setHeader('Content-Type', 'application/octet-stream');
      } else if (url.endsWith('.wasm')) {
        res.setHeader('Content-Type', 'application/wasm');
      } else if (url.endsWith('.binarypb')) {
        res.setHeader('Content-Type', 'application/octet-stream');
      } else if (url.includes('/mediapipe/') && url.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
      }

      next();
    });
  },
});

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
    plugins: [react(), mimeTypesPlugin()],
    // Include wasm and tflite files for TensorFlow.js and MediaPipe
    assetsInclude: ['**/*.wasm', '**/*.tflite'],
  };

  // Development-specific configuration
  if (isDev) {
    return {
      ...baseConfig,
      mode: 'development',
      server: {
        port: 3002,
        strictPort: true,
        host: true,
        cors: true,

        hmr: {
          clientPort: 3002,
          timeout: 30000,
          overlay: false,
          port: 3002,
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
          "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://storage.googleapis.com",
          "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com",
          "img-src 'self' blob: data:",
          "media-src 'self' blob:",
          "connect-src 'self' ws: wss: https://storage.googleapis.com https:",
          "worker-src 'self' blob: https://storage.googleapis.com",
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
            file_handlers: [
              {
                action: '/',
                accept: {
                  'image/png': ['.png'],
                  'image/jpeg': ['.jpg', '.jpeg'],
                  'image/webp': ['.webp'],
                },
              },
            ],
            screenshots: [
              {
                src: 'screenshots/desktop-wide.png',
                sizes: '1280x720',
                type: 'image/png',
                form_factor: 'wide',
                label: 'ChromeCam Studio Interface',
              },
              {
                src: 'screenshots/mobile.png',
                sizes: '750x1334',
                type: 'image/png',
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
          manualChunks: (id) => {
            // Vendor libraries
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom')) {
                return 'vendor';
              }
              if (id.includes('@tensorflow') || id.includes('tensorflow-models')) {
                return 'tensorflow';
              }
              if (id.includes('obs-websocket-js')) {
                return 'obs';
              }
              // Other node_modules go to vendor
              return 'vendor';
            }

            // Application code splitting
            if (
              id.includes('components/VideoPanel') ||
              id.includes('hooks/useVideoRenderer') ||
              id.includes('hooks/useBodySegmentation') ||
              id.includes('hooks/useCameraStream')
            ) {
              return 'video-core';
            }

            if (
              id.includes('components/ControlsPanel') ||
              id.includes('components/Header') ||
              id.includes('hooks/useMediaRecorder') ||
              id.includes('hooks/useVirtualCamera')
            ) {
              return 'controls';
            }

            if (
              id.includes('hooks/useBroadcastMode') ||
              id.includes('components/BroadcastModeOverlay')
            ) {
              return 'broadcast';
            }

            if (
              id.includes('hooks/useAutoLowLight') ||
              id.includes('hooks/useAudioProcessor') ||
              id.includes('hooks/useProOverlays')
            ) {
              return 'advanced-features';
            }
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
          "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://storage.googleapis.com",
          "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com",
          "img-src 'self' blob: data:",
          "media-src 'self' blob:",
          "connect-src 'self' ws: wss: https://storage.googleapis.com https:",
          "worker-src 'self' blob: https://storage.googleapis.com",
        ].join('; '),
        'Cross-Origin-Embedder-Policy': 'credentialless',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
    },
  } satisfies UserConfig;
});
