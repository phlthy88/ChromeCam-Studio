import React, { useState, useEffect } from 'react';

interface OnboardingStep {
  target: string;
  content: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  disableBeacon?: boolean;
}

const onboardingSteps: OnboardingStep[] = [
  {
    target: '#camera-select',
    content: 'Select your camera device from the dropdown. ChromeCam supports multiple cameras.',
    placement: 'bottom',
  },
  {
    target: '#resolution',
    content:
      'Choose your recording resolution. Higher resolutions provide better quality but require more processing power.',
    placement: 'bottom',
  },
  {
    target: '#ai-effects',
    content:
      'Enable AI background effects like blur or replacement. These run locally on your device.',
    placement: 'left',
  },
  {
    target: '#record-btn',
    content:
      'Start recording or take snapshots. Your videos are saved locally to your Downloads folder.',
    placement: 'top',
  },
  {
    target: '#presets',
    content:
      'Use presets for quick setup of common scenarios like studio lighting or low light conditions.',
    placement: 'bottom',
  },
  {
    target: '#virtual-camera',
    content:
      'Enable virtual camera to use ChromeCam as a webcam source in other applications like Zoom.',
    placement: 'top',
  },
];

interface OnboardingProps {
  isOpen: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({ isOpen, onComplete, onSkip }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setCurrentStep(0);
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  const handleNext = () => {
    if (currentStep < onboardingSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    setIsVisible(false);
    onComplete();
  };

  const handleSkip = () => {
    setIsVisible(false);
    onSkip();
  };

  if (!isVisible) return null;

  const step = onboardingSteps[currentStep];
  if (!step) return null;

  const targetElement = document.querySelector(step.target);

  if (!targetElement) {
    // If target not found, skip to next
    handleNext();
    return null;
  }

  const rect = targetElement.getBoundingClientRect();
  const tooltipStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 1000,
    background: 'white',
    border: '1px solid #ccc',
    borderRadius: '8px',
    padding: '16px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    maxWidth: '300px',
    fontSize: '14px',
    lineHeight: '1.5',
  };

  // Position tooltip based on placement
  switch (step.placement) {
    case 'top':
      tooltipStyle.bottom = `${window.innerHeight - rect.top + 8}px`;
      tooltipStyle.left = `${rect.left + rect.width / 2}px`;
      tooltipStyle.transform = 'translateX(-50%)';
      break;
    case 'bottom':
      tooltipStyle.top = `${rect.bottom + 8}px`;
      tooltipStyle.left = `${rect.left + rect.width / 2}px`;
      tooltipStyle.transform = 'translateX(-50%)';
      break;
    case 'left':
      tooltipStyle.right = `${window.innerWidth - rect.left + 8}px`;
      tooltipStyle.top = `${rect.top + rect.height / 2}px`;
      tooltipStyle.transform = 'translateY(-50%)';
      break;
    case 'right':
      tooltipStyle.left = `${rect.right + 8}px`;
      tooltipStyle.top = `${rect.top + rect.height / 2}px`;
      tooltipStyle.transform = 'translateY(-50%)';
      break;
    default:
      tooltipStyle.top = `${rect.bottom + 8}px`;
      tooltipStyle.left = `${rect.left + rect.width / 2}px`;
      tooltipStyle.transform = 'translateX(-50%)';
  }

  return (
    <>
      {/* Overlay */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 999,
          pointerEvents: 'none',
        }}
      />

      {/* Highlight target */}
      <div
        style={{
          position: 'fixed',
          top: rect.top - 4,
          left: rect.left - 4,
          width: rect.width + 8,
          height: rect.height + 8,
          border: '2px solid #007acc',
          borderRadius: '4px',
          zIndex: 1000,
          pointerEvents: 'none',
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
        }}
      />

      {/* Tooltip */}
      <div style={tooltipStyle}>
        <div style={{ marginBottom: '12px' }}>{step.content}</div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '12px', color: '#666' }}>
            {currentStep + 1} of {onboardingSteps.length}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleSkip}
              style={{
                padding: '4px 8px',
                background: 'transparent',
                border: '1px solid #ccc',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
              aria-label="Skip onboarding"
            >
              Skip
            </button>

            {currentStep > 0 && (
              <button
                onClick={handlePrev}
                style={{
                  padding: '4px 8px',
                  background: '#f0f0f0',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
                aria-label="Previous step"
              >
                Previous
              </button>
            )}

            <button
              onClick={handleNext}
              style={{
                padding: '4px 8px',
                background: '#007acc',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
              aria-label={currentStep === onboardingSteps.length - 1 ? 'Finish onboarding' : 'Next step'}
            >
              {currentStep === onboardingSteps.length - 1 ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Onboarding;
