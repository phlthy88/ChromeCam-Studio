/**
 * useAudioProcessor - Web Audio API processing hook
 *
 * Provides audio processing chain with:
 * - Dynamic compression for even audio levels
 * - Noise gate to eliminate background noise
 *
 * Features:
 * - Real-time parameter updates
 * - Automatic chain management
 * - Processed audio stream output
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  createAudioProcessingChain,
  disposeAudioProcessingChain,
  updateCompressor,
  type AudioProcessingChain,
  type CompressorConfig,
  type NoiseGateConfig,
} from '../utils/audio';

export interface UseAudioProcessorOptions {
  /** Input audio stream to process */
  inputStream: MediaStream | null;
  /** Enable the audio processor */
  enabled: boolean;
  /** Compressor settings */
  compressorEnabled: boolean;
  compressorThreshold: number;
  compressorKnee: number;
  compressorRatio: number;
  compressorAttack: number;
  compressorRelease: number;
  /** Noise gate settings */
  noiseGateEnabled: boolean;
  noiseGateThreshold: number;
  noiseGateAttack: number;
  noiseGateRelease: number;
}

export interface UseAudioProcessorReturn {
  /** Processed audio stream (use this instead of input stream) */
  processedStream: MediaStream | null;
  /** Whether the processor is active */
  isProcessing: boolean;
  /** Current compressor gain reduction (dB) */
  compressorReduction: number;
  /** Whether the noise gate is open */
  noiseGateOpen: boolean;
  /** Error message if audio processing failed */
  audioError: string | null;
  /** Average audio processing time (ms) */
  audioProcessingTime: number;
}

/**
 * Hook for audio processing with compressor and noise gate
 */
export function useAudioProcessor({
  inputStream,
  enabled,
  compressorEnabled,
  compressorThreshold,
  compressorKnee,
  compressorRatio,
  compressorAttack,
  compressorRelease,
  noiseGateEnabled,
  noiseGateThreshold,
  noiseGateAttack,
  noiseGateRelease,
}: UseAudioProcessorOptions): UseAudioProcessorReturn {
  const chainRef = useRef<AudioProcessingChain | null>(null);
  const [processedStream, setProcessedStream] = useState<MediaStream | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [compressorReduction, setCompressorReduction] = useState(0);
  const [noiseGateOpen, setNoiseGateOpen] = useState(true);
  const [audioError, setAudioError] = useState<string | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (chainRef.current) {
      disposeAudioProcessingChain(chainRef.current);
      chainRef.current = null;
    }

    setProcessedStream(null);
    setIsProcessing(false);
  }, []);

  // Initialize or rebuild chain when inputs change
  useEffect(() => {
    // Don't process if disabled or no input
    if (!enabled || !inputStream) {
      cleanup();
      return;
    }

    // Check if input stream has audio tracks
    const audioTracks = inputStream.getAudioTracks();
    if (audioTracks.length === 0) {
      cleanup();
      return;
    }

    // Check if any processing is enabled
    if (!compressorEnabled && !noiseGateEnabled) {
      // Just pass through the input stream
      setProcessedStream(inputStream);
      setIsProcessing(false);
      return;
    }

    // Build compressor config
    const compressorConfig: CompressorConfig = {
      threshold: compressorThreshold,
      knee: compressorKnee,
      ratio: compressorRatio,
      attack: compressorAttack,
      release: compressorRelease,
    };

    // Build noise gate config
    const noiseGateConfig: NoiseGateConfig = {
      threshold: noiseGateThreshold,
      attack: noiseGateAttack,
      release: noiseGateRelease,
    };

    try {
      // Create audio-only stream for processing
      const audioStream = new MediaStream(audioTracks);

      // Create processing chain
      const chain = createAudioProcessingChain(audioStream, {
        enableCompressor: compressorEnabled,
        compressorConfig,
        enableNoiseGate: noiseGateEnabled,
        noiseGateConfig,
      });

      chainRef.current = chain;
      setProcessedStream(chain.processedStream);
      setIsProcessing(true);
      setAudioError(null); // Clear any previous error on successful initialization

      // Start monitoring compressor reduction and gate state
      const monitor = () => {
        if (chain.compressor) {
          setCompressorReduction(chain.compressor.reduction);
        }

        if (chain.noiseGate) {
          setNoiseGateOpen(chain.noiseGate.gateOpen);
        }

        animationFrameRef.current = requestAnimationFrame(monitor);
      };

      animationFrameRef.current = requestAnimationFrame(monitor);
    } catch (error) {
      console.error('Failed to create audio processing chain:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown audio processing error';
      setAudioError(`Audio processing failed: ${errorMessage}`);
      cleanup();
    }

    return cleanup;
  }, [
    inputStream,
    enabled,
    compressorEnabled,
    noiseGateEnabled,
    // Only rebuild when these change significantly (not on every slider move)
    // Real-time updates are handled below
    cleanup,
  ]);

  // Update compressor parameters in real-time (without rebuilding chain)
  useEffect(() => {
    if (chainRef.current?.compressor && compressorEnabled) {
      updateCompressor(chainRef.current.compressor, {
        threshold: compressorThreshold,
        knee: compressorKnee,
        ratio: compressorRatio,
        attack: compressorAttack,
        release: compressorRelease,
      });
    }
  }, [
    compressorEnabled,
    compressorThreshold,
    compressorKnee,
    compressorRatio,
    compressorAttack,
    compressorRelease,
  ]);

  // Update noise gate parameters in real-time
  useEffect(() => {
    if (chainRef.current?.noiseGate && noiseGateEnabled) {
      chainRef.current.noiseGate.updateConfig({
        threshold: noiseGateThreshold,
        attack: noiseGateAttack,
        release: noiseGateRelease,
      });
    }
  }, [noiseGateEnabled, noiseGateThreshold, noiseGateAttack, noiseGateRelease]);

  return {
    processedStream,
    isProcessing,
    compressorReduction,
    noiseGateOpen,
    audioError,
    audioProcessingTime: 0, // TODO: Implement actual measurement
  };
}

export default useAudioProcessor;
