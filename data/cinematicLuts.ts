/**
 * Cinematic LUT Presets for ChromeCam Studio
 *
 * These procedurally generated LUTs provide various film looks and color grades.
 * All LUTs are generated at 16x16x16 resolution for optimal quality/performance balance.
 */

import { generateLutFromTransform, type LutData, type CinematicLut } from '../utils/webglLut';

const LUT_SIZE = 16;

/**
 * Color utility functions for LUT generation
 */

// Convert RGB to HSL
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
            case r:
                h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                break;
            case g:
                h = ((b - r) / d + 2) / 6;
                break;
            case b:
                h = ((r - g) / d + 4) / 6;
                break;
        }
    }

    return [h, s, l];
}

// Convert HSL to RGB
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    if (s === 0) {
        return [l, l, l];
    }

    const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    return [
        hue2rgb(p, q, h + 1 / 3),
        hue2rgb(p, q, h),
        hue2rgb(p, q, h - 1 / 3),
    ];
}

// Apply S-curve for contrast
function sCurve(x: number, strength: number = 1): number {
    const midpoint = 0.5;
    const k = strength * 2;

    if (x < midpoint) {
        return midpoint * Math.pow(2 * x, 1 + k) / 2;
    } else {
        return 1 - midpoint * Math.pow(2 * (1 - x), 1 + k) / 2;
    }
}

// Lift-Gamma-Gain adjustment
function liftGammaGain(
    value: number,
    lift: number,
    gamma: number,
    gain: number
): number {
    // Lift affects shadows
    let result = value + lift * (1 - value);
    // Gamma affects midtones
    result = Math.pow(Math.max(0, result), gamma);
    // Gain affects highlights
    result = result * gain;
    return Math.max(0, Math.min(1, result));
}

/**
 * LUT Generator Functions
 */

// Teal & Orange - Classic blockbuster look
function createTealOrangeLut(): LutData {
    return generateLutFromTransform('Teal & Orange', LUT_SIZE, (r, g, b) => {
        const [h, s, l] = rgbToHsl(r, g, b);

        // Push shadows toward teal, highlights toward orange
        let newH = h;
        let newS = s;

        if (l < 0.5) {
            // Shadows: shift toward teal (0.5 = 180 degrees = cyan)
            newH = h * 0.6 + 0.5 * 0.4;
            newS = Math.min(1, s * 1.2);
        } else {
            // Highlights: shift toward orange (0.08 = ~30 degrees)
            newH = h * 0.6 + 0.08 * 0.4;
            newS = Math.min(1, s * 1.1);
        }

        const [newR, newG, newB] = hslToRgb(newH, newS, l);

        // Add slight contrast
        return [
            sCurve(newR, 0.2),
            sCurve(newG, 0.2),
            sCurve(newB, 0.2),
        ];
    });
}

// Kodak 2383 Film Emulation
function createKodak2383Lut(): LutData {
    return generateLutFromTransform('Kodak 2383', LUT_SIZE, (r, g, b) => {
        // Kodak 2383 print film characteristics
        // - Warm highlights, cool shadows
        // - Slightly desaturated midtones
        // - Classic S-curve contrast

        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

        // Warm shadows, cool highlights (inverted for print film)
        const warmth = luminance < 0.5 ? 0.02 : -0.01;

        let newR = liftGammaGain(r + warmth, 0.01, 0.95, 1.02);
        let newG = liftGammaGain(g, 0.005, 0.98, 1.0);
        let newB = liftGammaGain(b - warmth * 0.5, 0.0, 1.0, 0.98);

        // Apply film-like S-curve
        newR = sCurve(newR, 0.3);
        newG = sCurve(newG, 0.3);
        newB = sCurve(newB, 0.3);

        // Slight desaturation in midtones
        const [h, s, l] = rgbToHsl(newR, newG, newB);
        const midtoneFactor = 1 - Math.abs(l - 0.5) * 2;
        const adjustedS = s * (1 - midtoneFactor * 0.1);

        return hslToRgb(h, adjustedS, l);
    });
}

