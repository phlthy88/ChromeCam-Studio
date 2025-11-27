#!/bin/bash
# ChromeCam Studio Worker Fix Diagnostic Script
# Run this from your project root to verify the fix is correctly applied

echo "========================================"
echo "ChromeCam Studio Worker Fix Diagnostic"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

# Check 1: Worker file exists in public/
echo "1. Checking worker file location..."
if [ -f "public/workers/segmentation.worker.js" ]; then
    echo -e "   ${GREEN}✓${NC} public/workers/segmentation.worker.js exists"
else
    echo -e "   ${RED}✗${NC} public/workers/segmentation.worker.js NOT FOUND"
    echo "     → Create: mkdir -p public/workers && copy the worker file there"
    ((ERRORS++))
fi

# Check 2: Worker file does NOT exist in src/
echo ""
echo "2. Checking for old worker files in src/..."
OLD_WORKERS=$(find src -name "*.worker.*" 2>/dev/null | grep -v node_modules)
if [ -z "$OLD_WORKERS" ]; then
    echo -e "   ${GREEN}✓${NC} No old worker files in src/"
else
    echo -e "   ${RED}✗${NC} Found old worker files that should be removed:"
    echo "$OLD_WORKERS" | while read f; do echo "     - $f"; done
    ((ERRORS++))
fi

# Check 3: segmentationManager.ts uses direct URL
echo ""
echo "3. Checking segmentationManager.ts..."
if [ -f "src/utils/segmentationManager.ts" ]; then
    # Check for correct pattern
    if grep -q "'/workers/segmentation.worker.js'" src/utils/segmentationManager.ts; then
        echo -e "   ${GREEN}✓${NC} Uses direct URL string"
    else
        echo -e "   ${RED}✗${NC} Does not use direct URL '/workers/segmentation.worker.js'"
        ((ERRORS++))
    fi
    
    # Check for bad patterns
    if grep -q "?worker" src/utils/segmentationManager.ts; then
        echo -e "   ${RED}✗${NC} Still contains ?worker import syntax"
        ((ERRORS++))
    else
        echo -e "   ${GREEN}✓${NC} No ?worker import syntax"
    fi
    
    # Check for classic worker type
    if grep -q "type: 'classic'" src/utils/segmentationManager.ts; then
        echo -e "   ${GREEN}✓${NC} Uses type: 'classic' for Worker"
    else
        echo -e "   ${YELLOW}!${NC} May not explicitly set Worker type to 'classic'"
        ((WARNINGS++))
    fi
else
    echo -e "   ${RED}✗${NC} src/utils/segmentationManager.ts NOT FOUND"
    ((ERRORS++))
fi

# Check 4: Worker content
echo ""
echo "4. Checking worker file content..."
if [ -f "public/workers/segmentation.worker.js" ]; then
    # Check for TensorFlow.js imports
    if grep -q "tensorflow/tfjs" public/workers/segmentation.worker.js; then
        echo -e "   ${GREEN}✓${NC} Uses TensorFlow.js"
    elif grep -q "mediapipe" public/workers/segmentation.worker.js; then
        echo -e "   ${YELLOW}!${NC} Uses MediaPipe (may cause issues)"
        ((WARNINGS++))
    fi
    
    # Check for importScripts
    if grep -q "importScripts" public/workers/segmentation.worker.js; then
        echo -e "   ${GREEN}✓${NC} Uses importScripts (correct for classic worker)"
    fi
    
    # Check it's not TypeScript
    if grep -q "^import " public/workers/segmentation.worker.js; then
        echo -e "   ${RED}✗${NC} Contains ES module imports - should be plain JS"
        ((ERRORS++))
    else
        echo -e "   ${GREEN}✓${NC} No ES module imports"
    fi
fi

# Check 5: Vite cache
echo ""
echo "5. Checking for Vite cache..."
if [ -d "node_modules/.vite" ]; then
    echo -e "   ${YELLOW}!${NC} Vite cache exists - consider clearing with: rm -rf node_modules/.vite"
    ((WARNINGS++))
else
    echo -e "   ${GREEN}✓${NC} No Vite cache"
fi

# Check 6: Any remaining ?worker imports
echo ""
echo "6. Scanning for any ?worker imports in codebase..."
WORKER_IMPORTS=$(grep -r "?worker" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v node_modules)
if [ -z "$WORKER_IMPORTS" ]; then
    echo -e "   ${GREEN}✓${NC} No ?worker imports found"
else
    echo -e "   ${RED}✗${NC} Found ?worker imports that need to be removed:"
    echo "$WORKER_IMPORTS" | while read line; do echo "     $line"; done
    ((ERRORS++))
fi

# Summary
echo ""
echo "========================================"
echo "SUMMARY"
echo "========================================"
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}All checks passed! ✓${NC}"
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}$WARNINGS warning(s), but should work${NC}"
else
    echo -e "${RED}$ERRORS error(s) found - fix before testing${NC}"
fi
echo ""
echo "Next steps:"
echo "1. Clear Vite cache: rm -rf node_modules/.vite dist"
echo "2. Restart dev server: npm run dev"
echo "3. Check browser console for: '[Worker] BodyPix model loaded successfully!'"
