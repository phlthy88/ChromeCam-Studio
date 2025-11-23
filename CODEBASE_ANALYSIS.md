# ChromeCam Studio - Codebase Analysis & Recommendations

**Date:** November 2024
**Scope:** Architecture review, performance analysis, and feature roadmap

---

## Executive Summary

ChromeCam Studio is a technically impressive modern React 19 PWA that pushes the boundaries of browser-based camera applications. The codebase demonstrates excellent architectural decisions, particularly the refactoring from a monolithic "God Component" to a modular hook-based architecture.

### Key Strengths

| Area | Implementation | Quality |
|------|---------------|---------|
| **Modern Stack** | React 19, Vite 6, Tailwind CSS 4 | Excellent |
| **Hardware Integration** | PTZ, Focus, ISO, Exposure via `useCameraStream` | Outstanding |
| **Design System** | OKLCH-based Material 3 theming via `useSystemAccentColor` | Industry-leading |
| **Architecture** | Modular hooks extracted from monolithic component | Clean & testable |

### Areas for Improvement

| Priority | Issue | Impact | Effort |
|----------|-------|--------|--------|
| P0 | AI processing on main thread | High (UI jank) | High |
| P1 | VUMeter creates duplicate AudioContext | Medium | Low |
| P1 | Memory allocations in useAutoLowLight | Medium | Low |
| P2 | Canvas filter string recreation per frame | Low-Medium | Low |
| P2 | Vignette gradient recreation per frame | Low | Low |

---

## 1. Critical Technical Issues

### 1.1 AI Processing on Main Thread (P0 - Performance Bottleneck)

**Location:** `hooks/useBodySegmentation.ts:133`, `components/aiWorker.ts`

**Current State:**
The `aiWorker.ts` file is intentionally empty due to MediaPipe/CDN Worker compatibility issues. All AI inference runs on the main JavaScript thread:

```typescript
// hooks/useBodySegmentation.ts:133
const segmentation = await segmenter.segmentPeople(video);
```

**Impact:**
- Body segmentation competes with React renders and UI interactions
- On lower-end devices (ChromeOS education/enterprise), enabling "Background Blur" causes:
  - UI jank during settings changes
  - Video frame rate drops below 30fps
  - Input lag on sliders and controls

**Root Cause:**
MediaPipe loads model files from CDN. Web Workers have stricter CORS/CSP policies, preventing dynamic script loading from external origins.

**Solution Options:**

1. **Local WASM Bundling (Recommended)**
   - Copy MediaPipe WASM files to `public/mediapipe/`
   - Configure worker to load from same-origin
   - Use `OffscreenCanvas` for worker-based rendering

2. **Main Thread with Throttling (Interim)**
   - Reduce inference rate when UI is active
   - Use `requestIdleCallback` for non-critical frames

3. **Comlink + Message Channel**
   - Use Comlink library for cleaner worker communication
   - Transfer `ImageBitmap` instead of pixel arrays

### 1.2 VUMeter AudioContext Duplication (P1)

**Location:** `components/ui/VUMeter.tsx:22-27`

**Current State:**
```typescript
stream = await navigator.mediaDevices.getUserMedia({ audio: true });
audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
```

