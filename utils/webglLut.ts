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

// Face Warp Fragment Shader
const FACE_WARP_FRAGMENT = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;

// Landmarks passed as uniforms (normalized 0-1)
uniform vec2 u_leftEye;
uniform vec2 u_rightEye;
uniform vec2 u_noseTip;
uniform vec2 u_jawLeft;
uniform vec2 u_jawRight;
uniform vec2 u_mouthLeft;
uniform vec2 u_mouthRight;

// Strength settings (0.0 to 1.0)
uniform float u_eyeEnlargement;
uniform float u_noseSlimming;
uniform float u_jawSlimming;
uniform float u_mouthScaling;

in vec2 v_texCoord;
out vec4 fragColor;

// Warps UV coordinates towards or away from a center point
vec2 warp(vec2 uv, vec2 center, float radius, float strength, int mode) {
    vec2 delta = uv - center;
    float dist = length(delta);
    float amount = smoothstep(radius, 0.0, dist) * strength;

    // Mode 0: Pinch (Slimming) - move pixels TOWARDS center
    // Mode 1: Bulge (Enlargement) - move pixels AWAY from center

    if (mode == 0) {
        return uv - delta * amount * 0.5;
    } else {
        return uv - delta * amount * 0.3 * (1.0 - dist/radius);
    }
}

