# ChromeCam Studio - Agent Guidelines

This document provides comprehensive guidance for AI agents working in the ChromeCam Studio codebase.

## Project Overview

ChromeCam Studio is a **Progressive Web Application** built with React 19, TypeScript 5.6, and Vite 6 that provides professional-grade webcam controls with AI-powered background effects. It's optimized for ChromeOS, macOS, and Windows with Material 3 design.

**Key Technologies:**
- **Framework:** React 19 + TypeScript 5.6
- **Build Tool:** Vite 6 with ES Module Workers
- **Styling:** Tailwind CSS + Material 3 Design Tokens
- **AI/ML:** TensorFlow.js + MediaPipe for body segmentation
- **Workers:** Web Workers with OffscreenCanvas
- **PWA:** vite-plugin-pwa + Workbox for offline capabilities

## Essential Commands

### Development Workflow
```bash
npm run dev           # Start development server (port 3001)
npm run dev:host      # Dev server with network access
npm run build         # Production build with type checking
npm run preview       # Preview production build
npm run typecheck     # TypeScript checking only
npm run typecheck:watch # Watch mode type checking
```

### Testing & Quality
```bash
npm run test          # Run tests in watch mode
npm run test:ui       # Interactive UI test runner
npm run test:coverage # Generate coverage report
npm run test:run      # CI mode (no watch)
npm run lint          # ESLint check
npm run lint:fix      # Auto-fix lint issues
npm run format        # Prettier formatting
npm run format:check  # Check formatting without changes
```

### Build & Analysis
```bash
npm run build:analyze # Build + bundle visualization
npm run generate:pwa-icons # Generate PWA icons
npm run clean         # Clean node_modules and dist
npm run clean:all     # Clean dist and node_modules completely
```

### Development Workflow
```bash
npm run dev           # Start development server (port 3001)
npm run dev:host      # Dev server with network access
npm run build         # Production build with type checking
npm run preview       # Preview production build
npm run typecheck     # TypeScript checking only
npm run typecheck:watch # Watch mode type checking
```

### Testing & Quality
```bash
npm run test          # Run tests in watch mode
npm run test:ui       # Interactive UI test runner
npm run test:coverage # Generate coverage report
npm run test:run      # CI mode (no watch)
npm run lint          # ESLint check
npm run lint:fix      # Auto-fix lint issues
npm run format        # Prettier formatting
npm run format:check  # Check formatting without changes
```

### Build & Analysis
```bash
npm run build:analyze # Build + bundle visualization
npm run generate:pwa-icons # Generate PWA icons
npm run clean         # Clean node_modules and dist
npm run clean:all     # Clean dist and node_modules completely
```

## Dependencies & Architecture

### Core Dependencies
- **React 19**: Latest React with concurrent features and improved hooks
- **TypeScript 5.6**: Strict type checking with modern features  
- **Vite 6**: Fast build tool with native worker support
- **TensorFlow.js 4.22.0**: ML inference with WASM backend support
- **MediaPipe**: Real-time AI models for face mesh and body segmentation
- **Tailwind CSS 3.4**: Utility-first CSS framework with M3 integration
- **OBS WebSocket**: Real-time OBS Studio integration

### AI/ML Stack
- **Primary**: MediaPipe SelfieSegmentation for body segmentation
- **Alternative**: TensorFlow.js BodyPix as fallback
- **Face Detection**: MediaPipe FaceMesh for auto-framing
- **QR Detection**: Native BarcodeDetector API
- **Backend**: WebGL with WASM fallback for performance

### Worker Architecture
- **Type Safety**: Vite's native worker import system
- **Message Protocol**: Typed messages via `types/worker-messages.ts`
- **Performance**: OffscreenCanvas, dynamic frame skipping, error recovery
- **Resource Management**: Automatic cleanup and disposal