// Fuji 3510 Film Emulation
function createFuji3510Lut(): LutData {
    return generateLutFromTransform('Fuji 3510', LUT_SIZE, (r, g, b) => {
        // Fuji characteristics
        // - Slightly cooler overall
        // - Vibrant but not oversaturated
        // - Strong greens

        const [h, s] = rgbToHsl(r, g, b);

        // Boost green hues slightly
        let newH = h;
        if (h > 0.2 && h < 0.45) {
            // Green range - make more vibrant
            newH = h;
        }

        // Slight cool shift
        let newR = liftGammaGain(r, 0.0, 1.0, 0.98);
        let newG = liftGammaGain(g, 0.005, 0.97, 1.02);
        let newB = liftGammaGain(b, 0.01, 0.98, 1.03);

        // Apply contrast curve
        newR = sCurve(newR, 0.25);
        newG = sCurve(newG, 0.25);
        newB = sCurve(newB, 0.25);

        // Boost saturation slightly
        const [, , newL] = rgbToHsl(newR, newG, newB);
        const boostedS = Math.min(1, s * 1.1);

        return hslToRgb(newH, boostedS, newL);
    });
}

// Bleach Bypass - Desaturated high contrast
function createBleachBypassLut(): LutData {
    return generateLutFromTransform('Bleach Bypass', LUT_SIZE, (r, g, b) => {
        // Bleach bypass: high contrast, reduced saturation, silvery look
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

        // Desaturate by mixing with luminance
        const desatAmount = 0.4;
        let newR = r * (1 - desatAmount) + luminance * desatAmount;
        let newG = g * (1 - desatAmount) + luminance * desatAmount;
        let newB = b * (1 - desatAmount) + luminance * desatAmount;

        // Strong S-curve for high contrast
        newR = sCurve(newR, 0.6);
        newG = sCurve(newG, 0.6);
        newB = sCurve(newB, 0.6);

        // Slight silver/blue tint in highlights
        if (luminance > 0.7) {
            newB = Math.min(1, newB + 0.02);
        }

        return [newR, newG, newB];
    });
}

// Cross Process - Shifted colors, high contrast
function createCrossProcessLut(): LutData {
    return generateLutFromTransform('Cross Process', LUT_SIZE, (r, g, b) => {
        // Cross processing: shift colors dramatically
        // Cyan shadows, yellow/green highlights

        const [, s] = rgbToHsl(r, g, b);

        let newR = liftGammaGain(r, -0.03, 1.1, 1.1);
        let newG = liftGammaGain(g, 0.02, 0.9, 1.15);
        let newB = liftGammaGain(b, 0.05, 0.95, 0.9);

        // Strong contrast
        newR = sCurve(newR, 0.5);
        newG = sCurve(newG, 0.4);
        newB = sCurve(newB, 0.4);

        // Boost saturation
        const [newH, , newL] = rgbToHsl(newR, newG, newB);
        const boostedS = Math.min(1, s * 1.3);

        return hslToRgb(newH, boostedS, newL);
    });
}

// Noir - High contrast black and white with slight tone
function createNoirLut(): LutData {
    return generateLutFromTransform('Noir', LUT_SIZE, (r, g, b) => {
        // Convert to luminance
        let lum = 0.299 * r + 0.587 * g + 0.114 * b;

        // Strong S-curve
        lum = sCurve(lum, 0.7);

        // Slight warm tone in highlights, cool in shadows
        const warmTone = lum > 0.5 ? 0.015 : -0.01;

        return [
            Math.max(0, Math.min(1, lum + warmTone)),
            lum,
            Math.max(0, Math.min(1, lum - warmTone * 0.5)),
        ];
    });
}

// Golden Hour - Warm sunset-like tones
function createGoldenHourLut(): LutData {
    return generateLutFromTransform('Golden Hour', LUT_SIZE, (r, g, b) => {
        // Add warmth across the board
        let newR = liftGammaGain(r, 0.02, 0.95, 1.08);
        let newG = liftGammaGain(g, 0.01, 0.98, 1.0);
        let newB = liftGammaGain(b, -0.02, 1.02, 0.9);

        // Soft contrast
        newR = sCurve(newR, 0.15);
        newG = sCurve(newG, 0.15);
        newB = sCurve(newB, 0.15);

        // Boost warm colors, reduce cool colors
        const [newH, newS, newL] = rgbToHsl(newR, newG, newB);

        // Shift hues slightly toward orange
        let adjustedH = newH;
        if (newH > 0 && newH < 0.2) {
            adjustedH = newH * 0.9; // Shift reds toward orange
        }

        return hslToRgb(adjustedH, Math.min(1, newS * 1.15), newL);
    });
}

