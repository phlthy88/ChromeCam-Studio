#!/usr/bin/env node

/**
 * Generate PNG icons from SVG for PWA manifest
 * This script converts SVG icons to PNG format at various sizes
 */

import sharp from 'sharp';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, '..', 'public');

const icons = [
  {
    input: join(publicDir, 'pwa-512x512.svg'),
    outputs: [
      { path: join(publicDir, 'pwa-192x192.png'), size: 192 },
      { path: join(publicDir, 'pwa-512x512.png'), size: 512 },
    ],
  },
  {
    input: join(publicDir, 'masked-icon.svg'),
    outputs: [{ path: join(publicDir, 'pwa-maskable-512x512.png'), size: 512 }],
  },
];

async function generateIcons() {
  console.log('🎨 Generating PWA icons from SVG...\n');

  for (const { input, outputs } of icons) {
    if (!existsSync(input)) {
      console.error(`❌ Input file not found: ${input}`);
      continue;
    }

    const svgBuffer = readFileSync(input);

    for (const { path, size } of outputs) {
      try {
        await sharp(svgBuffer)
          .resize(size, size, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png()
          .toFile(path);

        console.log(`✅ Generated: ${path} (${size}x${size})`);
      } catch (error) {
        console.error(`❌ Failed to generate ${path}:`, error.message);
      }
    }
  }

  console.log('\n✨ PWA icon generation complete!');
}

generateIcons().catch((error) => {
  console.error('❌ Icon generation failed:', error);
  process.exit(1);
});
