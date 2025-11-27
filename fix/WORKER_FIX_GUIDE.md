# ChromeCam Studio - Worker Initialization Fix Guide

## Problem Summary

The error:
```
[ERROR][SegmentationManager] Worker initialization timeout (30s) - falling back to main thread
```

**Root Cause**: Vite forces ES module workers (`type=module`) which don't support `importScripts()`. MediaPipe's legacy APIs use `importScripts()` internally for WASM loading, causing silent failures.

## Solution: Bypass Vite + Use TensorFlow.js BodyPix

Instead of fighting Vite, we:
1. Place the worker in `public/` where Vite doesn't process it
2. Use TensorFlow.js BodyPix instead of MediaPipe (loads models via fetch, not importScripts)

---

## Implementation Checklist

### Step 1: Create Worker Directory
```bash
mkdir -p public/workers
```

### Step 2: Copy Worker File
Copy `segmentation.worker.js` to `public/workers/segmentation.worker.js`

**Verify**: The file should start with:
```javascript
importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.17.0/dist/tf.min.js');
importScripts('https://cdn.jsdelivr.net/npm/@tensorflow-models/body-pix@2.2.1/dist/body-pix.min.js');
```

### Step 3: Update segmentationManager.ts
Replace `src/utils/segmentationManager.ts` with the fixed version.

**Key change** - look for this line around line 117:
```typescript
const workerUrl = '/workers/segmentation.worker.js';
this.worker = new Worker(workerUrl, { type: 'classic' });
```

**NOT** this (old broken approach):
```typescript
import SegmentationWorker from '../workers/segmentation.worker.ts?worker';
this.worker = new SegmentationWorker();
```

### Step 4: Remove Old Worker Files
```bash
# Remove any workers in src/ that Vite was processing
rm -f src/workers/segmentation.worker.ts
rm -f src/workers/segmentation.worker.js
```

### Step 5: Clear Vite Cache
```bash
rm -rf node_modules/.vite
rm -rf dist
```

### Step 6: Restart Dev Server
```bash
npm run dev
```

---

## Verification

### Console Should Show:
```
[Worker] TensorFlow.js and BodyPix loaded via importScripts
[Worker] Initializing TensorFlow.js...
[Worker] TensorFlow.js ready, backend: webgl
[Worker] Loading BodyPix model...
[Worker] BodyPix model loaded successfully!
[SegmentationManager] Worker initialized successfully
```

### Console Should NOT Show:
- `Worker initialization timeout`
- `importScripts is not a function`
- `Module scripts don't support importScripts()`
- `type=module` in any worker URL
- `video/mp2t` MIME type errors

### Network Tab Verification:
1. Open DevTools → Network tab
2. Filter by "worker" or "segmentation"
3. You should see: `/workers/segmentation.worker.js`
4. Content-Type should be: `application/javascript`
5. URL should NOT contain: `?worker_file&type=module`

---

## Common Issues

### Issue: "tf is not defined"
**Cause**: importScripts failed silently
**Fix**: Check browser Network tab for 404s on TensorFlow CDN URLs

### Issue: Worker URL still shows `?worker_file&type=module`
**Cause**: Old import syntax still in use
**Fix**: Search codebase for:
```bash
grep -r "?worker" src/
```
Remove any `?worker` or `?worker&url` imports

### Issue: "Failed to construct 'Worker': Script at '/workers/...' cannot be accessed"
**Cause**: File not in public/ folder
**Fix**: Ensure file is at exactly `public/workers/segmentation.worker.js`

### Issue: CORS errors on TensorFlow CDN
**Cause**: Network/firewall blocking CDN
**Fix**: Check if jsdelivr.net is accessible from your network

---

## Architecture After Fix

```
chromecam-studio/
├── public/
│   └── workers/
│       └── segmentation.worker.js    ← Plain JS, served as-is
├── src/
│   └── utils/
│       ├── logger.ts
│       └── segmentationManager.ts    ← Uses direct URL string
```

**Key Point**: Files in `public/` are served exactly as-is. Vite doesn't transform them, doesn't add `type=module`, doesn't do anything to them.

---

## Why TensorFlow.js BodyPix Instead of MediaPipe?

| Feature | MediaPipe SelfieSegmentation | TensorFlow.js BodyPix |
|---------|------------------------------|----------------------|
| Worker compatibility | ❌ Uses importScripts for WASM | ✅ Loads models via fetch |
| ES Module support | ❌ No | ✅ Yes |
| Model download | ~4MB WASM + tflite | ~7MB JS + weights |
| Quality | Excellent | Good |
| Performance | Faster (WASM) | Slightly slower (WebGL) |

For production, you could:
1. Run MediaPipe on main thread (not recommended - blocks UI)
2. Use a different bundler that supports classic workers
3. Pre-bundle MediaPipe WASM and serve from public/ (complex)

TensorFlow.js BodyPix is the pragmatic choice for Vite projects.

---

## Testing the Fix

After applying, test these scenarios:

1. **Fresh load**: Clear cache, reload page - should initialize within 5 seconds
2. **Tab switch**: Switch tabs for 30+ seconds, return - should not show black screen
3. **Background toggle**: Toggle background blur on/off rapidly - should not crash
4. **Long session**: Run for 10+ minutes - should maintain stable performance

---

## Performance Notes

First load will download ~7MB of model weights (cached thereafter). Expect:
- Initial load: 3-8 seconds depending on connection
- Subsequent loads: <2 seconds (cached)
- Per-frame processing: 30-60ms (varies by device)

The BodyPix model uses 'MobileNetV1' architecture which is optimized for real-time use.
