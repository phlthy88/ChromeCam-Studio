# ChromeCam Studio - Technical & Product Roadmap

**Last Updated:** November 2024
**Goal:** Transform ChromeCam Studio into a 60fps, studio-grade webcam application

---

## Overview

This roadmap prioritizes solving remaining performance bottlenecks before expanding to "Studio-grade" features. The primary focus is unlocking smooth 60fps UI performance on lower-end devices (including Chromebooks) before adding cinematic effects and power-user features.

---

## Phase 1: Performance & Architecture (The "AI Worker" Fix)

**Goal:** Unlock 60fps UI performance on lower-end devices

### 1.1 Solve the AI Worker CDN Issue

| Aspect | Details |
|--------|---------|
| **Priority** | P1 - High |
| **Impact** | High (Performance) |
| **Difficulty** | Medium |
| **Location** | `components/aiWorker.ts`, `hooks/useBodySegmentation.ts` |

**Current State:**
The `components/aiWorker.ts` file is intentionally empty because loading MediaPipe from a CDN inside a Web Worker failed due to cross-origin/security policies. All AI inference currently runs on the main JavaScript thread, competing with React renders and UI interactions.

**Problem:**
- On lower-end devices, enabling "Background Blur" causes UI jank
- Video frame rate drops below 30fps
- Input lag on sliders and controls

**Action:**
Bundle the MediaPipe `.tflite` and `.wasm` assets locally in the `public/` directory instead of relying on `jsdelivr`.

```
public/
├── mediapipe/
│   ├── selfie_segmentation.tflite
│   ├── selfie_segmentation_solution_simd.wasm
│   └── selfie_segmentation_solution_simd_wasm_bin.wasm
```

**Benefit:**
This allows moving the heavy inference logic from `hooks/useBodySegmentation.ts` into a Web Worker, completely freeing up the main thread for UI updates.

---

### 1.2 Implement OffscreenCanvas

| Aspect | Details |
|--------|---------|
| **Priority** | P1 - High |
| **Impact** | High (Performance) |
| **Difficulty** | Medium |
| **Location** | `hooks/useVideoRenderer.ts` |

**Current State:**
`useVideoRenderer.ts` renders to a DOM `<canvas>` element on the main thread.

**Action:**
Use the `canvas.transferControlToOffscreen()` API to send rendering control to the worker.

```typescript
// Main thread
const offscreen = canvas.transferControlToOffscreen();
worker.postMessage({ type: 'init', canvas: offscreen }, [offscreen]);

// Worker thread
self.onmessage = (e) => {
  if (e.data.type === 'init') {
    const ctx = e.data.canvas.getContext('2d');
    // Full rendering pipeline in worker
  }
};
```

**Benefit:**
The entire video pipeline (Segmentation → Filtering → Rendering) runs in a separate thread. The UI will never freeze, even if the video processing lags.

---

## Phase 2: Visual Fidelity (WebGL Migration)

**Goal:** Enable cinematic effects that are impossible with the current 2D Canvas context

### 2.1 Migrate useVideoRenderer to WebGL

| Aspect | Details |
|--------|---------|
| **Priority** | P2 - Medium |
| **Impact** | High (Visual Quality) |
| **Difficulty** | High |
| **Location** | `hooks/useVideoRenderer.ts` |

**Current State:**
Filters are applied using CSS-like strings:
```typescript
ctx.filter = 'contrast(1.1) blur(4px)';
```
This is CPU-intensive and limited to basic browser filters.

**Action:**
Rewrite the renderer using a lightweight WebGL wrapper (like `regl` or raw WebGL2).

**Benefits — Hardware-accelerated rendering unlocks:**

| Feature | Description |
|---------|-------------|
| **3D LUTs** | Hollywood-style color grading via `.cube` file loading |
| **Green Screen (Chroma Key)** | Faster and cleaner than AI segmentation for users with physical screens |
| **Film Grain/Noise** | Cinematic grain effects without killing performance |
| **Custom Shaders** | Unlimited visual effects possibilities |

**Implementation Approach:**
```typescript
// Fragment shader for 3D LUT color grading
uniform sampler3D uLUT;
uniform sampler2D uVideo;

void main() {
  vec4 color = texture2D(uVideo, vTexCoord);
  // Sample through 3D LUT for professional color grading
  gl_FragColor = texture3D(uLUT, color.rgb);
}
```

---

## Phase 3: Resilience & UX

**Goal:** Make the app crash-proof and more accessible

### 3.1 Global Error Boundaries

| Aspect | Details |
|--------|---------|
| **Priority** | P3 - Medium |
| **Impact** | Medium (Stability) |
| **Difficulty** | Low |
| **Location** | `components/VideoPanel.tsx` |

**Current State:**
`useBodySegmentation` handles its own errors, but a crash in the rendering loop could still take down the whole React tree.

**Action:**
Wrap `VideoPanel` in a React Error Boundary component.

```typescript
class VideoPanelErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-fallback">
          <p>Camera encountered an error</p>
          <button onClick={() => this.setState({ hasError: false })}>
            Reload Camera
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

**Benefit:**
If the camera crashes, show a "Reload Camera" button instead of a white screen.

---

### 3.2 Audio Effects Rack

| Aspect | Details |
|--------|---------|
| **Priority** | P4 - Low |
| **Impact** | Medium (Feature) |
| **Difficulty** | Medium |
| **Location** | `hooks/useCameraStream.ts` |

**Current State:**
Audio settings allow for basic Noise Suppression and Gain Control only.

**Action:**
Implement a Web Audio API processing graph.

```typescript
// Audio processing chain
const audioContext = new AudioContext();
const source = audioContext.createMediaStreamSource(stream);

