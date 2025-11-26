# ChromeCam-Studio Final Production Checklist

**Generated**: 2025-11-26
**Audit Method**: Gemini CLI Deep Analysis
**Status**: Pre-Production Audit Complete

---

## Executive Summary

This document contains **critical production blockers** and **quality improvements** identified through automated deep analysis using Gemini CLI. All issues have been categorized with specific file paths and line numbers.

**Severity Breakdown**:
- 🔴 **CRITICAL** (Zero-Tolerance): 10 issues
- 🟡 **HIGH** (Performance): 6 issues
- 🟢 **MEDIUM** (Quality): 50+ issues

---

## 1. Stability & Lifecycle (Zero-Tolerance List)

These are **blocking issues** that MUST be fixed before production deployment.

### 🔴 1.1 Worker Lifecycle - Memory Leak

**Issue**: Web Worker is never terminated, causing resource leak.

**Location**: `hooks/useBodySegmentation.ts:334-338`

**Problem**:
```typescript
// Cleanup worker on unmount
useEffect(() => {
  return () => {
    // Note: We don't dispose the singleton here as other components might use it
  };
}, []);
```

The worker thread and all loaded ML models remain in memory after component unmount.

**Action Required**:
1. Implement reference counting for the singleton worker
2. Call `segmentationManager.dispose()` when the last component unmounts
3. Alternatively, create a top-level cleanup in `App.tsx` or main component

**Proposed Fix**:
```typescript
// In App.tsx or top-level component
useEffect(() => {
  return () => {
    segmentationManager.dispose(); // Clean up on app unmount
  };
}, []);
```

---

### 🔴 1.2 WebGL Resource Leak - Orphaned Shaders

**Issue**: Shader objects not deleted after program linking, causing GPU memory leak.

**Locations**:
- `utils/webglLut.ts:250-267` (WebGLFaceWarpRenderer)
- `utils/webglLut.ts` (WebGLLutRenderer - similar pattern)

**Problem**:
```typescript
const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, FACE_WARP_VERTEX);
const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, FACE_WARP_FRAGMENT);

// ... attach and link ...
this.gl.linkProgram(this.program);

// ❌ MISSING: gl.deleteShader(vertexShader);
// ❌ MISSING: gl.deleteShader(fragmentShader);
```

**Action Required**:
Add shader cleanup after successful program linking:
```typescript
if (this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
  // Clean up shader objects - they're baked into the program now
  this.gl.deleteShader(vertexShader);
  this.gl.deleteShader(fragmentShader);
  // ... rest of initialization
}
```

**Files to Fix**:
- `utils/webglLut.ts:267` (after WebGLFaceWarpRenderer link)
- `utils/webglLut.ts` (after WebGLLutRenderer link - search for similar pattern)

---

### 🔴 1.3 Async State Updates After Unmount

**Issue**: Async operations can set state after component unmounts, causing React warnings and potential crashes.

**Locations**:

1. **`hooks/useOBSIntegration.ts:133-137`**
   - `setInterval` callback updates state after async OBS call
   - No cancellation check before `updateState`

2. **`hooks/useBodySegmentation.ts:249-287`**
   - `setQrResult` called after `await barcodeDetectorRef.current.detect(video)` (line 249)
   - `setIsAiActive` called after segmentation (line 299)
   - `setAiRuntimeError` and `setLoadingError` in catch block (lines 311-312)
   - **Note**: `isLoopActive` prevents new iterations but doesn't protect in-flight async operations

3. **`hooks/useWebGLRenderer.ts:173-288`**
   - `setTimeout` delay for WebGL init
   - `setIsReady(true)` at line 254
   - `setIsWebGLSupported(false)` at line 282
   - No check if component unmounted before state updates

**Action Required**:

Add `isMounted` flags to protect all async state updates:

```typescript
// Example fix for useWebGLRenderer.ts
useEffect(() => {
  let isMounted = true;

  const initDelay = setTimeout(() => {
    const tryCreateContext = () => {
      // ... initialization code ...
      if (initialized && isMounted) {  // ✅ Add check
        setIsReady(true);
      }
    };
    tryCreateContext();
  }, 500);

  return () => {
    isMounted = false;  // ✅ Set flag
    clearTimeout(initDelay);
  };
}, [enabled]);
```

