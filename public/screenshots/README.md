# PWA Screenshots

This directory contains screenshots for the Progressive Web App "Richer Install UI" feature.

## Required Screenshots

To enable the enhanced PWA install experience, you need to provide:

### 1. Desktop Screenshot (Wide)
- **Filename**: `desktop-wide.png`
- **Minimum Size**: 1280x720
- **Aspect Ratio**: 16:9 (wide)
- **Format**: PNG
- **Content**: Screenshot of ChromeCam Studio running in a desktop browser window

### 2. Mobile Screenshot
- **Filename**: `mobile.png`
- **Minimum Size**: 750x1334
- **Aspect Ratio**: Portrait (9:16 or similar)
- **Format**: PNG
- **Content**: Screenshot of ChromeCam Studio running on a mobile device

## How to Capture Screenshots

### Desktop Screenshot
1. Open ChromeCam Studio in your browser at 1920x1080 or higher resolution
2. Enable some effects (blur, LUT, etc.) to showcase features
3. Use your browser's built-in screenshot tool or a screen capture utility
4. Crop to 1280x720 or 1920x1080
5. Save as `desktop-wide.png` in this directory

### Mobile Screenshot
1. Open ChromeCam Studio on a mobile device or use Chrome DevTools mobile emulation
2. Set viewport to a mobile size (e.g., iPhone 14: 390x844)
3. Capture the screen showing the app interface
4. Save as `mobile.png` in this directory

## Example Screenshot Sizes

Good options for screenshot dimensions:
- **Desktop**: 1280x720, 1920x1080, 2560x1440
- **Mobile**: 375x667 (iPhone SE), 390x844 (iPhone 14), 393x851 (Pixel 7)

## Testing

After adding screenshots:
1. Run `npm run build`
2. Run `npm run preview`
3. Open Chrome DevTools > Application > Manifest
4. Verify screenshots appear in the manifest preview
5. Test PWA installation to see the richer install UI

## Notes

- Screenshots are optional but highly recommended for better app store presence
- They enhance the PWA install experience on both desktop and mobile
- Keep file sizes reasonable (compress if needed, aim for <500KB each)
- Make sure screenshots showcase your app's best features
