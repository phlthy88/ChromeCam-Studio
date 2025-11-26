#!/bin/bash

# ChromeCam-Studio Performance Optimization Patch Application Script
# This script applies all performance optimization patches automatically

set -e  # Exit on any error

echo "Applying ChromeCam-Studio Performance Optimization Patches..."

# Create new constants files
echo "Creating new constants files..."

cat > constants/webgl.ts << 'EOF'
/**
 * WebGL and rendering constants
 */

// WebGL initialization
export const WEBGL_STABILIZATION_DELAY_MS = 500;
export const WEBGL_INIT_TIMEOUT_MS = 30000;
export const WEBGL_CONTEXT_RETRY_DELAY_MS = 1000;
export const WEBGL_MAX_RETRIES = 3;

// Performance thresholds
export const PAN_CHANGE_THRESHOLD = 0.5;
export const ZOOM_CHANGE_THRESHOLD = 0.01;
EOF

cat > constants/network.ts << 'EOF'
/**
 * Network and connectivity constants
 */

// OBS WebSocket
export const DEFAULT_OBS_WEBSOCKET_URL = 'localhost:4455';
export const OBS_CONNECTION_RETRY_DELAY_MS = 2000;
export const OBS_RECONNECT_MAX_RETRIES = 5;
EOF

cat > constants/ui.ts << 'EOF'
/**
 * UI and UX timing constants
 */

// Toast and notification timeouts
export const TOAST_DEFAULT_DURATION_MS = 3000;
export const TOAST_WARNING_DURATION_MS = 5000;
export const TOAST_ERROR_DURATION_MS = 7000;

// Button confirmation timeouts
export const RESET_CONFIRM_TIMEOUT_MS = 3000;
export const DELETE_CONFIRM_TIMEOUT_MS = 3000;

// Animation durations
export const FADE_ANIMATION_MS = 150;
export const SLIDE_ANIMATION_MS = 250;
EOF

echo "Constants files created."

# Apply patches using git apply
echo "Applying patches..."

# Patch 1: useVideoRenderer.ts
cat > /tmp/useVideoRenderer.patch << 'EOF'
--- a/hooks/useVideoRenderer.ts
+++ b/hooks/useVideoRenderer.ts
@@ -1,4 +1,4 @@
-import React, { useEffect, useRef, useMemo } from 'react';
+import { useEffect, useRef, useMemo } from 'react';
 import type { CameraSettings } from '../components/settings';
 import { ASPECT_RATIO_PRESETS } from '../components/settings';
 import type { HardwareCapabilities } from './useCameraStream';
@@ -10,6 +10,7 @@ import { usePerformanceMonitor } from './usePerformanceMonitor';
 
 import { FaceLandmarks } from '../types/face';
 import { PERFORMANCE } from '../constants/performance';
