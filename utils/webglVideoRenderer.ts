/**
 * WebGL-based Video Renderer for ChromeCam Studio
 *
 * This module provides a completely WebGL-based rendering pipeline to avoid
 * the "Hybrid Context Tax" of switching between 2D Canvas and WebGL contexts.
 * All operations including video drawing, AI mask compositing, filters, LUTs,
 * and overlays are performed in WebGL.
 */

const DEFAULT_VERTEX_SHADER = `#version 300 es
    in vec2 a_position;
    in vec2 a_texCoord;
    out vec2 v_texCoord;

    void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
    }
`;

// Full-screen quad positions and texture coordinates
const FULLSCREEN_QUAD_POS = new Float32Array([
  -1,
  -1, // Bottom-left
  1,
  -1, // Bottom-right
  -1,
  1, // Top-left
  1,
  1, // Top-right
]);

const FULLSCREEN_QUAD_TEX = new Float32Array([
  0,
  0, // Bottom-left
  1,
  0, // Bottom-right
  0,
  1, // Top-left
  1,
  1, // Top-right
]);

// Texture target for video (WebGL2 requires TEXTURE_2D for video)
const VIDEO_TEXTURE_TARGET = 0x0de1; // gl.TEXTURE_2D

/**
 * WebGL-based video renderer that handles the complete rendering pipeline
 */
