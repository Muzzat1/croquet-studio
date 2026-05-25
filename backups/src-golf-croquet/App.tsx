/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { SphericalController } from './components/SphericalController';
import { HelpScreen, ToolButton } from './components/UIComponents';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, RotateCcw, Search, MousePointer2, Maximize2, Minimize2, HelpCircle, X, Eye, Clapperboard, ChevronLeft, ChevronRight, Save, FolderUp, Trash2, MonitorPlay, Camera, ZoomIn, ZoomOut, Pencil, Eraser, Settings, Undo2, Minus, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Point { x: number; y: number; }
type Path = { points: Point[], color: string, type: 'freehand' | 'straight' };
interface Ball { x: number; y: number; vx: number; vy: number; radius: number; color: string; id: 'blue' | 'red' | 'yellow' | 'black'; }
interface RecordedShot { id: number; activeBallId: 'blue' | 'red' | 'yellow' | 'black'; angle: number; speed: number; positions: { blue: Ball; red: Ball; yellow: Ball; black: Ball; }; trace?: Record<'blue' | 'red' | 'yellow' | 'black', Point[]>; impacts?: number[]; isAutoEnd?: boolean; }

const BALL_RADIUS = 1.5;
const DISPLAY_RADIUS = 6;
const SCALE = 22;
const EDGING = 1.5 * SCALE;

const FIELD_WIDTH = 35 * SCALE + 2 * EDGING;
const FIELD_HEIGHT = 28 * SCALE + 2 * EDGING;

const ZOOM_LEVELS = [1, 1.5, 2.5];

// Perfectly aligned Reset Positions based on left edging center
const RESET_X = EDGING / 2;
const BOTTOM_CORNER_Y = FIELD_HEIGHT - EDGING;
const SPACING = DISPLAY_RADIUS * 4.5;

const INITIAL_YELLOW_POS = { x: RESET_X, y: BOTTOM_CORNER_Y - SPACING * 4 };
const INITIAL_BLACK_POS = { x: RESET_X, y: BOTTOM_CORNER_Y - SPACING * 3 };
const INITIAL_RED_POS = { x: RESET_X, y: BOTTOM_CORNER_Y - SPACING * 2 };
const INITIAL_BLUE_POS = { x: RESET_X, y: BOTTOM_CORNER_Y - SPACING * 1 };

// Mathematically constrained hoop dimensions based on 3 3/4" gap
const HOOP_WIDTH = 16.41;
const PEG_RADIUS = 3;

const HOOPS = [
  { id: 1, x: EDGING + 7 * SCALE, y: EDGING + 7 * SCALE, label: '1', topColor: '#2563eb' },
  { id: 2, x: EDGING + 28 * SCALE, y: EDGING + 7 * SCALE, label: '2' },
  { id: 3, x: EDGING + 28 * SCALE, y: EDGING + 21 * SCALE, label: '3', topColor: '#dc2626' },
  { id: 4, x: EDGING + 7 * SCALE, y: EDGING + 21 * SCALE, label: '4' },
  { id: 5, x: EDGING + 10.5 * SCALE, y: EDGING + 14 * SCALE, label: '5' },
  { id: 6, x: EDGING + 24.5 * SCALE, y: EDGING + 14 * SCALE, label: '6' },
];
const PEG_POS = { x: EDGING + 17.5 * SCALE, y: EDGING + 14 * SCALE };

const SOUNDS = {
  mallet: 'https://cdn.freesound.org/previews/108/108615_1159841-lq.mp3', collision: 'https://cdn.freesound.org/previews/108/108615_1159841-lq.mp3',
  cheer: 'https://cdn.freesound.org/previews/337/337000_5121236-lq.mp3', miss: 'https://cdn.freesound.org/previews/175/175409_3235613-lq.mp3'
};
const playSound = (url: string, volume = 0.5) => { const audio = new Audio(url); audio.volume = volume; audio.play().catch(() => { }); };

const BALL_SETS = {
  primary: {
    blue: { hex: '#1e3a8a', label: 'BLU', name: 'Blue', ui: '#3b82f6' },
    black: { hex: '#18181b', label: 'BLK', name: 'Black', ui: '#e4e4e7' },
    red: { hex: '#991b1b', label: 'RED', name: 'Red', ui: '#ef4444' },
    yellow: { hex: '#fbbf24', label: 'YEL', name: 'Yellow', ui: '#fde047' }
  },
  secondary: {
    blue: { hex: '#22c55e', label: 'GRN', name: 'Green', ui: '#4ade80' },
    black: { hex: '#5c4033', label: 'BRN', name: 'Brown', ui: '#f59e0b' },
    red: { hex: '#f472b6', label: 'PNK', name: 'Pink', ui: '#fbcfe8' },
    yellow: { hex: '#f8fafc', label: 'WHT', name: 'White', ui: '#ffffff' }
  }
};
const getActiveColor = (id: string | null, currentSet: 'primary' | 'secondary') => {
  if (!id) return '#fbbf24'; return BALL_SETS[currentSet][id as keyof typeof BALL_SETS['primary']].ui;
};