+import { PAN_CHANGE_THRESHOLD, ZOOM_CHANGE_THRESHOLD } from '../constants/webgl';
 import { logger } from '../utils/logger';
 
 interface FilterDef {
@@ -440,11 +441,15 @@ export function useVideoRenderer({
       autoFrame,
       mirror,
       rotation,
       virtualBackground,
       activeFilter,
+      aspectRatioLock,
       gridOverlay,
       showHistogram,
       showZebraStripes,
       zebraThreshold,
       showFocusPeaking,
       focusPeakingColor,
-      aspectRatioLock,
     } = settingsRef.current;
 
     const filterPreset = FILTER_PRESETS[activeFilter] || FILTER_PRESETS['none'];
+
+    // Memoized aspect ratio lookup (moved to useMemo below, outside render loop)
+    // This prevents array.find() every frame
 
     // Calculate current transform with smooth interpolation (optimized)
@@ -465,19 +470,19 @@ export function useVideoRenderer.ts
         );
 
         // Only update if transform changed significantly (threshold: 0.5% for pan, 1% for zoom)
-        const panXChanged = Math.abs(newPanX - currentTransformRef.current.panX) > 0.5;
-        const panYChanged = Math.abs(newPanY - currentTransformRef.current.panY) > 0.5;
-        const zoomChanged = Math.abs(newZoom - currentTransformRef.current.zoom) > 0.01;
+        const panXChanged = Math.abs(newPanX - currentTransformRef.current.panX) > PAN_CHANGE_THRESHOLD;
+        const panYChanged = Math.abs(newPanY - currentTransformRef.current.panY) > PAN_CHANGE_THRESHOLD;
+        const zoomChanged = Math.abs(newZoom - currentTransformRef.current.zoom) > ZOOM_CHANGE_THRESHOLD;
 
         if (panXChanged || panYChanged || zoomChanged) {
           currentTransformRef.current.panX = newPanX;
           currentTransformRef.current.panY = newPanY;
           currentTransformRef.current.zoom = newZoom;
         }
       } else {
         // Manual transform (no interpolation needed)
         const effectiveZoom = hardwareCapabilities.zoom ? 1 : settingsRef.current.zoom;
         const effectivePanX = hardwareCapabilities.panX ? 0 : settingsRef.current.panX;
         const effectivePanY = hardwareCapabilities.panY ? 0 : settingsRef.current.panY;
 
-        currentTransformRef.current = {
-          panX: effectivePanX,
-          panY: effectivePanY,
-          zoom: effectiveZoom,
-        };
+        // Mutate existing object instead of creating new one
+        currentTransformRef.current.panX = effectivePanX;
+        currentTransformRef.current.panY = effectivePanY;
+        currentTransformRef.current.zoom = effectiveZoom;
       }
 
       const { panX, panY, zoom } = currentTransformRef.current;
@@ -506,18 +511,17 @@ export function useVideoRenderer({
             filterCache.baseFilter,
             contrast: settingsRef.current.contrast,
             saturation: settingsRef.current.saturation,
             brightness: settingsRef.current.brightness,
             grayscale: settingsRef.current.grayscale,
             sepia: settingsRef.current.sepia,
             hue: settingsRef.current.hue,
             activeFilter,
             autoGain,
             hwContrast: hardwareCapabilities.contrast,
             hwSaturation: hardwareCapabilities.saturation,
             hwBrightness: hardwareCapabilities.brightness,
           };
 
-          // Update cache
-          filterCacheRef.current = {
-            baseFilter,
-            contrast: settingsRef.current.contrast,
-            saturation: settingsRef.current.saturation,
-            brightness: settingsRef.current.brightness,
-            brightness: settingsRef.current.brightness,
-            grayscale: settingsRef.current.grayscale,
-            sepia: settingsRef.current.sepia,
-            hue: settingsRef.current.hue,
-            activeFilter,
-            autoGain,
-            hwContrast: hardwareCapabilities.contrast,
-            hwSaturation: hardwareCapabilities.saturation,
-            hwBrightness: hardwareCapabilities.brightness,
-          };
+          // Mutate cache object instead of creating new one
+          const cache = filterCacheRef.current;
+          cache.baseFilter = baseFilter;
+          cache.contrast = settingsRef.current.contrast;
+          cache.saturation = settingsRef.current.saturation;
+          cache.brightness = settingsRef.current.brightness;
+          cache.grayscale = settingsRef.current.grayscale;
+          cache.sepia = settingsRef.current.sepia;
+          cache.hue = settingsRef.current.hue;
+          cache.activeFilter = activeFilter;
+          cache.autoGain = autoGain;
+          cache.hwContrast = hardwareCapabilities.contrast;
+          cache.hwSaturation = hardwareCapabilities.saturation;
+          cache.hwBrightness = hardwareCapabilities.brightness;
         }
 
         const segmentationMask = segmentationMaskRef.current;
