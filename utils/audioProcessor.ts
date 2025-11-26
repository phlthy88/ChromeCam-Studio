/**
 * Audio Processing Utilities for ChromeCam Studio
 *
 * Handles Web Audio API processing chain with optional monitoring
 * for broadcast mode (routes audio to tab audio for screen sharing)
 */

export interface AudioProcessingOptions {
  // Noise suppression
  noiseSuppression?: boolean;
  echoCancellation?: boolean;
  autoGainControl?: boolean;

  // Compressor settings
  compressorEnabled?: boolean;
  compressorThreshold?: number; // dB (-100 to 0)
  compressorKnee?: number; // dB (0 to 40)
  compressorRatio?: number; // 1 to 20
  compressorAttack?: number; // seconds (0 to 1)
  compressorRelease?: number; // seconds (0 to 1)

  // Noise gate settings
  noiseGateEnabled?: boolean;
  noiseGateThreshold?: number; // dB (-100 to 0)
  noiseGateAttack?: number; // seconds (0 to 0.5)
  noiseGateRelease?: number; // seconds (0 to 1)

  // Monitoring
  monitor?: boolean; // Route to speakers for tab audio capture
}

export interface AudioProcessingChain {
  processedStream: MediaStream;
  audioContext: AudioContext;
  sourceNode: MediaStreamAudioSourceNode;
  compressorNode?: DynamicsCompressorNode;
  noiseGateNode?: AudioWorkletNode;
  destinationNode: MediaStreamAudioDestinationNode;
  cleanup: () => void;
}

// Singleton AudioContext to avoid "maximum context" errors
let globalAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!globalAudioContext) {
    globalAudioContext = new AudioContext({
      latencyHint: 'interactive',
      sampleRate: 48000,
    });
  }
  return globalAudioContext;
}

/**
 * Create audio processing chain with optional monitoring
 */
export async function createAudioProcessingChain(
  inputStream: MediaStream,
  options: AudioProcessingOptions = {}
): Promise<AudioProcessingChain> {
  const ctx = getAudioContext();

  // Resume context if suspended (required by browser autoplay policies)
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }

  // Create nodes
  const sourceNode = ctx.createMediaStreamSource(inputStream);
  const destinationNode = ctx.createMediaStreamDestination();

  let lastNode: AudioNode = sourceNode;
  let compressorNode: DynamicsCompressorNode | undefined;
  let noiseGateNode: AudioWorkletNode | undefined;

  // ========================================================================
  // COMPRESSOR (Dynamic Range Compression)
  // ========================================================================
  if (options.compressorEnabled) {
    compressorNode = ctx.createDynamicsCompressor();
    compressorNode.threshold.value = options.compressorThreshold ?? -24;
    compressorNode.knee.value = options.compressorKnee ?? 12;
    compressorNode.ratio.value = options.compressorRatio ?? 4;
    compressorNode.attack.value = options.compressorAttack ?? 0.003;
    compressorNode.release.value = options.compressorRelease ?? 0.25;

    lastNode.connect(compressorNode);
    lastNode = compressorNode;
  }

  // ========================================================================
  // NOISE GATE (Simple implementation using GainNode)
  // ========================================================================
  if (options.noiseGateEnabled) {
    // For production, use AudioWorklet for proper noise gate
    // For now, use a simple gain-based approach
    const gainNode = ctx.createGain();
    gainNode.gain.value = 1.0;

    lastNode.connect(gainNode);
    lastNode = gainNode;

    // Note: Proper noise gate requires AudioWorklet or ScriptProcessor
    // This is simplified - recommend implementing AudioWorklet later
  }

  // ========================================================================
  // MONITORING (Route to speakers for tab audio capture)
  // ========================================================================
  if (options.monitor) {
    // Connect to speakers so StreamYard/OBS can capture "Tab Audio"
    lastNode.connect(ctx.destination);
    console.log('[AudioProcessor] Monitoring enabled - audio routed to tab audio');
  }

  // Always connect to destination stream (for MediaRecorder, etc.)
  lastNode.connect(destinationNode);

  // Cleanup function
  const cleanup = () => {
    sourceNode.disconnect();
    compressorNode?.disconnect();
    noiseGateNode?.disconnect();
    destinationNode.disconnect();
  };

  return {
    processedStream: destinationNode.stream,
    audioContext: ctx,
    sourceNode,
    compressorNode,
    noiseGateNode,
    destinationNode,
    cleanup,
  };
}

/**
 * Update compressor settings on existing chain
 */
export function updateCompressorSettings(
  chain: AudioProcessingChain,
  settings: Pick<
    AudioProcessingOptions,
    | 'compressorThreshold'
    | 'compressorKnee'
    | 'compressorRatio'
    | 'compressorAttack'
    | 'compressorRelease'
  >
): void {
  if (!chain.compressorNode) return;

  if (settings.compressorThreshold !== undefined) {
    chain.compressorNode.threshold.value = settings.compressorThreshold;
  }
  if (settings.compressorKnee !== undefined) {
    chain.compressorNode.knee.value = settings.compressorKnee;
  }
  if (settings.compressorRatio !== undefined) {
    chain.compressorNode.ratio.value = settings.compressorRatio;
  }
  if (settings.compressorAttack !== undefined) {
    chain.compressorNode.attack.value = settings.compressorAttack;
  }
  if (settings.compressorRelease !== undefined) {
    chain.compressorNode.release.value = settings.compressorRelease;
  }
}

/**
 * Enable/disable monitoring on existing chain
 */
export function setMonitoring(chain: AudioProcessingChain, enabled: boolean): void {
  const lastNode = chain.compressorNode || chain.sourceNode;

  if (enabled) {
    // Connect to speakers
    lastNode.connect(chain.audioContext.destination);
    console.log('[AudioProcessor] Monitoring enabled');
  } else {
    // Disconnect from speakers (keep destination connection)
    try {
      lastNode.disconnect(chain.audioContext.destination);
    } catch (e) {
      // Already disconnected, ignore
    }
    console.log('[AudioProcessor] Monitoring disabled');
  }
}
