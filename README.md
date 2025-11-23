<div align="center">

<img width="1200" height="475" alt="ChromeCam Studio Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# 🎥 ChromeCam Studio

### *Professional webcam studio with AI-powered effects*

[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

**[Features](#-features)** • **[Installation](#-quick-start)** • **[Architecture](#-architecture)** • **[PWA](#-progressive-web-app)**

---

*A feature-rich webcam application with real-time AI background effects, professional camera controls, and Material 3 design — built for ChromeOS, macOS, and Windows.*

</div>

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🤖 AI-Powered Effects
- **Background Blur** — Real-time bokeh effect using MediaPipe
- **Body Segmentation** — TensorFlow.js powered person detection
- **Face Detection** — Smart focal point targeting
- **Low-Light Enhancement** — Automatic brightness compensation

</td>
<td width="50%">

### 🎛️ Professional Camera Controls
- **Exposure** — Manual ISO, shutter speed, and compensation
- **White Balance** — Color temperature and tint adjustments
- **Focus** — Manual focus distance with peaking overlay
- **PTZ Controls** — Pan, Tilt, and Zoom support

</td>
</tr>
<tr>
<td width="50%">

### 🎨 Material 3 Design
- **Dynamic Theming** — Automatic accent color from ChromeOS/Windows
- **OKLCH Color Science** — Perceptually uniform tonal palettes
- **Light/Dark Modes** — Seamless theme switching
- **32+ Design Tokens** — Full M3 specification compliance

</td>
<td width="50%">

### 📊 Pro Overlays
- **Zebra Stripes** — Highlight overexposed areas
- **Focus Peaking** — Sharp edge detection visualization
- **RGB Histogram** — Real-time exposure analysis
- **Grid Overlays** — Rule of thirds composition guides

</td>
</tr>
</table>

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+** and npm 9+
- A webcam-equipped device
- Modern browser (Chrome, Edge, Firefox, Safari)

### Installation

```bash
# Clone the repository
git clone https://github.com/phlthy88/ChromeCam-Studio.git
cd ChromeCam-Studio

# Install dependencies
npm install

# Set up environment (optional - for Gemini AI features)
echo "GEMINI_API_KEY=your_key_here" > .env.local

# Start development server
npm run dev
```

Open **http://localhost:3000** in your browser 🎉

### Production Build

```bash
npm run build    # Build optimized bundle
npm run preview  # Preview production build
```

---

## 🏗️ Architecture

ChromeCam Studio follows a **modern React architecture** with custom hooks for separation of concerns.

```
src/
├── components/
│   ├── VideoPanel.tsx      # Main video display component
│   ├── Slider.tsx          # M3 slider control
│   ├── Toggle.tsx          # M3 toggle switch
│   └── Chip.tsx            # M3 chip component
├── hooks/
│   ├── useCameraStream.ts       # Camera lifecycle management
│   ├── useMediaRecorder.ts      # Video recording logic
│   ├── useBodySegmentation.ts   # AI segmentation
│   ├── useCanvasRenderer.ts     # Render loop management
│   ├── useProOverlays.ts        # Histogram/zebra/peaking
│   └── useSystemAccentColor.ts  # Dynamic M3 theming
└── types/
    └── media.d.ts          # Extended browser API types
```

### 🔧 Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | React 19 with TypeScript |
| **Build Tool** | Vite 6 with HMR |
| **Styling** | Tailwind CSS + M3 Design Tokens |
| **AI/ML** | TensorFlow.js + MediaPipe |
| **PWA** | vite-plugin-pwa + Workbox |
| **Testing** | Vitest + React Testing Library |

### 🎯 Key Highlights

- **🔒 Type-Safe Browser APIs** — Custom TypeScript definitions for experimental APIs (MediaPipe, BarcodeDetector, WakeLock, FileSystem Access)
- **⚡ Optimized Canvas Rendering** — `willReadFrequently` hints for GPU readback performance
- **🎨 Mathematical Color System** — OKLCH-based tonal palette generation for Material 3
- **📦 Smart Caching** — CacheFirst for ML models, StaleWhileRevalidate for styles

---

## 📱 Progressive Web App

ChromeCam Studio is a **fully installable PWA** with native-like experience.

### ✅ PWA Features

| Feature | Description |
|---------|-------------|
| 🔌 **Offline Capable** | App shell and CDN assets cached locally |
| 🪟 **Window Controls Overlay** | Custom titlebar for native feel |
| 🔐 **Hardware Access** | Persisted camera/mic permissions |
| 🔄 **Auto-Update** | Service worker updates on new deployments |

### 📥 Installation

1. Open ChromeCam Studio in **Chrome** or **Edge**
2. Click the **Install** button in the header (or browser address bar icon)
3. The app launches in its own window with native controls

### 🖼️ PWA Assets

```
public/
├── pwa-192x192.svg     # Standard app icon
├── pwa-512x512.svg     # High-resolution icon
├── masked-icon.svg     # Adaptive icon systems
├── apple-touch-icon.svg # iOS home screen
└── favicon.svg         # Browser tab icon
```

> 💡 **Tip:** For maximum compatibility, convert SVGs to PNG using [pwa-asset-generator](https://github.com/nicholasadamou/pwa-asset-generator)

---

## 🧪 Development

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run dev:host` | Dev server with network access |
| `npm run build` | Production build with type checking |
| `npm run build:analyze` | Build + bundle visualization |
| `npm run test` | Run tests in watch mode |
| `npm run test:coverage` | Generate coverage report |
| `npm run lint` | ESLint check |
| `npm run format` | Prettier formatting |

### Type Checking

```bash
npm run typecheck        # Single check
npm run typecheck:watch  # Watch mode
```

---

## 📄 Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — Detailed architectural analysis, code patterns, and performance considerations
- **[ROADMAP.md](./ROADMAP.md)** — Technical and product roadmap with prioritized phases
- **[CODEBASE_ANALYSIS.md](./CODEBASE_ANALYSIS.md)** — Performance analysis and optimization recommendations

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📜 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Built with ❤️ for creators, streamers, and video professionals**

⭐ Star this repo if you find it useful!

</div>