@@ -520,12 +524,15 @@ export function useVideoRenderer({
       if (canvas && ctx && video && video.readyState >= 2) {
         // Resize canvas to match video dimensions
         if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
-          [canvas, tempCanvas, video].forEach((el) => {
-            if (el) {
-              el.width = video.videoWidth;
-              el.height = video.videoHeight;
-            }
-          });
+          // Direct iteration - no array allocation
+          canvas.width = video.videoWidth;
+          canvas.height = video.videoHeight;
+          if (tempCanvas) {
+            tempCanvas.width = video.videoWidth;
+            tempCanvas.height = video.videoHeight;
-          }
+          // Note: video element doesn't need width/height set
         }
 
         ctx.setTransform(1, 0, 0, 1, 0, 0);
@@ -640,13 +647,14 @@ export function useVideoRenderer({
 
           if (needsNewGradient) {
             // Create and cache new gradient
             const gradient = createVignetteGradient(ctx, canvas.width, canvas.height, vignette);
-            vignetteCacheRef.current = {
-              gradient,
-              width: canvas.width,
-              height: canvas.height,
-              intensity: vignette,
-            };
+            
+            // Mutate existing cache object
+            const cache = vignetteCacheRef.current;
+            cache.gradient = gradient;
+            cache.width = canvas.width;
+            cache.height = canvas.height;
+            cache.intensity = vignette;
+            
             drawVignette(ctx, canvas.width, canvas.height, gradient);
           } else if (vignetteCache.gradient) {
             // Use cached gradient
@@ -288,6 +292,12 @@ export function useVideoRenderer({
     faceLandmarks,
   ]);
 
+  // Memoize aspect ratio lookup to avoid array.find() every frame
+  const targetAspectRatio = useMemo(() => {
+    const aspectPreset = ASPECT_RATIO_PRESETS.find((p) => p.id === settings.aspectRatioLock);
+    return aspectPreset?.ratio ?? null;
+  }, [settings.aspectRatioLock]);
+
   return {
     maskCanvasRef,
     tempCanvasRef,
EOF

git apply /tmp/useVideoRenderer.patch

# Patch 2: useProOverlays.ts
cat > /tmp/useProOverlays.patch << 'EOF'
--- a/hooks/useProOverlays.ts
+++ b/hooks/useProOverlays.ts
@@ -1,4 +1,4 @@
-import { useCallback } from 'react';
+import { useCallback, useRef } from 'react';
 
 export interface UseProOverlaysReturn {
   drawGridOverlay: (
@@ -420,12 +420,17 @@ export function useProOverlays(): UseProOverlaysReturn {
     []
   );
 
+  // Reusable draw queue to avoid allocation every frame
+  const drawQueueRef = useRef<Array<{ x: number; y: number; w: number; h: number }>>([]);
+
   const drawZebraStripes = useCallback(
     (
       ctx: CanvasRenderingContext2D,
       width: number,
       height: number,
       imageData: ImageData,
       threshold: number
     ) => {
-      const drawQueue: Array<{ x: number; y: number; w: number; h: number }> = [];
+      // Reuse array by clearing it
+      const drawQueue = drawQueueRef.current;
+      drawQueue.length = 0;
       
       const data = imageData.data;
       const normalizedThreshold = threshold / 100;
EOF

git apply /tmp/useProOverlays.patch

# Patch 4: constants/ai.ts
cat > /tmp/ai_constants.patch << 'EOF'
--- a/constants/ai.ts
+++ b/constants/ai.ts
@@ -1,13 +1,35 @@
 /**
  * AI and segmentation constants
  */
 
-// Model loading timeout (30 seconds)
-export const MODEL_LOAD_TIMEOUT_MS = 30000;
+// Body segmentation
+export const BODY_SEGMENTATION_THRESHOLD = 0.7;
+export const AUTO_FRAME_CALC_INTERVAL_MS = 500;
 
-// Segmentation processing interval (process every 3rd frame for performance)
-export const SEGMENTATION_FRAME_SKIP = 3;
+// Auto-framing
+export const FACE_BOX_Y_OFFSET = 0.25;
+export const FRAME_CENTER_POINT = 0.5;
+export const AUTOFRAME_TARGET_ZOOM_FACTOR = 0.6;
+export const AUTOFRAME_MIN_ZOOM = 1.0;
+export const AUTOFRAME_MAX_ZOOM = 2.5;
 
-// Face tracking smoothing factor
-export const FACE_TRACKING_SMOOTHING = 0.3;
+// Face detection
+export const MIN_FACE_LANDMARKS = 68;
+export const FACE_MESH_LANDMARKS = 478;
+
+// Luminance coefficients (ITU-R BT.709)
+export const LUMINANCE_RED_COEFFICIENT = 0.2126;
+export const LUMINANCE_GREEN_COEFFICIENT = 0.7152;
+export const LUMINANCE_BLUE_COEFFICIENT = 0.0722;
+
+// Model loading timeout (30 seconds)
+export const MODEL_LOAD_TIMEOUT_MS = 30000;
+
+// Segmentation processing interval (process every 3rd frame for performance)
+export const SEGMENTATION_FRAME_SKIP = 3;
+
+// Face tracking smoothing factor
+export const FACE_TRACKING_SMOOTHING = 0.3;
EOF

git apply /tmp/ai_constants.patch

# Patch 5: useWebGLRenderer.ts
cat > /tmp/useWebGLRenderer.patch << 'EOF'
--- a/hooks/useWebGLRenderer.ts
+++ b/hooks/useWebGLRenderer.ts
@@ -11,6 +11,12 @@ import { useEffect, useRef, useCallback, useState } from 'react';
 import { WebGLLutRenderer, WebGLFaceWarpRenderer, applyLutSoftware } from '../utils/webglLut';
 import { getCinematicLut } from '../data/cinematicLuts';
 import { FaceLandmarks } from '../types/face';
+import {
+  WEBGL_STABILIZATION_DELAY_MS,
+  WEBGL_INIT_TIMEOUT_MS,
+  WEBGL_CONTEXT_RETRY_DELAY_MS,
+  WEBGL_MAX_RETRIES,
+} from '../constants/webgl';
 
 export interface UseWebGLRendererOptions {
   /** Whether WebGL rendering is enabled */
@@ -162,7 +168,7 @@ export function useWebGLRenderer({
     cleanupContextHandlers();
 
     // CRITICAL FIX: Delay WebGL initialization to allow main thread to stabilize
-    const initDelay = setTimeout(() => {
+    const initDelay = setTimeout(() => {
       if (!isMounted) return;
 
       // Check WebGL support
@@ -234,11 +240,11 @@ export function useWebGLRenderer({
       webglCanvasRef.current.addEventListener(
         'webglcontextrestored',
         contextRestoredHandlerRef.current
       );
 
       // CRITICAL FIX: Try WebGL context creation with error recovery
       let retryCount = 0;
-      const MAX_RETRIES = 3;
+      // Using WEBGL_MAX_RETRIES constant
 
       const tryCreateContext = () => {
         try {
@@ -255,17 +261,17 @@ export function useWebGLRenderer({
         } catch (error) {
           console.error('[useWebGLRenderer] Context creation failed:', error);
 
-          if (retryCount < MAX_RETRIES) {
+          if (retryCount < WEBGL_MAX_RETRIES) {
             retryCount++;
             console.warn(
-              `[useWebGLRenderer] Retrying context creation (${retryCount}/${MAX_RETRIES})...`
+              `[useWebGLRenderer] Retrying context creation (${retryCount}/${WEBGL_MAX_RETRIES})...`
             );
-            setTimeout(tryCreateContext, 1000 * retryCount); // Exponential backoff
+            setTimeout(tryCreateContext, WEBGL_CONTEXT_RETRY_DELAY_MS * retryCount);
           } else {
             console.error('[useWebGLRenderer] Failed to initialize WebGL after retries');
             if (isMounted) {
               setIsWebGLSupported(false);
             }
           }
         }
       };
 
       tryCreateContext();
-    }, 500); // Wait 500ms for main thread to stabilize
+    }, WEBGL_STABILIZATION_DELAY_MS);
 
     return () => {
EOF

git apply /tmp/useWebGLRenderer.patch

# Patch 6: useOBSIntegration.ts
cat > /tmp/useOBSIntegration.patch << 'EOF'
--- a/hooks/useOBSIntegration.ts
+++ b/hooks/useOBSIntegration.ts
@@ -1,6 +1,7 @@
 import { useState, useEffect, useCallback, useRef } from 'react';
 import OBSWebSocket from 'obs-websocket-js';
 import type { OBSState } from '../types/obs';
+import { DEFAULT_OBS_WEBSOCKET_URL, OBS_CONNECTION_RETRY_DELAY_MS } from '../constants/network';
 
 export interface UseOBSIntegrationReturn {
   obsState: OBSState;
@@ -64,7 +65,7 @@ export function useOBSIntegration() {
 
   const connect = useCallback(async () => {
     try {
-      const url = 'localhost:4455';
+      const url = DEFAULT_OBS_WEBSOCKET_URL;
       await obs.connect(`ws://${url}`);
       setObs State((prev) => ({ ...prev, connected: true, error: null }));
     } catch (error) {
@@ -128,7 +129,7 @@ export function useOBSIntegration() {
         const interval = setInterval(async () => {
           if (!obsState.connected) {
             await connect();
           }
-        }, 2000);
+        }, OBS_CONNECTION_RETRY_DELAY_MS);
 
         return () => clearInterval(interval);
       }
EOF

git apply /tmp/useOBSIntegration.patch

# Patch 7: segmentation.worker.ts
cat > /tmp/segmentation_worker.patch << 'EOF'
--- a/workers/segmentation.worker.ts
+++ b/workers/segmentation.worker.ts
@@ -5,6 +5,15 @@ import * as tf from '@tensorflow/tfjs';
 import * as bodyPix from '@tensorflow-models/body-pix';
 import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
 
+import {
+  BODY_SEGMENTATION_THRESHOLD,
+  AUTO_FRAME_CALC_INTERVAL_MS,
+  FACE_BOX_Y_OFFSET,
+  FRAME_CENTER_POINT,
+  AUTOFRAME_TARGET_ZOOM_FACTOR,
+  AUTOFRAME_MIN_ZOOM,
+  AUTOFRAME_MAX_ZOOM,
+} from '../constants/ai';
+
 // =============================================================================
 // POLYFILLS for Worker Environment
 // =============================================================================
@@ -84,7 +93,7 @@ let isInitialized = false;
 let isInitializing = false;
 let autoFrameEnabled = false;
 
 // Auto-frame throttling state
 let lastAutoFrameCalc = 0;
-const AUTO_FRAME_CALC_INTERVAL = 500; // Calculate only every 500ms (2 FPS)
+const AUTO_FRAME_CALC_INTERVAL = AUTO_FRAME_CALC_INTERVAL_MS;
 let cachedAutoFrameTransform: ReturnType<typeof calculateAutoFrameTransform> = null;
 
 // =============================================================================
@@ -109,7 +118,7 @@ function calculateAutoFrameTransform(segmentation: bodyPix.SemanticPersonSegmen
   if (found && maxY > minY) {
     const boxCenterX = (minX + maxX) / 2;
     const boxHeight = maxY - minY;
-    const faceY = minY + boxHeight * 0.25;
+    const faceY = minY + boxHeight * FACE_BOX_Y_OFFSET;
 
     const centerXPercent = boxCenterX / width;
     const faceYPercent = faceY / height;
 
-    const targetPanX = (0.5 - centerXPercent) * 100;
-    const targetPanY = (0.5 - faceYPercent) * 100;
+    const targetPanX = (FRAME_CENTER_POINT - centerXPercent) * 100;
+    const targetPanY = (FRAME_CENTER_POINT - faceYPercent) * 100;
 
-    let targetZoom = (height * 0.6) / boxHeight;
-    targetZoom = Math.max(1, Math.min(targetZoom, 2.5));
+    let targetZoom = (height * AUTOFRAME_TARGET_ZOOM_FACTOR) / boxHeight;
+    targetZoom = Math.max(AUTOFRAME_MIN_ZOOM, Math.min(targetZoom, AUTOFRAME_MAX_ZOOM));
 
     return { panX: targetPanX, panY: targetPanY, zoom: targetZoom };
   }
@@ -280,7 +289,7 @@ async function processFrame(imageBitmap: ImageBitmap, autoFrame: boolean) {
     const segmentation = await net.segmentPerson(canvas as unknown as HTMLCanvasElement, {
       flipHorizontal: false,
       internalResolution,
-      segmentationThreshold: 0.7,
+      segmentationThreshold: BODY_SEGMENTATION_THRESHOLD,
     });
 
     // Run face detection (optimized for high resolutions)
EOF

git apply /tmp/segmentation_worker.patch

# Patch 8: useAutoLowLight.ts
cat > /tmp/useAutoLowLight.patch << 'EOF'
--- a/hooks/useAutoLowLight.ts
+++ b/hooks/useAutoLowLight.ts
@@ -1,4 +1,9 @@
 import { useEffect, useRef, useState } from 'react';
+import {
+  LUMINANCE_RED_COEFFICIENT,
+  LUMINANCE_GREEN_COEFFICIENT,
+  LUMINANCE_BLUE_COEFFICIENT,
+} from '../constants/ai';
 
 export interface UseAutoLowLightOptions {
   videoRef: React.RefObject<HTMLVideoElement | null>;
@@ -95,9 +100,9 @@ export function useAutoLowLight({
         const b = data[i + 2] || 0;
 
         // Calculate luminance using ITU-R BT.709 coefficients
         const luminance =
-          (r / 255) * 0.2126 +
-          (g / 255) * 0.7152 +
-          (b / 255) * 0.0722;
+          (r / 255) * LUMINANCE_RED_COEFFICIENT +
+          (g / 255) * LUMINANCE_GREEN_COEFFICIENT +
+          (b / 255) * LUMINANCE_BLUE_COEFFICIENT;
 
         totalLuminance += luminance;
         pixelCount++;
EOF

git apply /tmp/useAutoLowLight.patch

# Patch 9: segmentationManager.ts
cat > /tmp/segmentationManager.patch << 'EOF'
--- a/utils/segmentationManager.ts
+++ b/utils/segmentationManager.ts
@@ -1,6 +1,5 @@
 import type { FaceLandmarks } from '../types/face';
-import type { SegmentationConfig } from '../types/media';
 import type { AutoFrameTransform } from '../hooks/useBodySegmentation';
 
 // Import the worker using Vite's standard syntax.
@@ -215,10 +214,6 @@ class SegmentationManager {
     }, 1000);
   }
 
-  updateConfig(_config: Partial<SegmentationConfig>): void {
-    // Not implemented
-  }
-
   getMode(): SegmentationMode {
     return this.mode;
   }
EOF

git apply /tmp/segmentationManager.patch

echo "All patches applied successfully!"

# Clean up temporary files
rm -f /tmp/*.patch

echo "Running verification..."

# TypeScript check
npm run typecheck

# Build verification
npm run build

echo "Performance optimization patches applied and verified!"
echo "You can now run 'npm run dev' or 'npm run preview' to test the optimizations."</content>
<parameter name="filePath">apply_patches.sh