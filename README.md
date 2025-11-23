<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# ChromeCam Studio

Advanced webcam studio with local AI effects, styled with Material 3 design system for ChromeOS, macOS, and Windows.

## Features

- Real-time video processing with AI-powered background blur
- Professional camera controls (exposure, white balance, filters)
- Material 3 (Material You) design with light/dark theme support
- Fully installable Progressive Web App (PWA)
- Window Controls Overlay for native app experience

## Run Locally

**Prerequisites:** Node.js 18+

1. Install dependencies:
   ```bash
   npm install
   ```
2. Set the `GEMINI_API_KEY` in `.env.local` to your Gemini API key
3. Run the app:
   ```bash
   npm run dev
   ```
4. Open http://localhost:3000 in your browser

## Build for Production

```bash
npm run build
npm run preview
```

## Progressive Web App (PWA) Support

ChromeCam Studio is fully installable on ChromeOS, macOS, and Windows as a Progressive Web App.

### Features

- **Offline Capable:** The app shell and CDN assets cache locally for offline access
- **Window Controls Overlay:** Uses custom title bar area for native app feel on supported platforms
- **Hardware Access:** Persists camera/microphone permissions when installed
- **Auto-Update:** Service worker automatically updates when new versions are deployed

### Installation

1. Open ChromeCam Studio in Chrome or Edge
2. Click the "Install" button in the header, or use the browser's install icon in the address bar
3. The app will open in its own window with native-like experience

### PWA Icon Assets

The project includes SVG icons in `public/`:
- `pwa-192x192.svg` - Standard app icon
- `pwa-512x512.svg` - High-resolution app icon
- `masked-icon.svg` - Maskable icon for adaptive icon systems
- `apple-touch-icon.svg` - iOS home screen icon
- `favicon.ico` - Browser tab icon

For production deployment, consider converting these to PNG format for maximum browser compatibility using tools like [pwa-asset-generator](https://github.com/nicholasadamou/pwa-asset-generator).

## Architecture

- **React 19** with TypeScript
- **Vite 6** for fast development and optimized builds
- **vite-plugin-pwa** for PWA/Service Worker generation
- **Material 3 Design Tokens** via CSS custom properties
- **Tailwind CSS** for utility styling
- **TensorFlow.js + MediaPipe** for AI-powered video processing

## License

MIT