### Directory Structure
```
ChromeCam-Studio/
├── components/          # React components (48dp touch targets)
│   ├── ui/             # Material 3 UI primitives
│   ├── VideoPanel.tsx  # Main video component (refactored from 993-line God Component)
│   └── settings.ts     # Camera settings interface (100+ properties)
├── hooks/              # Custom hooks (extracted for testability)
│   ├── useCameraStream.ts      # Hardware camera control
│   ├── useBodySegmentation.ts  # AI segmentation + QR detection
│   ├── useVideoRenderer.ts     # Canvas rendering loop
│   ├── useAutoLowLight.ts      # Brightness analysis
│   ├── useProOverlays.ts       # Histogram/zebra/peaking
│   ├── useSystemAccentColor.ts # OKLCH theming
│   ├── useOBSIntegration.ts    # OBS Studio control
│   ├── useBroadcastMode.ts     # Streaming mode management
│   ├── useWakeLock.ts          # Screen wake lock
│   └── useToast.tsx            # Toast notifications
├── types/              # TypeScript definitions
│   ├── media.ts        # Extended browser APIs (312 lines)
│   ├── tensorflow.ts   # ML model types
│   ├── worker-messages.ts # Typed worker protocols
│   ├── broadcast.ts    # OBS integration types
│   ├── face.ts         # Face detection and auto-frame types
│   └── worker-messages.ts # Worker communication types
├── utils/              # Pure utility functions
├── constants/          # App constants by category
├── workers/            # Web Worker implementations
├── public/             # Static assets
│   ├── workers/        # Worker files (served directly)
│   ├── mediapipe/      # ML model assets
│   └── pwa-*.png       # PWA icons
└── styles/             # CSS with M3 tokens
```

### Component Architecture
The codebase follows a **hook-based architecture** extracted from a monolithic "God Component":

- **WebcamApp.tsx**: Main application component (entry point, worker cleanup)
- **VideoPanel.tsx**: Video composition and rendering (420 lines, 15 hooks)
- **Specialized Hooks**: Each handles specific functionality with proper error boundaries
- **UI Components**: Custom Material 3 implementations with 48dp touch targets
- **Type Safety**: Comprehensive TypeScript coverage with strict mode
- **Worker Integration**: Type-safe Web Worker communication for AI processing

## Naming Conventions

### Files & Components
- **Components**: PascalCase (`VideoPanel.tsx`, `Slider.tsx`)
- **Hooks**: `use` prefix + PascalCase (`useCameraStream.ts`)
- **Utilities**: camelCase (`logger.ts`, `segmentationManager.ts`)
- **Types**: PascalCase with `.ts` extension (`media.ts`, `broadcast.ts`)
- **Constants**: SCREAMING_SNAKE_CASE (`PERFORMANCE.ts`)

### CSS Classes
- **Tailwind**: Utility-first approach
- **M3 Tokens**: `--md-sys-color-*`, `--md-sys-elevation-*`
- **Custom Properties**: `--app-*` prefix for app-specific tokens

### TypeScript Patterns
```typescript
// Extended browser APIs
interface ExtendedMediaTrackCapabilities extends MediaTrackCapabilities

// Type-safe worker protocols
interface SegmentationWorkerMessage {
  type: 'init' | 'segment' | 'dispose' | 'updateConfig'
  payload?: { imageBitmap?: ImageBitmap }
  timestamp: number
}

// Material 3 color tokens
interface TonalPalette {
  [key: number]: string // 0, 4, 6, 10, 12, 17, 20, 22, 24, 30, 40, 50, 60, 70, 80, 87, 90, 92, 94, 95, 96, 98, 99, 100
}
```

## Testing Approach

### Test Structure
- **Framework**: Vitest + React Testing Library
- **Environment**: jsdom with comprehensive mocks
- **Coverage**: Focus on `components/**/*` files
- **Pattern**: One test file per hook/component

### Key Mocks
```typescript
// vitest.setup.ts contains:
- MediaDevices API (getUserMedia, enumerateDevices)
- TensorFlow.js globals (SelfieSegmentation, tf)
- ResizeObserver & IntersectionObserver
- Canvas contexts (2D + WebGL)
- ML model responses
- BarcodeDetector API
```