export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null); const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportDims, setViewportDims] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!viewportRef.current) return;
    const obs = new ResizeObserver(entries => {
      setViewportDims({ w: entries[0].contentRect.width, h: entries[0].contentRect.height });
    });
    obs.observe(viewportRef.current);
    return () => obs.disconnect();
  }, []);

  const getCanvasStyle = () => {
    if (zoom !== 1 || viewportDims.w === 0) return { position: 'relative' as any, width: `${FIELD_WIDTH * zoom}px`, height: `${FIELD_HEIGHT * zoom}px` };
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const safeW = viewportDims.w - (isMobile ? 12 : 32);
    const safeH = viewportDims.h - (isMobile ? 12 : 32);
    const ratio = FIELD_WIDTH / FIELD_HEIGHT;
    let targetW = safeW; let targetH = targetW / ratio;
    if (targetH > safeH) { targetH = safeH; targetW = targetH * ratio; }
    return { position: 'relative' as any, width: `${targetW}px`, height: `${targetH}px` };
  };

  const [showMobilePrompt, setShowMobilePrompt] = useState(false);

  const [showOptions, setShowOptions] = useState(false); const [ballSet, setBallSet] = useState<'primary' | 'secondary'>('primary');
  const [features, setFeatures] = useState({ recording: false, draw: false, zoom: false });
  const [zoom, setZoom] = useState(1); const lastPanRef = useRef({ x: 0, y: 0, scrollL: 0, scrollT: 0 });
  const [angle, setAngle] = useState(315); const [speed, setSpeed] = useState(100);
  const [placementMode, setPlacementMode] = useState(true); const [drawMode, setDrawMode] = useState(false);

  const [drawWarning, setDrawWarning] = useState(false);

  const [targetSpot, setTargetSpot] = useState<{ x: number; y: number } | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeBallId, setActiveBallId] = useState<'blue' | 'red' | 'yellow' | 'black' | null>(null);
  const [showInstruction, setShowInstruction] = useState(true);
  const [ghostBallEnabled, setGhostBallEnabled] = useState(false);
  const [draggingItem, setDraggingItem] = useState<'blue' | 'red' | 'yellow' | 'black' | 'ghost' | 'pan' | 'draw' | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHelp, setShowHelp] = useState(false); const [cleanFeed, setCleanFeed] = useState(false);
  const [drawings, setDrawings] = useState<Path[]>([]); const [currentPath, setCurrentPath] = useState<Path | null>(null);
  const [drawStyle, setDrawStyle] = useState<'freehand' | 'straight'>('freehand');
  const [drawColor, setDrawColor] = useState<string>('#ffffff'); // Default fallback

  // Animation & Replay State
  const [isRecording, setIsRecording] = useState(false);
  const [sequence, setSequence] = useState<RecordedShot[]>([]);
  const [currentShotIndex, setCurrentShotIndex] = useState(0);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayDelay] = useState(1); // 1, 2, or 3 seconds

  const sequenceRef = useRef(sequence);
  useEffect(() => { sequenceRef.current = sequence; }, [sequence]);

  const replayRef = useRef<{ active: boolean, timeoutId: any, animId: any, isAutoReplaying: boolean }>({ active: false, timeoutId: null, animId: null, isAutoReplaying: false });

  const [history, setHistory] = useState<{ blue: Ball, red: Ball, y: Ball, b: Ball }[]>([]);
  const saveStateRef = useRef<{ blue: Ball, red: Ball, y: Ball, b: Ball } | null>(null);
  const ballsRef = useRef<{ blue: Ball, red: Ball, y: Ball, b: Ball } | null>(null);
  const touchingPairsRef = useRef<string[]>([]);
  const tracesRef = useRef<Record<'blue' | 'red' | 'yellow' | 'black', Point[]>>({ blue: [], red: [], yellow: [], black: [] });
  const impactsRef = useRef<number[]>([]);

  const [blue, setBlue] = useState<Ball>({ ...INITIAL_BLUE_POS, vx: 0, vy: 0, radius: BALL_RADIUS, color: BALL_SETS.primary.blue.hex, id: 'blue' });
  const [red, setRed] = useState<Ball>({ ...INITIAL_RED_POS, vx: 0, vy: 0, radius: BALL_RADIUS, color: BALL_SETS.primary.red.hex, id: 'red' });
  const [yellow, setYellow] = useState<Ball>({ ...INITIAL_YELLOW_POS, vx: 0, vy: 0, radius: BALL_RADIUS, color: BALL_SETS.primary.yellow.hex, id: 'yellow' });
  const [black, setBlack] = useState<Ball>({ ...INITIAL_BLACK_POS, vx: 0, vy: 0, radius: BALL_RADIUS, color: BALL_SETS.primary.black.hex, id: 'black' });

  // A ball is considered "docked" if it resides in the far left edging.
  const isBallDocked = (ball: Ball) => ball.x < EDGING * 0.8;
  const allBallsDocked = isBallDocked(blue) && isBallDocked(red) && isBallDocked(yellow) && isBallDocked(black);

  const blueRef = useRef<Ball>(blue); const redRef = useRef<Ball>(red); const yellowRef = useRef<Ball>(yellow); const blackRef = useRef<Ball>(black);

  useEffect(() => {
    ballsRef.current = { blue, red, y: yellow, b: black };
    if (!isPlaying) {
      blueRef.current = blue;
      redRef.current = red;
      yellowRef.current = yellow;
      blackRef.current = black;
    }
  }, [blue, red, yellow, black, isPlaying]);

  useEffect(() => {
    setBlue(prev => ({ ...prev, color: BALL_SETS[ballSet].blue.hex })); setRed(prev => ({ ...prev, color: BALL_SETS[ballSet].red.hex }));
    setBlack(prev => ({ ...prev, color: BALL_SETS[ballSet].black.hex })); setYellow(prev => ({ ...prev, color: BALL_SETS[ballSet].yellow.hex }));
  }, [ballSet]);

  useEffect(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
      setShowMobilePrompt(true);
    }
  }, []);

  const handleZoomChange = (newZoom: number) => {
    if (!viewportRef.current || newZoom === zoom) return; const viewport = viewportRef.current;
    const centerX = viewport.scrollLeft + viewport.clientWidth / 2; const centerY = viewport.scrollTop + viewport.clientHeight / 2; const zoomRatio = newZoom / zoom;
    setZoom(newZoom); setTimeout(() => { if (viewportRef.current) { viewportRef.current.scrollLeft = centerX * zoomRatio - viewportRef.current.clientWidth / 2; viewportRef.current.scrollTop = centerY * zoomRatio - viewportRef.current.clientHeight / 2; } }, 0);
  };

  const stateRefs = useRef({ activeBallId, angle, speed, isRecording });
  useEffect(() => { stateRefs.current = { activeBallId, angle, speed, isRecording }; }, [activeBallId, angle, speed, isRecording]);

  const handleCaptureFrame = () => {
    setSequence(prev => {
      const newSeq = [...prev, { id: Date.now() + Math.random(), activeBallId: stateRefs.current.activeBallId || 'blue', angle: stateRefs.current.angle, speed: stateRefs.current.speed, positions: { blue: { ...blueRef.current, vx: 0, vy: 0 }, red: { ...redRef.current, vx: 0, vy: 0 }, yellow: { ...yellowRef.current, vx: 0, vy: 0 }, black: { ...blackRef.current, vx: 0, vy: 0 } } }];
      setCurrentShotIndex(newSeq.length - 1); return newSeq;
    });
  };

  const wasPlayingRef = useRef(isPlaying);
  useEffect(() => { 
    if (wasPlayingRef.current && !isPlaying && stateRefs.current.isRecording) {
      const positionsCopy = { blue: { ...blueRef.current, vx: 0, vy: 0 }, red: { ...redRef.current, vx: 0, vy: 0 }, yellow: { ...yellowRef.current, vx: 0, vy: 0 }, black: { ...blackRef.current, vx: 0, vy: 0 } };
        
      const finalTraces = {} as Record<'blue' | 'red' | 'yellow' | 'black', Point[]>;
      (['blue', 'red', 'yellow', 'black'] as const).forEach(id => { 
          finalTraces[id] = [...(tracesRef.current[id] || [])]; 
          if (finalTraces[id].length > 0) {
              const lastPoint = finalTraces[id][finalTraces[id].length - 1];
              if (lastPoint.x !== positionsCopy[id].x || lastPoint.y !== positionsCopy[id].y) {
                  finalTraces[id].push({ x: positionsCopy[id].x, y: positionsCopy[id].y });
              }
          }
      });
      
      const currentImpacts = [...impactsRef.current];

      setSequence(prev => {
        const newSeq = [...prev, { 
            id: Date.now() + Math.random(), 
            activeBallId: stateRefs.current.activeBallId || 'blue', 
            angle: stateRefs.current.angle, 
            speed: stateRefs.current.speed, 
            positions: positionsCopy, 
            trace: finalTraces, 
            impacts: currentImpacts,
            isAutoEnd: true 
        }];
        setCurrentShotIndex(newSeq.length - 1); 
        return newSeq;
      });
      impactsRef.current = [];
    }
    wasPlayingRef.current = isPlaying; 
  }, [isPlaying]);

  useEffect(() => {
    if (placementMode && targetSpot && activeBallId && !isPlaying) {
      const activeBall = activeBallId === 'blue' ? blue : activeBallId === 'red' ? red : activeBallId === 'yellow' ? yellow : black;
      const dx = targetSpot.x - activeBall.x; const dy = targetSpot.y - activeBall.y; const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) { setAngle((Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360); setSpeed((dist / (35 * SCALE)) * 100); }
    }
  }, [placementMode, targetSpot, blue.x, blue.y, red.x, red.y, yellow.x, yellow.y, black.x, black.y, activeBallId, isPlaying]);

  const animationRef = useRef<number>(null);

  const isBallOnLawn = (ball: Ball) => { return ball.x >= EDGING && ball.x <= FIELD_WIDTH - EDGING && ball.y >= EDGING && ball.y <= FIELD_HEIGHT - EDGING; };

  const handleUndo = () => {
    if (history.length === 0 || isPlaying || isReplaying) return;
    const lastState = history[history.length - 1];
    setBlue(lastState.blue); setRed(lastState.red); setYellow(lastState.y); setBlack(lastState.b);
    setHistory(prev => prev.slice(0, -1)); setTargetSpot(null); setPlacementMode(true); setGhostBallEnabled(false);
    setDrawMode(false);
    setDrawWarning(false);
  };

  const resetPositions = useCallback(() => {
    if (isReplaying) return;
    setIsPlaying(false); setShowInstruction(true); setActiveBallId(null); setTargetSpot(null); setDrawings([]); setZoom(1); setPlacementMode(true); setHistory([]);
    setDrawMode(false); setDrawWarning(false);
    setSequence([]); setCurrentShotIndex(0);
    setGhostBallEnabled(false);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    setBlue({ ...INITIAL_BLUE_POS, vx: 0, vy: 0, radius: BALL_RADIUS, color: BALL_SETS[ballSet].blue.hex, id: 'blue' });
    setRed({ ...INITIAL_RED_POS, vx: 0, vy: 0, radius: BALL_RADIUS, color: BALL_SETS[ballSet].red.hex, id: 'red' });
    setYellow({ ...INITIAL_YELLOW_POS, vx: 0, vy: 0, radius: BALL_RADIUS, color: BALL_SETS[ballSet].yellow.hex, id: 'yellow' });
    setBlack({ ...INITIAL_BLACK_POS, vx: 0, vy: 0, radius: BALL_RADIUS, color: BALL_SETS[ballSet].black.hex, id: 'black' });
  }, [ballSet, isReplaying]);

  // Animation Engine for Sequence Replay
  const animateToFrame = (targetIndex: number) => {
    return new Promise<void>((resolve) => {
      const startState = { blue: { ...blueRef.current }, red: { ...redRef.current }, y: { ...yellowRef.current }, b: { ...blackRef.current } };
      const endState = sequenceRef.current[targetIndex].positions;
      const frameTrace = sequenceRef.current[targetIndex].trace;
      if (frameTrace && Object.keys(frameTrace).length > 0) {
        let maxLength = 0;
        Object.values(frameTrace).forEach((arr) => { if (arr.length > maxLength) maxLength = arr.length; });
        if (maxLength > 0) {
          let currentStep = 0;
          const step = () => {
            if (!replayRef.current.active && replayRef.current.isAutoReplaying) { resolve(); return; }
            
            const getBallPos = (id: 'blue' | 'red' | 'yellow' | 'black', start: Ball) => {
              const traceArr = frameTrace[id];
              if (traceArr && traceArr.length > 0) {
                const pt = traceArr[Math.min(currentStep, traceArr.length - 1)];
                return { ...start, x: pt.x, y: pt.y };
              }
              return { ...start };
            };

            const nextS = getBallPos('blue', startState.blue);
            const nextT = getBallPos('red', startState.red);
            const nextY = getBallPos('yellow', startState.y);
            const nextB = getBallPos('black', startState.b);

            blueRef.current = nextS; redRef.current = nextT; yellowRef.current = nextY; blackRef.current = nextB;
            setBlue(nextS); setRed(nextT); setYellow(nextY); setBlack(nextB);

            if (sequenceRef.current[targetIndex].impacts?.includes(currentStep)) {
              playSound(SOUNDS.collision, 0.3);
            }

            currentStep += 1;
            if (currentStep < maxLength) {
              replayRef.current.animId = requestAnimationFrame(step);
            } else {
              setCurrentShotIndex(targetIndex);
              setActiveBallId(sequenceRef.current[targetIndex].activeBallId);
              setAngle(sequenceRef.current[targetIndex].angle);
              setSpeed(sequenceRef.current[targetIndex].speed);
              resolve();
            }
          };
          replayRef.current.animId = requestAnimationFrame(step);
          return;
        }
      }

      // Calculate the maximum distance any ball travels to make the speed proportional and realistic
      const distS = Math.sqrt((endState.blue.x - startState.blue.x) ** 2 + (endState.blue.y - startState.blue.y) ** 2);
      const distT = Math.sqrt((endState.red.x - startState.red.x) ** 2 + (endState.red.y - startState.red.y) ** 2);
      const distY = Math.sqrt((endState.yellow.x - startState.y.x) ** 2 + (endState.yellow.y - startState.y.y) ** 2);
      const distB = Math.sqrt((endState.black.x - startState.b.x) ** 2 + (endState.black.y - startState.b.y) ** 2);
      const maxDist = Math.max(distS, distT, distY, distB, 1);

      // Full court is roughly 35 * SCALE (~770 units). 
      // Set duration proportional to distance: full court takes ~2500ms, minimum duration 400ms
      const duration = Math.max(400, (maxDist / (35 * SCALE)) * 2500);

      const startTime = performance.now();

      const step = (time: number) => {
        if (!replayRef.current.active && replayRef.current.isAutoReplaying) {
          resolve(); return;
        }
        const elapsed = time - startTime;
        let progress = elapsed / duration;
        if (progress > 1) progress = 1;

        const lerp = (start: number, end: number) => start + (end - start) * progress;

        const nextS = { ...startState.blue, x: lerp(startState.blue.x, endState.blue.x), y: lerp(startState.blue.y, endState.blue.y) };
        const nextT = { ...startState.red, x: lerp(startState.red.x, endState.red.x), y: lerp(startState.red.y, endState.red.y) };
        const nextY = { ...startState.y, x: lerp(startState.y.x, endState.yellow.x), y: lerp(startState.y.y, endState.yellow.y) };
        const nextB = { ...startState.b, x: lerp(startState.b.x, endState.black.x), y: lerp(startState.b.y, endState.black.y) };

        blueRef.current = nextS; redRef.current = nextT; yellowRef.current = nextY; blackRef.current = nextB;
        setBlue(nextS); setRed(nextT); setYellow(nextY); setBlack(nextB);

        if (progress < 1) {
          replayRef.current.animId = requestAnimationFrame(step);
        } else {
          setCurrentShotIndex(targetIndex);
          setActiveBallId(sequenceRef.current[targetIndex].activeBallId);
          setAngle(sequenceRef.current[targetIndex].angle);
          setSpeed(sequenceRef.current[targetIndex].speed);
          resolve();
        }
      };
      replayRef.current.animId = requestAnimationFrame(step);
    });
  };

  const goToFrame = async (index: number) => {
    if (index < 0 || index >= sequence.length || isPlaying || isReplaying) return;
    replayRef.current.active = true;
    replayRef.current.isAutoReplaying = false;
    setTargetSpot(null); setDrawings([]); setHistory([]);
    await animateToFrame(index);
    replayRef.current.active = false;
  };

  const startSequenceReplay = async () => {
    if (sequence.length < 2) return;
    setIsReplaying(true);
    replayRef.current.active = true;
    replayRef.current.isAutoReplaying = true;

    setTargetSpot(null); setDrawings([]); setHistory([]);

    // Non-animated snap to first frame
    const frame0 = sequenceRef.current[0];
    setBlue({ ...frame0.positions.blue, color: BALL_SETS[ballSet].blue.hex });
    setRed({ ...frame0.positions.red, color: BALL_SETS[ballSet].red.hex });
    setYellow({ ...frame0.positions.yellow, color: BALL_SETS[ballSet].yellow.hex });
    setBlack({ ...frame0.positions.black, color: BALL_SETS[ballSet].black.hex });
    blueRef.current = frame0.positions.blue; redRef.current = frame0.positions.red; yellowRef.current = frame0.positions.yellow; blackRef.current = frame0.positions.black;
    setCurrentShotIndex(0); setActiveBallId(frame0.activeBallId); setAngle(frame0.angle); setSpeed(frame0.speed);

    for (let i = 1; i < sequenceRef.current.length; i++) {
      if (!replayRef.current.active) break;
      await new Promise(res => { replayRef.current.timeoutId = setTimeout(res, replayDelay * 1000) });
      if (!replayRef.current.active) break;
      await animateToFrame(i);
    }

    setIsReplaying(false);
    replayRef.current.active = false;
    replayRef.current.isAutoReplaying = false;
  };

  const stopSequenceReplay = () => {
    setIsReplaying(false);
    replayRef.current.active = false;
    clearTimeout(replayRef.current.timeoutId);
    cancelAnimationFrame(replayRef.current.animId);
  };

  const handleUpdateFrame = () => {
    if (isReplaying) return;
    setSequence(prev => {
      const newSeq = [...prev];
      if (newSeq.length > currentShotIndex) {
        newSeq[currentShotIndex] = {
          ...newSeq[currentShotIndex],
          positions: JSON.parse(JSON.stringify(ballsRef.current)),
          activeBallId: activeBallId || newSeq[currentShotIndex].activeBallId,
          angle,
          speed
        };
      }
      return newSeq;
    });
  };

  const handleInsertFrame = () => {
    if (isReplaying) return;
    setSequence(prev => {
      const newSeq = [...prev];
      const newFrame = {
        id: Date.now(),
        positions: JSON.parse(JSON.stringify(ballsRef.current)),
        activeBallId: activeBallId || 'blue',
        angle,
        speed,
        impacts: []
      };
      newSeq.splice(currentShotIndex + 1, 0, newFrame);
      return newSeq;
    });
    setCurrentShotIndex(prev => prev + 1);
  };

  const handleDeleteFrame = () => {
    if (isReplaying || sequence.length === 0) return;
    setSequence(prev => {
      const newSeq = [...prev];
      if (newSeq.length > 0 && currentShotIndex >= 0 && currentShotIndex < newSeq.length) {
        newSeq.splice(currentShotIndex, 1);
      }
      return newSeq;
    });
    if (currentShotIndex >= sequence.length - 1) {
      setCurrentShotIndex(Math.max(0, sequence.length - 2));
    }
  };

  const clearSequence = () => { if (isReplaying) return; setSequence([]); setCurrentShotIndex(0); setDrawings([]); };

  const exportSequence = async () => {
    const d = new Date();
    const timestamp = `${d.getFullYear()}${(d.getMonth() + 1).toString().padStart(2, '0')}${d.getDate().toString().padStart(2, '0')}_${d.getHours().toString().padStart(2, '0')}${d.getMinutes().toString().padStart(2, '0')}`;
    const filename = `sequence_${timestamp}.json`;
    const jsonStr = JSON.stringify(sequence);

    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(jsonStr);
        await writable.close();
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error('Save failed, falling back to standard download:', err);
      }
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(jsonStr);
    const downloadAnchorNode = document.createElement('a'); 
    downloadAnchorNode.setAttribute("href", dataStr); 
    downloadAnchorNode.setAttribute("download", filename); 
    document.body.appendChild(downloadAnchorNode); 
    downloadAnchorNode.click(); 
    downloadAnchorNode.remove();
  };

  const importSequence = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (event) => { try { const loaded = JSON.parse(event.target?.result as string); if (Array.isArray(loaded)) { setSequence(loaded); setCurrentShotIndex(0); setIsRecording(false); setDrawings([]); setHistory([]); } } catch { console.error("Failed to load sequence"); } }; reader.readAsText(file); };

  const playShot = () => {
    if (isPlaying || isReplaying || !activeBallId) return; const activeBall = activeBallId === 'blue' ? blue : activeBallId === 'red' ? red : activeBallId === 'yellow' ? yellow : black;
    if (!isBallOnLawn(activeBall)) return;

    setHistory(prev => [...prev, { blue: { ...blue }, red: { ...red }, y: { ...yellow }, b: { ...black } }]);

    const pairs: string[] = [];
    const bs = [blue, red, yellow, black];
    for (let i = 0; i < bs.length; i++) {
       for (let j = i + 1; j < bs.length; j++) {
          const dx = bs[i].x - bs[j].x; const dy = bs[i].y - bs[j].y;
          if (Math.sqrt(dx*dx + dy*dy) <= 2 * BALL_RADIUS + 0.5 && !isBallDocked(bs[i]) && !isBallDocked(bs[j])) {
             pairs.push(`${bs[i].id}-${bs[j].id}`);
          }
       }
    }
    touchingPairsRef.current = pairs;

    if (isRecording && sequence.length === 0) {
      setSequence([{
        id: Date.now(),
        positions: { blue: { ...blue, vx: 0, vy: 0 }, red: { ...red, vx: 0, vy: 0 }, yellow: { ...yellow, vx: 0, vy: 0 }, black: { ...black, vx: 0, vy: 0 } },
        activeBallId: activeBallId || 'blue',
        angle,
        speed
      }]);
      setCurrentShotIndex(0);
    }

    if (isRecording) impactsRef.current = [];
    tracesRef.current = {
      blue: [{ x: blue.x, y: blue.y }],
      red: [{ x: red.x, y: red.y }],
      yellow: [{ x: yellow.x, y: yellow.y }],
      black: [{ x: black.x, y: black.y }]
    };

    // Removed redundant start-of-shot capture to only record 1 frame per shot.
    playSound(SOUNDS.mallet, 0.6);
    const rad = (angle * Math.PI) / 180; const decel = 0.06; const distance = (speed / 100) * 35 * SCALE; const initialSpeed = Math.sqrt(2 * decel * distance);
    const vx = Math.sin(rad) * initialSpeed; const vy = -Math.cos(rad) * initialSpeed;

    if (activeBallId === 'blue') blueRef.current = { ...blueRef.current, vx, vy };
    else if (activeBallId === 'red') redRef.current = { ...redRef.current, vx, vy };
    else if (activeBallId === 'yellow') yellowRef.current = { ...yellowRef.current, vx, vy };
    else if (activeBallId === 'black') blackRef.current = { ...blackRef.current, vx, vy };

    setTargetSpot(null);
    setIsPlaying(true);
  };

  const toggleFullscreen = () => {
    const doc = document.documentElement as any;
    const requestFS = doc.requestFullscreen || doc.webkitRequestFullscreen || doc.msRequestFullscreen;
    const exitFS = document.exitFullscreen || (document as any).webkitExitFullscreen || (document as any).msExitFullscreen;

    if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
      if (requestFS) {
        requestFS.call(doc).then(() => {
          if (window.screen && window.screen.orientation && (window.screen.orientation as any).lock) {
            (window.screen.orientation as any).lock('landscape').catch(() => { });
          }
        }).catch(() => { });
      }
    } else {
      if (exitFS) {
        exitFS.call(document);
      }
      if (window.screen && window.screen.orientation && window.screen.orientation.unlock) {
        window.screen.orientation.unlock();
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFS = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsFullscreen(isFS);
      if (!isFS) {
        setTimeout(() => {
          try {
            const targetHeight = Math.floor(window.screen.availHeight * 0.95);
            const targetWidth = Math.floor(targetHeight * (5 / 4));
            window.resizeTo(targetWidth, targetHeight);
          } catch { /* ignore */ }
        }, 100);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    }
  }, []);

  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return null;
    let clientX, clientY; if ('touches' in e) { clientX = e.touches[0].clientX; clientY = e.touches[0].clientY; } else { clientX = (e as React.MouseEvent).clientX; clientY = (e as React.MouseEvent).clientY; }
    const x = (clientX - rect.left) * (FIELD_WIDTH / rect.width); const y = (clientY - rect.top) * (FIELD_HEIGHT / rect.height);
    return { x, y };
  };

  const handleStart = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (isPlaying || isReplaying) return; const coords = getCanvasCoords(e); if (!coords) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX; const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const { x, y } = coords;

    saveStateRef.current = { blue: { ...blue }, red: { ...red }, y: { ...yellow }, b: { ...black } };

    const getHitDistance = (ball: Ball) => {
      const isDocked = isBallDocked(ball);
      const displayRadius = isDocked ? ball.radius * 1.5 : ball.radius;
      // In place mode, reduce the selection radius for balls on court by 50%
      const hitTolerance = isDocked ? 2.0 : (placementMode ? 2.5 : 5.0);
      const dist = Math.sqrt((x - ball.x) ** 2 + (y - ball.y) ** 2);
      return dist < displayRadius * hitTolerance ? dist : Infinity;
    };

    if (drawMode && !cleanFeed) {
      if ([blue, red, yellow, black].some(b => getHitDistance(b) !== Infinity)) {
        setDrawWarning(true);
        setTimeout(() => setDrawWarning(false), 2500);
      }
      setCurrentPath({ points: [{ x, y }], color: drawColor, type: drawStyle }); setDraggingItem('draw'); return;
    }

    const activeBall = activeBallId ? (activeBallId === 'blue' ? blue : activeBallId === 'red' ? red : activeBallId === 'yellow' ? yellow : black) : null;
    let hitSomething = false;

    if (!cleanFeed) {
      const hits = [
        { id: 'blue', dist: getHitDistance(blue) },
        { id: 'red', dist: getHitDistance(red) },
        { id: 'yellow', dist: getHitDistance(yellow) },
        { id: 'black', dist: getHitDistance(black) }
      ].filter(h => h.dist !== Infinity).sort((a, b) => a.dist - b.dist);

      if (hits.length > 0) {
        const hitId = hits[0].id as any;
        setActiveBallId(hitId);
        setDraggingItem(hitId);
        hitSomething = true;
      }
    }

    if (!hitSomething && ghostBallEnabled && !cleanFeed && activeBall) {
      const rad = (angle * Math.PI) / 180; const dx = Math.sin(rad); const dy = -Math.cos(rad);
      let firstImpact: { ball: Ball, t: number } | null = null;
      const otherBalls = [blue, red, yellow, black].filter(b => b.id !== activeBallId && !isBallDocked(b));

      for (const b of otherBalls) {
        const R2 = (2 * BALL_RADIUS) ** 2; const a_q = dx * dx + dy * dy;
        const b_q = 2 * (dx * (activeBall.x - b.x) + dy * (activeBall.y - b.y));
        const c_q = (activeBall.x - b.x) ** 2 + (activeBall.y - b.y) ** 2 - R2;
        const discriminant = b_q * b_q - 4 * a_q * c_q;
        if (discriminant >= 0) { const t = (-b_q - Math.sqrt(discriminant)) / (2 * a_q); if (t > 0 && (!firstImpact || t < firstImpact.t)) firstImpact = { ball: b, t }; }
      }

      if (firstImpact) {
        const ghostX = activeBall.x + firstImpact.t * dx;
        const ghostY = activeBall.y + firstImpact.t * dy;
        const distGhost = Math.sqrt((x - ghostX) ** 2 + (y - ghostY) ** 2);
        if (distGhost < DISPLAY_RADIUS * 4) {
          setDraggingItem('ghost');
          hitSomething = true;
        }
      }
    }

    if (!hitSomething && !cleanFeed) {
      if (placementMode) {
        if (!activeBall) return;
        setTargetSpot({ x, y });
        const dx = x - activeBall.x; const dy = y - activeBall.y; const dist = Math.sqrt(dx * dx + dy * dy);
        setAngle((Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360);
        setSpeed(Math.min(200, Math.max(1, (dist / (35 * SCALE)) * 100)));
      } else {
        setActiveBallId(null);
        setDraggingItem('pan'); lastPanRef.current = { x: clientX, y: clientY, scrollL: viewportRef.current?.scrollLeft || 0, scrollT: viewportRef.current?.scrollTop || 0 };
      }
    }
  };

  const handleMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);
    if (coords) setHoverPos(coords);

    if (!draggingItem || isPlaying || isReplaying) return;
    if (draggingItem === 'pan') {
      if (viewportRef.current) { const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX; const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY; viewportRef.current.scrollLeft = lastPanRef.current.scrollL - (clientX - lastPanRef.current.x); viewportRef.current.scrollTop = lastPanRef.current.scrollT - (clientY - lastPanRef.current.y); }
      return;
    }
    if (!coords) return; const { x, y } = coords;
    if (draggingItem === 'draw' && currentPath) { 
      setCurrentPath(prev => prev ? { ...prev, points: prev.type === 'straight' && prev.points.length > 0 ? [prev.points[0], { x, y }] : [...prev.points, { x, y }] } : null); 
      return; 
    }

    let cx = Math.max(BALL_RADIUS, Math.min(FIELD_WIDTH - BALL_RADIUS, x));
    let cy = Math.max(BALL_RADIUS, Math.min(FIELD_HEIGHT - BALL_RADIUS, y));

    if (['blue', 'red', 'yellow', 'black'].includes(draggingItem)) {
      const otherBalls = [blue, red, yellow, black].filter(b => b.id !== draggingItem);
      // Iterative physics relaxation to prevent ball overlaps
      for (let iter = 0; iter < 3; iter++) {
        for (const b of otherBalls) {
          const dx = cx - b.x;
          const dy = cy - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = 2.0 * BALL_RADIUS;
          if (dist < minDist && dist > 0.0001) {
            const overlap = minDist - dist;
            cx += (dx / dist) * overlap;
            cy += (dy / dist) * overlap;
          }
        }
      }
      // Re-constrain to field bounds after collision push
      cx = Math.max(BALL_RADIUS, Math.min(FIELD_WIDTH - BALL_RADIUS, cx));
      cy = Math.max(BALL_RADIUS, Math.min(FIELD_HEIGHT - BALL_RADIUS, cy));

      if (draggingItem === 'blue') setBlue(prev => ({ ...prev, x: cx, y: cy }));
      else if (draggingItem === 'red') setRed(prev => ({ ...prev, x: cx, y: cy }));
      else if (draggingItem === 'yellow') setYellow(prev => ({ ...prev, x: cx, y: cy }));
      else if (draggingItem === 'black') setBlack(prev => ({ ...prev, x: cx, y: cy }));
    }
    else if (draggingItem === 'ghost' && !cleanFeed) {
      const activeBall = activeBallId === 'blue' ? blue : activeBallId === 'red' ? red : activeBallId === 'yellow' ? yellow : black;

      let closestBall: Ball | null = null; let minDist = Infinity;
      const otherBalls = [blue, red, yellow, black].filter(b => b.id !== activeBallId && !isBallDocked(b));
      for (const b of otherBalls) {
        const dist = Math.sqrt((x - b.x) ** 2 + (y - b.y) ** 2);
        if (dist < minDist) { minDist = dist; closestBall = b; }
      }

      if (closestBall && minDist < DISPLAY_RADIUS * 8) {
        const bdx = x - closestBall.x; const bdy = y - closestBall.y; const bdist = Math.sqrt(bdx * bdx + bdy * bdy);
        if (bdist > 0) {
          const ghostX = closestBall.x + (bdx / bdist) * 2 * BALL_RADIUS;
          const ghostY = closestBall.y + (bdy / bdist) * 2 * BALL_RADIUS;
          const adx = ghostX - activeBall.x; const ady = ghostY - activeBall.y;
          setAngle((Math.atan2(ady, adx) * 180 / Math.PI + 90 + 360) % 360);
        }
      } else {
        const dx = x - activeBall.x; const dy = y - activeBall.y;
        setAngle((Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360);
      }
    }
  };

  const handleMouseUp = () => {
    if (draggingItem && draggingItem !== 'pan' && draggingItem !== 'draw' && saveStateRef.current) {
      const moved = blue.x !== saveStateRef.current.blue.x || blue.y !== saveStateRef.current.blue.y || red.x !== saveStateRef.current.red.x || red.y !== saveStateRef.current.red.y || yellow.x !== saveStateRef.current.y.x || yellow.y !== saveStateRef.current.y.y || black.x !== saveStateRef.current.b.x || black.y !== saveStateRef.current.b.y;
      if (moved) {
        setHistory(prev => [...prev, saveStateRef.current!]);
        if (features.recording && sequence.length > 0 && currentShotIndex >= 0 && currentShotIndex < sequence.length) {
          setSequence(prevSeq => {
            const newSeq = [...prevSeq];
            newSeq[currentShotIndex] = {
              ...newSeq[currentShotIndex],
              positions: { blue: { ...blue }, red: { ...red }, yellow: { ...yellow }, black: { ...black } }
            };
            return newSeq;
          });
        }
      }
    }
    if (draggingItem === 'draw' && currentPath) { setDrawings(prev => [...prev, currentPath]); setCurrentPath(null); }
    setDraggingItem(null);
  };
  const handleMouseLeave = () => { setHoverPos(null); handleMouseUp(); };

  const checkHoopPass = (x1: number, y1: number, x2: number, y2: number) => {
    for (const hoop of HOOPS) {
      const hy1 = hoop.y - HOOP_WIDTH / 2; const hy2 = hoop.y + HOOP_WIDTH / 2; const hx = hoop.x;
      if ((x1 > hx && x2 <= hx) || (x1 < hx && x2 >= hx)) {
        const intersectY = y1 + ((hx - x1) / (x2 - x1)) * (y2 - y1);
        if (intersectY >= hy1 && intersectY <= hy2) return true;
      }
    } return false;
  };

  const drawField = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#166534'; ctx.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);

    const boundaryWidth = (60 / 914.4) * SCALE; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = boundaryWidth; ctx.lineJoin = 'miter';
    ctx.strokeRect(EDGING, EDGING, 35 * SCALE, 28 * SCALE);

    const stripeWidth = 40; for (let x = 0; x < FIELD_WIDTH; x += stripeWidth) { ctx.fillStyle = (x / stripeWidth) % 2 === 0 ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)'; ctx.fillRect(x, 0, stripeWidth, FIELD_HEIGHT); }

    if (!cleanFeed) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'; ctx.font = '10px "Inter", sans-serif'; ctx.textAlign = 'center';

      ctx.fillText('West Boundary', FIELD_WIDTH / 2, EDGING - 15);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'; ctx.font = 'bold 10px "Inter", sans-serif'; ctx.fillText('35 yards', FIELD_WIDTH / 2, EDGING - 5); ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'; ctx.font = '10px "Inter", sans-serif';

      ctx.fillText('East Boundary', FIELD_WIDTH / 2, EDGING + 28 * SCALE + 15);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'; ctx.font = 'bold 10px "Inter", sans-serif'; ctx.fillText('35 yards', FIELD_WIDTH / 2, EDGING + 28 * SCALE + 25); ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'; ctx.font = '10px "Inter", sans-serif';

      ctx.save(); ctx.translate(EDGING - 12, FIELD_HEIGHT / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('South Boundary', 0, 0); ctx.restore();
      ctx.save(); ctx.translate(EDGING - 22, FIELD_HEIGHT / 2); ctx.rotate(-Math.PI / 2); ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'; ctx.font = 'bold 10px "Inter", sans-serif'; ctx.fillText('28 yards', 0, 0); ctx.restore(); ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'; ctx.font = '10px "Inter", sans-serif';

      ctx.save(); ctx.translate(EDGING + 35 * SCALE + 12, FIELD_HEIGHT / 2); ctx.rotate(Math.PI / 2); ctx.fillText('North Boundary', 0, 0); ctx.restore();
      ctx.save(); ctx.translate(EDGING + 35 * SCALE + 22, FIELD_HEIGHT / 2); ctx.rotate(Math.PI / 2); ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'; ctx.font = 'bold 10px "Inter", sans-serif'; ctx.fillText('28 yards', 0, 0); ctx.restore(); ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'; ctx.font = '10px "Inter", sans-serif';
    }

    ctx.save(); ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'; ctx.shadowBlur = 4; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(PEG_POS.x, PEG_POS.y, PEG_RADIUS, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();

