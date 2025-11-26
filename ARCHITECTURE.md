# ChromeCam Studio - Architecture Analysis

> **Document Version:** 1.0 **Analysis Date:** November 2025 **Codebase State:** Post Material 3 UI
> Redesign

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architectural Strengths](#architectural-strengths)
3. [Code Quality & Patterns](#code-quality--patterns)
4. [Critical Analysis & Technical Debt](#critical-analysis--technical-debt)
5. [Performance Considerations](#performance-considerations)
6. [Recommendations](#recommendations)
7. [Component Metrics](#component-metrics)

---

## Executive Summary

ChromeCam Studio is a Progressive Web Application built with React, TypeScript, and Vite that
provides professional-grade webcam controls with AI-powered background segmentation. The application
demonstrates sophisticated integration with experimental browser APIs and advanced color theory
implementation.

**Key Statistics:**

- Primary component (VideoPanel.tsx): 993 lines
- Type definitions (media.d.ts): 312 lines
- Theme system (useSystemAccentColor.ts): 450 lines
- Total hook invocations in VideoPanel: 55

---

## Architectural Strengths

### 1. Deep Hardware Integration

The application makes excellent use of the **MediaStream Image Capture API**, going beyond simple
video display to negotiate hardware capabilities including ISO, Focus, White Balance, and PTZ
(Pan-Tilt-Zoom) controls.

**Type definitions in `types/media.d.ts`:**

```typescript
export interface ExtendedMediaTrackCapabilities extends MediaTrackCapabilities {
  // PTZ controls
  zoom?: MediaSettingsRange;
  pan?: MediaSettingsRange;
  tilt?: MediaSettingsRange;

  // Image adjustment
  brightness?: MediaSettingsRange;
  contrast?: MediaSettingsRange;
  saturation?: MediaSettingsRange;
  sharpness?: MediaSettingsRange;

  // Exposure controls
  exposureMode?: string[];
  exposureTime?: MediaSettingsRange;
  exposureCompensation?: MediaSettingsRange;

  // White balance
  whiteBalanceMode?: string[];
  colorTemperature?: MediaSettingsRange;

  // Focus controls
  focusMode?: string[];
  focusDistance?: MediaSettingsRange;

  // Additional hardware controls
  iso?: MediaSettingsRange;
  torch?: boolean;
}
```

**Coverage extends to:**

- `BarcodeDetector` API for QR code scanning
- `WakeLock` API for screen management
- `FileSystemHandle` for native file saving
- `BodySegmenter` for MediaPipe integration

### 2. Dynamic Theming Engine

The implementation in `hooks/useSystemAccentColor.ts` is standout work. Instead of relying on
pre-defined themes, it generates a **Material 3 Tonal Palette mathematically** using the OKLCH color
space.

**Color Space Pipeline:**

```
Hex → RGB → Linear RGB → OKLab → OKLCH → Tonal Palette → M3 Scheme
```

**Key Features:**

- Perceptually uniform color manipulation
- Automatic chroma scaling across tonal range
- System accent color extraction from ChromeOS/Windows
- 32+ CSS custom properties for full M3 compliance

**Tonal Palette Generation:**

```typescript
function generateTonalPalette(seedOklch: OklchColor): TonalPalette {
  const tones = [
    0, 4, 6, 10, 12, 17, 20, 22, 24, 30, 40, 50, 60, 70, 80, 87, 90, 92, 94, 95, 96, 98, 99, 100,
  ];

  for (const tone of tones) {
    const chromaScale = tone <= 50 ? 0.6 + (tone / 50) * 0.4 : 1.0 - ((tone - 50) / 50) * 0.5;

    palette[tone] = oklchToHex({
      l: tone / 100,
      c: Math.min(seedOklch.c * chromaScale * 0.85, 0.15),
      h: seedOklch.h,
    });
  }
}
```

### 3. PWA-First Architecture

The `vite.config.ts` is heavily tuned for PWA functionality:

- **Window Controls Overlay**: Native-like titlebar integration
- **CacheFirst Strategy**: 30-day cache for heavy ML models from CDN
- **StaleWhileRevalidate**: For CSS assets allowing fresh updates
- **Immediate Activation**: Skip waiting + clients claim for instant updates

```typescript
workbox: {
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
      handler: 'CacheFirst',
      options: { cacheName: 'cdn-cache', expiration: { maxAgeSeconds: 60 * 60 * 24 * 30 } },
    },
  ];
}
```

---

## Code Quality & Patterns

### Strict Typing for Experimental APIs

The project creates robust TypeScript interfaces for unstable/experimental web APIs. This ensures
type safety even when working with bleeding-edge browser features that lack official TypeScript
definitions.

**APIs with custom type definitions:**

- MediaPipe BodySegmenter
- BarcodeDetector
- File System Access API
- Wake Lock API
- Extended MediaTrackCapabilities

### Component Composition

UI components (`Slider`, `Toggle`, `Chip`) are built from scratch using Tailwind but adhere strictly
to **Material Design 3 specifications**:

- State layers with proper opacity
- 48dp minimum touch targets
- Elevation and surface tint
- Dynamic color token application

This approach avoids the bloat of a UI library while maintaining high fidelity to design specs.

### Canvas Optimization

The developer explicitly defines `willReadFrequently: true` for canvas contexts used in AI
processing:

```typescript
// components/VideoPanel.tsx:163-164
maskCtxRef.current = maskCanvas.getContext('2d', { willReadFrequently: true });
tempCtxRef.current = tempCanvas.getContext('2d', { willReadFrequently: true });
```

This is a crucial optimization for Chrome/Chromium browsers when reading pixel data, preventing GPU
readback stalls.

---

## Critical Analysis & Technical Debt

### 1. The "God Component" Problem

**File:** `components/VideoPanel.tsx` (993 lines, 55 hooks)

VideoPanel handles too many responsibilities:

| Responsibility        | Lines            | Hooks Used              |
| --------------------- | ---------------- | ----------------------- |
| MediaStream lifecycle | 214-418          | 6 useRef, 3 useEffect   |
| AI Segmentation       | 167-185, 432-475 | 2 useState, 2 useRef    |
| Canvas rendering      | 477-583          | 4 useRef, 2 useCallback |
| MediaRecorder         | 592-643          | 2 useRef, 1 useCallback |
| Keyboard shortcuts    | 645-680          | 1 useEffect             |
| Wake Lock             | 138-160          | 1 useRef, 1 useEffect   |
| QR Detection          | 160, 442-444     | 1 useState              |

**Risk:** This makes the component brittle and hard to test. If the recording logic fails, it could
crash the rendering loop. Component isolation is poor.

### 2. AI Threading Issue

**File:** `components/aiWorker.ts`

```typescript
// This file is intentionally left empty as the AI logic has been moved back
// to the main thread to resolve MediaPipe/Worker compatibility issues with
// CDN asset loading.
export const workerScript = '';
```

**Risk:** Running segmentation (MediaPipe) on the main thread alongside React state updates and
Canvas drawing is a performance bottleneck. On lower-end ChromeOS devices, this will likely cause UI
jank (dropped frames) when the user interacts with sliders while AI is active.

**Root Cause:** MediaPipe's CDN-based asset loading doesn't work reliably in Web Worker contexts due
to cross-origin and blob URL limitations.

### 3. React State vs. Render Loop Tension

The app mixes React state (`useState`) with a mutable ref-based render loop.

**Good Pattern:**

```typescript
// Using useRef for values inside requestAnimationFrame avoids render overhead
currentTransformRef.current = { brightness, contrast, ... };
```

**Risk Pattern:**

- VideoPanel relies on `activeStreamRef` and other refs to manage the stream
- If React unmounts/remounts unexpectedly (Strict Mode, layout thrashing), race conditions regarding
  camera permissions could occur
- Stream cleanup in useEffect may not fire in all edge cases

---

## Performance Considerations

### Memory Allocation in Render Loop

**Issue #1: Histogram Arrays** (`VideoPanel.tsx:701-704`)

Every frame when histogram is enabled:

```typescript
const rHist = new Array(256).fill(0); // Allocated every frame
const gHist = new Array(256).fill(0); // Allocated every frame
const bHist = new Array(256).fill(0); // Allocated every frame
const lHist = new Array(256).fill(0); // Allocated every frame
```

**Impact at 1080p 30fps:** 4 arrays x 256 elements x 30 fps = ~30,720 allocations/sec

**Issue #2: Zebra Pattern Canvas** (`VideoPanel.tsx:768`)

```typescript
const patternCanvas = document.createElement('canvas'); // New DOM element per frame
```

**Impact:** 30 DOM element creations per second during zebra rendering

**Issue #3: Low-Light Analysis Canvas** (`VideoPanel.tsx:198`)

```typescript
const canvas = document.createElement('canvas'); // Every 500ms
```

### Recommended Fix

Allocate buffers once and reuse:

```typescript
// Outside component or in useRef
const histogramBuffers = useRef({
  r: new Uint32Array(256),
  g: new Uint32Array(256),
  b: new Uint32Array(256),
  l: new Uint32Array(256),
});

// In draw function - just reset instead of reallocate
histogramBuffers.current.r.fill(0);
```

### Canvas Context Optimization Gap

The main display canvas does not use `willReadFrequently`:

```typescript
// Current (VideoPanel.tsx:481)
const ctx = canvas?.getContext('2d', { alpha: false });

// Should be (if getImageData is called on this context)
const ctx = canvas?.getContext('2d', { alpha: false, willReadFrequently: true });
```

---

## Recommendations

### Priority 1: Extract Logic into Custom Hooks

Break VideoPanel.tsx into focused, testable units:

```typescript
// Proposed hook structure
useCameraStream(deviceId, settings); // Handles getUserMedia and constraints
useMediaRecorder(canvasRef); // Handles recording logic
useBodySegmentation(); // Abstracts AI model loading and inference
useCanvasRenderer(videoRef, settings); // Manages the render loop
useProOverlays(canvasRef); // Histogram, zebra, focus peaking
```

**Benefits:**

- Each hook can be tested in isolation
- Failures are contained to specific functionality
- Easier to reason about state flow

### Priority 2: Revisit Web Workers

The compatibility issues with MediaPipe in Workers are solvable:

1. **Comlink Library**: Provides cleaner Worker API abstraction
2. **Self-hosted Assets**: Bundle MediaPipe WASM locally instead of CDN
3. **OffscreenCanvas**: Transfer canvas to worker for rendering

```typescript
// Example with OffscreenCanvas
const offscreen = canvasRef.current.transferControlToOffscreen();
worker.postMessage({ canvas: offscreen }, [offscreen]);
```

### Priority 3: Memory Optimization

1. **Static Buffers**: Pre-allocate histogram arrays in useRef
2. **Canvas Pool**: Reuse pattern canvas for zebra stripes
3. **Typed Arrays**: Use `Uint32Array` instead of `Array` for histogram counts

### Priority 4: OffscreenCanvas Adoption

Since the app uses 2D canvas contexts heavily, utilizing OffscreenCanvas (where supported) would
allow the rendering loop to be entirely decoupled from the DOM and React:

```typescript
if ('OffscreenCanvas' in window) {
  const offscreen = canvasRef.current.transferControlToOffscreen();
  // Can now render in Worker or separate animation frame
}
```

---

## Component Metrics

### VideoPanel.tsx Breakdown

| Metric            | Value  |
| ----------------- | ------ |
| Total Lines       | 993    |
| useState hooks    | 12     |
| useRef hooks      | 24     |
| useEffect hooks   | 14     |
| useCallback hooks | 5      |
| **Total Hooks**   | **55** |

### Type Coverage

| File                            | Lines | Purpose               |
| ------------------------------- | ----- | --------------------- |
| `types/media.d.ts`              | 312   | Extended browser APIs |
| `hooks/useSystemAccentColor.ts` | 450   | OKLCH theming         |

### PWA Caching Strategy

| Pattern                 | Strategy             | TTL        |
| ----------------------- | -------------------- | ---------- |
| `cdn.jsdelivr.net/*`    | CacheFirst           | 30 days    |
| `cdn.tailwindcss.com/*` | StaleWhileRevalidate | 7 days     |
| Local assets            | Precache             | Build-time |

---

## Conclusion

ChromeCam Studio demonstrates sophisticated engineering in browser API integration, color science,
and PWA development. The primary technical debt lies in the VideoPanel component's accumulated
responsibilities and the main-thread AI processing constraint.

Addressing these issues through hook extraction and worker architecture improvements would elevate
the application from a capable tool to a truly "Studio-class" professional application capable of
maintaining 60fps under all conditions.