Apply similar pattern to all three locations.

---

### 🔴 1.4 WebGL Context Loss Safety

**Status**: ✅ **VERIFIED SAFE** (Context loss handlers correctly implemented)

**Location**: `hooks/useWebGLRenderer.ts:202-238`

**Analysis**:
- Context loss event listeners properly added (lines 234-238)
- `e.preventDefault()` correctly called (line 203) to allow restoration
- Renderers properly disposed on context loss (lines 208-223)
- No action required - this is correctly implemented

---

### 🔴 1.5 PWA Manifest Configuration Errors

**Issue**: Progressive Web App manifest has multiple critical errors preventing proper installation.

**Location**: `vite.config.ts:141-191`

**Problems Identified**:

1. **SVG Icons Not Loading** ❌
   - Icons at `pwa-192x192.svg`, `pwa-512x512.svg`, `masked-icon.svg` fail to load
   - Chrome/Edge PWA requires PNG format icons, not SVG
   - Current config (lines 156-175):
   ```typescript
   icons: [
     { src: 'pwa-192x192.svg', sizes: '192x192', type: 'image/svg+xml' },
     { src: 'pwa-512x512.svg', sizes: '512x512', type: 'image/svg+xml' },
     { src: 'masked-icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
   ]
   ```

2. **Missing Square Icons Requirement** ❌
   - Most OS require at least one square PNG icon
   - SVG icons don't satisfy this requirement

3. **Missing Installation Screenshots** ❌
   - No screenshots for "Richer PWA Install UI"
   - Need at least one wide screenshot (desktop)
   - Need at least one standard screenshot (mobile)

4. **App ID Not Explicitly Set** ⚠️
   - Currently using `start_url` as fallback
   - Should explicitly set `id: '/'` to match current identity
   - Line 149 has wrong value: `id: 'ChromeCam-Studio'`

**Action Required**:

**Step 1**: Generate PNG icons from SVG
```bash
# Convert SVG to PNG at multiple sizes
# Option A: Use ImageMagick
convert public/pwa-512x512.svg -resize 192x192 public/pwa-192x192.png
convert public/pwa-512x512.svg -resize 512x512 public/pwa-512x512.png
convert public/masked-icon.svg -resize 512x512 public/pwa-maskable-512x512.png

# Option B: Use a Node script with sharp
npm install --save-dev sharp
```

**Step 2**: Update manifest icons in `vite.config.ts:156-175`
```typescript
icons: [
  {
    src: 'pwa-192x192.png',      // ✅ Changed to PNG
    sizes: '192x192',
    type: 'image/png',           // ✅ Changed type
    purpose: 'any'
  },
  {
    src: 'pwa-512x512.png',      // ✅ Changed to PNG
    sizes: '512x512',
    type: 'image/png',           // ✅ Changed type
    purpose: 'any'
  },
  {
    src: 'pwa-maskable-512x512.png',  // ✅ Changed to PNG
    sizes: '512x512',
    type: 'image/png',           // ✅ Changed type
    purpose: 'maskable'
  },
  // Keep SVG as fallback for modern browsers
  {
    src: 'pwa-192x192.svg',
    sizes: 'any',
    type: 'image/svg+xml',
    purpose: 'any'
  }
]
```

**Step 3**: Fix App ID at line 149
```typescript
id: '/',  // ✅ Match the current computed App ID
```

**Step 4**: Add PWA screenshots
Create `public/screenshots/` directory with:
- `desktop-wide.png` (1280x720 or higher, 16:9 aspect ratio)
- `mobile.png` (750x1334 or similar, portrait)

Then add to manifest:
```typescript
manifest: {
  // ... existing config ...
  screenshots: [
    {
      src: 'screenshots/desktop-wide.png',
      sizes: '1280x720',
      type: 'image/png',
      form_factor: 'wide',
      label: 'ChromeCam Studio desktop view'
    },
    {
      src: 'screenshots/mobile.png',
      sizes: '750x1334',
      type: 'image/png',
      label: 'ChromeCam Studio mobile view'
    }
  ]
}
```

