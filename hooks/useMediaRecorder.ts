import { useState, useRef, useCallback, useEffect } from 'react';
import type { CameraSettings } from '../components/settings';
import { VIDEO_CODECS } from '../components/settings';

/**
 * Utility to save a blob to the user's file system
 * Uses the File System Access API when available, falls back to download
 */
const saveFile = async (blob: Blob, filename: string, type: string) => {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: 'Media File',
            accept: { [type]: ['.' + filename.split('.').pop()] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (_err) {
      // Fallback to download
    }
  }

  // Fallback: create download link
  const link = document.createElement('a');
  link.download = filename;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
};

export interface UseMediaRecorderOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  streamRef: React.RefObject<MediaStream | null>;
  settings: CameraSettings;
  /** Optional processed audio stream (from useAudioProcessor) - used instead of raw audio from streamRef */
  processedAudioStream?: MediaStream | null;
}

export interface UseMediaRecorderReturn {
  isRecording: boolean;
  recordingTime: number;
  toggleRecording: () => void;
  formatTime: (seconds: number) => string;
  handleSnapshot: () => Promise<void>;
  flashActive: boolean;
}

/**
 * useMediaRecorder - Handles video/audio recording and snapshots
 *
 * Features:
 * - Video recording with configurable codec (VP8, VP9, H.264, AV1)
 * - Audio recording with configurable bitrate
 * - Canvas snapshot to PNG
 * - Recording timer display
 * - Flash animation on snapshot
 */
export function useMediaRecorder({
  canvasRef,
  streamRef,
  settings,
  processedAudioStream,
}: UseMediaRecorderOptions): UseMediaRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [flashActive, setFlashActive] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }, []);

  const handleSnapshot = useCallback(async () => {
    if (!canvasRef.current) return;

    // Flash animation
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 150);

    canvasRef.current.toBlob(async (blob) => {
      if (!blob) return;
      const filename = `snapshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
      await saveFile(blob, filename, 'image/png');
    }, 'image/png');
  }, [canvasRef]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      // Stop recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      setIsRecording(false);
    } else {
      // Start recording
      if (!canvasRef.current) return;

      recordedChunksRef.current = [];
      const canvasStream = canvasRef.current.captureStream(settings.frameRate || 30);

      // Add audio track if enabled
      // Prefer processed audio stream (with compressor/noise gate) over raw stream
      if (settings.enableAudio) {
        const audioSource = processedAudioStream || streamRef.current;
        if (audioSource) {
          const audioTracks = audioSource.getAudioTracks();
          const firstTrack = audioTracks[0];
          if (firstTrack) {
            canvasStream.addTrack(firstTrack);
          }
        }
      }

      // Find the selected codec's mimeType
      const codecConfig = VIDEO_CODECS.find((c) => c.id === settings.videoCodec) ?? VIDEO_CODECS[1];
      let mimeType = codecConfig?.mimeType ?? 'video/webm;codecs=vp9';

      // Check if the mimeType is supported, fall back to vp9 or vp8
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp9';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm;codecs=vp8';
        }
      }

      // Calculate bitrate in bits per second
      const videoBitsPerSecond = settings.videoBitrate * 1000000; // Mbps to bps
      const audioBitsPerSecond = settings.audioBitrate * 1000; // kbps to bps

      try {
        const recorder = new MediaRecorder(canvasStream, {
          mimeType,
          videoBitsPerSecond,
          audioBitsPerSecond,
        });

        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const mimeTypeForSave = mimeType.split(';')[0] || 'video/webm';

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
          }
        };

        recorder.onstop = async () => {
          const blob = new Blob(recordedChunksRef.current, { type: mimeType });
          const filename = `recording-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
          await saveFile(blob, filename, mimeTypeForSave);
        };

        recorder.start();
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
        setRecordingTime(0);
        recordingTimerRef.current = setInterval(() => {
          setRecordingTime((prev) => prev + 1);
        }, 1000);
      } catch (e) {
        console.error('Recording failed', e);
        // Reset recording state when MediaRecorder fails to start
        setIsRecording(false);
        setRecordingTime(0);
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
      }
    }
  }, [isRecording, canvasRef, streamRef, settings, processedAudioStream]);

  // Cleanup recording timer on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    };
  }, []);

  return {
    isRecording,
    recordingTime,
    toggleRecording,
    formatTime,
    handleSnapshot,
    flashActive,
  };
}

export default useMediaRecorder;