// Compressor - even out voice volume
const compressor = audioContext.createDynamicsCompressor();
compressor.threshold.value = -24;
compressor.knee.value = 30;
compressor.ratio.value = 12;
compressor.attack.value = 0.003;
compressor.release.value = 0.25;

// Noise Gate - silence background hiss when not speaking
const gate = createNoiseGate(audioContext, {
  threshold: -50,
  attack: 0.005,
  release: 0.1
});

// Connect the chain
source
  .connect(compressor)
  .connect(gate)
  .connect(audioContext.destination);
```

**Features Added:**
- **Compressor** — Even out voice volume for consistent audio levels
- **Noise Gate** — Silence background hiss when not speaking
- **EQ (Future)** — Reduce room boom, add presence

---

## Phase 4: "Studio" Features

**Goal:** Expand capabilities for power users

### 4.1 Multi-Source Composition

| Aspect | Details |
|--------|---------|
| **Priority** | P4 - Low |
| **Impact** | High (Feature) |
| **Difficulty** | Medium |

**Action:**
Add `getDisplayMedia` (Screen Share) support to `useCameraStream`.

```typescript
const startScreenShare = async () => {
  const displayStream = await navigator.mediaDevices.getDisplayMedia({
    video: { cursor: 'always' },
    audio: true
  });

  // Composite: screen share as background, webcam as foreground PIP
  compositeStreams(displayStream, cameraStream);
};
```

**Feature:**
Allow users to put their webcam (background removed) *on top* of their screen share, creating a "Weather Reporter" effect for presentations.

---

### 4.2 Gesture Control

| Aspect | Details |
|--------|---------|
| **Priority** | P4 - Low |
| **Impact** | Medium (Feature) |
| **Difficulty** | Medium |

**Action:**
Since MediaPipe is already loaded, enable its Hand Tracking module.

**Supported Gestures:**

| Gesture | Action |
|---------|--------|
| ✌️ Peace Sign | Take a snapshot |
| ✋ Raise Hand | Toggle visual indicator |
| 👍 Thumb Up | Show emoji overlay |
| 👋 Wave | Start/stop recording |

```typescript
import { Hands } from '@mediapipe/hands';

const hands = new Hands({
  locateFile: (file) => `/mediapipe/${file}`
});

hands.onResults((results) => {
  if (detectPeaceSign(results.multiHandLandmarks)) {
    takeSnapshot();
  }
});
```

---

## Priority Summary

| Priority | Task | Impact | Difficulty | Status |
|:---------|:-----|:-------|:-----------|:-------|
| **P0** | Fix PWA Assets (Empty SVGs) | Critical (App Installability) | Low | ✅ Complete |
| **P1** | Local Asset Bundling + AI Worker | High (Performance) | Medium | 🔲 Planned |
| **P1** | OffscreenCanvas Implementation | High (Performance) | Medium | 🔲 Planned |
| **P2** | WebGL Renderer Migration | High (Visual Quality) | High | 🔲 Planned |
| **P3** | Error Boundaries | Medium (Stability) | Low | 🔲 Planned |
| **P4** | Audio Processing Rack | Medium (Feature) | Medium | 🔲 Planned |
| **P4** | Multi-Source Composition | High (Feature) | Medium | 🔲 Planned |
| **P4** | Gesture Control | Medium (Feature) | Medium | 🔲 Planned |

---

## Quick Wins (Can Be Done Immediately)

These optimizations from the codebase analysis can be implemented quickly:

| Task | Location | Impact | Effort |
|------|----------|--------|--------|
| Create shared AudioContext utility | `components/ui/VUMeter.tsx` | Medium | Low |
| Optimize useAutoLowLight memory allocations | `hooks/useAutoLowLight.ts` | Medium | Low |
| Cache vignette gradient in useVideoRenderer | `hooks/useVideoRenderer.ts` | Low-Medium | Low |
| Memoize filter strings | `hooks/useVideoRenderer.ts` | Low | Low |

---

## Success Metrics

| Metric | Current (Estimated) | Target |
|--------|---------------------|--------|
| Time to Interactive | ~2s | <1.5s |
| AI Inference FPS | ~30fps (blocks UI) | 30fps (non-blocking) |
| UI Frame Rate | Variable (jank during AI) | Consistent 60fps |
| Memory Churn (GC) | High during low-light analysis | Minimal |
| Lighthouse PWA Score | Good | 100 |
| Bundle Size | TBD | <500KB gzipped |

---

## Implementation Notes

### Recommended Development Order

1. **Phase 1.1** → Local asset bundling (unblocks everything else)
2. **Phase 1.2** → OffscreenCanvas (immediate UX improvement)
3. **Phase 3.1** → Error boundaries (quick win for stability)
4. **Quick Wins** → Memory/performance optimizations
5. **Phase 2.1** → WebGL migration (biggest effort, biggest payoff)
6. **Phase 3.2 & 4.x** → Feature additions (after core stability)

### Dependencies

```
Phase 1.1 (Local Assets)
    └── Phase 1.2 (OffscreenCanvas)
            └── Phase 2.1 (WebGL)
                    └── Phase 4.1 (Multi-Source)
                    └── Phase 4.2 (Gestures) ← Also depends on 1.1
```

---

## Related Documentation

- **[README.md](./README.md)** — Project overview and quick start
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — Detailed architectural analysis
- **[CODEBASE_ANALYSIS.md](./CODEBASE_ANALYSIS.md)** — Performance analysis and recommendations

---

<div align="center">

*This roadmap is a living document and will be updated as development progresses.*

</div>
