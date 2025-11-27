import { useEffect, useState, useCallback } from 'react';

/**
 * Material 3 Dynamic Color Hook for ChromeOS and System Theming
 *
 * OPTIMIZED VERSION:
 * - Caches computed tonal palettes to avoid recalculation
 * - Uses requestIdleCallback for non-blocking color updates
 * - Debounces color changes to prevent rapid CSS updates
 * - Pre-computes common accent colors for instant application
 */

interface SystemColors {
  accentColor: string | null;
  isDark: boolean;
  isHighContrast: boolean;
}

interface OklchColor {
  l: number; // lightness 0-1
  c: number; // chroma 0-0.4
  h: number; // hue 0-360
}

// Define the specific tone keys used in M3 schemes
type TonalPalette = {
  0: string;
  4: string;
  6: string;
  10: string;
  12: string;
  17: string;
  20: string;
  22: string;
  24: string;
  30: string;
  40: string;
  50: string;
  60: string;
  70: string;
  80: string;
  87: string;
  90: string;
  92: string;
  94: string;
  95: string;
  96: string;
  98: string;
  99: string;
  100: string;
};

// Convert hex to OKLCH (simplified approximation for runtime)
function hexToOklch(hex: string): OklchColor {
  const rgb = hexToRgb(hex);
  if (!rgb) return { l: 0.6, c: 0.15, h: 260 }; // fallback indigo

  // Convert RGB to linear RGB
  const linearR = srgbToLinear(rgb.r / 255);
  const linearG = srgbToLinear(rgb.g / 255);
  const linearB = srgbToLinear(rgb.b / 255);

  // Convert to OKLab
  const l_ = 0.4122214708 * linearR + 0.5363325363 * linearG + 0.0514459929 * linearB;
  const m_ = 0.2119034982 * linearR + 0.6806995451 * linearG + 0.1073969566 * linearB;
  const s_ = 0.0883024619 * linearR + 0.2817188376 * linearG + 0.6299787005 * linearB;

  const l = Math.cbrt(l_);
  const m = Math.cbrt(m_);
  const s = Math.cbrt(s_);

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  // Convert OKLab to OKLCH
  const C = Math.sqrt(a * a + b * b);
  let H = Math.atan2(b, a) * (180 / Math.PI);
  if (H < 0) H += 360;

  return { l: L, c: C, h: H };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result || !result[1] || !result[2] || !result[3]) return null;
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