### Test Commands
```bash
npm run test          # Watch mode (default)
npm run test:ui       # Interactive UI
npm run test:coverage # Coverage report
npm run test:run      # CI mode (no watch)
```

### 7. Segmentation Manager Timeout Issues - RESOLVED ✅
**Location**: `utils/segmentationManager.ts:49`, `workers/segmentation.worker.ts`

**Status**: Fixed in recent updates

**Current Configuration**:
```typescript
// Frame processing timeout: 5 seconds (increased from 1s)
const SEGMENT_TIMEOUT_MS = 5000;

// Worker initialization timeout: 45 seconds
initializationTimeout: 45000

// Worker file: Fixed global variable access
if (!self['body-pix']) { // Corrected from self.bodyPix
  // Initialize BodyPix
}
```

**Enhanced Features**:
- **Dynamic Frame Skipping**: Automatically adjusts based on real-time performance
- **Consecutive Timeout Recovery**: Terminates and reinitializes worker after 3 consecutive failures
- **Performance Metrics**: Tracks latency, FPS, and provides rolling averages
- **Auto Recovery**: Graceful fallback strategies for persistent worker issues

**Worker Implementation**: 
- Uses MediaPipe SelfieSegmentation (TensorFlow.js)
- OffscreenCanvas for zero-copy rendering
- Typed message protocols via `types/worker-messages.ts`
- Proper resource cleanup and disposal

**Debugging**: Monitor console for worker lifecycle messages and performance metrics

---

## Recent Production Fixes (November 2025)

### ✅ Worker Memory Leak - RESOLVED
**Issue**: Segmentation worker never terminated, causing 50-100MB memory leaks
**Fix**: Added cleanup in `App.tsx:21-25`
```typescript
useEffect(() => {
  return () => {
    segmentationManager.dispose();
  };
}, []);
```

### ✅ PWA Manifest Configuration - RESOLVED  
**Issues Fixed**:
- Missing PNG icons (only SVG existed)
- Incorrect App ID (`ChromeCam-Studio` → `/`)
- Icon types not specified correctly
- Missing screenshots configuration

**Files Modified**:
- `vite.config.ts:149-181` - Updated manifest configuration
- `App.tsx:21-25` - Added worker cleanup
- `scripts/generate-pwa-icons.mjs` - PNG icon generator
- `package.json` - Added `sharp` dependency and `generate:pwa-icons` script

### ✅ Segmentation Timeout Issues - RESOLVED
**Issues Fixed**:
- Worker initialization timeout (now 45 seconds)
- Frame processing timeout (increased from 1s to 5s)
- Global variable access in worker (`self.bodyPix` → `self['body-pix']`)
- Added dynamic frame skipping based on performance
- Implemented consecutive timeout recovery (restarts after 3 failures)

**Enhanced Features**:
- Real-time performance metrics tracking
- Adaptive frame skipping (BASE_INTERVAL = 1, MAX_SKIP_INTERVAL = 5)
- Automatic worker health monitoring
- Graceful fallback to main thread processing

---

## Important Gotchas

### 1. AI Processing on Main Thread (Critical Performance Issue)
**Location**: `hooks/useBodySegmentation.ts:133`

**Problem**: AI inference runs on main thread, causing UI jank on lower-end devices.

**Current State**: 
```typescript
// aiWorker.ts is intentionally empty due to MediaPipe/CDN Worker compatibility
const segmentation = await segmenter.segmentPeople(video); // Blocks UI
```

**Impact**: 30fps AI inference competes with React renders and UI interactions.

**Workaround**: Reduce inference rate when UI is active, use `requestIdleCallback`.

### 2. Worker Architecture - CURRENT IMPLEMENTATION ✅
**Location**: `workers/segmentation.worker.ts`, `utils/segmentationManager.ts`

