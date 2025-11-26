# ChromeCam Studio - Technical & Product Roadmap

**Last Updated:** November 2024 **Goal:** Transform ChromeCam Studio into a 60fps, studio-grade
webcam application

---

## Overview

ChromeCam Studio is evolving from a prototype into a professional-grade PWA. The current
architecture uses a hybrid rendering approach (Canvas 2D + WebGL for effects) and a modular
hook-based system. The immediate focus is resolving performance bottlenecks caused by main-thread AI
processing and finalizing the "Studio" feature set for V1.0 deployment.

---

## Execution Plan: Path to V1.0

This section outlines the specific execution steps required to reach "professional grade and
deployment ready" status.

### Phase 1: Performance Core (The 60fps Standard)

**Goal:** Decouple AI processing from the UI thread to guarantee 60fps responsiveness.

1.  **Local Asset Bundling & Worker Setup (P1)**
    - **Task:** Download MediaPipe WASM/TFLite assets to `public/mediapipe/`.
    - **Task:** Implement `components/aiWorker.ts` to load these local assets.
    - **Task:** Update `hooks/useBodySegmentation.ts` to communicate with the worker.
    - **Benefit:** Removes network dependency and enables worker-based inference.

2.  **OffscreenCanvas Implementation (P1)**
    - **Task:** Transfer control of the rendering canvas to a dedicated `render.worker.ts`.
    - **Task:** Move the `useVideoRenderer` logic into the worker.
    - **Benefit:** UI interactions (sliders, buttons) will never stutter due to video processing.

### Phase 2: Visual & Audio Excellence

**Goal:** Solidify the "Studio" in ChromeCam Studio.

1.  **Consolidate WebGL Pipeline (P2)**
    - **Status:** _Partially Implemented (LUTs & Face Warp active)._
    - **Task:** Move the remaining 2D Canvas compositing (text, simple overlays) into the WebGL
      context where possible, or optimize the hybrid approach.
    - **Task:** Ensure the WebGL context is robust against context loss.

2.  **Finalize Audio Processing (P3)**
    - **Status:** _Beta Implemented (Compressor & Noise Gate)._
    - **Task:** Add visual feedback for Compressor (gain reduction meter).
    - **Task:** Verify audio synchronization with the video stream (especially after moving video to
      worker).

### Phase 3: Resilience & Production

**Goal:** Crash-proof the app and prepare for store submission.

1.  **Global Error Boundaries (P3)**
    - **Task:** Wrap `VideoPanel` and `ControlsPanel` in React Error Boundaries.
    - **Task:** Implement graceful degradation (e.g., if WebGL fails, fallback to 2D Canvas; if AI
      fails, disable blur).

2.  **Deployment Readiness**
    - **Task:** Verify PWA installation flow and offline capabilities.
    - **Task:** Run production build analysis (`npm run build` and size check).
    - **Task:** Add basic unit/integration tests for critical paths (AI Worker communication).

---

## Detailed Feature Status

### 1. Performance & Architecture

| Priority | Task                     | Status        | Notes                                                          |
| :------- | :----------------------- | :------------ | :------------------------------------------------------------- |
| **P1**   | **Local Asset Bundling** | 🔴 Incomplete | `aiWorker.ts` is a placeholder. Assets missing from `public/`. |
| **P1**   | **OffscreenCanvas**      | 🔴 Incomplete | Rendering still happens on Main Thread.                        |
| **P1**   | **AI Worker Fix**        | 🔴 Incomplete | Dependent on Local Asset Bundling.                             |

### 2. Visual Fidelity

| Priority | Task               | Status      | Notes                                                                            |
| :------- | :----------------- | :---------- | :------------------------------------------------------------------------------- |
| **P2**   | **WebGL Renderer** | 🟡 Partial  | 3D LUTs and Face Warp implemented via `useWebGLRenderer`. Main loop is still 2D. |
| **P0**   | **PWA Assets**     | ✅ Complete | SVG icons and manifest generation configured.                                    |

### 3. Resilience & UX

| Priority | Task                   | Status        | Notes                                                     |
| :------- | :--------------------- | :------------ | :-------------------------------------------------------- |
| **P3**   | **Error Boundaries**   | 🔴 Incomplete | No error containment for video crashes.                   |
| **P3**   | **Audio Effects**      | 🟢 Beta       | Compressor & Noise Gate logic exists in `utils/audio.ts`. |
| **P4**   | **Multi-Source Comp.** | 🔴 Incomplete | Screen share not implemented.                             |
| **P4**   | **Gesture Control**    | 🔴 Incomplete | No hand tracking logic.                                   |

### 4. Quick Wins (Completed)

| Task                            | Impact     | Status      |
| ------------------------------- | ---------- | ----------- |
| Shared AudioContext utility     | Medium     | ✅ Complete |
| Optimize useAutoLowLight memory | Medium     | ✅ Complete |
| Cache vignette gradient         | Low-Medium | ✅ Complete |
| Memoize filter strings          | Low        | ✅ Complete |

---

## Technical Appendix

### AI Worker CDN Issue

**Current State:** `components/aiWorker.ts` is empty. `hooks/useBodySegmentation.ts` attempts to
load scripts from CDN on the main thread. **Action:** Must bundle `.tflite` and `.wasm` files in
`public/mediapipe/` to bypass CORS/CSP issues in Web Workers.

### Audio Processing Rack

**Current State:** Implemented in `hooks/useAudioProcessor.ts` and `utils/audio.ts`. **Action:**
Validate performance and synchronization.

### WebGL Migration

**Current State:** Hybrid. `useVideoRenderer` creates a 2D context but calls `useWebGLRenderer`
(which creates a separate WebGL canvas) for specific effects, then draws the result back to the 2D
canvas. **Action:** This "copy-back" mechanism is expensive. Moving everything to a single WebGL
context in an OffscreenCanvas (Phase 1.2) is the ultimate solution.