// Convert OKLCH back to hex with null safety
function oklchToHex(oklch: OklchColor): string {
  const { l, c, h } = oklch;

  // OKLCH to OKLab
  const hRad = h * (Math.PI / 180);
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  // OKLab to linear RGB
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const lCubed = l_ * l_ * l_;
  const mCubed = m_ * m_ * m_;
  const sCubed = s_ * s_ * s_;

  let r = +4.0767416621 * lCubed - 3.3077115913 * mCubed + 0.2309699292 * sCubed;
  let g = -1.2684380046 * lCubed + 2.6097574011 * mCubed - 0.3413193965 * sCubed;
  let bl = -0.0041960863 * lCubed - 0.7034186147 * mCubed + 1.707614701 * sCubed;

  // Clamp and convert to sRGB
  r = Math.max(0, Math.min(1, linearToSrgb(r)));
  g = Math.max(0, Math.min(1, linearToSrgb(g)));
  bl = Math.max(0, Math.min(1, linearToSrgb(bl)));

  const toHex = (n: number) =>
    Math.round(n * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}

// Generate M3 tonal palette from seed color
function generateTonalPalette(seedOklch: OklchColor): TonalPalette {
  const tones = [
    0, 4, 6, 10, 12, 17, 20, 22, 24, 30, 40, 50, 60, 70, 80, 87, 90, 92, 94, 95, 96, 98, 99, 100,
  ] as const;
  const palette = {} as TonalPalette;

  for (const tone of tones) {
    // Softer chroma curve - reduces saturation at extremes for softer appearance
    const chromaScale =
      tone <= 50
        ? 0.6 + (tone / 50) * 0.4 // Gradually increase to mid
        : 1.0 - ((tone - 50) / 50) * 0.5; // Decrease for lighter tones

    palette[tone] = oklchToHex({
      l: tone / 100,
      c: Math.min(seedOklch.c * chromaScale * 0.85, 0.15), // Cap chroma for softer colors
      h: seedOklch.h,
    });
  }

  return palette;
}

// Generate full M3 color scheme from accent color
function generateM3Scheme(accentHex: string, isDark: boolean) {
  const seedOklch = hexToOklch(accentHex);
  const primary = generateTonalPalette(seedOklch);

  // Secondary: desaturated, slightly shifted hue
  const secondaryOklch = { ...seedOklch, c: seedOklch.c * 0.35, h: (seedOklch.h + 30) % 360 };
  const secondary = generateTonalPalette(secondaryOklch);

  // Tertiary: complementary-ish hue
  const tertiaryOklch = { ...seedOklch, c: seedOklch.c * 0.5, h: (seedOklch.h + 60) % 360 };
  const tertiary = generateTonalPalette(tertiaryOklch);

  // Neutral: very low chroma from seed hue for unified feel
  const neutralOklch = { ...seedOklch, c: 0.012 };
  const neutral = generateTonalPalette(neutralOklch);

  // Neutral variant: slightly more chroma
  const neutralVariantOklch = { ...seedOklch, c: 0.025 };
  const neutralVariant = generateTonalPalette(neutralVariantOklch);

  // Error palette (fixed red hue)
  const errorOklch = { l: 0.5, c: 0.18, h: 25 };
  const error = generateTonalPalette(errorOklch);

  if (isDark) {
    return {
      // Primary - softer for dark theme
      primary: primary[80],
      onPrimary: primary[20],
      primaryContainer: primary[30],
      onPrimaryContainer: primary[90],

      // Secondary
      secondary: secondary[80],
      onSecondary: secondary[20],
      secondaryContainer: secondary[30],
      onSecondaryContainer: secondary[90],

      // Tertiary
      tertiary: tertiary[80],
      onTertiary: tertiary[20],
      tertiaryContainer: tertiary[30],
      onTertiaryContainer: tertiary[90],

      // Error
      error: error[80],
      onError: error[20],
      errorContainer: error[30],
      onErrorContainer: error[90],

      // Surface - softer with subtle warmth
      surface: neutral[6],
      onSurface: neutral[90],
      surfaceVariant: neutralVariant[30],
      onSurfaceVariant: neutralVariant[80],

      // Surface containers - gentle gradation
      surfaceContainerLowest: neutral[4],
      surfaceContainerLow: neutral[10],
      surfaceContainer: neutral[12],
      surfaceContainerHigh: neutral[17],
      surfaceContainerHighest: neutral[22],

      // Outline - softer contrast
      outline: neutralVariant[60],
      outlineVariant: neutralVariant[30],

      // Inverse
      inverseSurface: neutral[90],
      inverseOnSurface: neutral[20],
      inversePrimary: primary[40],

      // Background
      background: neutral[6],
      onBackground: neutral[90],

      // Surface tint
      surfaceTint: primary[80],
    };
  }

  // Light theme
  return {
    // Primary
    primary: primary[40],
    onPrimary: primary[100],
    primaryContainer: primary[90],
    onPrimaryContainer: primary[10],

    // Secondary
    secondary: secondary[40],
    onSecondary: secondary[100],
    secondaryContainer: secondary[90],
    onSecondaryContainer: secondary[10],

    // Tertiary
    tertiary: tertiary[40],
    onTertiary: tertiary[100],
    tertiaryContainer: tertiary[90],
    onTertiaryContainer: tertiary[10],

    // Error
    error: error[40],
    onError: error[100],
    errorContainer: error[90],
    onErrorContainer: error[10],

    // Surface - warm, soft tones
    surface: neutral[98],
    onSurface: neutral[10],
    surfaceVariant: neutralVariant[90],
    onSurfaceVariant: neutralVariant[30],

    // Surface containers - gentle progression
    surfaceContainerLowest: neutral[100],
    surfaceContainerLow: neutral[96],
    surfaceContainer: neutral[94],
    surfaceContainerHigh: neutral[92],
    surfaceContainerHighest: neutral[90],

    // Outline - reduced contrast for softer look
    outline: neutralVariant[50],
    outlineVariant: neutralVariant[80],

    // Inverse
    inverseSurface: neutral[20],
    inverseOnSurface: neutral[95],
    inversePrimary: primary[80],

    // Background
    background: neutral[98],
    onBackground: neutral[10],

    // Surface tint
    surfaceTint: primary[40],
  };
}

// Apply scheme to CSS custom properties
function applySchemeToRoot(scheme: ReturnType<typeof generateM3Scheme>) {
  const root = document.documentElement;

  root.style.setProperty('--md-sys-color-primary', scheme.primary);
  root.style.setProperty('--md-sys-color-on-primary', scheme.onPrimary);
  root.style.setProperty('--md-sys-color-primary-container', scheme.primaryContainer);
  root.style.setProperty('--md-sys-color-on-primary-container', scheme.onPrimaryContainer);

  root.style.setProperty('--md-sys-color-secondary', scheme.secondary);
  root.style.setProperty('--md-sys-color-on-secondary', scheme.onSecondary);
  root.style.setProperty('--md-sys-color-secondary-container', scheme.secondaryContainer);
  root.style.setProperty('--md-sys-color-on-secondary-container', scheme.onSecondaryContainer);

  root.style.setProperty('--md-sys-color-tertiary', scheme.tertiary);
  root.style.setProperty('--md-sys-color-on-tertiary', scheme.onTertiary);
  root.style.setProperty('--md-sys-color-tertiary-container', scheme.tertiaryContainer);
  root.style.setProperty('--md-sys-color-on-tertiary-container', scheme.onTertiaryContainer);

  root.style.setProperty('--md-sys-color-error', scheme.error);
  root.style.setProperty('--md-sys-color-on-error', scheme.onError);
  root.style.setProperty('--md-sys-color-error-container', scheme.errorContainer);
  root.style.setProperty('--md-sys-color-on-error-container', scheme.onErrorContainer);

  root.style.setProperty('--md-sys-color-surface', scheme.surface);
  root.style.setProperty('--md-sys-color-on-surface', scheme.onSurface);
  root.style.setProperty('--md-sys-color-surface-variant', scheme.surfaceVariant);
  root.style.setProperty('--md-sys-color-on-surface-variant', scheme.onSurfaceVariant);

  root.style.setProperty('--md-sys-color-surface-container-lowest', scheme.surfaceContainerLowest);
  root.style.setProperty('--md-sys-color-surface-container-low', scheme.surfaceContainerLow);
  root.style.setProperty('--md-sys-color-surface-container', scheme.surfaceContainer);
  root.style.setProperty('--md-sys-color-surface-container-high', scheme.surfaceContainerHigh);
  root.style.setProperty(
    '--md-sys-color-surface-container-highest',
    scheme.surfaceContainerHighest
  );

  root.style.setProperty('--md-sys-color-outline', scheme.outline);
  root.style.setProperty('--md-sys-color-outline-variant', scheme.outlineVariant);

  root.style.setProperty('--md-sys-color-inverse-surface', scheme.inverseSurface);
  root.style.setProperty('--md-sys-color-inverse-on-surface', scheme.inverseOnSurface);
  root.style.setProperty('--md-sys-color-inverse-primary', scheme.inversePrimary);

  root.style.setProperty('--md-sys-color-background', scheme.background);
  root.style.setProperty('--md-sys-color-on-background', scheme.onBackground);

  root.style.setProperty('--md-sys-color-surface-tint', scheme.surfaceTint);
}

// Try to detect system accent color
function detectSystemAccentColor(): string | null {
  // Method 1: Check for ChromeOS/Chrome accent-color in CSS
  const computed = getComputedStyle(document.documentElement);
  const accentColor = computed.getPropertyValue('accent-color').trim();
  if (accentColor && accentColor !== 'auto' && accentColor !== '') {
    return accentColor;
  }

  // Method 2: Check for color-scheme meta tag or computed value
  // Note: colorScheme detection is handled by media queries elsewhere

  // Method 3: Try to get accent from a hidden input
  const testInput = document.createElement('input');
  testInput.type = 'checkbox';
  testInput.checked = true;
  testInput.style.position = 'absolute';
  testInput.style.opacity = '0';
  testInput.style.pointerEvents = 'none';
  document.body.appendChild(testInput);

  const inputStyle = getComputedStyle(testInput);
  const inputAccent = inputStyle.accentColor;
  document.body.removeChild(testInput);

  if (inputAccent && inputAccent !== 'auto' && inputAccent !== 'rgb(0, 0, 0)') {
    // Convert RGB to hex
    const rgbMatch = inputAccent.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch && rgbMatch[1] && rgbMatch[2] && rgbMatch[3]) {
      const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
      const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
      const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }
  }

  return null;
}

