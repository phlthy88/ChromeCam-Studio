import { logger } from './logger';

export class AppError extends Error {
  constructor(
    public component: string,
    public code: string,
    message: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function handleError(
  component: string,
  error: unknown,
  fallbackMessage = 'An unexpected error occurred'
): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const err = error instanceof Error ? error : new Error(String(error));

  logger.error(component, fallbackMessage, {
    error: err.message,
    stack: err.stack,
  });

  return new AppError(component, 'UNKNOWN_ERROR', fallbackMessage, err);
}

export function isCriticalError(error: AppError): boolean {
  return ['CAMERA_ACCESS_DENIED', 'WEBGL_CONTEXT_LOST', 'MEDIA_STREAM_ERROR'].includes(error.code);
}

// Error codes for consistent error handling
export const ERROR_CODES = {
  CAMERA_ACCESS_DENIED: 'CAMERA_ACCESS_DENIED',
  CAMERA_NOT_FOUND: 'CAMERA_NOT_FOUND',
  WEBGL_CONTEXT_LOST: 'WEBGL_CONTEXT_LOST',
  MEDIA_STREAM_ERROR: 'MEDIA_STREAM_ERROR',
  AI_WORKER_INIT_FAILED: 'AI_WORKER_INIT_FAILED',
  SEGMENTATION_FAILED: 'SEGMENTATION_FAILED',
  FACE_TRACKING_FAILED: 'FACE_TRACKING_FAILED',
  VIRTUAL_CAMERA_ERROR: 'VIRTUAL_CAMERA_ERROR',
  OBS_INTEGRATION_FAILED: 'OBS_INTEGRATION_FAILED',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;
