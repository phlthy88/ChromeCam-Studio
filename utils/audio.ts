/**
 * Audio Utilities for ChromeCam Studio
 *
 * Provides a singleton AudioContext and utilities for audio processing.
 * This avoids creating multiple AudioContexts (browsers limit these)
 * and provides consistent audio handling across the application.
 */

// Singleton AudioContext instance
let audioContextInstance: AudioContext | null = null;

/**
 * Get or create the shared AudioContext instance.
 * Handles the webkit prefix for Safari compatibility.
 *
 * @returns The shared AudioContext instance
 */
export function getAudioContext(): AudioContext {
  if (!audioContextInstance) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) {
      throw new Error('AudioContext is not supported in this browser');
    }

    audioContextInstance = new AudioContextClass();
  }

  // Resume if suspended (required after user interaction on some browsers)
  if (audioContextInstance.state === 'suspended') {
    audioContextInstance.resume().catch(console.warn);
  }

  return audioContextInstance;
}

/**
 * Close the shared AudioContext and release resources.
 * Call this when the application is being unmounted or audio is no longer needed.
 */
export async function closeAudioContext(): Promise<void> {
  if (audioContextInstance) {
    await audioContextInstance.close();
    audioContextInstance = null;
  }
}

/**
 * Check if AudioContext is supported in the current browser.
 */