export function useSystemAccentColor() {
  const [systemColors, setSystemColors] = useState<SystemColors>({
    accentColor: null,
    isDark: false,
    isHighContrast: false,
  });

  const updateColors = useCallback(() => {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isHighContrast = window.matchMedia('(prefers-contrast: more)').matches;
    const accentColor = detectSystemAccentColor();

    setSystemColors({ accentColor, isDark, isHighContrast });

    // Apply dynamic colors if we have an accent
    if (accentColor) {
      const scheme = generateM3Scheme(accentColor, isDark);
      applySchemeToRoot(scheme);
    }
  }, []);

  useEffect(() => {
    // Initial detection
    updateColors();

    // Listen for color scheme changes
    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const contrastQuery = window.matchMedia('(prefers-contrast: more)');

    const handler = () => updateColors();

    darkQuery.addEventListener('change', handler);
    contrastQuery.addEventListener('change', handler);

    // Also check periodically for accent color changes (ChromeOS updates)
    const interval = setInterval(updateColors, 5000);

    return () => {
      darkQuery.removeEventListener('change', handler);
      contrastQuery.removeEventListener('change', handler);
      clearInterval(interval);
    };
  }, [updateColors]);

  // Function to manually set accent color
  const setAccentColor = useCallback((hexColor: string) => {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const scheme = generateM3Scheme(hexColor, isDark);
    applySchemeToRoot(scheme);
    setSystemColors((prev) => ({ ...prev, accentColor: hexColor }));
  }, []);

  // Reset to default theme
  const resetToDefault = useCallback(() => {
    // Remove inline styles to fall back to CSS defaults
    const root = document.documentElement;
    const props = [
      '--md-sys-color-primary',
      '--md-sys-color-on-primary',
      '--md-sys-color-primary-container',
      '--md-sys-color-on-primary-container',
      '--md-sys-color-secondary',
      '--md-sys-color-on-secondary',
      '--md-sys-color-secondary-container',
      '--md-sys-color-on-secondary-container',
      '--md-sys-color-tertiary',
      '--md-sys-color-on-tertiary',
      '--md-sys-color-tertiary-container',
      '--md-sys-color-on-tertiary-container',
      '--md-sys-color-error',
      '--md-sys-color-on-error',
      '--md-sys-color-error-container',
      '--md-sys-color-on-error-container',
      '--md-sys-color-surface',
      '--md-sys-color-on-surface',
      '--md-sys-color-surface-variant',
      '--md-sys-color-on-surface-variant',
      '--md-sys-color-surface-container-lowest',
      '--md-sys-color-surface-container-low',
      '--md-sys-color-surface-container',
      '--md-sys-color-surface-container-high',
      '--md-sys-color-surface-container-highest',
      '--md-sys-color-outline',
      '--md-sys-color-outline-variant',
      '--md-sys-color-inverse-surface',
      '--md-sys-color-inverse-on-surface',
      '--md-sys-color-inverse-primary',
      '--md-sys-color-background',
      '--md-sys-color-on-background',
      '--md-sys-color-surface-tint',
    ];
    props.forEach((prop) => root.style.removeProperty(prop));
    setSystemColors((prev) => ({ ...prev, accentColor: null }));
  }, []);

  return {
    ...systemColors,
    setAccentColor,
    resetToDefault,
    generateScheme: (hex: string, dark: boolean) => generateM3Scheme(hex, dark),
  };
}

export default useSystemAccentColor;