// Moonlight - Cool blue night look
function createMoonlightLut(): LutData {
    return generateLutFromTransform('Moonlight', LUT_SIZE, (r, g, b) => {
        // Cool blue tint, reduced contrast
        let newR = liftGammaGain(r, 0.0, 1.05, 0.9);
        let newG = liftGammaGain(g, 0.01, 1.0, 0.95);
        let newB = liftGammaGain(b, 0.03, 0.95, 1.1);

        // Slight lift in shadows, reduced highlights
        newR = Math.min(1, newR * 0.95 + 0.02);
        newG = Math.min(1, newG * 0.95 + 0.03);
        newB = Math.min(1, newB * 0.95 + 0.05);

        // Desaturate slightly
        const [h, s, l] = rgbToHsl(newR, newG, newB);

        return hslToRgb(h, s * 0.7, l);
    });
}

// Vintage - Faded film look
function createVintageLut(): LutData {
    return generateLutFromTransform('Vintage', LUT_SIZE, (r, g, b) => {
        // Faded blacks, reduced contrast, warm tone
        let newR = liftGammaGain(r, 0.05, 1.0, 0.95);
        let newG = liftGammaGain(g, 0.04, 1.0, 0.93);
        let newB = liftGammaGain(b, 0.03, 1.0, 0.88);

        // Reduce contrast
        const blend = 0.85;
        newR = newR * blend + 0.5 * (1 - blend);
        newG = newG * blend + 0.5 * (1 - blend);
        newB = newB * blend + 0.5 * (1 - blend);

        // Slight color shift
        const [h, s, l] = rgbToHsl(newR, newG, newB);

        return hslToRgb(h, s * 0.85, l);
    });
}

// Cyberpunk - High saturation neon look
function createCyberpunkLut(): LutData {
    return generateLutFromTransform('Cyberpunk', LUT_SIZE, (r, g, b) => {
        const [h, s, l] = rgbToHsl(r, g, b);

        // Shift colors toward magenta/cyan spectrum
        let newH = h;
        if (h < 0.1 || h > 0.9) {
            // Reds -> Magenta
            newH = h < 0.1 ? h + 0.05 : h - 0.05;
        } else if (h > 0.4 && h < 0.6) {
            // Greens -> Cyan
            newH = h + 0.1;
        }

        // High contrast
        const newL = sCurve(l, 0.5);

        // Boost saturation significantly
        const newS = Math.min(1, s * 1.4);

        const [newR, newG, newB] = hslToRgb(newH, newS, newL);

        // Add slight color tint based on luminance
        const tintAmount = 0.03;
        return [
            Math.min(1, newR + (l > 0.5 ? tintAmount : -tintAmount * 0.5)),
            newG,
            Math.min(1, newB + (l < 0.5 ? tintAmount : -tintAmount * 0.5)),
        ];
    });
}

// Muted - Subtle desaturation for documentary look
function createMutedLut(): LutData {
    return generateLutFromTransform('Muted', LUT_SIZE, (r, g, b) => {
        const [h, s, l] = rgbToHsl(r, g, b);

        // Gentle desaturation
        const newS = s * 0.65;

        // Slight lift in shadows
        let newL = l;
        if (l < 0.3) {
            newL = l + (0.3 - l) * 0.15;
        }

        // Slight compression in highlights
        if (newL > 0.8) {
            newL = 0.8 + (newL - 0.8) * 0.7;
        }

        return hslToRgb(h, newS, newL);
    });
}

