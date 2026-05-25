import { useState, useRef, useEffect } from 'react';
import CroquetCanvas2D, { type Path } from './components/2d/CroquetCanvas2D';
import CroquetCanvas3D from './components/3d/CroquetCanvas3D';
import {
  BALL_RADIUS,
  SCALE,
  EDGING,
  PEG_POS,
  isBallDocked,
  isBallOnLawn,
  stepPhysics,
  BALL_SETS,
} from './physics/CroquetPhysics';

interface Ball {
  id: 'blue' | 'red' | 'yellow' | 'black';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
}

interface ShotFrame {
  id: number;
  activeBallId: 'blue' | 'red' | 'yellow' | 'black';
  angle: number;
  speed: number;
  positions: Record<'blue' | 'red' | 'yellow' | 'black', Ball>;
  trace?: Record<'blue' | 'red' | 'yellow' | 'black', { x: number; y: number }[]>;
  impacts?: number[];
  isAutoEnd?: boolean;
}

// Retro audio synthesizers (zero-dependency Web Audio API)
const playSynthSound = (type: 'mallet' | 'collision' | 'cheer' | 'miss') => {
  try {
    const ctx = new (window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === 'mallet') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(10, now + 0.1);
      gain.gain.setValueAtTime(0.6, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'collision') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.08);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'cheer') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1100, now + 0.12);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.35);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    } else if (type === 'miss') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.linearRampToValueAtTime(65, now + 0.35);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    }
  } catch {
    // browser blocked audio context fallback
  }
};

