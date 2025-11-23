/**
 * WebGL LUT (Look-Up Table) Utilities for Cinematic Color Grading
 *
 * This module provides GPU-accelerated color grading using 3D LUTs.
 * 3D LUTs map input RGB values to output RGB values for precise color manipulation.
 */

// Vertex shader - simple pass-through for full-screen quad
const VERTEX_SHADER = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;

    void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
    }
`;

// Fragment shader - applies 3D LUT color grading with intensity control
const FRAGMENT_SHADER = `
    precision mediump float;

    uniform sampler2D u_image;
    uniform sampler2D u_lut;
    uniform float u_lutSize;
    uniform float u_intensity;

    varying vec2 v_texCoord;

    vec3 applyLut(vec3 color) {
        // LUT is stored as a 2D texture with slices arranged horizontally
        float sliceSize = 1.0 / u_lutSize;
        float slicePixelSize = sliceSize / u_lutSize;
        float sliceInnerSize = slicePixelSize * (u_lutSize - 1.0);

        // Calculate blue slice position
        float blueSlice0 = floor(color.b * (u_lutSize - 1.0));
        float blueSlice1 = min(blueSlice0 + 1.0, u_lutSize - 1.0);
        float blueFrac = (color.b * (u_lutSize - 1.0)) - blueSlice0;

        // Calculate UV coordinates for the two blue slices
        vec2 uv0 = vec2(
            (blueSlice0 + color.r * (u_lutSize - 1.0) / u_lutSize + 0.5 / u_lutSize) / u_lutSize,
            color.g * sliceInnerSize + slicePixelSize * 0.5
        );
        vec2 uv1 = vec2(
            (blueSlice1 + color.r * (u_lutSize - 1.0) / u_lutSize + 0.5 / u_lutSize) / u_lutSize,
            color.g * sliceInnerSize + slicePixelSize * 0.5
        );

        // Sample both slices and interpolate
        vec3 color0 = texture2D(u_lut, uv0).rgb;
        vec3 color1 = texture2D(u_lut, uv1).rgb;

        return mix(color0, color1, blueFrac);
    }

    void main() {
        vec4 originalColor = texture2D(u_image, v_texCoord);
        vec3 lutColor = applyLut(originalColor.rgb);

        // Mix between original and LUT-graded color based on intensity
        vec3 finalColor = mix(originalColor.rgb, lutColor, u_intensity);

        gl_FragColor = vec4(finalColor, originalColor.a);
    }