**Issues:**
1. Creates a separate `getUserMedia` call for audio (duplicates camera's audio stream)
2. Instantiates its own AudioContext (browsers limit these)
3. Uses legacy `webkitAudioContext` cast instead of proper polyfill
4. Memory leak risk: AudioContext nodes not properly disconnected

**Solution:**
Create a shared `AudioContextProvider` or utility that:
- Reuses the AudioContext singleton
- Accepts an existing MediaStream from `useCameraStream`
- Properly manages node lifecycle

### 1.3 Memory Allocations in useAutoLowLight (P1)

**Location:** `hooks/useAutoLowLight.ts:114`

**Current State:**
```typescript
// Called 5 times per analysis cycle (every 500ms)
for (const region of regions) {
    ctx.drawImage(video, region.x, region.y, ...);
    const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize); // NEW allocation each time
    const data = imageData.data; // Uint8ClampedArray created
}
```

**Impact:**
- 5 × `ImageData` allocations per cycle = 10 allocations/second
- Each `ImageData` contains a `Uint8ClampedArray` (64×64×4 = 16KB each)
- 160KB allocated and garbage collected every second
- Contributes to GC pauses, especially on memory-constrained devices

**Solution:**
```typescript
// Reuse a single ImageData buffer
const imageDataRef = useRef<ImageData | null>(null);

// In analysis:
if (!imageDataRef.current) {
    imageDataRef.current = ctx.createImageData(sampleSize, sampleSize);
}
// Use ctx.drawImage then manually copy pixels, or use ctx.getImageData only once per cycle
```

### 1.4 Canvas Rendering Optimizations (P2)

**Location:** `hooks/useVideoRenderer.ts`

**Issues Identified:**

1. **Vignette Gradient Recreation (line 72)**
   ```typescript
   // Creates new gradient object EVERY FRAME
   const gradient = ctx.createRadialGradient(centerX, centerY, radius * 0.3, ...);
   ```

2. **Filter String in RAF Loop (line 288-298)**
   ```typescript
   // String concatenation happens 60 times/second
   let baseFilter = '';
   baseFilter += `brightness(${totalBrightness}%) contrast(${effectiveContrast}%)...`;
   ```

3. **getImageData for Overlays (line 394)**
   ```typescript
   const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
   ```
   This is expensive but necessary for histogram/zebra/focus peaking. Consider:
   - Making it conditional (only when overlays change)
   - Downsampling before analysis

**Solutions:**
- Cache vignette gradient when dimensions/intensity change
- Memoize filter string when settings change (not per frame)
- Consider WebGL for hardware-accelerated effects (future)

---

## 2. Code Quality Issues

### 2.1 Hardcoded Values

**Location:** `components/ui/VUMeter.tsx:63`
```typescript
const bars = 12; // Magic number
```

**Recommendation:** Extract to constants file or component props.

### 2.2 Legacy Browser Compatibility Casts

**Location:** `components/ui/VUMeter.tsx:25`
```typescript
(window as any).webkitAudioContext
```

**Recommendation:** Create a proper audio utility:
```typescript
// utils/audio.ts
export function getAudioContext(): AudioContext {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    return new AudioContextClass();
}
```

---

## 3. Feature Recommendations

### 3.1 3D LUT (Look-Up Table) Support

**Why:** Current filters use basic CSS (sepia, contrast). Professional colorists use `.CUBE` files for cinematic grading.

**Implementation:**
1. Parse `.CUBE` file format (simple text-based 3D table)
2. Upload texture to WebGL as 3D texture
3. Sample RGB through LUT in fragment shader

**Value:** Hollywood-grade color grading not achievable with CSS filters.

### 3.2 Chroma Key (Green Screen)

**Why:** AI segmentation is CPU-heavy with edge artifacts. Physical green screens are common in "Studio" setups.

**Implementation:**
```typescript
// Simple HSL-based chroma key
function chromaKey(r: number, g: number, b: number, targetHue: number, tolerance: number): number {
    const hue = rgbToHsl(r, g, b)[0];
    return Math.abs(hue - targetHue) < tolerance ? 0 : 255;
}
```

**Value:** Cheaper than AI, cleaner edges for professionals.

### 3.3 Audio Effects Rack

**Why:** App currently only uses browser defaults (Noise Suppression toggle).

**Features:**
- **Compressor:** Consistent voice volume
- **Noise Gate:** Silence when not speaking
- **EQ:** Reduce room boom, add presence

**Implementation:** Web Audio API graph injection:
```typescript
// Insert between source and destination
const compressor = audioContext.createDynamicsCompressor();
const gate = createNoiseGate(audioContext); // Custom implementation
source.connect(compressor).connect(gate).connect(destination);
```

### 3.4 Gesture Control via MediaPipe

**Why:** MediaPipe is already loaded for segmentation.

**Gestures:**
| Gesture | Action |
|---------|--------|
| ✋ Raise Hand | Show visual indicator |
| ✌️ Peace Sign | Auto-snapshot |
| 👍 Thumb Up | Emoji overlay |

**Implementation:** Use MediaPipe Hands model (similar loading pattern to Segmentation).

### 3.5 Multi-Source Composition

**Why:** "Weather Reporter" style presentations are popular.

**Implementation:**
```typescript
const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
// Render display as background, camera (AI-cut) as foreground PIP
```

---

## 4. Prioritized Refactoring Roadmap

### Phase 1: Quick Wins (1-2 days)
- [x] ~~P0: Populate empty PWA SVG files~~ *(Already complete)*
- [ ] P1: Create shared AudioContext utility
- [ ] P1: Optimize useAutoLowLight memory allocations
- [ ] P2: Cache vignette gradient in useVideoRenderer
- [ ] P2: Memoize filter strings

### Phase 2: Core Performance (1-2 weeks)
- [ ] P0: Implement Web Worker for body segmentation
  - Bundle MediaPipe WASM locally
  - Use OffscreenCanvas for zero-copy rendering
  - Implement Comlink for ergonomic worker API

### Phase 3: Studio Features (2-4 weeks)
- [ ] P2: WebGL-based renderer (enables 3D LUTs, better effects)
- [ ] P3: Audio processing graph (Compressor, Gate)
- [ ] P3: Chroma key mode
- [ ] P4: Gesture recognition

---

## 5. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           WebcamApp                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────────┐ │
│  │   Header     │  │  VideoPanel  │  │     ControlsPanel         │ │
│  │  (VUMeter)   │  │  (Hooks Hub) │  │  (Settings UI)            │ │
│  └──────────────┘  └──────────────┘  └───────────────────────────┘ │
│                           │                                         │
│           ┌───────────────┼───────────────────┐                    │
│           ▼               ▼                   ▼                    │
│  ┌─────────────┐  ┌───────────────┐  ┌─────────────────┐          │
│  │useCameraStream│ │useBodySegment.│  │useVideoRenderer │          │
│  │  (Hardware)  │  │  (AI/Main)   │  │  (Canvas Loop)  │          │
│  └─────────────┘  └───────────────┘  └─────────────────┘          │
│           │               │                   │                    │
│           ▼               ▼                   ▼                    │
│  ┌─────────────┐  ┌───────────────┐  ┌─────────────────┐          │
│  │useAutoLowLight│ │ useProOverlays│  │useMediaRecorder │          │
│  │  (Analysis)  │  │ (Histogram)  │  │  (Recording)    │          │
│  └─────────────┘  └───────────────┘  └─────────────────┘          │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Shared Utilities                          │   │
│  │  useSystemAccentColor │ useTheme │ useWakeLock │ useToast   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. Metrics & Targets

| Metric | Current (Estimated) | Target |
|--------|---------------------|--------|
| Time to Interactive | ~2s | <1.5s |
| AI Inference FPS | ~30fps (blocks UI) | 30fps (non-blocking) |
| Memory Churn (GC) | High during low-light analysis | Minimal |
| Lighthouse PWA Score | Good | 100 |
| Bundle Size | TBD | <500KB gzipped |

---

## Appendix: File Reference

| File | Purpose | Lines |
|------|---------|-------|
| `hooks/useCameraStream.ts` | Hardware camera control, streams | ~450 |
| `hooks/useBodySegmentation.ts` | AI segmentation, auto-frame | ~214 |
| `hooks/useVideoRenderer.ts` | Main canvas rendering loop | ~451 |
| `hooks/useAutoLowLight.ts` | Brightness analysis, auto-gain | ~224 |
| `hooks/useProOverlays.ts` | Professional overlays | ~280 |
| `hooks/useSystemAccentColor.ts` | M3 dynamic theming | ~450 |
| `components/VideoPanel.tsx` | Hook composition, UI | ~420 |
| `components/ui/VUMeter.tsx` | Audio level meter | ~160 |
| `components/settings.ts` | Settings types & defaults | ~350 |