HOOPS.forEach(hoop => {
      ctx.save(); ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'; ctx.shadowBlur = 3; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
      const hy1 = hoop.y - HOOP_WIDTH / 2; const hy2 = hoop.y + HOOP_WIDTH / 2;

      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(hoop.x, hy1, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(hoop.x, hy2, 4, 0, Math.PI * 2); ctx.fill();

      ctx.strokeStyle = (hoop as any).topColor || '#fff'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(hoop.x, hy1); ctx.lineTo(hoop.x, hy2); ctx.stroke();
      ctx.restore();

      if (!cleanFeed) { 
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'; 
        ctx.font = 'bold 12px "Inter", sans-serif'; 
        ctx.textAlign = 'center'; 
        
        // Logical placement based on entry side:
        // Hoops 3 & 4 (North Entry) positioned North (above)
        // Hoops 1, 2, 5, 6 (South Entry) positioned South (below)
        const isNorthEntry = (hoop.id === 3 || hoop.id === 4);
        const yOffset = isNorthEntry ? -20 : 20; 
        
        ctx.fillText(hoop.label, hoop.x, hoop.y + yOffset + 4); 
      }
    });
    const flags = [
      { x: EDGING, y: EDGING, color: '#1e3a8a', label: 'SW' },
      { x: EDGING + 35 * SCALE, y: EDGING, color: '#991b1b', label: 'NW' },
      { x: EDGING, y: EDGING + 28 * SCALE, color: '#fbbf24', label: 'SE' },
      { x: EDGING + 35 * SCALE, y: EDGING + 28 * SCALE, color: '#18181b', label: 'NE' }
    ];
    flags.forEach(flag => {
      ctx.save(); ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'; ctx.shadowBlur = 3; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(flag.x, flag.y); ctx.lineTo(flag.x, flag.y - 15); ctx.stroke();
      ctx.fillStyle = flag.color; ctx.beginPath(); ctx.moveTo(flag.x, flag.y - 15); ctx.lineTo(flag.x + 10, flag.y - 11); ctx.lineTo(flag.x, flag.y - 7); ctx.closePath(); ctx.fill(); ctx.restore();
    });

    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(FIELD_WIDTH / 2, EDGING, SCALE, 0, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(FIELD_WIDTH / 2, FIELD_HEIGHT - EDGING, SCALE, Math.PI, 2 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(EDGING, FIELD_HEIGHT - EDGING, SCALE, -Math.PI / 2, 0); ctx.stroke();

    // Offside markers (White pegs on ALL boundaries)
    const offsidePegs = [
      // North & South boundaries (Short edges): 10.5, 14, 17.5 yards
      { x: EDGING, y: EDGING + 10.5 * SCALE },
      { x: EDGING + 35 * SCALE, y: EDGING + 10.5 * SCALE },
      { x: EDGING, y: EDGING + 14 * SCALE },
      { x: EDGING + 35 * SCALE, y: EDGING + 14 * SCALE },
      { x: EDGING, y: EDGING + 17.5 * SCALE },
      { x: EDGING + 35 * SCALE, y: EDGING + 17.5 * SCALE },
      // East & West boundaries (Long edges): 17.5 yards (Center)
      { x: EDGING + 17.5 * SCALE, y: EDGING },
      { x: EDGING + 17.5 * SCALE, y: FIELD_HEIGHT - EDGING }
    ];
    offsidePegs.forEach(peg => {
      ctx.save(); ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'; ctx.shadowBlur = 3; ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
      ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(peg.x, peg.y, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    });
  };

  const drawAnnotations = (ctx: CanvasRenderingContext2D) => {
    ctx.save(); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'; ctx.shadowBlur = 4;
    const renderPath = (path: Path) => { if (path.points.length < 2) return; ctx.strokeStyle = path.color || '#ffffff'; ctx.beginPath(); ctx.moveTo(path.points[0].x, path.points[0].y); for (let i = 1; i < path.points.length; i++) { ctx.lineTo(path.points[i].x, path.points[i].y); } ctx.stroke(); };
    drawings.forEach(renderPath); if (currentPath) renderPath(currentPath); ctx.restore();
  };

  const drawBall = (ctx: CanvasRenderingContext2D, ball: Ball, shadow = false, isActive = false) => {
    ctx.save();
    const isDocked = isBallDocked(ball);
    const displayRadius = isDocked ? DISPLAY_RADIUS * 1.5 : DISPLAY_RADIUS;

    if (isActive && !shadow && !cleanFeed) {
      ctx.beginPath(); ctx.arc(ball.x, ball.y, displayRadius + (isDocked ? 6 : 5), 0, Math.PI * 2);
      ctx.strokeStyle = getActiveColor(ball.id, ballSet); ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
    }
    if (!shadow) { ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3; }
    ctx.beginPath(); ctx.arc(ball.x, ball.y, displayRadius, 0, Math.PI * 2);
    ctx.fillStyle = shadow ? 'rgba(220, 220, 220, 0.6)' : ball.color; ctx.fill(); ctx.shadowColor = 'transparent';

    ctx.beginPath(); ctx.arc(ball.x - displayRadius * 0.3, ball.y - displayRadius * 0.3, displayRadius * 0.25, 0, Math.PI * 2); ctx.fillStyle = shadow ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.4)'; ctx.fill();
    ctx.restore();
  };

  const drawPrediction = (ctx: CanvasRenderingContext2D) => {
    if (isPlaying || isReplaying || draggingItem || !activeBallId || cleanFeed || !ghostBallEnabled || placementMode) return;
    const rad = (angle * Math.PI) / 180; const dx = Math.sin(rad); const dy = -Math.cos(rad);
    let activeBall: Ball | null = null;
    if (activeBallId === 'blue') activeBall = blue;
    else if (activeBallId === 'red') activeBall = red;
    else if (activeBallId === 'yellow') activeBall = yellow;
    else if (activeBallId === 'black') activeBall = black;

    if (!activeBall || !isBallOnLawn(activeBall)) return;
    const x0 = activeBall.x; const y0 = activeBall.y; let lineEndT = 1000;
    if (dx > 0) lineEndT = Math.min(lineEndT, (FIELD_WIDTH - BALL_RADIUS - x0) / dx); if (dx < 0) lineEndT = Math.min(lineEndT, (BALL_RADIUS - x0) / dx);
    if (dy > 0) lineEndT = Math.min(lineEndT, (FIELD_HEIGHT - BALL_RADIUS - y0) / dy); if (dy < 0) lineEndT = Math.min(lineEndT, (BALL_RADIUS - y0) / dy);

    ctx.save(); ctx.beginPath(); ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; ctx.lineWidth = 2; ctx.moveTo(x0, y0); ctx.lineTo(x0 + dx * lineEndT, y0 + dy * lineEndT); ctx.stroke(); ctx.restore();

    let firstImpact: { ball: Ball, t: number } | null = null;
    const otherBalls = [blue, red, yellow, black].filter(b => b.id !== activeBallId && !isBallDocked(b));
    for (const b of otherBalls) {
      const R2 = (2 * BALL_RADIUS) ** 2; const a_q = dx * dx + dy * dy; const b_q = 2 * (dx * (x0 - b.x) + dy * (y0 - b.y)); const c_q = (x0 - b.x) ** 2 + (y0 - b.y) ** 2 - R2; const discriminant = b_q * b_q - 4 * a_q * c_q;
      if (discriminant >= 0) { const t = (-b_q - Math.sqrt(discriminant)) / (2 * a_q); if (t > 0 && (!firstImpact || t < firstImpact.t)) firstImpact = { ball: b, t }; }
    }

    const obstacles: { x: number, y: number, radius: number, color: string }[] = [{ x: PEG_POS.x, y: PEG_POS.y, radius: PEG_RADIUS, color: '#fff' }];
    HOOPS.forEach(h => { obstacles.push({ x: h.x, y: h.y - HOOP_WIDTH / 2, radius: 2, color: '#fff' }); obstacles.push({ x: h.x, y: h.y + HOOP_WIDTH / 2, radius: 2, color: '#fff' }); });
    for (const obs of obstacles) {
      const R2 = (BALL_RADIUS + obs.radius) ** 2; const a_q = dx * dx + dy * dy; const b_q = 2 * (dx * (x0 - obs.x) + dy * (y0 - obs.y)); const c_q = (x0 - obs.x) ** 2 + (y0 - obs.y) ** 2 - R2; const discriminant = b_q * b_q - 4 * a_q * c_q;
      if (discriminant >= 0) { const t = (-b_q - Math.sqrt(discriminant)) / (2 * a_q); if (t > 0 && (!firstImpact || t < firstImpact.t)) firstImpact = { ball: { ...activeBall!, x: obs.x, y: obs.y, radius: obs.radius, color: obs.color, vx: 0, vy: 0, id: 'blue' }, t }; }
    }

    if (firstImpact) {
      const { ball: hitBall, t } = firstImpact; const impactX = x0 + t * dx; const impactY = y0 + t * dy;
      ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(impactX, impactY); ctx.stroke(); ctx.restore();
      drawBall(ctx, { ...activeBall, x: impactX, y: impactY }, true);

      const e_coeff = 0.92; const nx = (hitBall.x - impactX) / (2 * BALL_RADIUS); const ny = (hitBall.y - impactY) / (2 * BALL_RADIUS); const initialShotSpeed = speed * 10; const decel_val = 0.06;
      const vImpactSq = Math.max(0, initialShotSpeed * initialShotSpeed - 2 * decel_val * t); const vImpact = Math.sqrt(vImpactSq);

      if (vImpact > 0) {
        const vx = dx * vImpact; const vy = dy * vImpact; const v_dot_n = vx * nx + vy * ny;
        const target_vx_init = ((1 + e_coeff) / 2) * v_dot_n * nx; const target_vy_init = ((1 + e_coeff) / 2) * v_dot_n * ny;
        const striker_vx_init = vx - ((1 + e_coeff) / 2) * v_dot_n * nx; const striker_vy_init = vy - ((1 + e_coeff) / 2) * v_dot_n * ny;
        const arrowLen = 25; const sMag = Math.sqrt(striker_vx_init ** 2 + striker_vy_init ** 2); const tMag = Math.sqrt(target_vx_init ** 2 + target_vy_init ** 2);
        if (sMag > 0.1) drawArrow(ctx, impactX, impactY, impactX + (striker_vx_init / sMag) * arrowLen, impactY + (striker_vy_init / sMag) * arrowLen, activeBall.color + 'CC');
        if (tMag > 0.1) drawArrow(ctx, hitBall.x, hitBall.y, hitBall.x + (target_vx_init / tMag) * arrowLen, hitBall.y + (target_vy_init / tMag) * arrowLen, hitBall.color + 'CC');
      }
    }
  };

  const drawArrow = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, color: string) => {
    const headLength = 10; const angle = Math.atan2(toY - fromY, toX - fromX); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fromX, fromY); ctx.lineTo(toX, toY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(toX, toY); ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6)); ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6)); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  };

  const renderScene = (s: Ball, t: Ball, y: Ball, b: Ball) => {
    const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    let canvasW, canvasH;

    if (zoom !== 1) {
      canvasW = FIELD_WIDTH * zoom * dpr;
      canvasH = FIELD_HEIGHT * zoom * dpr;
    } else {
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      const safeW = viewportDims.w - (isMobile ? 8 : 16);
      const safeH = viewportDims.h - (isMobile ? 40 : 60);
      const ratio = FIELD_WIDTH / FIELD_HEIGHT;
      let targetW = safeW; let targetH = targetW / ratio;
      if (targetH > safeH) { targetH = safeH; targetW = targetH * ratio; }
      canvasW = targetW * dpr;
      canvasH = targetH * dpr;
    }

    if (canvasW <= 0 || isNaN(canvasW)) canvasW = FIELD_WIDTH * dpr;
    if (canvasH <= 0 || isNaN(canvasH)) canvasH = FIELD_HEIGHT * dpr;

    if (canvas.width !== Math.round(canvasW)) canvas.width = Math.round(canvasW);
    if (canvas.height !== Math.round(canvasH)) canvas.height = Math.round(canvasH);

    ctx.resetTransform();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.scale(canvas.width / FIELD_WIDTH, canvas.height / FIELD_HEIGHT);

    drawField(ctx);

    if (placementMode && !cleanFeed && activeBallId && hoverPos && !targetSpot) {
      const activeBall = activeBallId === 'blue' ? s : activeBallId === 'red' ? t : activeBallId === 'yellow' ? y : b;
      if (!isBallDocked(activeBall)) {
        ctx.save();
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)'; ctx.lineWidth = 2; ctx.setLineDash([4, 2]);
        ctx.beginPath(); ctx.arc(hoverPos.x, hoverPos.y, 4, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(hoverPos.x - 6, hoverPos.y); ctx.lineTo(hoverPos.x + 6, hoverPos.y);
        ctx.moveTo(hoverPos.x, hoverPos.y - 6); ctx.lineTo(hoverPos.x, hoverPos.y + 6); ctx.stroke();
        ctx.restore();
      }
    }

    if (placementMode && targetSpot && !cleanFeed && activeBallId) {
      ctx.save(); ctx.strokeStyle = getActiveColor(activeBallId, ballSet); ctx.lineWidth = 2; ctx.setLineDash([4, 2]); ctx.beginPath(); ctx.arc(targetSpot.x, targetSpot.y, 4, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(targetSpot.x - 6, targetSpot.y); ctx.lineTo(targetSpot.x + 6, targetSpot.y); ctx.moveTo(targetSpot.x, targetSpot.y - 6); ctx.lineTo(targetSpot.x, targetSpot.y + 6); ctx.stroke(); ctx.restore();
    }
    drawPrediction(ctx); drawAnnotations(ctx);
    drawBall(ctx, s, false, activeBallId === 'blue'); drawBall(ctx, t, false, activeBallId === 'red'); drawBall(ctx, y, false, activeBallId === 'yellow'); drawBall(ctx, b, false, activeBallId === 'black');
  };

  useEffect(() => {
    if (!isPlaying) return;
    let lastTime: number | null = null; let frameCount = 0;

    const loop = (time: number) => {
      if (lastTime === null) { lastTime = time; animationRef.current = requestAnimationFrame(loop); return; }
      const deltaTime = Math.min((time - lastTime) / 16.67, 5); lastTime = time; frameCount++;

      const nextS = { ...blueRef.current }; const nextT = { ...redRef.current }; const nextY = { ...yellowRef.current }; const nextB = { ...blackRef.current };

      let remainingTime = deltaTime; const decel = 0.06; const subStepDt = 0.1;

      while (remainingTime > 0) {
        const dt = Math.min(remainingTime, subStepDt); remainingTime -= dt;
        const balls = [nextS, nextT, nextY, nextB];

        balls.forEach((ball) => {
          if (isBallDocked(ball)) return;
          const prevX = ball.x; const prevY = ball.y; ball.x += ball.vx * dt; ball.y += ball.vy * dt;
          if (checkHoopPass(prevX, prevY, ball.x, ball.y)) { playSound(SOUNDS.cheer, 0.4); }
        });

        balls.forEach(ball => { if (isBallDocked(ball)) return; const s = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy); if (s > 0) { const ns = Math.max(0, s - decel * dt); ball.vx = (ball.vx / s) * ns; ball.vy = (ball.vy / s) * ns; } });

        balls.forEach(ball => {
          if (isBallDocked(ball)) { ball.vx = 0; ball.vy = 0; return; }
          if (ball.x < ball.radius) { ball.x = ball.radius; ball.vx = 0; ball.vy = 0; }
          if (ball.x > FIELD_WIDTH - ball.radius) { ball.x = FIELD_WIDTH - ball.radius; ball.vx = 0; ball.vy = 0; }
          if (ball.y < ball.radius) { ball.y = ball.radius; ball.vx = 0; ball.vy = 0; }
          if (ball.y > FIELD_HEIGHT - ball.radius) { ball.y = FIELD_HEIGHT - ball.radius; ball.vx = 0; ball.vy = 0; }
        });

        balls.forEach(ball => {
          if (isBallDocked(ball)) return;
          const dxPeg = ball.x - PEG_POS.x; const dyPeg = ball.y - PEG_POS.y; const distPeg = Math.sqrt(dxPeg * dxPeg + dyPeg * dyPeg); const minPegDist = ball.radius + PEG_RADIUS;
          if (distPeg < minPegDist) {
            const nx = dxPeg / distPeg; const ny = dyPeg / distPeg; const velAlongNormal = ball.vx * nx + ball.vy * ny;
            if (velAlongNormal < 0) { 
              const j = -(1 + 0.5) * velAlongNormal; ball.vx += j * nx; ball.vy += j * ny; 
              playSound(SOUNDS.collision, 0.2); 
              if (stateRefs.current.isRecording) impactsRef.current.push(tracesRef.current.blue?.length || 0);
            }
            ball.x = PEG_POS.x + nx * minPegDist; ball.y = PEG_POS.y + ny * minPegDist;
          }
          HOOPS.forEach(hoop => {
            const posts = [{ x: hoop.x, y: hoop.y - HOOP_WIDTH / 2 }, { x: hoop.x, y: hoop.y + HOOP_WIDTH / 2 }];
            posts.forEach(post => {
              const dx = ball.x - post.x; const dy = ball.y - post.y; const dist = Math.sqrt(dx * dx + dy * dy); const minDist = ball.radius + 2;
              if (dist < minDist) {
                const nx = dx / dist; const ny = dy / dist; const velAlongNormal = ball.vx * nx + ball.vy * ny;
                if (velAlongNormal < 0) { 
                  const j = -(1 + 0.4) * velAlongNormal; ball.vx += j * nx; ball.vy += j * ny; 
                  playSound(SOUNDS.collision, 0.2); 
                  if (stateRefs.current.isRecording) impactsRef.current.push(tracesRef.current.blue?.length || 0);
                }
                ball.x = post.x + nx * minDist; ball.y = post.y + ny * minDist;
              }
            });
          });
        });

        for (let i = 0; i < balls.length; i++) {
          for (let j = i + 1; j < balls.length; j++) {
            const b1 = balls[i]; const b2 = balls[j]; if (isBallDocked(b1) || isBallDocked(b2)) continue;
            const relX = b1.x - b2.x; const relY = b1.y - b2.y; const distSq = relX * relX + relY * relY; const minContactDistSq = (2 * BALL_RADIUS) ** 2;
            if (distSq < minContactDistSq) {
              const dist = Math.sqrt(distSq);
              if (dist > 0) {
                const relVX = b1.vx - b2.vx; const relVY = b1.vy - b2.vy; const dotProduct = relX * relVX + relY * relVY;
                if (dotProduct < 0) {
                  const nx = relX / dist; const ny = relY / dist;
                  const v_dot_n = (b1.vx - b2.vx) * nx + (b1.vy - b2.vy) * ny;

                  const pairStr1 = `${b1.id}-${b2.id}`;
                  const pairStr2 = `${b2.id}-${b1.id}`;
                  let restitution = 0.92;
                  if (touchingPairsRef.current.includes(pairStr1) || touchingPairsRef.current.includes(pairStr2)) {
                    restitution = 0.3333; 
                    touchingPairsRef.current = touchingPairsRef.current.filter(p => p !== pairStr1 && p !== pairStr2);
                  }

                  const j_impulse = (-(1 + restitution) * v_dot_n) / 2;
                  b1.vx += j_impulse * nx; b1.vy += j_impulse * ny;
                  b2.vx -= j_impulse * nx; b2.vy -= j_impulse * ny;
                  playSound(SOUNDS.collision, 0.3);
                  if (stateRefs.current.isRecording) impactsRef.current.push(tracesRef.current.blue?.length || 0);
                }
                const overlap = (2 * BALL_RADIUS) - dist;
                const nx_pos = relX / dist; const ny_pos = relY / dist;
                b1.x += nx_pos * overlap / 2; b1.y += ny_pos * overlap / 2;
                b2.x -= nx_pos * overlap / 2; b2.y -= ny_pos * overlap / 2;
              }
            }
          }
        }
      }

      const balls = [nextS, nextT, nextY, nextB];
      balls.forEach(ball => { if (Math.abs(ball.vx) < 0.05 && Math.abs(ball.vy) < 0.05) { ball.vx = 0; ball.vy = 0; } });

      blueRef.current = nextS; redRef.current = nextT; yellowRef.current = nextY; blackRef.current = nextB;

      if (frameCount % 2 === 0) {
        if (tracesRef.current.blue) tracesRef.current.blue.push({ x: nextS.x, y: nextS.y });
        if (tracesRef.current.red) tracesRef.current.red.push({ x: nextT.x, y: nextT.y });
        if (tracesRef.current.yellow) tracesRef.current.yellow.push({ x: nextY.x, y: nextY.y });
        if (tracesRef.current.black) tracesRef.current.black.push({ x: nextB.x, y: nextB.y });
      }

      renderScene(nextS, nextT, nextY, nextB);

      if (frameCount > 5 && balls.every(b => b.vx === 0 && b.vy === 0)) {
        setIsPlaying(false);
        setBlue(nextS); setRed(nextT); setYellow(nextY); setBlack(nextB);
        playSound(SOUNDS.miss, 0.3);
        return;
      }

      animationRef.current = requestAnimationFrame(loop);
    };

    animationRef.current = requestAnimationFrame(loop);
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [isPlaying, ballSet]);

  useEffect(() => {
    renderScene(blue, red, yellow, black);
  }, [blue, red, yellow, black, angle, isPlaying, draggingItem, ghostBallEnabled, cleanFeed, activeBallId, placementMode, targetSpot, hoverPos, zoom, drawings, currentPath, ballSet, viewportDims]);

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
        * { font-family: 'Inter', sans-serif !important; }
        
        .custom-scrollbar::-webkit-scrollbar {
            width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
            background: rgba(16, 185, 129, 0.2);
            border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: rgba(16, 185, 129, 0.5);
        }
      `}} />
      <div className="h-screen w-screen bg-zinc-900 flex flex-row overflow-hidden relative selection:bg-emerald-500/30 text-zinc-100 select-none" style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}>

        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat z-0 transition-all duration-500"
          style={{
            backgroundImage: 'url("https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=2560&auto=format&fit=crop")',
            filter: 'brightness(0.7)'
          }}
        />

        <AnimatePresence>
          {showMobilePrompt && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[500] bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
              <h2 className="text-2xl font-bold text-emerald-400 mb-4">Mobile Device Detected</h2>
              <p className="text-sm text-zinc-300 mb-8 max-w-xs">For the best experience, this app runs in Fullscreen Landscape mode.</p>
              <button
                onClick={() => {
                  toggleFullscreen();
                  setShowMobilePrompt(false);
                }}
                className="px-8 py-4 bg-emerald-500 text-zinc-950 font-bold rounded-full uppercase tracking-widest shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-transform active:scale-95"
              >
                Enter Studio
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {!cleanFeed && (
          <aside className="relative z-10 w-[240px] md:w-[320px] lg:w-[360px] h-full flex flex-col shrink-0 backdrop-blur-xl border-r p-3 md:p-5 overflow-y-auto custom-scrollbar shadow-[8px_0_30px_rgba(0,0,0,0.5)] transition-colors duration-300 bg-zinc-900/90 border-zinc-700/50">
            <div className="shrink-0 flex items-center gap-2 md:gap-3 mb-4">
              <a href="/" title="Return to Croquet Studio" className="relative flex items-center justify-center w-6 h-6 md:w-8 md:h-8 hover:scale-110 transition-transform cursor-pointer"><div className="absolute top-[4px] left-[4px] md:top-[6px] md:left-[6px] w-3 h-3 md:w-4 md:h-4 rounded-full bg-[radial-gradient(circle_at_30%_30%,#60a5fa,#1e3a8a)] shadow-inner z-0" /><Search className="text-emerald-500 relative z-10 drop-shadow-md w-5 h-5 md:w-8 md:h-8" /></a>
              <div>
                <p className="text-[10px] md:text-xs text-emerald-500 -mb-1 ml-0.5" style={{ fontFamily: '"Brush Script MT", cursive' }}>Murray Tinker's</p>
                <h1 className="text-lg md:text-xl font-bold tracking-tight text-zinc-100 leading-tight">Golf Croquet<br className="md:hidden" /> Visualiser</h1>
                <p className="hidden md:block text-[9px] uppercase tracking-widest mt-0.5 font-bold text-zinc-400">Version 0.83 (BETA)</p>
              </div>
            </div>

            <div className="shrink-0 grid grid-cols-4 gap-1.5 md:gap-2 mb-3 md:mb-4 pb-3 md:pb-4 border-b border-zinc-800/50">
              <ToolButton
                icon={<MousePointer2 size={14} className="md:w-[18px] md:h-[18px]" />}
                active={placementMode && !drawMode}
                label="PLACE"
                title="Click on a ball to highlight and click the crosshair on red spot"
                onClick={() => {
                  setPlacementMode(true);
                  setGhostBallEnabled(false);
                  setTargetSpot(null);
                  setDrawMode(false);
                  setDrawWarning(false);
                }}
              />
              <ToolButton
                icon={<Eye size={14} className="md:w-[18px] md:h-[18px]" />}
                active={!placementMode && !drawMode}
                label="AIM"
                title="Use the Velocity and Aim wheels to direct your shot"
                onClick={() => {
                  setPlacementMode(false);
                  setGhostBallEnabled(true);
                  setTargetSpot(null);
                  setDrawMode(false);
                  setDrawWarning(false);
                }}
              />
              <ToolButton
                icon={<Pencil size={14} className="md:w-[18px] md:h-[18px]" />}
                active={drawMode}
                label="DRAW"
                title="Draw tactical lines on the court"
                onClick={() => {
                  const newMode = !drawMode;
                  setDrawMode(newMode);
                  if (newMode) { setPlacementMode(false); setTargetSpot(null); }
                }}
              />
              <ToolButton
                icon={isFullscreen ? <Minimize2 size={14} className="md:w-[18px] md:h-[18px]" /> : <Maximize2 size={14} className="md:w-[18px] md:h-[18px]" />}
                label={isFullscreen ? "REDUCE" : "EXPAND"}
                title="Toggle Fullscreen"
                onClick={toggleFullscreen}
              />
            </div>

            <div className={`shrink-0 relative flex flex-col gap-3 md:gap-4 mb-3 md:mb-4 pb-3 md:pb-4 border-b border-zinc-800/50 transition-opacity min-h-[80px] ${!activeBallId ? 'opacity-30 pointer-events-none' : ''}`}>
              {!placementMode ? (
                <SphericalController
                  angle={angle}
                  setAngle={setAngle}
                  speed={speed}
                  setSpeed={setSpeed}
                  isPlaying={isPlaying}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl border p-4 text-center bg-zinc-950/80 border-emerald-500/30 shadow-[inset_0_0_20px_rgba(16,185,129,0.1)] z-10">
                  <p className="text-[10px] md:text-xs font-bold uppercase tracking-widest leading-relaxed text-emerald-400">
                    Select the Striker's Ball<br />
                    <span className="text-[8px] md:text-[9px] mt-1.5 block font-bold text-zinc-400">Then click your red location on the court</span>
                  </p>
                </div>
              )}
            </div>

            <div className="shrink-0 flex flex-row items-center justify-between px-1 mb-3 md:mb-4 pb-3 md:pb-4 border-b border-zinc-800/50">
              <button onClick={handleUndo} disabled={history.length === 0 || isPlaying || isReplaying} className="p-2 md:p-2.5 rounded-full transition-all border shadow-sm disabled:opacity-30 disabled:cursor-not-allowed bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 border-zinc-800" title="Undo your last ball action"><Undo2 size={16} className="md:w-[18px] md:h-[18px]" /></button>

              {(() => {
                const activeBallIdSafe = activeBallId || null;
                const activeBall = activeBallIdSafe ? (activeBallIdSafe === 'blue' ? blue : activeBallIdSafe === 'red' ? red : activeBallIdSafe === 'yellow' ? yellow : black) : null;
                const onLawn = activeBall ? isBallOnLawn(activeBall) : false;

                let outerRing = "";
                let innerRing = "";
                if (isPlaying || isReplaying || !activeBallId || !onLawn) {
                  outerRing = 'bg-gradient-to-b from-zinc-800/80 to-zinc-950/80 cursor-not-allowed shadow-[0_8px_20px_rgba(0,0,0,0.6)]';
                  innerRing = 'bg-gradient-to-b from-zinc-800/80 to-zinc-900/80 shadow-[inset_0_2px_4px_rgba(255,255,255,0.05),inset_0_-4px_8px_rgba(0,0,0,0.4)] text-zinc-500';
                } else {
                  outerRing = 'bg-gradient-to-b from-zinc-400 to-zinc-600 active:translate-y-1 cursor-pointer shadow-[0_8px_20px_rgba(0,0,0,0.6),inset_0_2px_2px_rgba(255,255,255,0.1)]';
                  innerRing = 'bg-gradient-to-b from-zinc-100 to-zinc-300 shadow-[inset_0_2px_6px_rgba(255,255,255,0.8),inset_0_-6px_12px_rgba(0,0,0,0.2),0_0_10px_rgba(255,255,255,0.1)] hover:from-white hover:to-zinc-200 text-zinc-950';
                }

                return (
                  <button onClick={playShot} disabled={isPlaying || isReplaying || !activeBallId || !onLawn} className={`relative group w-[110px] md:w-[136px] h-10 md:h-14 rounded-full p-1 transition-all select-none ${outerRing}`} title="Click to play shot">
                    <div className={`w-full h-full rounded-full flex items-center justify-center transition-all ${innerRing}`}>
                      <span className="text-[13px] md:text-[18px] font-black tracking-widest leading-none drop-shadow-sm whitespace-nowrap">{activeBallId && !onLawn ? 'MOVE' : 'PLAY BALL'}</span>
                    </div>
                  </button>
                );
              })()}

              <button onClick={resetPositions} disabled={isPlaying || isReplaying} className="p-2 md:p-2.5 rounded-full transition-all border shadow-sm disabled:opacity-30 disabled:cursor-not-allowed bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 border-zinc-800" title="Reset Everything"><RotateCcw size={16} className="md:w-[18px] md:h-[18px]" /></button>
            </div>

            <div className="shrink-0 flex justify-center gap-2 md:gap-4 mb-4 pb-4 border-b border-zinc-800/50">
              <button onClick={() => setFeatures(prev => ({ ...prev, recording: !prev.recording }))} className={`flex items-center gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-full transition-all border shadow-sm ${features.recording ? 'bg-emerald-900/40 border-emerald-500/50 text-emerald-400' : 'bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 border-zinc-800'}`} title="Toggle Sequence Record">
                <Clapperboard size={14} />
                <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-widest">CAPTURE</span>
              </button>

              <button onClick={() => setShowOptions(true)} className="flex items-center gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-full transition-all border shadow-sm bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 border-zinc-800" title="Studio Preferences">
                <Settings size={14} />
                <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-widest">Prefs</span>
              </button>

              <button onClick={() => setShowHelp(true)} className="flex items-center gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-full transition-all border shadow-sm bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 border-zinc-800" title="Open Help Guide">
                <HelpCircle size={14} />
                <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-widest">HELP</span>
              </button>
            </div>

            {features.zoom && (
              <div className="shrink-0 flex items-center justify-between p-2 rounded-xl border mb-4 shadow-sm bg-zinc-950/60 border-zinc-800/50">
                <span className="text-[10px] font-bold uppercase tracking-widest px-2 text-zinc-400">Zoom</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => { const idx = ZOOM_LEVELS.indexOf(zoom); if (idx > 0) handleZoomChange(ZOOM_LEVELS[idx - 1]); }} className="p-1.5 rounded border transition-colors shadow-sm text-zinc-300 hover:text-emerald-400 bg-zinc-900 border-zinc-800"><ZoomOut size={14} /></button>
                  <span className="text-[10px] font-mono font-bold w-12 text-center px-2 py-1 rounded border shadow-sm text-emerald-400 bg-zinc-950 border-zinc-800">{Math.round(zoom * 100)}%</span>
                  <button onClick={() => { const idx = ZOOM_LEVELS.indexOf(zoom); if (idx < ZOOM_LEVELS.length - 1) handleZoomChange(ZOOM_LEVELS[idx + 1]); }} className="p-1.5 rounded border transition-colors shadow-sm text-zinc-300 hover:text-emerald-400 bg-zinc-900 border-zinc-800"><ZoomIn size={14} /></button>
                </div>
              </div>
            )}

            {features.recording && (
              <div className="shrink-0 flex flex-col gap-2 mb-4 pb-4 border-b border-zinc-800/50">
                <div className="flex items-center justify-between">
                  <h3 className="text-[9px] font-bold uppercase tracking-[0.1em] flex items-center gap-1.5 text-zinc-300"><Clapperboard size={12} className="text-emerald-500" /> Seq Record</h3>
                  <div className="flex gap-1">
                    <button onClick={handleCaptureFrame} disabled={isReplaying} className="px-1.5 py-1 rounded text-[8px] font-bold uppercase transition-all border flex items-center gap-1 shadow-sm bg-zinc-900/60 border-zinc-700/50 text-zinc-200 hover:bg-zinc-800/80 disabled:opacity-50"><Camera size={10} className="text-zinc-400" /> Frame</button>
                    <button onClick={() => setIsRecording(!isRecording)} disabled={isReplaying} className={`px-1.5 py-1 rounded text-[8px] font-bold uppercase transition-all border flex items-center gap-1 shadow-sm disabled:opacity-50 ${isRecording ? 'bg-red-900/50 text-red-400 border-red-500/50 animate-pulse' : 'bg-zinc-900/60 border-zinc-700/50 text-zinc-200 hover:bg-zinc-800/80'}`}><div className={`w-1.5 h-1.5 rounded-full shadow-inner border border-black/10 ${isRecording ? 'bg-red-500' : 'bg-zinc-500'}`} /> {isRecording ? 'Rec' : 'Rec'}</button>
                  </div>
                </div>
                {sequence.length === 0 ? (<div className="text-[9px] italic text-center py-2 rounded border border-dashed text-zinc-500 bg-zinc-900/40 border-zinc-800">No frames captured</div>) : (
                  <div className="flex flex-col gap-1.5 p-2 rounded-lg border shadow-sm bg-zinc-900/40 border-zinc-700/50">
                    <div className="flex items-center gap-1">
                      <div className="flex items-center justify-between rounded border shadow-sm flex-1 px-1 bg-zinc-950/60 border-zinc-800">
                        <button onClick={() => goToFrame(currentShotIndex - 1)} disabled={currentShotIndex <= 0 || isPlaying || isReplaying} className="p-1 disabled:opacity-30 text-zinc-300 hover:text-emerald-400"><ChevronLeft size={12} /></button>
                        <span className="text-[9px] font-bold uppercase tracking-wider font-mono text-emerald-400">Fr {currentShotIndex}/{Math.max(0, sequence.length - 1)}</span>
                        <button onClick={() => goToFrame(currentShotIndex + 1)} disabled={currentShotIndex >= sequence.length - 1 || isPlaying || isReplaying} className="p-1 disabled:opacity-30 text-zinc-300 hover:text-emerald-400"><ChevronRight size={12} /></button>
                      </div>
                      <button onClick={clearSequence} disabled={isPlaying || isReplaying} className="p-1.5 disabled:opacity-50 rounded border shadow-sm transition-colors bg-zinc-900/60 hover:bg-red-900/40 text-red-400 border-zinc-700/50"><Trash2 size={12} /></button>
                    </div>
                    <div className="flex gap-1 mt-1">
                      <button onClick={handleUpdateFrame} disabled={isPlaying || isReplaying} className="flex-1 flex items-center justify-center gap-1 text-[8px] py-1 rounded font-bold uppercase tracking-wider border shadow-sm transition-colors bg-zinc-900/60 hover:bg-zinc-800/80 text-zinc-200 border-zinc-700/50" title="Overwrite current frame with current ball layout">
                        <Save size={10} className="text-blue-400" /> Update
                      </button>
                      <button onClick={handleInsertFrame} disabled={isPlaying || isReplaying} className="flex-1 flex items-center justify-center gap-1 text-[8px] py-1 rounded font-bold uppercase tracking-wider border shadow-sm transition-colors bg-zinc-900/60 hover:bg-zinc-800/80 text-zinc-200 border-zinc-700/50" title="Insert new frame after this one">
                        <Plus size={10} className="text-emerald-400" /> Insert
                      </button>
                      <button onClick={handleDeleteFrame} disabled={isPlaying || isReplaying || sequence.length <= 1} className="flex-1 flex items-center justify-center gap-1 text-[8px] py-1 rounded font-bold uppercase tracking-wider border shadow-sm transition-colors bg-zinc-900/60 hover:bg-zinc-800/80 text-zinc-200 border-zinc-700/50" title="Delete current frame">
                        <X size={10} className="text-red-400" /> Delete
                      </button>
                    </div>
                    <div className="flex gap-1 mt-1">
                      <button onClick={isReplaying ? stopSequenceReplay : startSequenceReplay} disabled={sequence.length < 2 || isPlaying} className={`flex-1 flex items-center justify-center gap-1 text-[8px] py-1.5 rounded font-bold uppercase tracking-wider border shadow-sm transition-colors ${isReplaying ? 'bg-amber-900/40 text-amber-400 border-amber-500/50' : 'bg-emerald-900/40 text-emerald-400 border-emerald-500/50 hover:bg-emerald-800/60'} disabled:opacity-50`}>{isReplaying ? <><MonitorPlay size={10} /> Stop</> : <><Play size={10} /> Auto Play</>}</button>
                    </div>
                  </div>
                )}
                <div className="flex gap-1 pt-1 mt-1 border-t border-zinc-800/50">
                  <button onClick={exportSequence} disabled={isPlaying || isReplaying || sequence.length === 0} className="flex-1 flex items-center justify-center gap-1 disabled:opacity-50 text-[8px] py-1 rounded font-bold uppercase tracking-wider border shadow-sm transition-colors bg-zinc-900/60 hover:bg-zinc-800/80 text-zinc-200 border-zinc-700/50"><Save size={10} className="text-emerald-600" /> Export</button>
                  <label className={`flex-1 flex items-center justify-center gap-1 text-[8px] py-1 rounded font-bold uppercase tracking-wider border shadow-sm transition-colors ${isPlaying || isReplaying ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} bg-zinc-900/60 hover:bg-zinc-800/80 text-zinc-200 border-zinc-700/50`}>
                    <FolderUp size={10} className="text-emerald-600" /> Import
                    <input type="file" accept=".json" onChange={importSequence} disabled={isPlaying || isReplaying} className="hidden" />
                  </label>
                </div>
              </div>
            )}

          </aside>
        )}

        <main className="relative z-10 flex-1 h-full overflow-hidden bg-black/20" ref={viewportRef}>

          <AnimatePresence>
            {drawMode && !cleanFeed && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={`fixed top-2 md:top-4 left-1/2 -translate-x-1/2 z-[100] pointer-events-auto flex items-center gap-1 md:gap-2 p-1.5 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.3)] border-2 backdrop-blur-xl transition-all duration-300 ${drawWarning
                  ? 'bg-amber-950/95 border-amber-500 scale-105'
                  : 'bg-zinc-900/95 border-emerald-500'
                  }`}
              >
                <div className={`flex items-center gap-2 pl-3 pr-2 py-1 ${drawWarning ? 'text-amber-400' : 'text-emerald-400'}`}>
                  <Pencil size={16} className={!drawWarning ? 'animate-pulse' : ''} />
                  <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest whitespace-nowrap">
                    {drawWarning ? "Turn off Draw to select" : "Telestrator Active"}
                  </span>
                </div>

                <div className="w-px h-5 bg-zinc-700/50"></div>

                <div className="flex bg-zinc-950/50 rounded-full p-0.5">
                  <button onClick={(e) => { e.stopPropagation(); setDrawStyle('freehand'); }} className={`p-1.5 rounded-full transition-colors ${drawStyle === 'freehand' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
                    <Pencil size={15} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setDrawStyle('straight'); }} className={`p-1.5 rounded-full transition-colors ${drawStyle === 'straight' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
                    <Minus size={15} />
                  </button>
                </div>
                
                <div className="w-px h-5 bg-zinc-700/50 mx-1"></div>
                
                <div className="flex gap-1">
                  {[BALL_SETS[ballSet].blue.hex, BALL_SETS[ballSet].red.hex, BALL_SETS[ballSet].yellow.hex, BALL_SETS[ballSet].black.hex, '#ffffff'].map((c, idx) => (
                    <button key={idx} onClick={(e) => { e.stopPropagation(); setDrawColor(c); }} className="p-1 rounded-full hover:bg-zinc-800 transition-colors">
                      <div className={`w-4 h-4 rounded-full border-2 ${drawColor === c || (drawColor === '#ffffff' && c === '#ffffff' && idx === 4) ? 'border-white' : 'border-transparent'}`} style={{ backgroundColor: c }}></div>
                    </button>
                  ))}
                </div>

                <div className="w-px h-5 bg-zinc-700/50"></div>

                <button
                  onClick={(e) => { e.stopPropagation(); setDrawings(prev => prev.slice(0, -1)); }}
                  disabled={drawings.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-widest text-zinc-300 hover:text-white hover:bg-zinc-800 disabled:opacity-30 transition-colors"
                >
                  <Undo2 size={14} /> <span className="hidden md:inline">Undo</span>
                </button>

                <button
                  onClick={(e) => { e.stopPropagation(); setDrawings([]); setDrawMode(false); setDrawWarning(false); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-widest text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                >
                  <Eraser size={14} /> <span className="hidden md:inline">Clear</span>
                </button>

                <div className="w-px h-5 bg-zinc-700/50"></div>

                <button
                  onClick={(e) => { e.stopPropagation(); setDrawMode(false); setDrawWarning(false); }}
                  className="p-1.5 mr-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  <X size={16} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className={zoom === 1 ? "absolute inset-0 flex items-center justify-center min-w-0 min-h-0" : "min-w-max min-h-max p-12 flex items-center justify-center overflow-auto"}>
            <div
              style={getCanvasStyle()}
              className={`shadow-[0_0_40px_rgba(0,0,0,0.5)] bg-transparent pointer-events-auto border ${cleanFeed ? 'border-transparent' : 'border-zinc-800/80'} rounded-lg ${draggingItem === 'pan' ? 'cursor-grabbing' : (!isPlaying && !cleanFeed ? (drawMode ? 'cursor-crosshair' : (placementMode ? 'cursor-crosshair' : 'cursor-grab')) : 'cursor-default')} touch-none`}
            >

              <div className={zoom === 1 ? "absolute inset-0" : "w-full h-full relative"}>
                <canvas
                  ref={canvasRef}
                  style={{ display: 'block', width: '100%', height: '100%' }}
                  className="rounded-lg"
                  onMouseDown={handleStart} onMouseMove={handleMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseLeave}
                  onTouchStart={handleStart} onTouchMove={handleMove} onTouchEnd={handleMouseUp}
                />

                {/* Instruction Speech Bubble: Anchored to the right of the Yellow Ball */}
                {showInstruction && !cleanFeed && allBallsDocked && zoom === 1 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute z-[100] pointer-events-none"
                    style={{
                      left: `${((INITIAL_YELLOW_POS.x + DISPLAY_RADIUS + 16) / FIELD_WIDTH) * 100}%`,
                      top: `${(INITIAL_YELLOW_POS.y / FIELD_HEIGHT) * 100}%`,
                      transform: 'translate(0%, -50%)'
                    }}
                  >
                    <div className="relative w-max px-3 py-2 rounded-xl border shadow-2xl uppercase tracking-widest text-[8px] font-bold text-center leading-snug whitespace-nowrap bg-zinc-950 text-emerald-400 border-zinc-800">
                      Drag Ball(s)<br />onto Court to Begin
                      {/* Triangle pointer pointing LEFT */}
                      <div className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 -rotate-45 border-t border-l bg-zinc-950 border-zinc-800"></div>
                    </div>
                  </motion.div>
                )}

                {/* Primary/Secondary Switch: Anchored 0x0 exactly to the bottom-left boundary intersection */}
                {!cleanFeed && allBallsDocked && (
                  <div
                    className="absolute z-40 pointer-events-auto"
                    style={{
                      left: `${(EDGING / FIELD_WIDTH) * 100}%`,
                      top: `${((FIELD_HEIGHT - EDGING) / FIELD_HEIGHT) * 100}%`
                    }}
                  >
                    <div className="absolute top-[8px] left-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border shadow-xl transition-all bg-zinc-950/90 border-zinc-800">
                      <span className={`text-[8px] font-bold uppercase tracking-widest cursor-pointer transition-colors ${ballSet === 'primary' ? 'text-emerald-400' : 'text-zinc-500'}`} onClick={() => setBallSet('primary')}>Primary</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setBallSet(prev => prev === 'primary' ? 'secondary' : 'primary'); }}
                        className="w-6 h-3.5 rounded-full relative transition-colors shadow-inner border bg-zinc-800 border-zinc-700"
                      >
                        <div className={`absolute top-[1px] w-2.5 h-2.5 rounded-full transition-all shadow-sm bg-zinc-300 ${ballSet === 'secondary' ? 'left-[11px]' : 'left-[1px]'}`} />
                      </button>
                      <span className={`text-[8px] font-bold uppercase tracking-widest cursor-pointer transition-colors ${ballSet === 'secondary' ? 'text-emerald-400' : 'text-zinc-500'}`} onClick={() => setBallSet('secondary')}>Secondary</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>

        {cleanFeed && (
          <div className="absolute bottom-4 right-4 z-[200] flex gap-2 pointer-events-auto">
            <button onClick={() => {
              const url = canvasRef.current?.toDataURL('image/png');
              if (url) {
                const a = document.createElement('a'); a.href = url;
                const d = new Date();
                a.download = `croquet_capture_${d.getFullYear()}${(d.getMonth() + 1).toString().padStart(2, '0')}${d.getDate().toString().padStart(2, '0')}_${d.getHours().toString().padStart(2, '0')}${d.getMinutes().toString().padStart(2, '0')}.png`;
                a.click();
              }
            }} className="bg-emerald-600/90 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-emerald-500 transition-all shadow-lg flex items-center gap-2">
              <Camera size={14} /> Capture Screen
            </button>
            <button onClick={() => setCleanFeed(false)} className="px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all shadow-lg backdrop-blur-md bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border-zinc-700">
              Exit Freeze Frame
            </button>
          </div>
        )}

        <AnimatePresence>
          {showHelp && !cleanFeed && <HelpScreen onClose={() => setShowHelp(false)} />}
        </AnimatePresence>

        <AnimatePresence>
          {showOptions && !cleanFeed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[150] backdrop-blur-md flex items-center justify-center p-4 bg-zinc-950/90">
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-2xl w-full max-w-md shadow-2xl border backdrop-blur-xl bg-zinc-900 border-zinc-800">
                <div className="p-6 border-b flex items-center justify-between sticky top-0 z-10 rounded-t-2xl bg-zinc-900 border-zinc-800">
                  <h2 className="text-xl font-bold flex items-center gap-2 text-emerald-400"><Settings size={24} />Visualiser Preferences</h2>
                  <button onClick={() => setShowOptions(false)} className="px-4 py-1.5 rounded-lg font-bold uppercase tracking-widest text-[10px] transition-colors border shadow-sm bg-emerald-500/20 text-emerald-400 border-emerald-500/50 hover:bg-emerald-500 hover:text-zinc-950">Accept</button>
                </div>
                <div className="p-6 space-y-3">

                  <div className="flex items-center justify-between p-4 rounded-xl border shadow-sm bg-zinc-950 border-zinc-800">
                    <div className="flex items-center gap-3 font-bold text-sm uppercase tracking-wider text-zinc-300"><MonitorPlay size={16} /> Freeze Frame Mode</div>
                    <button onClick={() => { setCleanFeed(true); setShowOptions(false); }} className="px-4 py-1.5 rounded text-[11px] font-bold uppercase tracking-widest border transition-colors shadow-sm bg-emerald-900/40 text-emerald-400 border-emerald-500/50 hover:bg-emerald-800/60">Activate</button>
                  </div>

                  {[{ key: 'recording', label: 'Sequence Record', icon: <Clapperboard size={16} /> }, { key: 'zoom', label: 'Pan & Zoom Controls', icon: <ZoomIn size={16} /> }].map(f => (
                    <div key={f.key} className="flex items-center justify-between p-4 rounded-xl border shadow-sm bg-zinc-950 border-zinc-800">
                      <div className="flex items-center gap-3 font-bold text-sm uppercase tracking-wider text-zinc-300">{f.icon} {f.label}</div>
                      <button onClick={() => { setFeatures(prev => { const newState = !prev[f.key as keyof typeof features]; if (f.key === 'zoom' && !newState) { setZoom(1); setTimeout(() => { if (viewportRef.current) { viewportRef.current.scrollLeft = (viewportRef.current.scrollWidth - viewportRef.current.clientWidth) / 2; viewportRef.current.scrollTop = viewportRef.current.scrollHeight; } }, 10); } return { ...prev, [f.key]: newState }; }); }} className={`w-12 h-6 rounded-full relative transition-colors shadow-inner border ${features[f.key as keyof typeof features] ? 'bg-emerald-500 border-emerald-700' : 'bg-zinc-700 border-zinc-900'}`}>
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-md ${features[f.key as keyof typeof features] ? 'left-7' : 'left-1'}`} />
                      </button>
                    </div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}