**Current Implementation**: Uses MediaPipe SelfieSegmentation with TensorFlow.js
- **Type-safe Worker Import**: `new SegmentationWorker()` via Vite's native worker import
- **Message Protocol**: Typed messages via `types/worker-messages.ts`
- **Performance**: 5-second frame timeout, 45-second initialization timeout
- **Error Recovery**: Automatic worker restart after 3 consecutive failures
- **Resource Management**: Proper cleanup and disposal

**Worker Features**:
```typescript
// Worker initialization
let selfieSegmentation: SelfieSegmentation | null = null;

// Performance tracking
const fpsHistory: number[] = [];
const MAX_FPS_HISTORY = 30;

// Dynamic frame processing with timeout handling
const SEGMENT_TIMEOUT_MS = 5000;
```

**Key Files**:
- Active: `workers/segmentation.worker.ts` (MediaPipe SelfieSegmentation)
- Manager: `utils/segmentationManager.ts` (Worker lifecycle management)
- Types: `types/worker-messages.ts` (Typed message protocols)

**Debug Commands**:
```bash
# Monitor worker messages
grep -n "Worker\|Segmentation" console.log

# Check worker file access
curl -I http://localhost:3001/segmentation.worker.js

# Verify message types
grep -n "WorkerRequest\|WorkerResponse" types/worker-messages.ts
```

### 3. Memory Allocation Hotspots
**Location**: `hooks/useAutoLowLight.ts:114`, `hooks/useVideoRenderer.ts`

**Issues**:
```typescript
// Every 500ms: 5 × ImageData allocations = 10/second = 160KB GC pressure
const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);

// Every frame: Canvas element creation during zebra rendering
const patternCanvas = document.createElement('canvas');

// Every frame: Histogram array allocation
const rHist = new Array(256).fill(0);
```

**Fix**: Pre-allocate buffers in `useRef`, reuse pattern canvas, use `Uint32Array`.

### 4. Canvas Context Optimization
**Location**: `components/VideoPanel.tsx:163-164`

**Critical**: Use `willReadFrequently: true` for canvas contexts reading pixel data:
```typescript
maskCtxRef.current = maskCanvas.getContext('2d', { willReadFrequently: true });
tempCtxRef.current = tempCanvas.getContext('2d', { willReadFrequently: true });
```

### 5. ChromeOS/Crostini Compatibility
**Location**: `vite.config.ts` CSP headers

**Requirements**:
- Enhanced CSP headers for Linux container compatibility
- Cross-origin policies for worker scripts
- Hardware access permissions persistence

### 6. AudioContext Management
**Location**: `components/ui/VUMeter.tsx:22-27`

**Problem**: Creates separate `getUserMedia` call and AudioContext, causing resource conflicts.

**Solution**: Shared `AudioContextProvider` that reuses existing MediaStream.

## Performance Considerations

### Bundle Optimization
- **Manual Chunks**: vendor (React), tfjs (ML models), obs (OBS integration)
- **PWA Caching**: CacheFirst for CDN assets (30 days), StaleWhileRevalidate for Tailwind (7 days)
- **WASM Support**: TensorFlow.js WASM backend included

### Rendering Performance
- **Adaptive Quality**: Frame skipping based on real-time FPS monitoring
- **OffscreenCanvas**: Transfer canvas to workers for non-blocking rendering
- **Memory Management**: Pre-allocated buffers, canvas pooling
- **Filter Optimization**: Memoize CSS filter strings, cache gradients

### AI Inference Optimization
- **Model Loading**: CacheFirst strategy for ML models from CDN
- **Inference Rate**: Throttle based on performance metrics
- **Worker Strategy**: OffscreenCanvas + Comlink for cleaner worker API

## Material 3 Implementation

### Color System
- **Mathematical**: OKLCH-based tonal palette generation
- **System Integration**: Extract accent colors from ChromeOS/Windows
- **32+ Tokens**: Full M3 specification compliance
- **Perceptual Uniformity**: OKLab color space for adjustments

