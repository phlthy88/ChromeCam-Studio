# ChromeCam Studio - Project Context

## Project Overview

ChromeCam Studio is a professional webcam application with AI-powered effects built using React, TypeScript, and Vite. The application provides real-time AI background effects, professional camera controls, and follows Material 3 design principles. It's designed to work across ChromeOS, macOS, and Windows platforms with a focus on smooth 60fps performance through off-main-thread AI processing.

### Key Features

- **AI-Powered Effects**: Real-time background blur, body segmentation, and face detection using TensorFlow.js and MediaPipe
- **Professional Camera Controls**: Manual exposure, white balance, focus, and PTZ (Pan, Tilt, Zoom) controls
- **Material 3 Design**: Dynamic theming with OKLCH color science and Light/Dark modes
- **Pro Overlays**: Zebra stripes, focus peaking, RGB histogram, and grid overlays
- **Progressive Web App**: Installable desktop application with offline capabilities
- **Off-Main-Thread Processing**: Web Workers with OffscreenCanvas for AI inference without UI jank
- **Cross-Platform Compatibility**: Optimized for ChromeOS, macOS, and Windows

## Tech Stack

- **Framework**: React 19 with TypeScript 5.6
- **Build Tool**: Vite 6 with ES Module Workers
- **Styling**: Tailwind CSS with Material 3 Design Tokens
- **AI/ML**: TensorFlow.js + MediaPipe
- **Workers**: OffscreenCanvas + Web Workers
- **PWA**: vite-plugin-pwa + Workbox
- **Testing**: Vitest + React Testing Library

## Building and Running

### Prerequisites

- Node.js 18+ and npm 9+
- A webcam-equipped device
- Modern browser (Chrome, Edge, Firefox, Safari)

### Development Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment (optional for Gemini AI features):
   ```bash
   echo "GEMINI_API_KEY=your_key_here" > .env.local
   ```

3. Start development server:
   ```bash
   npm run dev
   ```

4. Open **http://localhost:3000** in your browser

### Production Build

```bash
npm run build    # Build optimized bundle
npm run preview  # Preview production build
```

### Additional Scripts

| Script                  | Description                         |
| ----------------------- | ----------------------------------- |
| `npm run dev:host`      | Dev server with network access      |
| `npm run build:analyze` | Build + bundle visualization        |
| `npm run test`          | Run tests in watch mode             |
| `npm run test:coverage` | Generate coverage report            |
| `npm run lint`          | ESLint check                        |
| `npm run format`        | Prettier formatting                 |
| `npm run typecheck`     | Type checking                       |

## Architecture

ChromeCam Studio follows a modern React architecture with a production-ready off-main-thread worker system:

```
├── components/
│   ├── VideoPanel.tsx           # Main video display component
│   ├── Slider.tsx               # M3 slider control
│   ├── Toggle.tsx               # M3 toggle switch
│   └── Chip.tsx                 # M3 chip component
├── hooks/
│   ├── useCameraStream.ts       # Camera lifecycle management
│   ├── useVideoRenderer.ts      # Optimized render loop with adaptive quality
│   ├── useBodySegmentation.ts   # AI segmentation hook
│   ├── useMediaRecorder.ts      # Video recording logic
│   ├── useProOverlays.ts        # Histogram/zebra/peaking
│   └── useSystemAccentColor.ts  # Dynamic M3 theming
├── workers/
│   └── segmentation.worker.ts   # OffscreenCanvas AI processing
├── utils/
│   └── segmentationManager.ts   # Worker lifecycle & fallback management
└── types/
    └── media.d.ts               # Type-safe worker protocols & browser APIs
```

## Development Conventions

### Code Style
- TypeScript with strict mode enabled
- ESLint with React hooks and refresh plugins
- Prettier for consistent formatting
- Import aliases: `@/*`, `@components/*`, `@ui/*`, `@styles/*`

### Performance Considerations
- All AI processing runs in Web Workers to prevent UI jank
- Adaptive quality system adjusts frame rate based on real-time performance metrics
- Type-safe worker protocols with latency tracking
- OffscreenCanvas for AI inference operations

### Security
- Content Security Policy headers for workers and WebGL
- ChromeOS/Crostini optimized policies for Linux container compatibility
- Cross-Origin security headers (COEP/COOP)

### Testing
- Vitest for unit and integration tests
- React Testing Library for component testing
- Coverage reports available via `npm run test:coverage`

## PWA Features

- **Offline Capable**: App shell and CDN assets cached locally
- **Window Controls Overlay**: Custom titlebar for native feel
- **Hardware Access**: Persisted camera/mic permissions
- **Auto-Update**: Service worker updates on new deployments

## ChromeOS Optimizations

- Enhanced CSP headers and Cross-Origin policies for Linux container compatibility
- VirGL support for better graphics performance
- Crostini compatibility for Linux container users

## File Structure Notes

- `workers/` directory contains Web Worker implementations that run AI processing off the main thread
- `hooks/` directory contains custom React hooks for camera, AI processing, and other logic
- `components/` contains reusable UI components following Material 3 design
- `public/` contains PWA assets and icons
- `types/` contains TypeScript type definitions for browser APIs and worker protocols
- `utils/` contains utility functions and managers for various features