export default function App() {
  // Master options states
  const [viewMode, setViewMode] = useState<'2d' | '3d' | 'split'>('2d');
  const [ballSet, setBallSet] = useState<'primary' | 'secondary'>('primary');
  const [historyLength, setHistoryLength] = useState(0);

  const handleToggleBallSet = () => {
    const nextSet = ballSet === 'primary' ? 'secondary' : 'primary';
    setBallSet(nextSet);
    setBalls((prev) => ({
      blue: { ...prev.blue, color: BALL_SETS[nextSet].blue.hex },
      red: { ...prev.red, color: BALL_SETS[nextSet].red.hex },
      black: { ...prev.black, color: BALL_SETS[nextSet].black.hex },
      yellow: { ...prev.yellow, color: BALL_SETS[nextSet].yellow.hex },
    }));
  };

  // Master balls state
  const [balls, setBalls] = useState<Record<'blue' | 'red' | 'yellow' | 'black', Ball>>({
    blue: { id: 'blue', x: EDGING + 7 * SCALE, y: EDGING + 7 * SCALE, vx: 0, vy: 0, radius: BALL_RADIUS, color: BALL_SETS.primary.blue.hex },
    red: { id: 'red', x: EDGING + 28 * SCALE, y: EDGING + 7 * SCALE, vx: 0, vy: 0, radius: BALL_RADIUS, color: BALL_SETS.primary.red.hex },
    black: { id: 'black', x: EDGING + 7 * SCALE, y: EDGING + 21 * SCALE, vx: 0, vy: 0, radius: BALL_RADIUS, color: BALL_SETS.primary.black.hex },
    yellow: { id: 'yellow', x: EDGING + 28 * SCALE, y: EDGING + 21 * SCALE, vx: 0, vy: 0, radius: BALL_RADIUS, color: BALL_SETS.primary.yellow.hex },
  });

  // Action / Striker States
  const [selectedBall, setSelectedBall] = useState<'blue' | 'red' | 'yellow' | 'black'>('blue');
  const [activeBallId, setActiveBallId] = useState<'blue' | 'red' | 'yellow' | 'black' | null>(null);
  
  const [angle, setAngle] = useState<number>(0);
  const [speed, setSpeed] = useState<number>(50); // 1% to 200%
  const [zoom, setZoom] = useState<number>(1);
  const [placementMode, setPlacementMode] = useState<boolean>(true);
  const [cleanFeed, setCleanFeed] = useState<boolean>(false);
  const [ghostBallEnabled, setGhostBallEnabled] = useState<boolean>(true);
  
  // Whiteboard drawing states
  const [drawMode, setDrawMode] = useState<boolean>(false);
  const [drawColor, setDrawColor] = useState<string>('#ffffff');
  const [drawStyle, setDrawStyle] = useState<'freehand' | 'straight'>('freehand');
  const [drawings, setDrawings] = useState<Path[]>([]);
  const [currentPath, setCurrentPath] = useState<Path | null>(null);
  
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [targetSpot, setTargetSpot] = useState<{ x: number; y: number } | null>(null);
  
  // Animation/Playback Loop States
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [sequence, setSequence] = useState<ShotFrame[]>([]);
  const [currentShotIndex, setCurrentShotIndex] = useState<number>(0);
  const [isReplaying, setIsReplaying] = useState<boolean>(false);
  const [replayDelay] = useState<number>(1.5);
  
  const [showDrawWarning, setShowDrawWarning] = useState<boolean>(false);

  // 3D Cartoon Striker swing animation parameters
  const [activeStriker, setActiveStriker] = useState<'blue' | 'red' | 'yellow' | 'black' | null>(null);
  const [isStriking, setIsStriking] = useState<boolean>(false);
  const [strikeTarget, setStrikeTarget] = useState<{ x: number; z: number } | null>(null);

  // References to keep standard loops lag-free
  const ballsRef = useRef(balls);
  const activeBallIdRef = useRef(activeBallId);
  const angleRef = useRef(angle);
  const speedRef = useRef(speed);
  const isRecordingRef = useRef(isRecording);
  const sequenceRef = useRef(sequence);

  const animationFrameId = useRef<number | null>(null);
  const historyRef = useRef<Record<'blue' | 'red' | 'yellow' | 'black', Ball>[]>([]);
  const savedStateRef = useRef<Record<'blue' | 'red' | 'yellow' | 'black', Ball> | null>(null);
  
  const touchingPairsRef = useRef<string[]>([]);
  const tracesRef = useRef<Record<'blue' | 'red' | 'yellow' | 'black', { x: number; y: number }[]>>({
    blue: [], red: [], yellow: [], black: []
  });
  const impactsRef = useRef<number[]>([]);

  // Sync references
  useEffect(() => { ballsRef.current = balls; }, [balls]);
  useEffect(() => { activeBallIdRef.current = activeBallId; }, [activeBallId]);
  useEffect(() => { angleRef.current = angle; }, [angle]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { sequenceRef.current = sequence; }, [sequence]);

  const selectedBallRef = useRef(selectedBall);
  useEffect(() => { selectedBallRef.current = selectedBall; }, [selectedBall]);

  const pushToHistory = (state: Record<'blue' | 'red' | 'yellow' | 'black', Ball>) => {
    historyRef.current = [...historyRef.current, JSON.parse(JSON.stringify(state))];
    setHistoryLength(historyRef.current.length);
  };

  const clearHistory = () => {
    historyRef.current = [];
    setHistoryLength(0);
  };

  const popHistory = () => {
    if (historyRef.current.length === 0) return null;
    const last = historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);
    setHistoryLength(historyRef.current.length);
    return last;
  };

  // Handle active ball selection from 2D component
  const handleActiveBallIdChange = (id: 'blue' | 'red' | 'yellow' | 'black' | null) => {
    setActiveBallId(id);
    if (id) {
      setSelectedBall(id);
    }
  };

  // Undo Layout changes
  const handleUndo = () => {
    if (historyLength === 0 || isPlaying || isReplaying) return;
    const lastState = popHistory();
    if (lastState) {
      setBalls(lastState);
    }
    setTargetSpot(null);
    setGhostBallEnabled(false);
  };

  // Reset court to defaults
  const handleReset = () => {
    if (isReplaying) return;
    setIsPlaying(false);
    setActiveBallId(null);
    setTargetSpot(null);
    setDrawings([]);
    setPlacementMode(true);
    setGhostBallEnabled(false);
    clearHistory();
    setSequence([]);
    setCurrentShotIndex(0);
    if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);

    setBalls({
      blue: { id: 'blue', x: EDGING + 7 * SCALE, y: EDGING + 7 * SCALE, vx: 0, vy: 0, radius: BALL_RADIUS, color: BALL_SETS[ballSet].blue.hex },
      red: { id: 'red', x: EDGING + 28 * SCALE, y: EDGING + 7 * SCALE, vx: 0, vy: 0, radius: BALL_RADIUS, color: BALL_SETS[ballSet].red.hex },
      black: { id: 'black', x: EDGING + 7 * SCALE, y: EDGING + 21 * SCALE, vx: 0, vy: 0, radius: BALL_RADIUS, color: BALL_SETS[ballSet].black.hex },
      yellow: { id: 'yellow', x: EDGING + 28 * SCALE, y: EDGING + 21 * SCALE, vx: 0, vy: 0, radius: BALL_RADIUS, color: BALL_SETS[ballSet].yellow.hex },
    });
  };

  // Move all balls to docking bays (far left zone)
  const handleClearLawn = () => {
    if (isPlaying || isReplaying) return;
    pushToHistory(balls);
    setBalls({
      blue: { id: 'blue', x: EDGING * 0.4, y: EDGING + 4 * SCALE, vx: 0, vy: 0, radius: BALL_RADIUS, color: BALL_SETS[ballSet].blue.hex },
      red: { id: 'red', x: EDGING * 0.4, y: EDGING + 10 * SCALE, vx: 0, vy: 0, radius: BALL_RADIUS, color: BALL_SETS[ballSet].red.hex },
      black: { id: 'black', x: EDGING * 0.4, y: EDGING + 16 * SCALE, vx: 0, vy: 0, radius: BALL_RADIUS, color: BALL_SETS[ballSet].black.hex },
      yellow: { id: 'yellow', x: EDGING * 0.4, y: EDGING + 22 * SCALE, vx: 0, vy: 0, radius: BALL_RADIUS, color: BALL_SETS[ballSet].yellow.hex },
    });
  };

  // Playback Animation frame engine
  const animateToFrame = (targetIndex: number) => {
    return new Promise<void>((resolve) => {
      const frame = sequenceRef.current[targetIndex];
      const startState = JSON.parse(JSON.stringify(ballsRef.current));
      const endState = frame.positions;
      const frameTrace = frame.trace;

      if (frameTrace && Object.keys(frameTrace).length > 0) {
        let maxLength = 0;
        Object.values(frameTrace).forEach((arr) => {
          if (arr.length > maxLength) maxLength = arr.length;
        });

        if (maxLength > 0) {
          let currentStep = 0;
          const step = () => {
            if (!isReplaying) {
              resolve();
              return;
            }

            const getBallPos = (id: 'blue' | 'red' | 'yellow' | 'black') => {
              const traceArr = frameTrace[id];
              if (traceArr && traceArr.length > 0) {
                const pt = traceArr[Math.min(currentStep, traceArr.length - 1)];
                return { ...startState[id], x: pt.x, y: pt.y };
              }
              return { ...startState[id] };
            };

            const updatedBalls = {
              blue: getBallPos('blue'),
              red: getBallPos('red'),
              yellow: getBallPos('yellow'),
              black: getBallPos('black'),
            };

            setBalls(updatedBalls);

            if (frame.impacts?.includes(currentStep)) {
              playSynthSound('collision');
            }

            currentStep++;
            if (currentStep < maxLength) {
              animationFrameId.current = requestAnimationFrame(step);
            } else {
              setCurrentShotIndex(targetIndex);
              setActiveBallId(frame.activeBallId);
              setAngle(frame.angle);
              setSpeed(frame.speed);
              resolve();
            }
          };

          animationFrameId.current = requestAnimationFrame(step);
          return;
        }
      }

      // Fallback linear LERP replay
      const startTime = performance.now();
      const duration = 1200;

      const step = (time: number) => {
        const elapsed = time - startTime;
        let progress = elapsed / duration;
        if (progress > 1) progress = 1;

        const lerp = (start: number, end: number) => start + (end - start) * progress;

        const updatedBalls = {
          blue: { ...startState.blue, x: lerp(startState.blue.x, endState.blue.x), y: lerp(startState.blue.y, endState.blue.y) },
          red: { ...startState.red, x: lerp(startState.red.x, endState.red.x), y: lerp(startState.red.y, endState.red.y) },
          yellow: { ...startState.yellow, x: lerp(startState.yellow.x, endState.yellow.x), y: lerp(startState.yellow.y, endState.yellow.y) },
          black: { ...startState.black, x: lerp(startState.black.x, endState.black.x), y: lerp(startState.black.y, endState.black.y) },
        };

        setBalls(updatedBalls);

        if (progress < 1) {
          animationFrameId.current = requestAnimationFrame(step);
        } else {
          setCurrentShotIndex(targetIndex);
          resolve();
        }
      };

      animationFrameId.current = requestAnimationFrame(step);
    });
  };

  const startSequenceReplay = async () => {
    if (sequence.length < 2) return;
    setIsReplaying(true);

    const frame0 = sequence[0];
    setBalls(JSON.parse(JSON.stringify(frame0.positions)));
    setCurrentShotIndex(0);

    for (let i = 1; i < sequence.length; i++) {
      await new Promise((res) => setTimeout(res, replayDelay * 1000));
      await animateToFrame(i);
    }
    setIsReplaying(false);
  };

  const stopSequenceReplay = () => {
    setIsReplaying(false);
    if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
  };

  // Run unified physics frame loop
  const triggerImpact = () => {
    setActiveStriker(null);
    setIsStriking(false);

    // Keep pre-shot backup in history
    pushToHistory(ballsRef.current);

    // Compute standard physics coordinates impulse velocities
    const rad = (angleRef.current * Math.PI) / 180;
    const decel = 0.06;
    const distance = (speedRef.current / 100) * 35 * SCALE;
    const initialSpeed = Math.sqrt(2 * decel * distance);

    const vx = Math.sin(rad) * initialSpeed;
    const vy = -Math.cos(rad) * initialSpeed;

    const modifiedBalls = JSON.parse(JSON.stringify(ballsRef.current));
    modifiedBalls[selectedBall].vx = vx;
    modifiedBalls[selectedBall].vy = vy;

    // Record traces and collision counts
    tracesRef.current = {
      blue: [{ x: modifiedBalls.blue.x, y: modifiedBalls.blue.y }],
      red: [{ x: modifiedBalls.red.x, y: modifiedBalls.red.y }],
      yellow: [{ x: modifiedBalls.yellow.x, y: modifiedBalls.yellow.y }],
      black: [{ x: modifiedBalls.black.x, y: modifiedBalls.black.y }],
    };
    impactsRef.current = [];

    // Calculate initial touching pairs
    const pairs: string[] = [];
    const bs = [modifiedBalls.blue, modifiedBalls.red, modifiedBalls.yellow, modifiedBalls.black];
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const dx = bs[i].x - bs[j].x;
        const dy = bs[i].y - bs[j].y;
        if (
          Math.sqrt(dx * dx + dy * dy) <= 2 * BALL_RADIUS + 0.5 &&
          !isBallDocked(bs[i]) &&
          !isBallDocked(bs[j])
        ) {
          pairs.push(`${bs[i].id}-${bs[j].id}`);
        }
      }
    }
    touchingPairsRef.current = pairs;

    // If recording, set up the initial step frame
    if (isRecordingRef.current && sequenceRef.current.length === 0) {
      setSequence([
        {
          id: Date.now(),
          positions: JSON.parse(JSON.stringify(ballsRef.current)),
          activeBallId: selectedBall,
          angle: angleRef.current,
          speed: speedRef.current,
        },
      ]);
    }

    setBalls(modifiedBalls);
    setTargetSpot(null);
    setIsPlaying(true);
    playSynthSound('mallet');
  };

  // Run the physics step loop
  useEffect(() => {
    if (!isPlaying) return;
    let lastTime: number | null = null;
    let frameCount = 0;

    const loop = (time: number) => {
      if (lastTime === null) {
        lastTime = time;
        animationFrameId.current = requestAnimationFrame(loop);
        return;
      }
      const deltaTime = Math.min((time - lastTime) / 16.67, 5);
      lastTime = time;
      frameCount++;

      const stepBalls = Object.values(JSON.parse(JSON.stringify(ballsRef.current))) as Ball[];
      
      const isMoving = stepPhysics(
        stepBalls,
        touchingPairsRef.current,
        deltaTime,
        {
          onHoopPass: () => playSynthSound('cheer'),
          onCollision: () => {
            playSynthSound('collision');
            if (isRecordingRef.current) {
              impactsRef.current.push(tracesRef.current.blue.length);
            }
          },
        }
      );

      // Reformat to Record
      const nextBalls = {
        blue: stepBalls.find((b) => b.id === 'blue')!,
        red: stepBalls.find((b) => b.id === 'red')!,
        yellow: stepBalls.find((b) => b.id === 'yellow')!,
        black: stepBalls.find((b) => b.id === 'black')!,
      };

      // Push traces every 2 frames
      if (frameCount % 2 === 0) {
        tracesRef.current.blue.push({ x: nextBalls.blue.x, y: nextBalls.blue.y });
        tracesRef.current.red.push({ x: nextBalls.red.x, y: nextBalls.red.y });
        tracesRef.current.yellow.push({ x: nextBalls.yellow.x, y: nextBalls.yellow.y });
        tracesRef.current.black.push({ x: nextBalls.black.x, y: nextBalls.black.y });
      }

      setBalls(nextBalls);

      // End of motion detection
      if (!isMoving && frameCount > 5) {
        setIsPlaying(false);
        playSynthSound('miss');

        // Capture frame at end of shot
        if (isRecordingRef.current) {
          const finalTraces = {
            blue: [...tracesRef.current.blue],
            red: [...tracesRef.current.red],
            yellow: [...tracesRef.current.yellow],
            black: [...tracesRef.current.black],
          };
          const currentImpacts = [...impactsRef.current];

          setSequence((prev) => [
            ...prev,
            {
              id: Date.now(),
              activeBallId: selectedBallRef.current,
              angle: angleRef.current,
              speed: speedRef.current,
              positions: nextBalls,
              trace: finalTraces,
              impacts: currentImpacts,
              isAutoEnd: true,
            },
          ]);
        }
        return;
      }

      animationFrameId.current = requestAnimationFrame(loop);
    };

    animationFrameId.current = requestAnimationFrame(loop);
    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, [isPlaying]);

  // Hook striking sequences
  const handlePlayShot = () => {
    if (isPlaying || isReplaying) return;
    const striker = balls[selectedBall];
    if (!isBallOnLawn(striker)) return;

    if (viewMode === '3d' || viewMode === 'split') {
      // In 3D: set striker animation
      const rad = (angle * Math.PI) / 180;
      const dx = Math.sin(rad);
      const dy = -Math.cos(rad);
      const strikeDist = (speed / 100) * 35 * SCALE;

      // 3D coordinate target
      setStrikeTarget({
        x: (striker.y + dy * strikeDist - PEG_POS.y) / SCALE,
        z: (striker.x + dx * strikeDist - PEG_POS.x) / SCALE,
      });

      setActiveStriker(selectedBall);
      setIsStriking(true);
    } else {
      // In 2D: play immediately
      triggerImpact();
    }
  };

  // Sync positions change from sub-components
  const handleBallsChange = (updatedBalls: Record<'blue' | 'red' | 'yellow' | 'black', Ball>) => {
    // Keep history record on start of dragging
    if (!savedStateRef.current) {
      savedStateRef.current = JSON.parse(JSON.stringify(balls));
    }
    setBalls(updatedBalls);
  };

  // Track finished dragging
  useEffect(() => {
    const handleMouseUp = () => {
      if (savedStateRef.current) {
        const moved =
          balls.blue.x !== savedStateRef.current.blue.x ||
          balls.blue.y !== savedStateRef.current.blue.y ||
          balls.red.x !== savedStateRef.current.red.x ||
          balls.red.y !== savedStateRef.current.red.y ||
          balls.yellow.x !== savedStateRef.current.yellow.x ||
          balls.yellow.y !== savedStateRef.current.yellow.y ||
          balls.black.x !== savedStateRef.current.black.x ||
          balls.black.y !== savedStateRef.current.black.y;

        if (moved) {
          pushToHistory(savedStateRef.current);
        }
        savedStateRef.current = null;
      }
    };
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchend', handleMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [balls]);

  // JSON Save/Load layout
  const handleSavePosition = () => {
    const data = JSON.stringify(balls);
    localStorage.setItem('croquet_studio_layout', data);
    alert('Layout saved successfully!');
  };

  const handleLoadPosition = () => {
    const data = localStorage.getItem('croquet_studio_layout');
    if (data) {
      pushToHistory(balls);
      setBalls(JSON.parse(data));
    } else {
      alert('No saved layout found.');
    }
  };

  // Import/Export Sequences
  const handleExportSequence = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(sequence));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `sequence_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportSequence = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const loaded = JSON.parse(event.target?.result as string);
        if (Array.isArray(loaded)) {
          setSequence(loaded);
          setCurrentShotIndex(0);
          setIsRecording(false);
          setDrawings([]);
          clearHistory();
        }
      } catch {
        alert('Failed to parse sequence JSON.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, position: 'relative', overflow: 'hidden' }}>
      
      {/* 2D Warning Toast */}
      {showDrawWarning && (
        <div className="warning-toast">
          Please avoid drawing directly over croquet balls!
        </div>
      )}

      {/* Sleek Glassmorphic Header view toggle */}
      <div className="unified-header">
        <span className="brand-title">Croquet Studio</span>
        <div className="view-mode-tabs">
          <button
            className={`view-tab ${viewMode === '2d' ? 'active' : ''}`}
            onClick={() => setViewMode('2d')}
          >
            2D Canvas
          </button>
          <button
            className={`view-tab ${viewMode === '3d' ? 'active' : ''}`}
            onClick={() => setViewMode('3d')}
          >
            3D Simulation
          </button>
          <button
            className={`view-tab ${viewMode === 'split' ? 'active' : ''}`}
            onClick={() => setViewMode('split')}
          >
            Split Screen
          </button>
        </div>
      </div>

      {/* Main viewport area */}
      <div className="view-main-container">
        {(viewMode === '2d' || viewMode === 'split') && (
          <div className="viewport-half">
            <CroquetCanvas2D
              balls={balls}
              activeBallId={activeBallId}
              selectedBall={selectedBall}
              targetSpot={targetSpot}
              angle={angle}
              speed={speed}
              zoom={zoom}
              placementMode={placementMode}
              drawMode={drawMode}
              cleanFeed={cleanFeed}
              ghostBallEnabled={ghostBallEnabled}
              drawColor={drawColor}
              drawStyle={drawStyle}
              drawings={drawings}
              currentPath={currentPath}
              hoverPos={hoverPos}
              ballSet={ballSet}
              onBallsChange={handleBallsChange}
              onActiveBallIdChange={handleActiveBallIdChange}
              onTargetSpotChange={setTargetSpot}
              onAngleChange={setAngle}
              onSpeedChange={setSpeed}
              onDrawingsChange={setDrawings}
              onCurrentPathChange={setCurrentPath}
              onHoverPosChange={setHoverPos}
              onDrawWarningTrigger={() => {
                setShowDrawWarning(true);
                setTimeout(() => setShowDrawWarning(false), 2500);
              }}
              isPlaying={isPlaying || isReplaying}
            />
          </div>
        )}

        {(viewMode === '3d' || viewMode === 'split') && (
          <div className="viewport-half">
            <CroquetCanvas3D
              balls={balls}
              selectedBall={selectedBall}
              angle={angle}
              speed={speed}
              drawings={drawings}
              currentPath={currentPath}
              cleanFeed={cleanFeed}
              ghostBallEnabled={ghostBallEnabled}
              isPlaying={isPlaying || isReplaying}
              ballSet={ballSet}
              onSelectedBallChange={setSelectedBall}
              onBallsChange={handleBallsChange}
              placementMode={placementMode}
              onAngleChange={setAngle}
              onSpeedChange={setSpeed}
              onTargetSpotChange={setTargetSpot}
              activeStriker={activeStriker}
              isStriking={isStriking}
              strikeTarget={strikeTarget}
              onImpact={triggerImpact}
              onFinished={() => {
                setActiveStriker(null);
                setIsStriking(false);
              }}
            />
          </div>
        )}
      </div>

      {/* Floating Control Panel Sidebar */}
      {!cleanFeed && (
        <div className="unified-sidebar">
          
          {/* Section: Striker Ball & Sets */}
          <div className="sidebar-section">
            <h3 className="section-title">Active Striker</h3>
            <div className="ball-selector-strip">
              {(['blue', 'red', 'black', 'yellow'] as const).map((id) => (
                <button
                  key={id}
                  className={`ball-selector-item ${selectedBall === id ? 'selected' : ''} ${
                    isBallDocked(balls[id]) ? 'docked' : ''
                  }`}
                  style={{
                    backgroundColor: BALL_SETS[ballSet][id].hex,
                    color: BALL_SETS[ballSet][id].ui,
                  }}
                  onClick={() => {
                    if (!isPlaying && !isReplaying) {
                      setSelectedBall(id);
                      setActiveBallId(id);
                    }
                  }}
                  title={`Select ${BALL_SETS[ballSet][id].name} Ball`}
                />
              ))}
            </div>
            
            <div className="option-toggle" onClick={handleToggleBallSet}>
              <span className="option-toggle-label">Secondary Ball Set</span>
              <div className={`toggle-switch ${ballSet === 'secondary' ? 'active' : ''}`}>
                <div className="toggle-knob" />
              </div>
            </div>
          </div>

          {/* Section: Aiming Vector */}
          <div className="sidebar-section">
            <h3 className="section-title">Shot Vector</h3>
            
            <div className="control-row">
              <div className="control-label-row">
                <span>Aiming Angle</span>
                <span className="control-value">{Math.round(angle)}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="360"
                value={angle}
                onChange={(e) => setAngle(parseFloat(e.target.value))}
                className="custom-range-slider"
                disabled={isPlaying || isReplaying}
              />
            </div>

            <div className="control-row">
              <div className="control-label-row">
                <span>Strike Force</span>
                <span className="control-value">{Math.round(speed)}%</span>
              </div>
              <input
                type="range"
                min="1"
                max="200"
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="custom-range-slider"
                disabled={isPlaying || isReplaying}
              />
            </div>

            {viewMode === '2d' && (
              <div className="control-row">
                <div className="control-label-row">
                  <span>2D Lawn Zoom</span>
                  <span className="control-value">{Math.round(zoom * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.5"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="custom-range-slider"
                />
              </div>
            )}

            <div className="option-toggle" onClick={() => setPlacementMode(prev => !prev)}>
              <span className="option-toggle-label">Drag / Placement Mode</span>
              <div className={`toggle-switch ${placementMode ? 'active' : ''}`}>
                <div className="toggle-knob" />
              </div>
            </div>
          </div>

          {/* Section: Interactive Whiteboard */}
          <div className="sidebar-section">
            <h3 className="section-title">Interactive Whiteboard</h3>
            
            <div className="option-toggle" onClick={() => setDrawMode(prev => !prev)}>
              <span className="option-toggle-label">Pencil Sketch Tool</span>
              <div className={`toggle-switch ${drawMode ? 'active' : ''}`}>
                <div className="toggle-knob" />
              </div>
            </div>

            {drawMode && (
              <>
                <div className="control-row">
                  <div className="control-label-row">
                    <span>Sketch Style</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <button
                      className={`btn-secondary ${drawStyle === 'freehand' ? 'active' : ''}`}
                      style={{ flex: 1, borderColor: drawStyle === 'freehand' ? '#ffd700' : 'transparent' }}
                      onClick={() => setDrawStyle('freehand')}
                    >
                      Freehand
                    </button>
                    <button
                      className={`btn-secondary ${drawStyle === 'straight' ? 'active' : ''}`}
                      style={{ flex: 1, borderColor: drawStyle === 'straight' ? '#ffd700' : 'transparent' }}
                      onClick={() => setDrawStyle('straight')}
                    >
                      Straight Line
                    </button>
                  </div>
                </div>

                <div className="control-row">
                  <div className="control-label-row">
                    <span>Pencil Color</span>
                  </div>
                  <div className="color-picker-strip">
                    {['#ffffff', '#fde047', '#ef4444', '#3b82f6', '#22c55e'].map((col) => (
                      <button
                        key={col}
                        className={`color-picker-dot ${drawColor === col ? 'active' : ''}`}
                        style={{ backgroundColor: col, color: col }}
                        onClick={() => setDrawColor(col)}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}

            <button className="btn-secondary" onClick={() => setDrawings([])} disabled={drawings.length === 0}>
              Clear Whiteboard Drawings
            </button>
          </div>

          {/* Section: Predictions & Views */}
          <div className="sidebar-section">
            <h3 className="section-title">Overlay Forecasts</h3>
            
            <div className="option-toggle" onClick={() => setGhostBallEnabled(prev => !prev)}>
              <span className="option-toggle-label">Collision Projection Ghost</span>
              <div className={`toggle-switch ${ghostBallEnabled ? 'active' : ''}`}>
                <div className="toggle-knob" />
              </div>
            </div>

            <div className="option-toggle" onClick={() => setCleanFeed(prev => !prev)}>
              <span className="option-toggle-label">Clean Broadcast Feed</span>
              <div className={`toggle-switch ${cleanFeed ? 'active' : ''}`}>
                <div className="toggle-knob" />
              </div>
            </div>
          </div>

          {/* Section: Unified Action Trigger */}
          <div className="sidebar-section">
            <h3 className="section-title">Match Control</h3>
            <div className="actions-grid">
              <button
                className="btn-primary"
                onClick={handlePlayShot}
                disabled={isPlaying || isReplaying || !isBallOnLawn(balls[selectedBall])}
              >
                Strike Mallet
              </button>
              
              <button className="btn-secondary" onClick={handleUndo} disabled={historyLength === 0 || isPlaying || isReplaying}>
                Undo Move
              </button>
              <button className="btn-secondary" onClick={handleReset} disabled={isPlaying || isReplaying}>
                Full Reset
              </button>
              
              <button className="btn-secondary" onClick={handleClearLawn} disabled={isPlaying || isReplaying}>
                Clear Lawn
              </button>
              <button className="btn-secondary" onClick={handleSavePosition} disabled={isPlaying || isReplaying}>
                Save Layout
              </button>
              <button className="btn-secondary" onClick={handleLoadPosition} disabled={isPlaying || isReplaying} style={{ gridColumn: 'span 2' }}>
                Load Layout
              </button>
            </div>
          </div>

          {/* Section: Sequence Recorder */}
          <div className="sidebar-section">
            <h3 className="section-title">Sequence Recorder</h3>
            <div className="option-toggle" onClick={() => setIsRecording(prev => !prev)}>
              <span className="option-toggle-label">Record Shot Actions</span>
              <div className={`toggle-switch ${isRecording ? 'active' : ''}`}>
                <div className="toggle-knob" />
              </div>
            </div>

            {sequence.length > 0 && (
              <div className="sequence-scroller">
                {sequence.map((frame, idx) => (
                  <div
                    key={frame.id}
                    className={`sequence-item ${currentShotIndex === idx ? 'active' : ''}`}
                    onClick={() => {
                      if (!isPlaying && !isReplaying) {
                        setCurrentShotIndex(idx);
                        setBalls(JSON.parse(JSON.stringify(frame.positions)));
                        setActiveBallId(frame.activeBallId);
                        setAngle(frame.angle);
                        setSpeed(frame.speed);
                      }
                    }}
                  >
                    <div>
                      <span className="sequence-index">#{idx + 1}</span>
                      <span className="sequence-details">
                        {frame.activeBallId.toUpperCase()} • {Math.round(frame.angle)}° • {Math.round(frame.speed)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="actions-grid">
              <button
                className="btn-secondary"
                onClick={startSequenceReplay}
                disabled={sequence.length < 2 || isPlaying || isReplaying}
              >
                Replay All
              </button>
              <button
                className="btn-secondary"
                onClick={stopSequenceReplay}
                disabled={!isReplaying}
              >
                Stop Replay
              </button>
              
              <button
                className="btn-secondary"
                onClick={handleExportSequence}
                disabled={sequence.length === 0 || isPlaying || isReplaying}
              >
                Export JSON
              </button>
              
              <button
                className="btn-secondary"
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.json';
                  input.onchange = (e) => handleImportSequence(e as unknown as React.ChangeEvent<HTMLInputElement>);
                  input.click();
                }}
                disabled={isPlaying || isReplaying}
              >
                Import JSON
              </button>
              
              <button
                className="btn-secondary"
                onClick={() => {
                  setSequence([]);
                  setCurrentShotIndex(0);
                }}
                disabled={sequence.length === 0 || isPlaying || isReplaying}
                style={{ gridColumn: 'span 2' }}
              >
                Clear Sequence
              </button>
            </div>
          </div>

        </div>
      )}

      {/* Floating broadcast feed indicator */}
      {cleanFeed && (
        <button
          className="btn-secondary"
          style={{ position: 'absolute', bottom: '16px', right: '16px', zIndex: 120, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)' }}
          onClick={() => setCleanFeed(false)}
        >
          Exit Broadcast Mode
        </button>
      )}

    </div>
  );
}
