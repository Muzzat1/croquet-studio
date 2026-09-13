import { TUTORIAL_STEPS, type TutorialStep } from '../data/gateballTutorialData';

interface TutorialPlayerProps {
  currentStepIndex: number;
  onNextStep: () => void;
  onPrevStep: () => void;
  onReplayStep: () => void;
  onExitTutorial: () => void;
  isMuted: boolean;
  isSpeaking: boolean;
  onToggleMute: () => void;
  actionLabel?: string | null;
}

export default function TutorialPlayer({
  currentStepIndex,
  onNextStep,
  onPrevStep,
  onReplayStep,
  onExitTutorial,
  isMuted,
  isSpeaking,
  onToggleMute,
  actionLabel
}: TutorialPlayerProps) {
  const step: TutorialStep = TUTORIAL_STEPS[currentStepIndex] || TUTORIAL_STEPS[0];
  const isFirst = currentStepIndex === 0;
  const isLast = currentStepIndex === TUTORIAL_STEPS.length - 1;

  return (
    <div
      style={{
        position: 'absolute',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '90%',
        maxWidth: '680px',
        background: 'rgba(10, 15, 26, 0.88)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '20px',
        padding: '18px 24px',
        zIndex: 1000,
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6), 0 0 1px 1px rgba(255, 255, 255, 0.1)',
        color: '#ffffff',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        animation: 'slideDownFade 0.35s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
    >
      {/* Top Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '10px',
              fontWeight: '800',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              background: '#10b981',
              color: '#000000',
              padding: '3px 8px',
              borderRadius: '12px'
            }}
          >
            {step.badge}
          </span>
          {actionLabel && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: '700',
                background: 'rgba(56, 189, 248, 0.2)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                color: '#38bdf8',
                padding: '3px 8px',
                borderRadius: '12px'
              }}
            >
              ▶ {actionLabel}
            </span>
          )}
          <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600' }}>
            Step {currentStepIndex + 1} of {TUTORIAL_STEPS.length}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Audio Narration Toggle */}
          <button
            onClick={onToggleMute}
            title={isMuted ? "Unmute Voice Narration" : "Mute Voice Narration"}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '10px',
              fontWeight: '700',
              padding: '4px 10px',
              borderRadius: '14px',
              background: isMuted ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)',
              border: `1px solid ${isMuted ? 'rgba(239, 68, 68, 0.4)' : 'rgba(59, 130, 246, 0.4)'}`,
              color: isMuted ? '#fca5a5' : '#93c5fd',
              cursor: 'pointer'
            }}
          >
            <span>{isMuted ? '🔇' : isSpeaking ? '🔊' : '🔈'}</span>
            <span>{isMuted ? 'Voice Muted' : isSpeaking ? 'Speaking...' : 'Voice On'}</span>
          </button>

          {/* Close / Exit button */}
          <button
            onClick={onExitTutorial}
            title="Exit Tutorial"
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#94a3b8',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Step Title */}
      <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '800', color: '#f8fafc' }}>
        {step.title}
      </h3>

      {/* Explanatory Body Text */}
      <p style={{ margin: '0 0 16px 0', fontSize: '12.5px', lineHeight: '1.55', color: '#cbd5e1' }}>
        {step.text}
      </p>

      {/* Progress Dots & Navigation Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '12px' }}>
        {/* Progress dots */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {TUTORIAL_STEPS.map((s, idx) => (
            <div
              key={s.id}
              style={{
                width: idx === currentStepIndex ? '20px' : '6px',
                height: '6px',
                borderRadius: '3px',
                background: idx === currentStepIndex ? '#10b981' : idx < currentStepIndex ? '#3b82f6' : 'rgba(255, 255, 255, 0.2)',
                transition: 'all 0.25s ease'
              }}
            />
          ))}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {(Boolean(step.demoActions && step.demoActions.length > 0) || Boolean(step.demonstration)) && (
            <button
              onClick={onReplayStep}
              style={{
                fontSize: '11px',
                padding: '6px 12px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#ffffff',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              ↺ Replay Action
            </button>
          )}

          <button
            onClick={onPrevStep}
            disabled={isFirst}
            style={{
              fontSize: '11px',
              padding: '6px 14px',
              borderRadius: '8px',
              background: isFirst ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: isFirst ? '#475569' : '#ffffff',
              fontWeight: '700',
              cursor: isFirst ? 'not-allowed' : 'pointer'
            }}
          >
            ← Previous
          </button>

          <button
            onClick={onNextStep}
            style={{
              fontSize: '11px',
              padding: '6px 18px',
              borderRadius: '8px',
              background: '#10b981',
              border: 'none',
              color: '#000000',
              fontWeight: '800',
              cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(16, 185, 129, 0.3)'
            }}
          >
            {isLast ? 'Complete Tutorial ✓' : 'Next Step →'}
          </button>
        </div>
      </div>
    </div>
  );
}