**Priority**: P0 - These errors prevent proper PWA installation and app store listing

---

## 2. Performance & Dead Code (The "60 FPS Guarantee")

These issues impact rendering performance and should be addressed for smooth 60 FPS operation.

### 🟡 2.1 Redundant Calculations in Render Loop

**Issue**: Object allocations and array operations in hot path (60 FPS loop).

**Locations**:

#### `hooks/useVideoRenderer.ts`

1. **Line 458**: New object created every frame when autoFrame disabled
   ```typescript
   currentTransformRef.current = { panX: effectivePanX, panY: effectivePanY, zoom: effectiveZoom };
   ```
   **Fix**: Only update if values changed, or mutate existing object

2. **Line 524**: New array created on canvas resize
   ```typescript
   [canvas, tempCanvas, video].forEach(...)
   ```
   **Fix**: Create array once outside loop, or use manual iteration

3. **Line 510**: Filter cache object allocation
   ```typescript
   filterCacheRef.current = { ... }
   ```
   **Fix**: Mutate existing object properties instead

4. **Line 646**: Vignette cache object allocation
   ```typescript
   vignetteCacheRef.current = { gradient, width: canvas.width, height: canvas.height, intensity: vignette };
   ```
   **Fix**: Mutate existing object properties instead

5. **Line 447**: Array.find() every frame
   ```typescript
   const aspectPreset = ASPECT_RATIO_PRESETS.find(p => p.id === aspectRatioLock);
   ```
   **Fix**: Memoize with `useMemo([aspectRatioLock])`

#### `hooks/useProOverlays.ts`

6. **Line 427**: Array allocation in `drawZebraStripes` (called every frame)
   ```typescript
   const drawQueue: Array<{ x: number; y: number; w: number; h: number }> = [];
   ```
   **Fix**: Reuse array with `drawQueue.length = 0` pattern

**Estimated FPS Impact**: 2-5 FPS improvement (reduces GC pressure)

---

### 🟡 2.2 Unused Imports and Variables

**Issue**: Dead code that should be removed.

**Locations**:

1. **`components/ControlSection.tsx:21`**
   ```typescript
   const [_contentHeight, setContentHeight] = useState(0);
   ```
   **Action**: Remove `_contentHeight` if truly unused, or use it

2. **`hooks/useVideoRenderer.ts:1`**
   ```typescript
   import React from 'react';  // ❌ Unused
   ```
   **Action**: Remove import

3. **`utils/segmentationManager.ts:2`**
   ```typescript
   import type { SegmentationConfig } from '../types/media';  // ❌ Unused
   ```
   **Action**: Remove import

---

### 🟡 2.3 Magic Numbers Extraction

**Issue**: Hardcoded values throughout codebase make tuning difficult.

**Recommended Constants Structure**:
```
constants/
  ├── animations.ts      (lerp speeds, easing values)
  ├── audio.ts          (thresholds, compressor settings)
  ├── camera.ts         (existing + new camera values)
  ├── effects.ts        (visual effect parameters)
  ├── network.ts        (OBS port, URLs)
  ├── performance.ts    (existing + timeouts, FPS targets)
  ├── ui.ts             (timeout durations, opacities)
  ├── color.ts          (luminance coefficients)
  └── math.ts           (common constants like MS_IN_SECOND)
```

**High-Priority Extractions**:

#### Network & Connectivity
- `hooks/useOBSIntegration.ts:67` - `'localhost:4455'` → `DEFAULT_OBS_WEBSOCKET_URL`
- `hooks/useOBSIntegration.ts:131` - `2000` → `OBS_CONNECTION_RETRY_DELAY_MS`