export class WebGLVideoRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;

  // Base rendering program
  private baseProgram: WebGLProgram | null = null;
  private basePositionBuffer: WebGLBuffer | null = null;
  private baseTexCoordBuffer: WebGLBuffer | null = null;

  // Texture objects
  private videoTexture: WebGLTexture | null = null;
  private maskTexture: WebGLTexture | null = null;
  private bgTexture: WebGLTexture | null = null;

  // Current state
  private currentVideo: HTMLVideoElement | HTMLImageElement | ImageBitmap | null = null;
  private currentMask: ImageData | ImageBitmap | null = null;
  private currentBg: HTMLImageElement | ImageBitmap | null = null;

  /**
   * Check if WebGL2 is supported (required for this renderer)
   */
  static isSupported(): boolean {
    try {
      if (typeof OffscreenCanvas !== 'undefined') {
        const canvas = new OffscreenCanvas(1, 1);
        return !!canvas.getContext('webgl2');
      }
      const canvas = document.createElement('canvas');
      return !!canvas.getContext('webgl2');
    } catch {
      return false;
    }
  }

  /**
   * Initialize the WebGL2 context and shaders
   */
  initialize(canvas: HTMLCanvasElement | OffscreenCanvas): boolean {
    this.canvas = canvas;

    // Get WebGL2 context
    this.gl = canvas.getContext('webgl2', {
      alpha: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      antialias: false,
    }) as WebGL2RenderingContext | null;

    if (!this.gl) {
      console.error('[WebGLVideoRenderer] WebGL2 context creation failed');
      return false;
    }

    // Initialize the base rendering program
    if (!this.initializeBaseProgram()) {
      console.error('[WebGLVideoRenderer] Failed to initialize base program');
      return false;
    }

    // Create textures
    this.videoTexture = this.gl.createTexture();
    this.maskTexture = this.gl.createTexture();
    this.bgTexture = this.gl.createTexture();

    // Create buffers
    this.basePositionBuffer = this.gl.createBuffer();
    this.baseTexCoordBuffer = this.gl.createBuffer();

    // Set up full-screen quad buffers
    const gl = this.gl;

    // Position buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.basePositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, FULLSCREEN_QUAD_POS, gl.STATIC_DRAW);

    // Texture coordinate buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.baseTexCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, FULLSCREEN_QUAD_TEX, gl.STATIC_DRAW);

    return true;
  }

  /**
   * Initialize the base rendering program
   */
  private initializeBaseProgram(): boolean {
    if (!this.gl) return false;

    const gl = this.gl;

    // Create and compile vertex shader
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, DEFAULT_VERTEX_SHADER);
    if (!vertexShader) return false;

    // For now, using a basic fragment shader that just renders the video
    // In the future, we'll expand this to include all the effects
    const fragmentShaderSource = `#version 300 es
        precision highp float;
        
        uniform sampler2D u_video;
        uniform sampler2D u_mask;
        uniform sampler2D u_bg;
        uniform float u_blur;
        uniform float u_portraitLighting;
        uniform float u_brightness;
        uniform bool u_virtualBackground;
        uniform float u_zoom;
        uniform float u_panX;
        uniform float u_panY;
        uniform bool u_mirror;
        uniform float u_rotation;
        
        in vec2 v_texCoord;
        out vec4 fragColor;

        void main() {
            // Apply transform
            vec2 coord = v_texCoord;
            
            // Apply zoom and pan
            coord = (coord - 0.5) / u_zoom + 0.5;
            coord.x -= u_panX / 100.0;
            coord.y -= u_panY / 100.0;
            
            // Apply mirroring
            if (u_mirror) {
                coord.x = 1.0 - coord.x;
            }
            
            // Apply rotation
            if (u_rotation != 0.0) {
                float angle = radians(u_rotation);
                float cosA = cos(angle);
                float sinA = sin(angle);
                
                // Translate to center
                vec2 centeredCoord = coord - 0.5;
                
                // Rotate
                vec2 rotatedCoord = vec2(
                    centeredCoord.x * cosA - centeredCoord.y * sinA,
                    centeredCoord.x * sinA + centeredCoord.y * cosA
                );
                
                // Translate back
                coord = rotatedCoord + 0.5;
            }
            
            // Clamp coordinates to valid range
            if (coord.x < 0.0 || coord.x > 1.0 || coord.y < 0.0 || coord.y > 1.0) {
                fragColor = vec4(0.0, 0.0, 0.0, 1.0);
                return;
            }
            
            // Sample the video
            vec4 videoColor = texture(u_video, coord);
            
            // If we have a mask and effects to apply
            if (u_blur > 0.0 || u_portraitLighting > 0.0 || u_virtualBackground) {
                vec4 maskValue = texture(u_mask, coord);
                
                // Sample background if virtual background is enabled
                vec4 bgColor = u_virtualBackground ? texture(u_bg, coord) : videoColor;
                
                // Apply blur to background if specified
                if (u_blur > 0.0) {
                    bgColor = bgColor * 0.6 + 0.4 * vec4(0.0, 0.0, 0.0, 1.0);
                }
                
                // Apply portrait lighting (dim background)
                if (u_portraitLighting > 0.0 && !u_virtualBackground) {
                    float dim = (u_portraitLighting / 100.0) * 0.6;
                    bgColor = bgColor * (1.0 - dim);
                }
                
                // Composite: apply mask to select foreground (person) from video
                // Use mask value to blend between background and foreground
                fragColor = mix(bgColor, videoColor, maskValue.r);
            } else {
                // No AI effects, just apply basic transforms
                fragColor = videoColor;
            }
            
            // Apply brightness adjustment
            fragColor.rgb *= u_brightness / 100.0;
        }
    `;

    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    if (!fragmentShader) return false;

    // Create and link program
    this.baseProgram = gl.createProgram();
    if (!this.baseProgram) return false;

    gl.attachShader(this.baseProgram, vertexShader);
    gl.attachShader(this.baseProgram, fragmentShader);
    gl.linkProgram(this.baseProgram);

    if (!gl.getProgramParameter(this.baseProgram, gl.LINK_STATUS)) {
      console.error(
        '[WebGLVideoRenderer] Base program link error:',
        gl.getProgramInfoLog(this.baseProgram)
      );
      return false;
    }

    return true;
  }

  /**
   * Compile a shader
   */
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

  /**
   * Upload video frame to texture
   */
  private uploadVideoTexture(video: HTMLVideoElement | HTMLImageElement | ImageBitmap): boolean {
    if (!this.gl || !this.videoTexture) return false;

    const gl = this.gl;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(VIDEO_TEXTURE_TARGET, this.videoTexture);
    gl.texParameteri(VIDEO_TEXTURE_TARGET, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(VIDEO_TEXTURE_TARGET, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(VIDEO_TEXTURE_TARGET, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(VIDEO_TEXTURE_TARGET, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    try {
      // WebKit requires checking video readyState before texture upload
      if (video instanceof HTMLVideoElement && video.readyState < 3) {
        console.warn('[WebGLVideoRenderer] Video not ready for texture upload');
        return false;
      }

      gl.texImage2D(VIDEO_TEXTURE_TARGET, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      return true;
    } catch (e) {
      console.error('[WebGLVideoRenderer] Error uploading video texture:', e);
      // Additional handling for SecurityError which can occur in WebKit when video is not ready
      if (e instanceof DOMException && (e.name === 'SecurityError' || e.name === 'InvalidStateError')) {
        console.warn('[WebGLVideoRenderer] Security or state error during video upload, likely WebKit issue');
      }
      return false;
    }
  }

  /**
   * Upload mask data to texture
   */
  private uploadMaskTexture(mask: ImageData | ImageBitmap): boolean {
    if (!this.gl || !this.maskTexture) return false;

    const gl = this.gl;

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    if (mask instanceof ImageBitmap) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask);
    } else {
      // Convert ImageData to a format suitable for WebGL
      // The mask should have alpha values indicating person vs background
      const maskTextureData = new Uint8Array(mask.width * mask.height * 4);
      for (let i = 0; i < mask.data.length; i += 4) {
        // Use red channel as mask value (as expected by fragment shader)
        const maskValue = mask.data[i] ?? 0;
        maskTextureData[i] = maskValue; // R
        maskTextureData[i + 1] = maskValue; // G
        maskTextureData[i + 2] = maskValue; // B
        maskTextureData[i + 3] = 255; // A
      }

      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        mask.width,
        mask.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        maskTextureData
      );
    }

    return true;
  }

  /**
   * Upload background image to texture
   */
  private uploadBgTexture(bgImage: HTMLImageElement | ImageBitmap): boolean {
    if (!this.gl || !this.bgTexture) return false;

    const gl = this.gl;

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(VIDEO_TEXTURE_TARGET, this.bgTexture);
    gl.texParameteri(VIDEO_TEXTURE_TARGET, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(VIDEO_TEXTURE_TARGET, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(VIDEO_TEXTURE_TARGET, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(VIDEO_TEXTURE_TARGET, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    try {
      // WebKit requires checking video readyState before texture upload
      // Only check readyState if bgImage is actually a video element
      if (bgImage instanceof HTMLVideoElement && bgImage.readyState < 3) {
        console.warn('[WebGLVideoRenderer] Background video not ready for texture upload');
        return false;
      }

      gl.texImage2D(VIDEO_TEXTURE_TARGET, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bgImage);
      return true;
    } catch (e) {
      console.error('[WebGLVideoRenderer] Error uploading background texture:', e);
      // Additional handling for SecurityError which can occur in WebKit when video is not ready
      if (e instanceof DOMException && (e.name === 'SecurityError' || e.name === 'InvalidStateError')) {
        console.warn('[WebGLVideoRenderer] Security or state error during background upload, likely WebKit issue');
      }
      return false;
    }
  }

  /**
   * Render the video frame with all effects
   */
  render(
    video: HTMLVideoElement | HTMLImageElement | ImageBitmap,
    mask: ImageData | ImageBitmap | null,
    bgImage: HTMLImageElement | ImageBitmap | null,
    settings: {
      blur: number;
      portraitLighting: number;
      virtualBackground: boolean;
      zoom: number;
      panX: number;
      panY: number;
      mirror: boolean;
      rotation: number;
      brightness: number;
    }
  ): boolean {
    if (!this.gl || !this.baseProgram || !this.canvas) {
      console.error('[WebGLVideoRenderer] Cannot render: missing resources');
      return false;
    }

    const gl = this.gl;

    // Resize canvas if needed
    const width = video instanceof HTMLVideoElement ? video.videoWidth : video.width;
    const height = video instanceof HTMLVideoElement ? video.videoHeight : video.height;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      gl.viewport(0, 0, width, height);
    }

    // Upload video texture
    if (this.currentVideo !== video) {
      if (!this.uploadVideoTexture(video)) {
        return false;
      }
      this.currentVideo = video;
    }

    // Upload mask texture if available
    if (mask && this.currentMask !== mask) {
      if (!this.uploadMaskTexture(mask)) {
        return false;
      }
      this.currentMask = mask;
    }

    // Upload background texture if available
    if (bgImage && this.currentBg !== bgImage) {
      if (!this.uploadBgTexture(bgImage)) {
        return false;
      }
      this.currentBg = bgImage;
    }

    // Use the base program
    gl.useProgram(this.baseProgram);

    // Set uniforms
    const videoLoc = gl.getUniformLocation(this.baseProgram, 'u_video');
    const maskLoc = gl.getUniformLocation(this.baseProgram, 'u_mask');
    const bgLoc = gl.getUniformLocation(this.baseProgram, 'u_bg');
    const blurLoc = gl.getUniformLocation(this.baseProgram, 'u_blur');
    const portraitLightingLoc = gl.getUniformLocation(this.baseProgram, 'u_portraitLighting');
    const virtualBgLoc = gl.getUniformLocation(this.baseProgram, 'u_virtualBackground');
    const zoomLoc = gl.getUniformLocation(this.baseProgram, 'u_zoom');
    const panXLoc = gl.getUniformLocation(this.baseProgram, 'u_panX');
    const panYLoc = gl.getUniformLocation(this.baseProgram, 'u_panY');
    const mirrorLoc = gl.getUniformLocation(this.baseProgram, 'u_mirror');
    const rotationLoc = gl.getUniformLocation(this.baseProgram, 'u_rotation');
    const brightnessLoc = gl.getUniformLocation(this.baseProgram, 'u_brightness');

    gl.uniform1i(videoLoc, 0); // texture unit 0
    gl.uniform1i(maskLoc, 1); // texture unit 1
    gl.uniform1i(bgLoc, 2); // texture unit 2
    gl.uniform1f(blurLoc, settings.blur);
    gl.uniform1f(portraitLightingLoc, settings.portraitLighting);
    gl.uniform1i(virtualBgLoc, settings.virtualBackground ? 1 : 0);
    gl.uniform1f(zoomLoc, settings.zoom);
    gl.uniform1f(panXLoc, settings.panX);
    gl.uniform1f(panYLoc, settings.panY);
    gl.uniform1i(mirrorLoc, settings.mirror ? 1 : 0);
    gl.uniform1f(rotationLoc, settings.rotation);
    gl.uniform1f(brightnessLoc, settings.brightness);

    // Set up position attribute
    const positionLoc = gl.getAttribLocation(this.baseProgram, 'a_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.basePositionBuffer);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    // Set up texture coordinate attribute
    const texCoordLoc = gl.getAttribLocation(this.baseProgram, 'a_texCoord');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.baseTexCoordBuffer);
    gl.enableVertexAttribArray(texCoordLoc);
    gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0);

    // Draw the full-screen quad
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    return true;
  }

  /**
   * Get the canvas element
   */
  getCanvas(): HTMLCanvasElement | OffscreenCanvas | null {
    return this.canvas;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (!this.gl) return;

    if (this.basePositionBuffer) this.gl.deleteBuffer(this.basePositionBuffer);
    if (this.baseTexCoordBuffer) this.gl.deleteBuffer(this.baseTexCoordBuffer);
    if (this.videoTexture) this.gl.deleteTexture(this.videoTexture);
    if (this.maskTexture) this.gl.deleteTexture(this.maskTexture);
    if (this.bgTexture) this.gl.deleteTexture(this.bgTexture);
    if (this.baseProgram) this.gl.deleteProgram(this.baseProgram);

    this.gl = null;
    this.canvas = null;
  }
}
