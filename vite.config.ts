import path from 'path';
import { defineConfig, loadEnv, type UserConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const isDev = mode === 'development';
  const isProd = mode === 'production';

  // ==========================================================================
  // FIX: Custom plugin to ensure correct MIME types for workers
  //
  // This prevents the "video/mp2t" MIME type error that occurs when Vite
  // misidentifies worker files. The plugin intercepts requests and sets
  // the correct Content-Type header.
  // ==========================================================================
  const workerMimeFix: Plugin = {
    name: 'worker-mime-fix',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';

        // Fix MIME type for worker files
        if (url.includes('.worker') || url.includes('/workers/')) {
          if (url.endsWith('.js') || url.endsWith('.mjs')) {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          } else if (url.endsWith('.ts')) {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          }
        }
        next();
      });
    },
  };

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
    // CRITICAL: Worker support for OffscreenCanvas
    worker: {
      format: 'es',
      plugins: () => [react()],
      rollupOptions: {
        output: {
          entryFileNames: 'workers/[name].[hash].js',
        },
      },
    },
    // Ensure binary assets aren't mangled during build
    assetsInclude: ['**/*.wasm', '**/*.tflite', '**/*.bin'],
  };

  // Development-specific configuration
  if (isDev) {
    return {
      ...baseConfig,
      mode: 'development',
      plugins: [...baseConfig.plugins!, workerMimeFix],
      server: {
        // -----------------------------------------------------------------------
        // FIX #3: PORT & WEBSOCKET CONFIGURATION
        // -----------------------------------------------------------------------
        port: 3001,       // CHANGE: Moved to 3001 to avoid Java Backend (3000) conflict
        strictPort: true, // CHANGE: Fail if 3001 is busy (prevents random port switching)
        host: true,       // Listen on all addresses (0.0.0.0)
        cors: true,
        
        // HMR Configuration
        hmr: {
          clientPort: 3001, // CHANGE: Force client to look at 3001 (fixes the 3004 error)
          timeout: 30000,   // CHANGE: Increase timeout to 30s for high CPU load
          overlay: false,   // OPTIONAL: Disable error overlay if it blocks the view
        },

        // WebSocket Keep-Alive Configuration
        ws: {
          pingTimeout: 30000,  // CHANGE: Wait 30s before killing connection
          pingInterval: 10000, // CHANGE: Ping less frequently (every 10s)
        },
        // -----------------------------------------------------------------------

        // Watch configuration
        watch: {
          usePolling: false,
          ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
        },
        // Enhanced Content Security Policy for workers and WebGL
        headers: {
          'Content-Security-Policy': [
            "default-src 'self'",
            "script-src 'self' 'unsafe-eval' 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://storage.googleapis.com",
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
      // Enable source maps for debugging
      css: {
        devSourcemap: true,
      },
      // Optimize deps for faster dev startup - optimized for ChromeOS VirGL
      optimizeDeps: {
        include: ['react', 'react-dom'],
        exclude: [],
        // Force pre-bundling for faster Crostini startup
        force: isDev,
        esbuildOptions: {
          // Target modern browsers (Chrome 120+)
          target: 'es2022',
          supported: {
            'top-level-await': true,
          },
        },
      },
      // Clear console on reload for cleaner output
      clearScreen: true,
      // Development build options
      build: {
        sourcemap: true,
        minify: false,
      },
      // Log level for development
      logLevel: 'info',
      // Faster esbuild for dev
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
    // Ensure same security headers as dev for production
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
          // Clean up old caches
          cleanupOutdatedCaches: true,
          // Skip waiting to activate new service worker immediately
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
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
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
                  maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        // Enable PWA in development
        devOptions: {
          enabled: true,
        },
      }),
    ],
    build: {
      // Production build options
      target: 'es2022',
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: false,
      minify: 'esbuild',
      // Chunk splitting strategy
      rollupOptions: {
        output: {
          manualChunks: {
            // Vendor chunk for better caching
            vendor: ['react', 'react-dom'],
          },
          // Asset file naming
          chunkFileNames: 'assets/js/[name]-[hash].js',
          entryFileNames: 'assets/js/[name]-[hash].js',
          assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
        },
      },
      // CRITICAL: Ensure workers are properly bundled
      assetsInlineLimit: 0,
      // Report compressed size
      reportCompressedSize: true,
      // Chunk size warning limit (in kB)
      chunkSizeWarningLimit: 500,
      // CSS code splitting
      cssCodeSplit: true,
      // Minify CSS
      cssMinify: true,
    },
    // CRITICAL: Worker support for OffscreenCanvas (same as dev)
    worker: {
      format: 'es',
      plugins: () => [react()],
      rollupOptions: {
        output: {
          entryFileNames: 'workers/[name].[hash].js',
        },
      },
    },
    // Production esbuild options
    esbuild: {
      drop: ['console', 'debugger'],
      legalComments: 'none',
    },
    // Preview server configuration
    preview: {
      port: 4173,
      host: '0.0.0.0',
      strictPort: true,
      cors: true,
      // Enhanced Content Security Policy for workers and WebGL (same as dev)
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
