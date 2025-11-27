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
```

### Testing & Quality
```bash
npm run test          # Run tests in watch mode
npm run test:coverage # Generate coverage report
npm run lint          # ESLint check
npm run format        # Prettier formatting
npm run typecheck     # TypeScript check
npm run typecheck:watch # Watch mode type checking
```

### Build & Analysis
```bash
npm run build:analyze # Build + bundle visualization
npm run generate:pwa-icons # Generate PWA icons
npm run clean         # Clean node_modules and dist
```

## Code Organization

### Directory Structure
```
ChromeCam-Studio/
├── components/          # React components (48dp touch targets)
│   ├── ui/             # Material 3 UI primitives
│   ├── VideoPanel.tsx  # Main video component (refactored from 993-line God Component)
│   └── settings.ts     # Camera settings interface (100+ properties)
├── hooks/              # Custom hooks (extracted for testability)
│   ├── useCameraStream.ts      # Hardware camera control
│   ├── useBodySegmentation.ts  # AI segmentation
│   ├── useVideoRenderer.ts     # Canvas rendering loop
│   ├── useAutoLowLight.ts      # Brightness analysis
│   ├── useProOverlays.ts       # Histogram/zebra/peaking
│   └── useSystemAccentColor.ts # OKLCH theming
├── types/              # TypeScript definitions
│   ├── media.ts        # Extended browser APIs (312 lines)
│   ├── tensorflow.ts   # ML model types
│   └── broadcast.ts    # OBS integration types
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

- **VideoPanel.tsx**: Main composition component (420 lines, 15 hooks)
- **Specialized Hooks**: Each handles specific functionality
- **UI Components**: Custom Material 3 implementations
- **Type Safety**: Comprehensive TypeScript coverage

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
```

### Test Commands
```bash
npm run test          # Watch mode (default)
npm run test:ui       # Interactive UI
npm run test:coverage # Coverage report
npm run test:run      # CI mode (no watch)
```

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

### 2. Worker Architecture Issues
**Location**: `fix/diagnose-worker-fix.sh`

**Problem**: MediaPipe CDN loading fails in Web Workers due to CORS/CSP policies.

**Solution**: 
- Bundle MediaPipe WASM locally in `public/mediapipe/`
- Use direct URL workers: `new Worker('/workers/segmentation.worker.js', { type: 'classic' })`
- Transfer canvas via OffscreenCanvas for zero-copy rendering

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
- **State Layers**: Proper opacity for interaction states
- **Touch Targets**: 48dp minimum for accessibility
- **Elevation**: Surface tint and shadow tokens
- **Typography**: M3 scale with responsive sizing

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
- **WebSocket**: Real-time OBS Studio control
- **Scene Management**: Dynamic scene switching
- **Source Control**: Virtual camera source management

### MediaPipe/TensorFlow.js
- **Model Loading**: CDN-based with local fallback options
- **Inference**: Main thread (current) → Worker (planned)
- **Performance**: Real-time segmentation with adaptive quality

### Browser APIs
- **Extended MediaStream**: PTZ, focus, exposure, white balance
- **Wake Lock**: Prevents screen sleep during camera operation
- **File System**: Native file saving for recordings
- **Barcode Detection**: QR code scanning capability

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

### Debug Commands
```bash
npm run dev           # Development with source maps
npm run build         # Production build check
npm run test:coverage # Coverage analysis
npm run build:analyze # Bundle analysis
```

## Contributing Guidelines

### Code Style
- **TypeScript**: Strict mode, explicit types, no `any`
- **React**: Functional components, hooks, proper dependencies
- **CSS**: Tailwind utilities, M3 tokens, no inline styles
- **Performance**: Consider impact on 60fps rendering loop

### Testing Requirements
- **Hooks**: Unit tests with mocked dependencies
- **Components**: Integration tests with React Testing Library
- **Performance**: No new memory allocation patterns without justification
- **Browser Support**: Chrome, Edge, Firefox, Safari (last 2 versions)

### Architecture Principles
- **Separation of Concerns**: Each hook has single responsibility
- **Performance First**: Main thread must stay responsive for UI
- **Progressive Enhancement**: Graceful fallbacks for missing features
- **Accessibility**: 48dp touch targets, proper contrast, ARIA labels

---

**Note**: This codebase represents sophisticated browser API integration with professional-grade camera controls. Prioritize performance and maintainability when making changes, especially in the rendering loop and AI processing code.