#### Performance Critical
- `hooks/useVideoRenderer.ts:451` - `0.05` → `AUTO_FRAME_LERP_SPEED` (animations.ts)
- `hooks/useProOverlays.ts:364` - `16.67` → `FPS_60_FRAME_DURATION_MS` (performance.ts)
- `workers/segmentation.worker.ts:283` - `0.7` → `BODY_SEGMENTATION_THRESHOLD`

#### UI/UX Timeouts
- `components/ControlsPanel.tsx:363` - `3000` → `RESET_CONFIRM_TIMEOUT_MS`
- `components/VideoPanel.tsx:565` - `5000` → `TAKE_PHOTO_CONFIRM_TIMEOUT_MS`
- `hooks/useWebGLRenderer.ts:288` - `500` → `WEBGL_STABILIZATION_DELAY_MS`

#### Color Processing
- `hooks/useAutoLowLight.ts:98` - `0.2126, 0.7152, 0.0722` →
  - `LUMINANCE_RED_COEFFICIENT`
  - `LUMINANCE_GREEN_COEFFICIENT`
  - `LUMINANCE_BLUE_COEFFICIENT`

#### Auto-Frame/Camera
- `workers/segmentation.worker.ts:112` - `0.25` → `FACE_BOX_Y_OFFSET`
- `workers/segmentation.worker.ts:118` - `0.5` → `FRAME_CENTER_POINT`
- `workers/segmentation.worker.ts:120` - `0.6` → `AUTOFRAME_TARGET_ZOOM_FACTOR`
- `hooks/useVideoRenderer.ts:471-473` - `0.5, 0.01` → `PAN_CHANGE_THRESHOLD, ZOOM_CHANGE_THRESHOLD`

**Full List**: See audit output for complete 50+ magic number locations

**Action Plan**:
1. Create new constants files with exported values
2. Replace hardcoded numbers with named constants
3. Add JSDoc comments explaining each constant's purpose

---

## 3. Code Quality & Inconsistencies (The "Cleanup")

### 🟢 3.1 Logging Inconsistencies

**Issue**: Direct `console.log` usage instead of centralized logger.

**Existing Logger**: `utils/logger.ts` exports a `logger` with `debug`, `info`, `warn`, `error` methods.

**Files Using console.log** (should migrate to logger):

#### Hooks
- `hooks/useBodySegmentation.ts:173, 180`
- `hooks/useBroadcastMode.ts:28, 44`
- `hooks/useVideoRenderer.ts:304, 342, 346`
- `hooks/useWebGLRenderer.ts:87, 258, 262, 312, 353, 366`

#### Utils
- `utils/audio.ts:389, 426, 434`
- `utils/audioProcessor.ts:114, 181, 189`
- `utils/segmentationManager.ts:204`
- `utils/webglLut.ts:247`

#### Workers
- `workers/segmentation.worker.ts:42, 53, 92, 276, 308, 317, 320, 344`

**Action Required**:

Replace:
```typescript
console.log('[BroadcastMode] Entered broadcast mode');
```

With:
```typescript
import { logger } from '../utils/logger';
logger.info('BroadcastMode', 'Entered broadcast mode');
```

**Benefits**:
- Consistent formatting
- Filterable log levels
- Centralized control for production log suppression

---

### 🟢 3.2 ARIA Accessibility Issues

**Issue**: Icon-only buttons missing `aria-label` attributes.

**Locations**:

1. **`components/ui/CameraWidget.tsx:174`**
   ```tsx
   <button onClick={closeMenu} className="p-2">
     {/* X icon */}
   </button>
   ```
   **Fix**: Add `aria-label="Close menu"`

2. **`components/ControlSection.tsx:57`**
   ```tsx
   <button
     onClick={onReset}
     className="..."
     title="Reset this section to default values"
   >
     {/* Refresh icon */}
   </button>
   ```
   **Fix**: Add `aria-label="Reset to defaults"` (title alone is insufficient)

**Action Required**:
Add descriptive aria-label to all icon-only buttons for screen reader accessibility.

---

### 🟢 3.3 Old Hacks and Legacy Code

**Issue**: Check for deprecated polyfills or workarounds.

**Status**: ✅ **CLEAN**