`;

/**
 * Represents a 3D LUT data structure
 */
export interface LutData {
    /** Name of the LUT */
    name: string;
    /** Size of the LUT (e.g., 16 = 16x16x16) */
    size: number;
    /** RGB data as flat array [r,g,b,r,g,b,...] normalized to 0-1 */
    data: Float32Array;
}

/**
 * Pre-defined cinematic LUT presets
 */
export interface CinematicLut {
    id: string;
    name: string;
    description: string;
    category: 'film' | 'mood' | 'vintage' | 'creative';
}

/**
 * WebGL LUT Renderer class
 * Handles GPU-accelerated color grading
 */
export class WebGLLutRenderer {
    private gl: WebGLRenderingContext | null = null;
    private program: WebGLProgram | null = null;
    private positionBuffer: WebGLBuffer | null = null;
    private texCoordBuffer: WebGLBuffer | null = null;
    private imageTexture: WebGLTexture | null = null;
    private lutTexture: WebGLTexture | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private currentLutSize: number = 0;

    /**
     * Check if WebGL is supported
     */
    static isSupported(): boolean {
        try {
            const canvas = document.createElement('canvas');
            return !!(
                canvas.getContext('webgl') ||
                canvas.getContext('experimental-webgl')
            );
        } catch {
            return false;
        }
    }

    /**
     * Initialize the WebGL context and shaders
     */
    initialize(canvas: HTMLCanvasElement): boolean {
        this.canvas = canvas;

        // Get WebGL context
        this.gl = canvas.getContext('webgl', {
            alpha: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: true,
        }) as WebGLRenderingContext | null;

        if (!this.gl) {
            console.warn('WebGL not supported, falling back to Canvas 2D');
            return false;
        }

        // Compile shaders
        const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, VERTEX_SHADER);
        const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, FRAGMENT_SHADER);

        if (!vertexShader || !fragmentShader) {
            return false;
        }

        // Create and link program
        this.program = this.gl.createProgram();
        if (!this.program) return false;

        this.gl.attachShader(this.program, vertexShader);
        this.gl.attachShader(this.program, fragmentShader);
        this.gl.linkProgram(this.program);

        if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
            console.error('Shader program link error:', this.gl.getProgramInfoLog(this.program));
            return false;
        }

        // Setup buffers
        this.setupBuffers();

        // Create textures
        this.imageTexture = this.gl.createTexture();
        this.lutTexture = this.gl.createTexture();

        return true;
    }

    private compileShader(type: number, source: string): WebGLShader | null {
        if (!this.gl) return null;

        const shader = this.gl.createShader(type);
        if (!shader) return null;

        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    private setupBuffers(): void {
        if (!this.gl || !this.program) return;

        // Position buffer (full-screen quad)
        const positions = new Float32Array([
            -1, -1,
             1, -1,
            -1,  1,
             1,  1,
        ]);

        this.positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);

        // Texture coordinate buffer
        const texCoords = new Float32Array([
            0, 1,
            1, 1,
            0, 0,
            1, 0,
        ]);

        this.texCoordBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.texCoordBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, texCoords, this.gl.STATIC_DRAW);
    }

    /**
     * Load a LUT from data
     */
    loadLut(lutData: LutData): void {
        if (!this.gl || !this.lutTexture) return;

        this.currentLutSize = lutData.size;

        // Convert LUT data to 2D texture format (horizontal slices)
        const textureWidth = lutData.size * lutData.size;
        const textureHeight = lutData.size;
        const textureData = new Uint8Array(textureWidth * textureHeight * 4);

        for (let b = 0; b < lutData.size; b++) {
            for (let g = 0; g < lutData.size; g++) {
                for (let r = 0; r < lutData.size; r++) {
                    const srcIndex = (b * lutData.size * lutData.size + g * lutData.size + r) * 3;
                    const dstX = b * lutData.size + r;
                    const dstY = g;
                    const dstIndex = (dstY * textureWidth + dstX) * 4;

                    textureData[dstIndex + 0] = Math.round((lutData.data[srcIndex + 0] ?? 0) * 255);
                    textureData[dstIndex + 1] = Math.round((lutData.data[srcIndex + 1] ?? 0) * 255);
                    textureData[dstIndex + 2] = Math.round((lutData.data[srcIndex + 2] ?? 0) * 255);
                    textureData[dstIndex + 3] = 255;
                }
            }
        }

        this.gl.bindTexture(this.gl.TEXTURE_2D, this.lutTexture);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texImage2D(
            this.gl.TEXTURE_2D,
            0,
            this.gl.RGBA,
            textureWidth,
            textureHeight,
            0,
            this.gl.RGBA,
            this.gl.UNSIGNED_BYTE,
            textureData
        );
    }

    /**
     * Apply LUT to video frame
     */
    render(
        source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap,
        intensity: number = 1.0
    ): void {
        if (!this.gl || !this.program || !this.canvas) return;

        const gl = this.gl;

        // Resize canvas if needed
        const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
        const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.height;

        if (this.canvas.width !== sourceWidth || this.canvas.height !== sourceHeight) {
            this.canvas.width = sourceWidth;
            this.canvas.height = sourceHeight;
            gl.viewport(0, 0, sourceWidth, sourceHeight);
        }

        gl.useProgram(this.program);

        // Upload video frame to texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

        // Set uniforms
        const imageLocation = gl.getUniformLocation(this.program, 'u_image');
        const lutLocation = gl.getUniformLocation(this.program, 'u_lut');
        const lutSizeLocation = gl.getUniformLocation(this.program, 'u_lutSize');
        const intensityLocation = gl.getUniformLocation(this.program, 'u_intensity');

        gl.uniform1i(imageLocation, 0);
        gl.uniform1i(lutLocation, 1);
        gl.uniform1f(lutSizeLocation, this.currentLutSize);
        gl.uniform1f(intensityLocation, intensity);

        // Bind LUT texture
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.lutTexture);

        // Set up position attribute
        const positionLocation = gl.getAttribLocation(this.program, 'a_position');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        // Set up texCoord attribute
        const texCoordLocation = gl.getAttribLocation(this.program, 'a_texCoord');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
        gl.enableVertexAttribArray(texCoordLocation);
        gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

        // Draw
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    /**
     * Get the output canvas
     */
    getCanvas(): HTMLCanvasElement | null {
        return this.canvas;
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        if (!this.gl) return;

        if (this.positionBuffer) this.gl.deleteBuffer(this.positionBuffer);
        if (this.texCoordBuffer) this.gl.deleteBuffer(this.texCoordBuffer);
        if (this.imageTexture) this.gl.deleteTexture(this.imageTexture);
        if (this.lutTexture) this.gl.deleteTexture(this.lutTexture);
        if (this.program) this.gl.deleteProgram(this.program);

        this.gl = null;
        this.program = null;
        this.canvas = null;
    }
}

/**
 * Generate an identity LUT (no color change)
 */
export function generateIdentityLut(size: number = 16): LutData {
    const data = new Float32Array(size * size * size * 3);

    for (let b = 0; b < size; b++) {
        for (let g = 0; g < size; g++) {
            for (let r = 0; r < size; r++) {
                const index = (b * size * size + g * size + r) * 3;
                data[index + 0] = r / (size - 1);
                data[index + 1] = g / (size - 1);
                data[index + 2] = b / (size - 1);
            }
        }
    }

    return { name: 'Identity', size, data };
}

/**
 * Apply a color transformation function to generate a LUT
 */
export function generateLutFromTransform(
    name: string,
    size: number,
    transform: (r: number, g: number, b: number) => [number, number, number]
): LutData {
    const data = new Float32Array(size * size * size * 3);

    for (let bIdx = 0; bIdx < size; bIdx++) {
        for (let gIdx = 0; gIdx < size; gIdx++) {
            for (let rIdx = 0; rIdx < size; rIdx++) {
                const r = rIdx / (size - 1);
                const g = gIdx / (size - 1);
                const b = bIdx / (size - 1);

                const [newR, newG, newB] = transform(r, g, b);

                const index = (bIdx * size * size + gIdx * size + rIdx) * 3;
                data[index + 0] = Math.max(0, Math.min(1, newR));
                data[index + 1] = Math.max(0, Math.min(1, newG));
                data[index + 2] = Math.max(0, Math.min(1, newB));
            }
        }
    }

    return { name, size, data };
}

/**
 * Blend two LUTs together
 */
export function blendLuts(lut1: LutData, lut2: LutData, factor: number): LutData {
    if (lut1.size !== lut2.size) {
        throw new Error('LUTs must have the same size');
    }

    const data = new Float32Array(lut1.data.length);

    for (let i = 0; i < data.length; i++) {
        data[i] = (lut1.data[i] ?? 0) * (1 - factor) + (lut2.data[i] ?? 0) * factor;
    }

    return { name: `Blend(${lut1.name}, ${lut2.name})`, size: lut1.size, data };
}