### Component Design
- **State Layers**: Proper opacity for interaction states (hover: 0.08, focus: 0.12, pressed: 0.16)
- **Touch Targets**: 48dp minimum for accessibility compliance
- **Elevation**: Surface tint and shadow tokens (0dp to 6dp)
- **Typography**: M3 scale with responsive sizing (display, headline, title, body, label)
- **Iconography**: Material Icons with proper semantic meaning

## PWA Features

### Installation & Updates
- **Auto-Update**: Service worker skips waiting + clients claim
- **Native Feel**: Window Controls Overlay for custom titlebar
- **Offline Capable**: App shell and CDN assets cached
- **Hardware Access**: Persisted camera/mic permissions

### Asset Management
- **PWA Icons**: SVG source files in `public/`, PNG generated via script
- **Manifest**: Comprehensive PWA manifest with shortcuts
- **Screenshots**: SVG-based for instant generation

## Development Workflow

### Code Quality
1. **Type Checking**: `npm run typecheck:watch` during development
2. **Linting**: `npm run lint` (ESLint + TypeScript ESLint)
3. **Formatting**: `npm run format` (Prettier with project-specific rules)
4. **Testing**: `npm run test` with comprehensive browser API mocks

### Build Process
1. **Development**: Hot reload with enhanced CSP headers
2. **Production**: Type checking + minification + PWA optimization
3. **Analysis**: Bundle visualization for optimization insights

### Debugging
- **Worker Issues**: Run `./fix/diagnose-worker-fix.sh`
- **Performance**: Chrome DevTools Performance tab + custom FPS metrics
- **Memory**: Allocation tracking for canvas/ImageData hotspots

## Security Considerations

### Content Security Policy
- **Development**: Allows 'unsafe-eval' and 'unsafe-inline' for HMR
- **Production**: Strict CSP with wasm-unsafe-eval for TensorFlow.js
- **Workers**: Self + blob sources only
- **CDN**: jsdelivr.net and storage.googleapis.com for ML models

### Camera Permissions
- **Persistent**: PWA permission persistence across sessions
- **Graceful Fallback**: Handles permission denial gracefully
- **Hardware Access**: Direct camera control via MediaStream Image Capture API

## Integration Points

### OBS Integration
- **Protocol**: WebSocket communication via obs-websocket-js library
- **Features**: Scene switching, source control, virtual camera management
- **Real-time Control**: Live parameter adjustments and status monitoring
- **Error Handling**: Automatic reconnection and graceful degradation
- **Security**: Configurable connection settings for local network use

### MediaPipe/TensorFlow.js
- **Current Implementation**: MediaPipe SelfieSegmentation with TensorFlow.js WASM backend
- **Worker Architecture**: Type-safe worker import via Vite, OffscreenCanvas for zero-copy rendering
- **Performance**: Dynamic frame skipping, 5-second timeout, automatic worker recovery
- **Models**: SelfieSegmentation for real-time body segmentation
- **Local Assets**: ML models bundled in `public/mediapipe/` directory
- **Fallback**: Graceful degradation to main thread processing if worker fails

### Browser APIs
- **Extended MediaStream**: PTZ, focus, exposure, white balance controls
- **Wake Lock**: Prevents screen sleep during camera operation
- **File System**: Native file saving for recordings
- **Barcode Detection**: QR code scanning capability via BarcodeDetector API
- **WebGL**: Hardware-accelerated rendering with proper resource management
- **Web Workers**: Offscreen processing for AI inference and video rendering

## Troubleshooting Guide

### Common Issues

1. **Worker Loading Failures**
   ```bash
   ./fix/diagnose-worker-fix.sh  # Run diagnostic script
   rm -rf node_modules/.vite     # Clear Vite cache
   ```

2. **Camera Permission Issues**
   - Check ChromeOS settings for camera access
   - Verify PWA installation for persistent permissions
   - Test with different browsers