export function isAudioContextSupported(): boolean {
  return !!(
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}

/**
 * VU Meter constants
 */
export const VU_METER_CONFIG = {
  /** Number of bars in the VU meter display */
  BARS: 12,
  /** Gap between bars in pixels */
  GAP: 2,
  /** FFT size for frequency analysis */
  FFT_SIZE: 256,
  /** Smoothing factor for volume transitions */
  SMOOTHING: 0.5,
  /** Threshold percentage for green bars */
  GREEN_THRESHOLD: 0.6,
  /** Threshold percentage for yellow bars */
  YELLOW_THRESHOLD: 0.85,
} as const;

/**
 * VU Meter color scheme (Material 3 compatible)
 */
export const VU_METER_COLORS = {
  /** Safe audio levels (green) */
  LOW: '#4ade80',
  /** Moderate audio levels (yellow) */
  MID: '#facc15',
  /** Peak/clipping levels (red) */
  HIGH: '#f87171',
  /** Inactive bar fallback color */
  INACTIVE_FALLBACK: '#cac4d0',
} as const;

/**
 * Calculate RMS (Root Mean Square) volume from frequency data.
 *
 * @param dataArray - Uint8Array of frequency data from AnalyserNode
 * @returns Volume level as percentage (0-100)
 */
export function calculateRMSVolume(dataArray: Uint8Array): number {
  let sum = 0;
  const length = dataArray.length;

  for (let i = 0; i < length; i++) {
    const value = dataArray[i] ?? 0;
    sum += value * value;
  }

  const rms = Math.sqrt(sum / length);
  // Scale to 0-100 with slight boost
  return Math.min(100, (rms / 128) * 100 * 1.5);
}

/**
 * Get CSS custom property value with fallback.
 *
 * @param property - CSS custom property name (e.g., '--md-sys-color-outline-variant')
 * @param fallback - Fallback value if property not found
 * @returns The property value or fallback
 */
export function getCSSProperty(property: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(property).trim() || fallback;
}

/**
 * Audio Processor Configuration
 */
export interface CompressorConfig {
  threshold: number; // dB (-100 to 0)
  knee: number; // dB (0 to 40)
  ratio: number; // 1 to 20
  attack: number; // seconds (0 to 1)
  release: number; // seconds (0 to 1)
}

export interface NoiseGateConfig {
  threshold: number; // dB (-100 to 0)
  attack: number; // seconds (0 to 0.5)
  release: number; // seconds (0 to 1)
}

/**
 * Default compressor settings for voice
 */
export const DEFAULT_COMPRESSOR_CONFIG: CompressorConfig = {
  threshold: -24,
  knee: 12,
  ratio: 4,
  attack: 0.003,
  release: 0.25,
};

/**
 * Default noise gate settings
 */
export const DEFAULT_NOISE_GATE_CONFIG: NoiseGateConfig = {
  threshold: -50,
  attack: 0.005,
  release: 0.1,
};

/**
 * Create a DynamicsCompressorNode with the given configuration.
 *
 * @param ctx - AudioContext to create the node in
 * @param config - Compressor configuration
 * @returns Configured DynamicsCompressorNode
 */
export function createCompressor(
  ctx: AudioContext,
  config: CompressorConfig = DEFAULT_COMPRESSOR_CONFIG
): DynamicsCompressorNode {
  const compressor = ctx.createDynamicsCompressor();

  compressor.threshold.value = config.threshold;
  compressor.knee.value = config.knee;
  compressor.ratio.value = config.ratio;
  compressor.attack.value = config.attack;
  compressor.release.value = config.release;

  return compressor;
}

/**
 * Update compressor parameters in real-time.
 *
 * @param compressor - The compressor node to update
 * @param config - New configuration values
 */
export function updateCompressor(
  compressor: DynamicsCompressorNode,
  config: Partial<CompressorConfig>
): void {
  if (config.threshold !== undefined) compressor.threshold.value = config.threshold;
  if (config.knee !== undefined) compressor.knee.value = config.knee;
  if (config.ratio !== undefined) compressor.ratio.value = config.ratio;
  if (config.attack !== undefined) compressor.attack.value = config.attack;
  if (config.release !== undefined) compressor.release.value = config.release;
}

/**
 * Noise Gate implementation using Web Audio API
 *
 * Since Web Audio API doesn't have a native noise gate, we implement it using:
 * - An AnalyserNode to measure input level
 * - A GainNode to control output
 * - A scriptProcessorNode/worklet for real-time processing
 *
 * This creates a simple expander that reduces gain below the threshold.
 */
export class NoiseGate {
  private analyser: AnalyserNode;
  private gainNode: GainNode;
  private inputNode: GainNode;
  private config: NoiseGateConfig;
  private isOpen: boolean = false;
  private currentGain: number = 1;
  private animationFrameId: number | null = null;
  private dataArray: Float32Array;

  constructor(ctx: AudioContext, config: NoiseGateConfig = DEFAULT_NOISE_GATE_CONFIG) {
    this.config = { ...config };

    // Create nodes
    this.inputNode = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.gainNode = ctx.createGain();

    // Configure analyser
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.3;
    this.dataArray = new Float32Array(this.analyser.frequencyBinCount);

    // Connect internal chain
    this.inputNode.connect(this.analyser);
    this.inputNode.connect(this.gainNode);

    // Start processing
    this.startProcessing();
  }

  /**
   * Get the input node to connect audio source to
   */
  get input(): GainNode {
    return this.inputNode;
  }

  /**
   * Get the output node to connect to destination
   */
  get output(): GainNode {
    return this.gainNode;
  }

  /**
   * Update gate configuration
   */
  updateConfig(config: Partial<NoiseGateConfig>): void {
    if (config.threshold !== undefined) this.config.threshold = config.threshold;
    if (config.attack !== undefined) this.config.attack = config.attack;
    if (config.release !== undefined) this.config.release = config.release;
  }

  /**
   * Check if the gate is currently open
   */
  get gateOpen(): boolean {
    return this.isOpen;
  }

  /**
   * Get current gain reduction in dB
   */
  get reduction(): number {
    return 20 * Math.log10(this.currentGain + 0.0001);
  }

  private startProcessing(): void {
    const process = () => {
      // Get current RMS level in dB
      this.analyser.getFloatTimeDomainData(this.dataArray);

      let sum = 0;
      for (let i = 0; i < this.dataArray.length; i++) {
        const sample = this.dataArray[i] ?? 0;
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / this.dataArray.length);
      const dbLevel = 20 * Math.log10(rms + 0.0001);

      // Determine if gate should be open or closed
      const shouldBeOpen = dbLevel > this.config.threshold;

      // Calculate target gain
      const targetGain = shouldBeOpen ? 1 : 0;

      // Apply attack/release smoothing
      const smoothingTime = shouldBeOpen ? this.config.attack : this.config.release;
      const smoothingFactor = Math.min(1, 1 / 60 / smoothingTime); // Assuming ~60fps

      this.currentGain = this.currentGain + (targetGain - this.currentGain) * smoothingFactor;
      this.isOpen = this.currentGain > 0.5;

      // Apply gain
      this.gainNode.gain.value = this.currentGain;

      this.animationFrameId = requestAnimationFrame(process);
    };

    this.animationFrameId = requestAnimationFrame(process);
  }

  /**
   * Disconnect and clean up resources
   */
  dispose(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.inputNode.disconnect();
    this.analyser.disconnect();
    this.gainNode.disconnect();
  }
}

/**
 * Audio processing chain for microphone input
 *
 * Chain order:
 * Source -> NoiseGate -> Compressor -> Destination
 */
export interface AudioProcessingChain {
  source: MediaStreamAudioSourceNode;
  noiseGate: NoiseGate | null;
  compressor: DynamicsCompressorNode | null;
  output: MediaStreamAudioDestinationNode;
  processedStream: MediaStream;
}

/**
 * Create a complete audio processing chain from a media stream.
 *
 * @param inputStream - The input media stream with audio track
 * @param options - Processing options
 * @returns The processing chain with processed output stream
 */
export function createAudioProcessingChain(
  inputStream: MediaStream,
  options: {
    enableCompressor?: boolean;
    compressorConfig?: CompressorConfig;
    enableNoiseGate?: boolean;
    noiseGateConfig?: NoiseGateConfig;
    monitor?: boolean; // Route to speakers for tab audio capture
  } = {}
): AudioProcessingChain {
  const ctx = getAudioContext();

  // Create source from input stream
  const source = ctx.createMediaStreamSource(inputStream);

  // Create destination for output stream
  const output = ctx.createMediaStreamDestination();

  let noiseGate: NoiseGate | null = null;
  let compressor: DynamicsCompressorNode | null = null;

  // Build the chain
  let currentNode: AudioNode = source;

  // Add noise gate if enabled
  if (options.enableNoiseGate) {
    noiseGate = new NoiseGate(ctx, options.noiseGateConfig);
    currentNode.connect(noiseGate.input);
    currentNode = noiseGate.output;
  }

  // Add compressor if enabled
  if (options.enableCompressor) {
    compressor = createCompressor(ctx, options.compressorConfig);
    currentNode.connect(compressor);
    currentNode = compressor;
  }

  // Monitoring: Route to speakers for tab audio capture
  if (options.monitor) {
    currentNode.connect(ctx.destination);
    console.log('[AudioUtils] Monitoring enabled - audio routed to tab audio');
  }

  // Connect to output
  currentNode.connect(output);

  return {
    source,
    noiseGate,
    compressor,
    output,
    processedStream: output.stream,
  };
}

/**
 * Dispose of an audio processing chain and clean up resources.
 *
 * @param chain - The chain to dispose
 */
export function disposeAudioProcessingChain(chain: AudioProcessingChain): void {
  chain.source.disconnect();
  chain.noiseGate?.dispose();
  chain.compressor?.disconnect();
  chain.output.disconnect();
}

/**
 * Enable/disable monitoring on an existing audio processing chain
 */
export function setAudioMonitoring(chain: AudioProcessingChain, enabled: boolean): void {
  const ctx = getAudioContext();
  const lastNode = chain.compressor || (chain.noiseGate ? chain.noiseGate.output : chain.source);

  if (enabled) {
    // Connect to speakers for tab audio capture
    lastNode.connect(ctx.destination);
    console.log('[AudioUtils] Monitoring enabled');
  } else {
    // Disconnect from speakers (keep output connection)
    try {
      lastNode.disconnect(ctx.destination);
    } catch (e) {
      // Already disconnected, ignore
    }
    console.log('[AudioUtils] Monitoring disabled');
  }
}