**Verification**: `workers/segmentation.worker.ts`
- Only contains modern `atob` polyfill (lines 14-19) - **SAFE**
- No old `importScripts()` with `XMLHttpRequest` hacks
- Worker uses modern ES module imports

**No action required** - worker code is clean.

---

## 4. Priority Action Matrix

### Must Fix Before Deploy (P0 - Critical)

#### Code Issues
- [ ] **1.1** Add worker lifecycle cleanup with reference counting
- [ ] **1.2** Delete orphaned shaders in WebGL renderers (2 locations)
- [ ] **1.3** Add isMounted guards to 3 async hooks

#### PWA Configuration
- [ ] **1.5** Generate PNG icons from SVG (192x192, 512x512, maskable)
- [ ] **1.5** Update manifest to use PNG icons instead of SVG
- [ ] **1.5** Fix App ID to `'/'` in manifest
- [ ] **1.5** Create and add PWA screenshots (desktop + mobile)

**Estimated Time**: 6-8 hours
**Risk if Skipped**:
- Memory leaks, crashes, React warnings in production
- PWA cannot be installed on mobile/desktop
- App store submission rejection

---

### High Priority (P1 - Performance)

- [ ] **2.1** Memoize object allocations in render loops (6 locations)
- [ ] **2.2** Remove unused imports/variables (3 locations)
- [ ] **2.3** Extract top 20 most critical magic numbers

**Estimated Time**: 3-4 hours
**Benefit**: +5 FPS, improved code clarity

---

### Medium Priority (P2 - Quality)

- [ ] **3.1** Migrate console.log to centralized logger (20+ locations)
- [ ] **3.2** Add aria-label to icon buttons (2 locations)
- [ ] **2.3** Complete magic number extraction (remaining 30+ locations)

**Estimated Time**: 2-3 hours
**Benefit**: Better logging, accessibility compliance, maintainability

---

## 5. Verification Checklist

After fixes, verify:

### Memory Leaks
```bash
# Chrome DevTools Memory Profiler
1. Open app, enable all AI features
2. Take heap snapshot (Snapshot A)
3. Use app for 5 minutes
4. Unmount and remount main components
5. Take heap snapshot (Snapshot B)
6. Compare - worker and WebGL objects should be freed
```

### Performance
```bash
# Chrome DevTools Performance
1. Record 60-second session with all effects enabled
2. Check for:
   - Consistent 60 FPS (no drops below 50)
   - JS heap under 100MB
   - No long tasks >50ms in render loop
   - GPU memory stable (no growth)
```

### Accessibility
```bash
# Lighthouse Audit
1. Run Lighthouse accessibility audit
2. Target score: 95+
3. Verify screen reader navigation
```

---

## 6. Post-Fix Regression Tests

### Critical Path Tests
1. Enable blur/background removal → Check worker starts/stops cleanly
2. Switch between LUT presets → Check WebGL context stable
3. Rapid component mount/unmount → Check for console errors
4. Long recording session (30+ min) → Check memory stable

### Edge Cases
1. Browser tab backgrounded → Check worker/WebGL recovery
2. GPU driver restart simulation → Check context loss recovery
3. High-resolution input (4K) → Check FPS maintained

---

## Appendix: Full Audit Metadata

**Gemini CLI Sessions**:
- Worker Audit: 22,533 tokens, 2 read operations
- WebGL Audit: 41,607 tokens, 2 read operations
- Async Safety: 99,451 tokens, 20 read operations
- Performance: 28,843 tokens, 2 read operations
- Unused Code: 3,173,994 tokens, 63 operations
- Magic Numbers: 164,516 tokens, 13 operations
- Logging: 31,164 tokens, 4 operations
- ARIA: 82,612 tokens, 4 operations

**Total Analysis**: ~3.6M tokens, 110 file operations

**Audit Date**: 2025-11-26
**Next Review**: Before production deploy

---

## Notes

This checklist was generated using automated deep analysis via Gemini CLI. All findings have been verified for accuracy and include specific file locations and remediation guidance.

For questions or clarifications, reference the individual audit outputs in `/tmp/*-audit.json`.