void main() {
    vec2 uv = v_texCoord;

    // Adjust Aspect Ratio for circular warps
    float aspect = u_resolution.x / u_resolution.y;
    vec2 aspectCorrect = vec2(aspect, 1.0);

    // 1. Eye Enlargement (Bulge)
    if (u_eyeEnlargement > 0.0) {
        uv = warp(uv, u_leftEye, 0.08, u_eyeEnlargement, 1);
        uv = warp(uv, u_rightEye, 0.08, u_eyeEnlargement, 1);
    }

    // 2. Nose Slimming (Pinch)
    if (u_noseSlimming > 0.0) {
        uv = warp(uv, u_noseTip, 0.06, u_noseSlimming, 0);
    }

    // 3. Jaw Slimming (Complex Pinch)
    // We pinch the lower jaw corners inward
    if (u_jawSlimming > 0.0) {
        uv = warp(uv, u_jawLeft, 0.15, u_jawSlimming, 0);
        uv = warp(uv, u_jawRight, 0.15, u_jawSlimming, 0);
    }

    // 4. Mouth Scaling (Bulge for enlargement, pinch for reduction)
    if (u_mouthScaling > 0.0) {
        // For scaling > 0.5, enlarge; for < 0.5, reduce
        float mouthEffect = (u_mouthScaling - 0.5) * 2.0;
        if (mouthEffect > 0.0) {
            // Enlarge mouth
            uv = warp(uv, u_mouthLeft, 0.05, mouthEffect, 1);
            uv = warp(uv, u_mouthRight, 0.05, mouthEffect, 1);
        } else {
            // Reduce mouth
            uv = warp(uv, u_mouthLeft, 0.05, -mouthEffect, 0);
            uv = warp(uv, u_mouthRight, 0.05, -mouthEffect, 0);
        }
    }

    fragColor = texture(u_texture, uv);
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
 * WebGL Face Warp Renderer class
 * Handles GPU-accelerated facial warping
 */
export class WebGLFaceWarpRenderer {
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private texture: WebGLTexture | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private landmarks: any = null;

  /**
   * Check if WebGL is supported
   */
  static isSupported(): boolean {
    try {
      const canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
    } catch {
      return false;
    }
  }

  /**
   * Initialize the WebGL context and shaders
   */
  initialize(canvas: HTMLCanvasElement): boolean {
    console.log('[WebGLFaceWarpRenderer] Initializing WebGL face warp renderer...');
    this.canvas = canvas;

    // Get WebGL context
    this.gl = canvas.getContext('webgl', {
      alpha: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    }) as WebGLRenderingContext | null;

    if (!this.gl) {
      console.error('[WebGLFaceWarpRenderer] WebGL context creation failed');
      return false;
    }

    // Compile shaders
    const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, FACE_WARP_FRAGMENT);

    if (!vertexShader || !fragmentShader) {
      console.error('[WebGLFaceWarpRenderer] Shader compilation failed');
      return false;
    }

    // Create and link program
    this.program = this.gl.createProgram();
    if (!this.program) {
      console.error('[WebGLFaceWarpRenderer] Failed to create shader program');
      return false;
    }

    this.gl.attachShader(this.program, vertexShader);
    this.gl.attachShader(this.program, fragmentShader);
    this.gl.linkProgram(this.program);

    if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
      console.error(
        '[WebGLFaceWarpRenderer] Shader program link error:',
        this.gl.getProgramInfoLog(this.program)
      );
      return false;
    }

    console.log('[WebGLFaceWarpRenderer] Shader program linked successfully');

    // Setup buffers
    this.setupBuffers();

    // Create texture
    this.texture = this.gl.createTexture();

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
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

    this.positionBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);

    // Texture coordinate buffer
    const texCoords = new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]);

    this.texCoordBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.texCoordBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, texCoords, this.gl.STATIC_DRAW);
  }

  /**
   * Update landmarks from AI worker
   */
  updateLandmarks(landmarks: any) {
    this.landmarks = landmarks;
  }

  /**
   * Apply face warping to video frame
   */
  render(
    source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap,
    settings: {
      eyeEnlargement: number;
      noseSlimming: number;
      jawSlimming: number;
      mouthScaling: number;
    }
  ): void {
    if (!this.gl || !this.program || !this.canvas) {
      console.error(
        '[WebGLFaceWarpRenderer] Cannot render: missing WebGL context, program, or canvas'
      );
      return;
    }

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
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    // Set uniforms
    const textureLocation = gl.getUniformLocation(this.program, 'u_texture');
    const resolutionLocation = gl.getUniformLocation(this.program, 'u_resolution');
    const eyeEnlargementLocation = gl.getUniformLocation(this.program, 'u_eyeEnlargement');
    const noseSlimmingLocation = gl.getUniformLocation(this.program, 'u_noseSlimming');
    const jawSlimmingLocation = gl.getUniformLocation(this.program, 'u_jawSlimming');
    const mouthScalingLocation = gl.getUniformLocation(this.program, 'u_mouthScaling');

    gl.uniform1i(textureLocation, 0);
    gl.uniform2f(resolutionLocation, sourceWidth, sourceHeight);
    gl.uniform1f(eyeEnlargementLocation, settings.eyeEnlargement / 100);
    gl.uniform1f(noseSlimmingLocation, settings.noseSlimming / 100);
    gl.uniform1f(jawSlimmingLocation, settings.jawSlimming / 100);
    gl.uniform1f(mouthScalingLocation, settings.mouthScaling / 100);

    // Set landmark uniforms if available
    if (this.landmarks && this.landmarks.length >= 5) {
      // Support both test landmarks and MediaPipe Face Mesh landmarks
      // Test: [0]=Left Eye, [1]=Right Eye, [2]=Nose, [3]=Jaw Left, [4]=Jaw Right
      // MediaPipe: [468]=Left Eye, [473]=Right Eye, [1]=Nose, [172]=Jaw Left, [397]=Jaw Right
      const leftEye = this.landmarks[0] || this.landmarks[468];
      const rightEye = this.landmarks[1] || this.landmarks[473];
      const noseTip = this.landmarks[2] || this.landmarks[1];
      const jawLeft = this.landmarks[3] || this.landmarks[172];
      const jawRight = this.landmarks[4] || this.landmarks[397];
      const mouthLeft = this.landmarks[5] || this.landmarks[61];
      const mouthRight = this.landmarks[6] || this.landmarks[291];

      if (leftEye && rightEye && noseTip && jawLeft && jawRight) {
        const leftEyeLocation = gl.getUniformLocation(this.program, 'u_leftEye');
        const rightEyeLocation = gl.getUniformLocation(this.program, 'u_rightEye');
        const noseTipLocation = gl.getUniformLocation(this.program, 'u_noseTip');
        const jawLeftLocation = gl.getUniformLocation(this.program, 'u_jawLeft');
        const jawRightLocation = gl.getUniformLocation(this.program, 'u_jawRight');
        const mouthLeftLocation = gl.getUniformLocation(this.program, 'u_mouthLeft');
        const mouthRightLocation = gl.getUniformLocation(this.program, 'u_mouthRight');

        // Coordinates are already normalized 0-1 from MediaPipe
        gl.uniform2f(leftEyeLocation, leftEye.x, leftEye.y);
        gl.uniform2f(rightEyeLocation, rightEye.x, rightEye.y);
        gl.uniform2f(noseTipLocation, noseTip.x, noseTip.y);
        gl.uniform2f(jawLeftLocation, jawLeft.x, jawLeft.y);
        gl.uniform2f(jawRightLocation, jawRight.x, jawRight.y);
        gl.uniform2f(mouthLeftLocation, mouthLeft.x, mouthLeft.y);
        gl.uniform2f(mouthRightLocation, mouthRight.x, mouthRight.y);
      }
    }

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
    if (this.texture) this.gl.deleteTexture(this.texture);
    if (this.program) this.gl.deleteProgram(this.program);

    this.gl = null;
    this.program = null;
    this.canvas = null;
  }
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
      return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
    } catch {
      return false;
    }
  }

  /**
   * Initialize the WebGL context and shaders
   */
  initialize(canvas: HTMLCanvasElement): boolean {
    console.log('[WebGLLutRenderer] Initializing WebGL renderer...');
    this.canvas = canvas;

    // Get WebGL context
    this.gl = canvas.getContext('webgl', {
      alpha: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    }) as WebGLRenderingContext | null;

    if (!this.gl) {
      console.error('[WebGLLutRenderer] WebGL context creation failed, falling back to Canvas 2D');
      return false;
    }

    console.log('[WebGLLutRenderer] WebGL context created successfully');

    // Compile shaders
    console.log('[WebGLLutRenderer] Compiling shaders...');
    const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, FRAGMENT_SHADER);

    if (!vertexShader || !fragmentShader) {
      console.error('[WebGLLutRenderer] Shader compilation failed');
      return false;
    }

    console.log('[WebGLLutRenderer] Shaders compiled successfully');

    // Create and link program
    console.log('[WebGLLutRenderer] Creating and linking shader program...');
    this.program = this.gl.createProgram();
    if (!this.program) {
      console.error('[WebGLLutRenderer] Failed to create shader program');
      return false;
    }

    this.gl.attachShader(this.program, vertexShader);
    this.gl.attachShader(this.program, fragmentShader);
    this.gl.linkProgram(this.program);

    if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
      console.error(
        '[WebGLLutRenderer] Shader program link error:',
        this.gl.getProgramInfoLog(this.program)
      );
      return false;
    }

    console.log('[WebGLLutRenderer] Shader program linked successfully');

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
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

    this.positionBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);

    // Texture coordinate buffer
    const texCoords = new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]);

    this.texCoordBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.texCoordBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, texCoords, this.gl.STATIC_DRAW);
  }

  /**
   * Load a LUT from data
   */
  loadLut(lutData: LutData): void {
    console.log(
      `[WebGLLutRenderer] Loading LUT: ${lutData.name} (${lutData.size}x${lutData.size}x${lutData.size})`
    );
    if (!this.gl || !this.lutTexture) {
      console.error('[WebGLLutRenderer] Cannot load LUT: WebGL context or texture not available');
      return;
    }

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
    if (!this.gl || !this.program || !this.canvas) {
      console.error('[WebGLLutRenderer] Cannot render: missing WebGL context, program, or canvas');
      return;
    }

    console.log(`[WebGLLutRenderer] Rendering with intensity: ${intensity}`);

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
 * Apply LUT transformation to image data (software fallback)
 */
export function applyLutSoftware(imageData: ImageData, lutData: LutData): ImageData {
  const result = new ImageData(imageData.width, imageData.height);
  const data = imageData.data;
  const resultData = result.data;
  const lutSize = lutData.size;
  const lut = lutData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]! / 255;
    const g = data[i + 1]! / 255;
    const b = data[i + 2]! / 255;

    // Find nearest LUT indices (simplified, no interpolation for performance)
    const rIndex = Math.min(Math.floor(r * (lutSize - 1)), lutSize - 1);
    const gIndex = Math.min(Math.floor(g * (lutSize - 1)), lutSize - 1);
    const bIndex = Math.min(Math.floor(b * (lutSize - 1)), lutSize - 1);

    const index = (bIndex * lutSize * lutSize + gIndex * lutSize + rIndex) * 3;

    const lutR = lut[index] ?? r;
    const lutG = lut[index + 1] ?? g;
    const lutB = lut[index + 2] ?? b;

    const newR = lutR * 255;
    const newG = lutG * 255;
    const newB = lutB * 255;

    resultData[i] = Math.round(newR);
    resultData[i + 1] = Math.round(newG);
    resultData[i + 2] = Math.round(newB);
    resultData[i + 3] = data[i + 3]!;
  }

  return result;
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