// Cinematic Drama - Theatrical contrast and color
function createCinematicDramaLut(): LutData {
    return generateLutFromTransform('Cinematic Drama', LUT_SIZE, (r, g, b) => {
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

        // Teal in shadows, orange in highlights (classic cinema)
        let newR, newG, newB;

        if (luminance < 0.5) {
            // Shadow region - push toward teal
            const factor = (0.5 - luminance) * 2;
            newR = liftGammaGain(r, 0.0, 1.0, 1.0 - factor * 0.1);
            newG = liftGammaGain(g, 0.01, 0.98, 1.0);
            newB = liftGammaGain(b, 0.02, 0.96, 1.0 + factor * 0.1);
        } else {
            // Highlight region - push toward orange
            const factor = (luminance - 0.5) * 2;
            newR = liftGammaGain(r, 0.0, 0.98, 1.0 + factor * 0.08);
            newG = liftGammaGain(g, 0.0, 1.0, 1.0);
            newB = liftGammaGain(b, 0.0, 1.02, 1.0 - factor * 0.1);
        }

        // Strong S-curve
        newR = sCurve(newR, 0.4);
        newG = sCurve(newG, 0.4);
        newB = sCurve(newB, 0.4);

        return [newR, newG, newB];
    });
}

/**
 * Available cinematic LUT presets
 */
export const CINEMATIC_LUT_PRESETS: CinematicLut[] = [
    {
        id: 'none',
        name: 'None',
        description: 'No cinematic color grading applied',
        category: 'film',
    },
    {
        id: 'teal-orange',
        name: 'Teal & Orange',
        description: 'Classic Hollywood blockbuster look',
        category: 'film',
    },
    {
        id: 'kodak-2383',
        name: 'Kodak 2383',
        description: 'Warm Kodak print film emulation',
        category: 'film',
    },
    {
        id: 'fuji-3510',
        name: 'Fuji 3510',
        description: 'Vibrant Fuji film stock emulation',
        category: 'film',
    },
    {
        id: 'cinematic-drama',
        name: 'Cinematic Drama',
        description: 'Theatrical contrast and color separation',
        category: 'film',
    },
    {
        id: 'bleach-bypass',
        name: 'Bleach Bypass',
        description: 'Desaturated high contrast silver look',
        category: 'creative',
    },
    {
        id: 'cross-process',
        name: 'Cross Process',
        description: 'Shifted colors with high contrast',
        category: 'creative',
    },
    {
        id: 'noir',
        name: 'Noir',
        description: 'High contrast black and white',
        category: 'mood',
    },
    {
        id: 'golden-hour',
        name: 'Golden Hour',
        description: 'Warm sunset-inspired tones',
        category: 'mood',
    },
    {
        id: 'moonlight',
        name: 'Moonlight',
        description: 'Cool blue night atmosphere',
        category: 'mood',
    },
    {
        id: 'vintage',
        name: 'Vintage',
        description: 'Faded film with lifted blacks',
        category: 'vintage',
    },
    {
        id: 'cyberpunk',
        name: 'Cyberpunk',
        description: 'Neon-saturated sci-fi aesthetic',
        category: 'creative',
    },
    {
        id: 'muted',
        name: 'Muted',
        description: 'Subtle documentary-style desaturation',
        category: 'mood',
    },
];

/**
 * Get LUT data by preset ID
 */
export function getCinematicLut(id: string): LutData | null {
    switch (id) {
        case 'none':
            return null;
        case 'teal-orange':
            return createTealOrangeLut();
        case 'kodak-2383':
            return createKodak2383Lut();
        case 'fuji-3510':
            return createFuji3510Lut();
        case 'bleach-bypass':
            return createBleachBypassLut();
        case 'cross-process':
            return createCrossProcessLut();
        case 'noir':
            return createNoirLut();
        case 'golden-hour':
            return createGoldenHourLut();
        case 'moonlight':
            return createMoonlightLut();
        case 'vintage':
            return createVintageLut();
        case 'cyberpunk':
            return createCyberpunkLut();
        case 'muted':
            return createMutedLut();
        case 'cinematic-drama':
            return createCinematicDramaLut();
        default:
            return null;
    }
}

/**
 * LUT category colors for UI
 */
export const LUT_CATEGORY_COLORS: Record<string, string> = {
    film: 'bg-amber-200 dark:bg-amber-900',
    mood: 'bg-blue-200 dark:bg-blue-900',
    vintage: 'bg-stone-300 dark:bg-stone-800',
    creative: 'bg-purple-200 dark:bg-purple-900',
};