3. **Performance Problems**
   - Monitor FPS metrics in console
   - Check memory allocation patterns
   - Verify adaptive quality is working

4. **TypeScript Errors**
   - Run `npm run typecheck` for full analysis
   - Check for missing type definitions in `types/media.ts`
   - Verify worker protocol types are current

### Debugging Segmentation Worker Issues

When experiencing segmentation worker issues:

1. **Check Worker Status**:
```bash
# Monitor worker lifecycle messages
grep -n "Worker\|Segmentation\|initialized\|ready" console.log

# Verify worker file accessibility
curl -I http://localhost:3001/segmentation.worker.js
```

2. **Performance Monitoring**:
```bash
# Check performance metrics in console
grep -n "avgLatency\|avgFps\|minFps\|maxFps" console.log

# Monitor frame skipping behavior
grep -n "frameSkip\|consecutiveTimeouts\|TARGET_FRAME_TIME" console.log
```

3. **Error Recovery**:
```bash
# Check for worker restart events
grep -n "consecutiveTimeouts\|terminateWorker\|re-initializing" console.log

# Verify error handling
grep -n "Segmentation timeout\|Worker error\|Model initialization failed" console.log
```

**Expected Success Logs**:
```
[SegmentationManager] Worker initialized
[SegmentationManager] Worker ready, version: 1.0.0
[SegmentationManager] Model initialized: general
[SegmentationManager] Segmentation result: latency=XXXms, fps=XX
```

**Common Issues & Solutions**:
- **Worker not loading**: Check browser CORS settings, verify worker file exists
- **High latency**: Monitor frame skip behavior, check device performance
- **Timeout errors**: Verify 5-second frame timeout is sufficient for your use case
- **Memory leaks**: Ensure `segmentationManager.dispose()` is called on app unmount

### Debug Commands
```bash
npm run dev           # Development with source maps
npm run build         # Production build check
npm run test:coverage # Coverage analysis
npm run build:analyze # Bundle analysis
npm run generate:pwa-icons # Generate PNG PWA icons

# Worker-specific debugging
curl -I http://localhost:3001/segmentation.worker.js  # Check worker accessibility
grep -n "Worker\|Segmentation" console.log           # Monitor worker messages
grep -n "avgLatency\|avgFps" console.log             # Performance metrics
```

## Contributing Guidelines

### Code Style
- **TypeScript**: Strict mode, explicit types, no `any`
- **React**: Functional components, hooks, proper dependencies
- **CSS**: Tailwind utilities, M3 tokens, no inline styles
- **Performance**: Consider impact on 60fps rendering loop

### Testing Requirements
- **Hooks**: Unit tests with mocked dependencies (MediaDevices, TensorFlow.js, WebSocket)
- **Components**: Integration tests with React Testing Library
- **Workers**: Message protocol testing and error handling verification
- **Performance**: No new memory allocation patterns without justification
- **Browser Support**: Chrome, Edge, Firefox, Safari (last 2 versions)
- **AI Features**: Comprehensive testing of segmentation fallbacks and timeouts

### Architecture Principles
- **Separation of Concerns**: Each hook has single responsibility
- **Performance First**: Main thread must stay responsive for UI (60fps target)
- **Worker Safety**: All AI processing runs in Web Workers, never block main thread
- **Progressive Enhancement**: Graceful fallbacks for missing features
- **Accessibility**: 48dp touch targets, proper contrast, ARIA labels
- **Type Safety**: Comprehensive TypeScript with strict mode, no `any` types
- **Resource Management**: Proper cleanup of workers, WebGL contexts, and media streams

---

**Note**: This codebase represents sophisticated browser API integration with professional-grade camera controls. Recent fixes have resolved critical production issues including worker memory leaks, PWA manifest configuration, and segmentation timeout problems. The system now features robust error recovery, dynamic performance adaptation, and comprehensive type safety. Prioritize performance and maintainability when making changes, especially in the rendering loop and AI processing code.