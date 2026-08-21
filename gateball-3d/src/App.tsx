import React, { useState, useRef, useEffect, useMemo, useCallback, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Line, Environment } from '@react-three/drei';
import * as THREE from 'three';
import CourtSurface from './components/CourtSurface';
import ParkSurroundings from './components/ParkSurroundings';
import GateballGate from './components/GateballGate';
import GateballBall from './components/GateballBall';
import CartoonPlayer from './components/CartoonPlayer';

// --- Gateball Constants ---
const BOUNDARY_X = 7.5;
const BOUNDARY_Z = 10;
const BALL_RADIUS = 0.1425; // 3× real (0.0475 × 3)
const GOAL_POLE_RADIUS = 0.03;  // 3× real (0.01 × 3)
const GATE_WIDTH = 0.69;        // 3× real (0.23 × 3)

// Gate locations rotated 90 degrees
const GATES = [
  { id: 1, x: 3.5, y: 0, z: -8.0, rotationY: Math.PI / 2 },
  { id: 2, x: -5.5, y: 0, z: 2.0, rotationY: 0 },
  { id: 3, x: 5.5, y: 0, z: 0.0, rotationY: 0 }
];

const GOAL_POLE_POS = { x: 0, y: 0, z: 0 };

// Gate Leg positions — ±(GATE_WIDTH/2) from gate centre
const GATE_LEGS = [
  // Gate 1: vertical (legs separated in Z at x = 3.5)
  { x: 3.5, z: -8.0 - 0.345 },
  { x: 3.5, z: -8.0 + 0.345 },
  // Gate 2: horizontal (legs separated in X at z = 2.0)
  { x: -5.5 - 0.345, z: 2.0 },
  { x: -5.5 + 0.345, z: 2.0 },
  // Gate 3: horizontal (legs separated in X at z = 0.0)
  { x: 5.5 - 0.345, z: 0.0 },
  { x: 5.5 + 0.345, z: 0.0 }
];

const BALL_IDS = ['r1', 'w2', 'r3', 'w4', 'r5', 'w6', 'r7', 'w8', 'r9', 'w10'] as const;
type BallId = typeof BALL_IDS[number];

// High fidelity color sets
const BALL_SETS = {
  primary: {
    red: { hex: '#e60000', ui: '#ef4444', name: 'Red' },
    white: { hex: '#f8fafc', ui: '#ffffff', name: 'White' }
  },
  secondary: {
    red: { hex: '#f472b6', ui: '#fbcfe8', name: 'Pink' },
    white: { hex: '#fde047', ui: '#fef08a', name: 'Yellow' }
  }
};

const SOUNDS = {
  mallet: 'https://cdn.freesound.org/previews/108/108615_1159841-lq.mp3',
  collision: 'https://cdn.freesound.org/previews/108/108615_1159841-lq.mp3',
  cheer: 'https://cdn.freesound.org/previews/337/337000_5121236-lq.mp3',
  miss: 'https://cdn.freesound.org/previews/175/175409_3235613-lq.mp3'
};

const playSound = (url: string, volume = 0.5) => {
  const audio = new Audio(url);
  audio.volume = volume;
  audio.play().catch(() => {});
};

interface PhysicsBallState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  isRolling: boolean;
  isDragging?: boolean;
}

interface BallScore {
  gate1: boolean;
  gate2: boolean;
  gate3: boolean;
  finished: boolean;
}

interface RecordedShot {
  id: number;
  activeBallId: BallId;
  angle: number;
  speed: number;
  isPowerShot: boolean;
  positions: Record<BallId, { x: number; z: number }>;
  scores: Record<BallId, BallScore>;
}

// Check if a segment intersects a Gate segment
const checkGatePass = (id: number, x1: number, z1: number, x2: number, z2: number) => {
  const gate = GATES.find(g => g.id === id);
  if (!gate) return false;

  if (id === 1) {
    // Gate 1 is horizontal: crossing line is at Z = 3.5, from X = 7.7 to 8.3
    const crossZ = 3.5;
    const minX = 7.7;
    const maxX = 8.3;
    if ((z1 > crossZ && z2 <= crossZ) || (z1 < crossZ && z2 >= crossZ)) {
      const intersectX = x1 + ((crossZ - z1) / (z2 - z1)) * (x2 - x1);
      if (intersectX >= minX && intersectX <= maxX) return true;
    }
  } else {
    // Gate 2 and 3 are vertical: crossing line is at X = gate.x, from Z = gate.z - 0.3 to gate.z + 0.3
    const crossX = gate.x;
    const minZ = gate.z - 0.3;
    const maxZ = gate.z + 0.3;
    if ((x1 > crossX && x2 <= crossX) || (x1 < crossX && x2 >= crossX)) {
      const intersectZ = z1 + ((crossX - x1) / (x2 - x1)) * (z2 - z1);
      if (intersectZ >= minZ && intersectZ <= maxZ) return true;
    }
  }
  return false;
};

// --- Custom Camera Controller ---
interface CameraPresetData {
  position: [number, number, number];
  target:   [number, number, number];
}

interface CameraControllerProps {
  selectedBall: BallId | null;
  balls: Record<BallId, { x: number; z: number }>;
  resetCounter: number;
  isDraggingBallRef: React.MutableRefObject<boolean>;
  gotoPresetRef: React.MutableRefObject<CameraPresetData | null>;
  getCurrentCameraRef: React.MutableRefObject<(() => CameraPresetData) | null>;
}

function CameraController({ selectedBall, balls, resetCounter, isDraggingBallRef, gotoPresetRef, getCurrentCameraRef }: CameraControllerProps) {
  const { camera, controls } = useThree();
  const prevCounter = useRef(resetCounter);

  // --- Smooth preset lerp state ---
  const isLerpingRef   = useRef(false);
  const lerpProgRef    = useRef(0);
  const lerpFromPos    = useRef(new THREE.Vector3());
  const lerpFromTarget = useRef(new THREE.Vector3());
  const lerpToPos      = useRef(new THREE.Vector3());
  const lerpToTarget   = useRef(new THREE.Vector3());

  // Expose a getter so the App can read the current camera for saving
  getCurrentCameraRef.current = () => ({
    position: camera.position.toArray() as [number, number, number],
    target:   [(controls as any).target.x, (controls as any).target.y, (controls as any).target.z],
  });

  useEffect(() => {
    if (resetCounter !== prevCounter.current) {
      prevCounter.current = resetCounter;
      if (controls) {
        (controls as any).target.set(0, 0, 0);
        camera.position.set(-16, 12, 0);
        (controls as any).update();
      }
    }
  }, [resetCounter, camera, controls]);



  useFrame((state, delta) => {
    // Start a new lerp if App requested a preset transition
    if (gotoPresetRef.current) {
      const p = gotoPresetRef.current;
      gotoPresetRef.current = null;
      lerpFromPos.current.copy(state.camera.position);
      lerpFromTarget.current.copy((controls as any).target);
      lerpToPos.current.set(...p.position);
      lerpToTarget.current.set(...p.target);
      lerpProgRef.current = 0;
      isLerpingRef.current = true;
    }

    if (!isLerpingRef.current) return;

    // Ease-in-out over ~1.6 s (slower panning)
    lerpProgRef.current = Math.min(lerpProgRef.current + delta / 1.6, 1);
    const t = lerpProgRef.current;
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    state.camera.position.lerpVectors(lerpFromPos.current, lerpToPos.current, e);
    (controls as any).target.lerpVectors(lerpFromTarget.current, lerpToTarget.current, e);
    (controls as any).update();

    if (t >= 1) isLerpingRef.current = false;
  });

  return null;
}

// --- Panorama Background ---
function PanoramaBackground() {
  return (
    <mesh rotation={[0, -Math.PI / 2, 0]}>
      <sphereGeometry args={[80, 32, 32]} />
      <meshBasicMaterial color="#a0c4de" side={THREE.BackSide} />
    </mesh>
  );
}

// --- Debug Exporter for Puppeteer ---
function DebugExporter() {
  const state = useThree();
  useEffect(() => {
    (window as any).r3fState = state;
    (window as any).THREE = THREE;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

// --- Dynamic Aiming Guide Line ---
interface AimLineProps {
  selectedBall: BallId | null;
  balls: Record<BallId, { x: number; z: number }>;
  angle: number;
  ballSet: 'primary' | 'secondary';
  visible: boolean;
}

function AimLine({ selectedBall, balls, angle, ballSet, visible }: AimLineProps) {
  if (!visible || !selectedBall) return null;

  const activeBall = balls[selectedBall];
  // Don't aim at balls that are still docked/off-court
  if (activeBall.x > 8.8) return null;

  const rad = (angle * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dz = -Math.cos(rad);

  const points: [number, number, number][] = [
    [activeBall.x, 0.021, activeBall.z],
    [activeBall.x + dx * 12, 0.021, activeBall.z + dz * 12] // 12 meters aiming line
  ];

  const isRed = selectedBall.startsWith('r');
  const activeSet = BALL_SETS[ballSet];
  const lineColor = isRed ? activeSet.red.ui : activeSet.white.ui;

  return (
    <Line
      points={points}
      color={lineColor}
      lineWidth={3.5}
      dashed
      dashSize={0.2}
      gapSize={0.2}
      polygonOffset
      polygonOffsetFactor={-20}
      polygonOffsetUnits={-20}
    />
  );
}



// --- Physics Manager Engine ---
interface PhysicsManagerProps {
  physicsBalls: React.MutableRefObject<Record<BallId, PhysicsBallState>>;
  meshRefs: React.MutableRefObject<Record<BallId, React.RefObject<THREE.Object3D | null>>>;
  onPositionChange: (id: BallId, x: number, z: number) => void;
  onGatePass: (ballId: BallId, gateId: number) => void;
  onPegHit: (ballId: BallId) => void;
  ballScores: Record<BallId, BallScore>;
  isPaused: boolean;
}

function PhysicsManager({
  physicsBalls,
  meshRefs,
  onPositionChange,
  onGatePass,
  onPegHit,
  ballScores,
  isPaused
}: PhysicsManagerProps) {

  useFrame((_, delta) => {
    if (isPaused) return;

    // Delta capping to prevent stutters
    const dt = Math.min(delta, 0.03);
    const SUB_STEPS = 10;
    const subDt = dt / SUB_STEPS;

    const balls = physicsBalls.current;
    const refs = meshRefs.current;

    for (let step = 0; step < SUB_STEPS; step++) {
      // 1. Individual ball movement & Out-of-bounds cross checking
      BALL_IDS.forEach(id => {
        const b = balls[id];
        // Skip docked or stationary balls (allow if currently rolling/moving)
        if (!b.isRolling && (b.x > 8.8 || (b.vx === 0 && b.vz === 0))) return;

        const prevX = b.x;
        const prevZ = b.z;

        b.x += b.vx * subDt;
        b.z += b.vz * subDt;

        // Apply friction deceleration
        b.vx *= Math.exp(-0.85 * subDt);
        b.vz *= Math.exp(-0.85 * subDt);

        // Check if crossed out-of-bounds in this exact step
        const isOutLeft = b.x + BALL_RADIUS < -BOUNDARY_X;
        const isOutRight = b.x - BALL_RADIUS > BOUNDARY_X;
        const isOutTop = b.z + BALL_RADIUS < -BOUNDARY_Z;
        const isOutBottom = b.z - BALL_RADIUS > BOUNDARY_Z;

        const wasOutLeft = prevX + BALL_RADIUS < -BOUNDARY_X;
        const wasOutRight = prevX - BALL_RADIUS > BOUNDARY_X;
        const wasOutTop = prevZ + BALL_RADIUS < -BOUNDARY_Z;
        const wasOutBottom = prevZ - BALL_RADIUS > BOUNDARY_Z;

        if (isOutLeft && !wasOutLeft) {
          const t = b.vx ? (-BOUNDARY_X - BALL_RADIUS - prevX) / b.vx : 0;
          b.z = prevZ + b.vz * t;
          b.x = -BOUNDARY_X - (0.2 + BALL_RADIUS);
          b.vx = 0; b.vz = 0; b.isRolling = false;
          playSound(SOUNDS.miss, 0.4);
        } else if (isOutRight && !wasOutRight) {
          const t = b.vx ? (BOUNDARY_X + BALL_RADIUS - prevX) / b.vx : 0;
          b.z = prevZ + b.vz * t;
          b.x = BOUNDARY_X + (0.2 + BALL_RADIUS);
          b.vx = 0; b.vz = 0; b.isRolling = false;
          playSound(SOUNDS.miss, 0.4);
        } else if (isOutTop && !wasOutTop) {
          const t = b.vz ? (-BOUNDARY_Z - BALL_RADIUS - prevZ) / b.vz : 0;
          b.x = prevX + b.vx * t;
          b.z = -BOUNDARY_Z - (0.2 + BALL_RADIUS);
          b.vx = 0; b.vz = 0; b.isRolling = false;
          playSound(SOUNDS.miss, 0.4);
        } else if (isOutBottom && !wasOutBottom) {
          const t = b.vz ? (BOUNDARY_Z + BALL_RADIUS - prevZ) / b.vz : 0;
          b.x = prevX + b.vx * t;
          b.z = BOUNDARY_Z + (0.2 + BALL_RADIUS);
          b.vx = 0; b.vz = 0; b.isRolling = false;
          playSound(SOUNDS.miss, 0.4);
        }

        // 2. Validate Gate Crossing
        [1, 2, 3].forEach(gateId => {
          // Gateball rules: can only run Gate 1, then Gate 2, then Gate 3 in sequence!
          const scores = ballScores[id];
          const canRun = 
            (gateId === 1 && !scores.gate1) ||
            (gateId === 2 && scores.gate1 && !scores.gate2) ||
            (gateId === 3 && scores.gate1 && scores.gate2 && !scores.gate3);

          if (canRun && checkGatePass(gateId, prevX, prevZ, b.x, b.z)) {
            onGatePass(id, gateId);
          }
        });

        // 3. Goal Pole Collision
        const scores = ballScores[id];
        const canFinish = scores.gate1 && scores.gate2 && scores.gate3 && !scores.finished;
        if (canFinish) {
          const dxPeg = b.x - GOAL_POLE_POS.x;
          const dzPeg = b.z - GOAL_POLE_POS.z;
          const distPeg = Math.sqrt(dxPeg * dxPeg + dzPeg * dzPeg);
          const minPegDist = BALL_RADIUS + GOAL_POLE_RADIUS;
          if (distPeg < minPegDist && distPeg > 0.001) {
            b.vx = 0; b.vz = 0; b.isRolling = false;
            onPegHit(id);
          }
        } else {
          // Goal Pole behaves as simple solid peg if not finished yet
          const dxPeg = b.x - GOAL_POLE_POS.x;
          const dzPeg = b.z - GOAL_POLE_POS.z;
          const distPeg = Math.sqrt(dxPeg * dxPeg + dzPeg * dzPeg);
          const minPegDist = BALL_RADIUS + GOAL_POLE_RADIUS;
          if (distPeg < minPegDist && distPeg > 0.001) {
            const nx = dxPeg / distPeg;
            const nz = dzPeg / distPeg;
            const velAlongNormal = b.vx * nx + b.vz * nz;
            if (velAlongNormal < 0) {
              const j = -(1 + 0.5) * velAlongNormal;
              b.vx += j * nx;
              b.vz += j * nz;
              playSound(SOUNDS.collision, 0.3);
            }
            b.x = GOAL_POLE_POS.x + nx * minPegDist;
            b.z = GOAL_POLE_POS.z + nz * minPegDist;
          }
        }

        // 4. Gate Legs Collision
        const minLegDist = BALL_RADIUS + 0.02; // leg radius 0.02
        GATE_LEGS.forEach(leg => {
          const dx = b.x - leg.x;
          const dz = b.z - leg.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < minLegDist && dist > 0.001) {
            const nx = dx / dist;
            const nz = dz / dist;
            const velAlongNormal = b.vx * nx + b.vz * nz;
            if (velAlongNormal < 0) {
              const j = -(1 + 0.2) * velAlongNormal;
              b.vx += j * nx;
              b.vz += j * nz;
              playSound(SOUNDS.collision, 0.3);
            }
            b.x = leg.x + nx * minLegDist;
            b.z = leg.z + nz * minLegDist;
          }
        });

        // 5. Clean up slow movements
        const speed = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
        if (speed < 0.04 && b.isRolling) {
          b.vx = 0; b.vz = 0; b.isRolling = false;
        }

        // Callback visual update
        onPositionChange(id, b.x, b.z);
      });

      // 6. Ball-to-Ball elastic collisions
      for (let i = 0; i < BALL_IDS.length; i++) {
        for (let j = i + 1; j < BALL_IDS.length; j++) {
          const idA = BALL_IDS[i];
          const idB = BALL_IDS[j];
          const bA = balls[idA];
          const bB = balls[idB];

          // Ignore collisions with docked balls unless they were somehow struck
          if ((bA.x > 8.8 && !bA.isRolling) || (bB.x > 8.8 && !bB.isRolling)) continue;

          // Skip if either ball is being dragged
          if (bA.isDragging || bB.isDragging) continue;

          const dx = bA.x - bB.x;
          const dz = bA.z - bB.z;
          const distSq = dx * dx + dz * dz;
          const minContactDist = 2 * BALL_RADIUS;
          const minContactDistSq = minContactDist * minContactDist;

          if (distSq < minContactDistSq) {
            const dist = Math.sqrt(distSq);
            if (dist > 0.001) {
              const relVX = bA.vx - bB.vx;
              const relVZ = bA.vz - bB.vz;
              const dotProduct = dx * relVX + dz * relVZ;

              if (dotProduct < 0) {
                const nx = dx / dist;
                const nz = dz / dist;
                const v_dot_n = relVX * nx + relVZ * nz;
                
                const restitution = 0.92;
                const j_impulse = (-(1 + restitution) * v_dot_n) / 2;

                bA.vx += j_impulse * nx;
                bA.vz += j_impulse * nz;
                bB.vx -= j_impulse * nx;
                bB.vz -= j_impulse * nz;

                playSound(SOUNDS.collision, 0.4);
              }

              // Overlap resolution
              const overlap = minContactDist - dist;
              const nx_pos = dx / dist;
              const nz_pos = dz / dist;
              bA.x += (nx_pos * overlap) / 2;
              bA.z += (nz_pos * overlap) / 2;
              bB.x -= (nx_pos * overlap) / 2;
              bB.z -= (nz_pos * overlap) / 2;

              bA.isRolling = true;
              bB.isRolling = true;

              onPositionChange(idA, bA.x, bA.z);
              onPositionChange(idB, bB.x, bB.z);
            }
          }
        }
      }
    }

    // Apply immediate visual update directly to WebGL meshes (only for rolling/moving balls to prevent drag fighting)
    BALL_IDS.forEach(id => {
      const b = balls[id];
      if (b.isRolling || b.vx !== 0 || b.vz !== 0) {
        const mesh = refs[id].current;
        if (mesh) {
          mesh.position.x = b.x;
          mesh.position.z = b.z;
        }
      }
    });
  });

  return null;
}

// --- Main App Component ---
export default function App() {

  // Initial docked positions along the right margin (X = 9.0) starting next to the Start Box (Z = -6.0)
  const resetPositions = useMemo<Record<BallId, { x: number; z: number }>>(() => ({
    r1: { x: 9.0, z: -6.0 },
    w2: { x: 9.0, z: -5.5 },
    r3: { x: 9.0, z: -5.0 },
    w4: { x: 9.0, z: -4.5 },
    r5: { x: 9.0, z: -4.0 },
    w6: { x: 9.0, z: -3.5 },
    r7: { x: 9.0, z: -3.0 },
    w8: { x: 9.0, z: -2.5 },
    r9: { x: 9.0, z: -2.0 },
    w10: { x: 9.0, z: -1.5 }
  }), []);

  // React State for ball coordination
  const [balls, setBalls] = useState<Record<BallId, { x: number; z: number }>>(resetPositions);

  // Scores state
  const [ballScores, setBallScores] = useState<Record<BallId, BallScore>>(() => {
    const scores = {} as Record<BallId, BallScore>;
    BALL_IDS.forEach(id => {
      scores[id] = { gate1: false, gate2: false, gate3: false, finished: false };
    });
    return scores;
  });

  // Undo history stack
  const [history, setHistory] = useState<Array<{ balls: Record<BallId, { x: number; z: number }>; scores: Record<BallId, BallScore> }>>([]);

  // Toast / HUD banner notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = (message: string) => {
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    setToastMessage(message);
    toastTimeoutRef.current = window.setTimeout(() => setToastMessage(null), 3000);
  };

  // State controls
  const [selectedBall, setSelectedBall] = useState<BallId | null>(null);
  const [activeStriker, setActiveStriker] = useState<BallId | null>(null);
  const [isStriking, setIsStriking] = useState(false);
  const [ballSet, setBallSet] = useState<'primary' | 'secondary'>('primary');
  const [angle, setAngle] = useState(0); // Aim Angle (0 to 360)
  const [speed, setSpeed] = useState(80); // Speed/power slider (1 to 200)
  const [isPowerShot, setIsPowerShot] = useState(false);
  const [placementMode] = useState(false); // Play/Aim mode is always default now
  const [showAimingLines] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [showScoresPanel, setShowScoresPanel] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [cameraResetCounter, setCameraResetCounter] = useState(0);
  const [scoringEvent, setScoringEvent] = useState<{ text: string; team: 'red' | 'white' | 'generic'; id: number } | null>(null);

  useEffect(() => {
    if (!scoringEvent) return;
    const t = setTimeout(() => setScoringEvent(null), 4000);
    return () => clearTimeout(t);
  }, [scoringEvent]);

  // Annotation (Telestrator)
  const [drawMode, setDrawMode] = useState(false);
  const [drawColorIndex, setDrawColorIndex] = useState(0);
  const drawColors = useMemo(() => ['#ffffff', '#ef4444', '#facc15'], []);
  const [drawings, setDrawings] = useState<Array<{ id: string; points: [number, number, number][]; color: string }>>([]);
  const [currentDrawingPoints, setCurrentDrawingPoints] = useState<[number, number, number][]>([]);
  const [isDrawingActive, setIsDrawingActive] = useState(false);
  const [drawTool, setDrawTool] = useState<'pencil' | 'arrow' | 'circle'>('pencil');

  useEffect(() => {
    (window as any).THREE = THREE;
  }, []);

  const [features, setFeatures] = useState({ recording: false });
  const [sequence, setSequence] = useState<RecordedShot[]>([]);
  const [isReplaying, setIsReplaying] = useState(false);
  const strikeInitialPos = useRef<[number, number, number]>([0, BALL_RADIUS, 0]);
  const strikeInitialAngle = useRef<number>(0);
  const [playerState, setPlayerState] = useState<'hidden' | 'stalking' | 'aiming' | 'striking'>('hidden');
  const strikeTargetDist = useRef<number>(0);
  const autoPlayTimeout = useRef<any>(null);
  const playShotRef = useRef<() => void>(() => {});
  useEffect(() => {
    playShotRef.current = playShot;
  });

  // Physics refs starting next to the Start Box
  const physicsBalls = useRef<Record<BallId, PhysicsBallState>>({
    r1: { x: 8.5, z: -6.0, vx: 0, vz: 0, isRolling: false },
    w2: { x: 8.5, z: -5.5, vx: 0, vz: 0, isRolling: false },
    r3: { x: 8.5, z: -5.0, vx: 0, vz: 0, isRolling: false },
    w4: { x: 8.5, z: -4.5, vx: 0, vz: 0, isRolling: false },
    r5: { x: 8.5, z: -4.0, vx: 0, vz: 0, isRolling: false },
    w6: { x: 8.5, z: -3.5, vx: 0, vz: 0, isRolling: false },
    r7: { x: 8.5, z: -3.0, vx: 0, vz: 0, isRolling: false },
    w8: { x: 8.5, z: -2.5, vx: 0, vz: 0, isRolling: false },
    r9: { x: 8.5, z: -2.0, vx: 0, vz: 0, isRolling: false },
    w10: { x: 8.5, z: -1.5, vx: 0, vz: 0, isRolling: false }
  });

  const meshRefs = useRef<Record<BallId, React.RefObject<THREE.Object3D | null>>>({
    r1: React.createRef(),
    w2: React.createRef(),
    r3: React.createRef(),
    w4: React.createRef(),
    r5: React.createRef(),
    w6: React.createRef(),
    r7: React.createRef(),
    w8: React.createRef(),
    r9: React.createRef(),
    w10: React.createRef()
  });

  // Spark shot state
  const [sparkTargetId, setSparkTargetId] = useState<BallId | null>(null);

  // Spark Mode trigger logic
  // Triggered when active striker ball contacts another ball
  const sparkMode = useMemo(() => !!sparkTargetId, [sparkTargetId]);

  // Sync state values with physics refs when modified
  const handleBallChange = useCallback((id: BallId, x: number, z: number) => {
    setBalls(prev => ({ ...prev, [id]: { x, z } }));
    physicsBalls.current[id].x = x;
    physicsBalls.current[id].z = z;
    setSelectedBall(id);

    // Instantly sync visual WebGL mesh if present (matches clean-court sync pattern to prevent wobbly drag)
    const mesh = meshRefs.current[id].current;
    if (mesh) {
      mesh.position.x = x;
      mesh.position.z = z;
    }
  }, []);

  const saveToHistory = useCallback(() => {
    const snapshot = {
      balls: JSON.parse(JSON.stringify(balls)),
      scores: JSON.parse(JSON.stringify(ballScores))
    };
    setHistory(prev => {
      const next = [...prev, snapshot];
      if (next.length > 50) next.shift();
      return next;
    });
  }, [balls, ballScores]);

  const handleUndo = useCallback(() => {
    if (history.length === 0 || isStriking || isReplaying) return;
    const prev = history[history.length - 1];
    setHistory(list => list.slice(0, -1));
    setBalls(prev.balls);
    setBallScores(prev.scores);
    setSparkTargetId(null);

    // Sync physics refs
    BALL_IDS.forEach(id => {
      physicsBalls.current[id].x = prev.balls[id].x;
      physicsBalls.current[id].z = prev.balls[id].z;
      physicsBalls.current[id].vx = 0;
      physicsBalls.current[id].vz = 0;
      physicsBalls.current[id].isRolling = false;
    });

    showToast("Undo Successful");
  }, [history, isStriking, isReplaying]);

  // Reset court positions
  const handleReset = useCallback(() => {
    saveToHistory();
    setBalls(resetPositions);
    setSparkTargetId(null);

    const freshScores = {} as Record<BallId, BallScore>;
    BALL_IDS.forEach(id => {
      freshScores[id] = { gate1: false, gate2: false, gate3: false, finished: false };
      physicsBalls.current[id].x = resetPositions[id].x;
      physicsBalls.current[id].z = resetPositions[id].z;
      physicsBalls.current[id].vx = 0;
      physicsBalls.current[id].vz = 0;
      physicsBalls.current[id].isRolling = false;
    });
    setBallScores(freshScores);
    setSequence([]);
    setPlayerState('hidden');
    if (autoPlayTimeout.current) clearTimeout(autoPlayTimeout.current);
    showToast("Simulation Reset");
  }, [resetPositions, saveToHistory]);

  // Hitting trigger
  const playShot = () => {
    console.log("[DEBUG] playShot triggered! isStriking:", isStriking, "isReplaying:", isReplaying, "selectedBall:", selectedBall);
    if (isStriking || isReplaying || !selectedBall) {
      console.log("[DEBUG] playShot ignored early return condition met.");
      return;
    }
    if (autoPlayTimeout.current) clearTimeout(autoPlayTimeout.current);

    const activeBall = balls[selectedBall];
    saveToHistory();

    // Ensure coordinates are locked in case they hit play button directly
    if (strikeInitialPos.current[0] === 0 && strikeInitialPos.current[2] === 0) {
      strikeInitialPos.current = [activeBall.x, BALL_RADIUS, activeBall.z];
    }
    if (strikeInitialAngle.current === 0) {
      strikeInitialAngle.current = angle;
    }

    setPlayerState('striking');
    setActiveStriker(selectedBall);
    setIsStriking(true);

    // Setup sequence capture if active
    if (features.recording && sequence.length === 0) {
      setSequence([{
        id: Date.now(),
        activeBallId: selectedBall,
        angle: strikeInitialAngle.current,
        speed,
        isPowerShot,
        positions: JSON.parse(JSON.stringify(balls)),
        scores: JSON.parse(JSON.stringify(ballScores))
      }]);
    }

    // Player vanishes 2 seconds after the shot is played!
    setTimeout(() => {
      setPlayerState('hidden');
    }, 2000);
  };

  const handleImpact = () => {
    console.log("[DEBUG] handleImpact triggered! activeStriker:", activeStriker, "angle:", angle, "speed:", speed);
    if (!activeStriker) {
      console.log("[DEBUG] handleImpact ignored: activeStriker is null!");
      return;
    }
    playSound(SOUNDS.mallet, 0.7);

    // Velocity math
    const rad = (angle * Math.PI) / 180;
    const velocityMultiplier = isPowerShot ? 2.0 : 1.0;
    
    // Calculate initial speed so that the ball rolls exactly the clicked target distance under k=0.85 deceleration.
    const dist = strikeTargetDist.current || 4.0;
    const targetSpeed = (dist * 0.85 + 0.04) * velocityMultiplier;
    console.log("[DEBUG] Target distance:", dist, "Target speed:", targetSpeed);
    const vx = Math.sin(rad) * targetSpeed;
    const vz = -Math.cos(rad) * targetSpeed;

    const b = physicsBalls.current[activeStriker];

    if (sparkMode && sparkTargetId) {
      // SPARK SHOT MECHANICS:
      // In Gateball, the player steps on their own ball (striker) and hits it.
      // This transfers all momentum to the spark target ball, launching it off,
      // while the striker ball remains stationary!
      const targetBall = physicsBalls.current[sparkTargetId];
      targetBall.vx = vx;
      targetBall.vz = vz;
      targetBall.isRolling = true;
      
      b.vx = 0;
      b.vz = 0;
      b.isRolling = false;

      // Log spark touch event
      showToast(`Sparked Ball ${sparkTargetId.replace(/[^\d]/g, '')}!`);
      setSparkTargetId(null); // Clear spark target after strike
    } else {
    // Standard Stroke
    b.vx = vx;
    b.vz = vz;
    b.isRolling = true;
    }

    // Deselect the ball immediately after it is played
    setSelectedBall(null);
    setAngle(0);
    setShowAimingLines(false);
  };

  const handleFinished = () => {
    setIsStriking(false);
    setActiveStriker(null);
    setPlayerState('hidden');
    
    // Capture step in sequence
    if (features.recording) {
      setSequence(prev => [
        ...prev,
        {
          id: Date.now(),
          activeBallId: selectedBall || 'r1',
          angle,
          speed,
          isPowerShot,
          positions: JSON.parse(JSON.stringify(balls)),
          scores: JSON.parse(JSON.stringify(ballScores))
        }
      ]);
    }
  };

  // physics events callbacks
  const handleGatePass = useCallback((ballId: BallId, gateId: number) => {
    playSound(SOUNDS.cheer, 0.5);
    const isRed = ballId.startsWith('r');
    const ballNum = ballId.replace(/[^\d]/g, '');
    setBallScores(prev => {
      const key = `gate${gateId}` as keyof BallScore;
      const nextScores = { ...prev, [ballId]: { ...prev[ballId], [key]: true } };
      setScoringEvent({
        text: `Ball ${ballNum} ran Gate ${gateId}!`,
        team: isRed ? 'red' : 'white',
        id: Date.now()
      });
      setShowScoresPanel(true);
      return nextScores;
    });
  }, []);

  const handlePegHit = useCallback((ballId: BallId) => {
    playSound(SOUNDS.cheer, 0.7);
    const isRed = ballId.startsWith('r');
    const ballNum = ballId.replace(/[^\d]/g, '');
    setBallScores(prev => {
      const nextScores = { ...prev, [ballId]: { ...prev[ballId], finished: true } };
      setScoringEvent({
        text: `Ball ${ballNum} Finished (Agari)!`,
        team: isRed ? 'red' : 'white',
        id: Date.now()
      });
      setShowScoresPanel(true);
      
      // Move finished ball off court/hide
      handleBallChange(ballId, 100, 100);
      return nextScores;
    });
  }, [handleBallChange]);

  const drawStartPoint = useRef<[number, number, number] | null>(null);
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  const handleCourtPointerDown = (e: any) => {
    if (isPlaying || isReplaying) return;
    if (drawMode) {
      e.stopPropagation();
      setIsDrawingActive(true);
      const pt = e.point;
      if (pt) {
        drawStartPoint.current = [pt.x, 0.075, pt.z];
        setCurrentDrawingPoints([[pt.x, 0.075, pt.z]]);
      }
      return;
    }
    const clientX = e.clientX ?? e.nativeEvent?.clientX ?? 0;
    const clientY = e.clientY ?? e.nativeEvent?.clientY ?? 0;
    pointerDownPos.current = { x: clientX, y: clientY };
  };

  const handleCourtPointerMove = (e: any) => {
    if (isPlaying || isReplaying) return;
    if (drawMode && isDrawingActive) {
      e.stopPropagation();
      const pt = e.point;
      if (pt && drawStartPoint.current) {
        const start = drawStartPoint.current;
        if (drawTool === 'pencil') {
          setCurrentDrawingPoints(prev => {
            if (prev.length === 0) return [[pt.x, 0.075, pt.z]];
            const lastPoint = prev[prev.length - 1];
            const dx = pt.x - lastPoint[0];
            const dz = pt.z - lastPoint[2];
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > 0.01) {
              return [...prev, [pt.x, 0.075, pt.z]];
            }
            return prev;
          });
        } else if (drawTool === 'arrow') {
          const dx = pt.x - start[0];
          const dz = pt.z - start[2];
          const len = Math.sqrt(dx * dx + dz * dz);
          if (len > 0.05) {
            const angle = Math.atan2(dx, dz);
            const arrowSize = Math.min(0.4, len * 0.3);
            const ax1 = pt.x - arrowSize * Math.sin(angle + Math.PI / 6);
            const az1 = pt.z - arrowSize * Math.cos(angle + Math.PI / 6);
            const ax2 = pt.x - arrowSize * Math.sin(angle - Math.PI / 6);
            const az2 = pt.z - arrowSize * Math.cos(angle - Math.PI / 6);
            setCurrentDrawingPoints([
              start,
              [pt.x, 0.075, pt.z],
              [ax1, 0.075, az1],
              [pt.x, 0.075, pt.z],
              [ax2, 0.075, az2]
            ]);
          }
        } else if (drawTool === 'circle') {
          const dx = pt.x - start[0];
          const dz = pt.z - start[2];
          const R = Math.sqrt(dx * dx + dz * dz);
          if (R > 0.05) {
            const pts: [number, number, number][] = [];
            const segments = 32;
            for (let i = 0; i <= segments; i++) {
              const theta = (i / segments) * Math.PI * 2;
              pts.push([
                start[0] + Math.cos(theta) * R,
                0.075,
                start[2] + Math.sin(theta) * R
              ]);
            }
            setCurrentDrawingPoints(pts);
          }
        }
      }
    }
  };

  const handleCourtPointerUp = (e: any) => {
    if (isPlaying || isReplaying) return;
    if (drawMode) {
      e.stopPropagation();
      if (isDrawingActive) {
        setIsDrawingActive(false);
        if (currentDrawingPoints.length >= 2) {
          setDrawings(prev => [
            ...prev,
            {
              id: Math.random().toString(),
              points: currentDrawingPoints,
              color: drawColors[drawColorIndex]
            }
          ]);
        }
        setCurrentDrawingPoints([]);
        drawStartPoint.current = null;
      }
      return;
    }
    if (!pointerDownPos.current) return;

    const clientX = e.clientX ?? e.nativeEvent?.clientX ?? 0;
    const clientY = e.clientY ?? e.nativeEvent?.clientY ?? 0;
    const dx = clientX - pointerDownPos.current.x;
    const dy = clientY - pointerDownPos.current.y;
    const dragDistance = Math.sqrt(dx * dx + dy * dy);

    pointerDownPos.current = null;

    e.stopPropagation();
    const clickPoint = e.point;
    
    if (clickPoint && selectedBall) {
      const clickX = clickPoint.x;
      const clickZ = clickPoint.z;
      const ball = balls[selectedBall];
      
      // Any camera orbit drag cancels the action entirely
      if (dragDistance > 6) return;

      // Only act if the selected ball is already on the court or in the Start Box — docked balls
      // must be positioned by dragging, not by clicking the court.
      if (ball.x > 8.8) return;

      // Standard Aiming/Striking Logic (Only runs if the ball is already on the court)
      const aimDx = clickX - ball.x;
      const aimDz = clickZ - ball.z;
      let angleDeg = Math.round((Math.atan2(aimDx, -aimDz) * 180) / Math.PI);
      if (angleDeg < 0) angleDeg += 360;

      setAngle(angleDeg);

      // Lock player position, angle, and distance immediately
      strikeInitialPos.current = [ball.x, BALL_RADIUS, ball.z];
      strikeInitialAngle.current = angleDeg;
      strikeTargetDist.current = Math.sqrt(aimDx * aimDx + aimDz * aimDz);

      // Stalk the ball: player walks up from behind, then pauses 1s at stance before shot
      setPlayerState('stalking');

      if (autoPlayTimeout.current) clearTimeout(autoPlayTimeout.current);
      // After 1.2s of walking → switch to aiming stance
      autoPlayTimeout.current = setTimeout(() => {
        setPlayerState('aiming');
        // After 1s pause at stance → play the shot
        autoPlayTimeout.current = setTimeout(() => {
          playShotRef.current();
        }, 1000);
      }, 1200);

      // Spark touch detection logic...
      const otherBalls = (BALL_IDS as readonly BallId[]).filter(id => id !== selectedBall && balls[id].x <= 8.0);
      let closestBall: BallId | null = null;
      let closestDist = Infinity;

      otherBalls.forEach(id => {
        const ob = balls[id];
        const dist = Math.sqrt((clickX - ob.x) ** 2 + (clickZ - ob.z) ** 2);
        if (dist < 0.8 && dist < closestDist) {
          closestDist = dist;
          closestBall = id;
        }
      });

      if (closestBall) {
        const ob = balls[closestBall];
        const touchDist = Math.sqrt((ball.x - ob.x) ** 2 + (ball.z - ob.z) ** 2);
        if (touchDist <= 2 * BALL_RADIUS + 0.05) {
          setSparkTargetId(closestBall);
          showToast(`Touch! Aligning spark with Ball ${closestBall.replace(/[^\d]/g, '')}`);
        }
      }
    }
  };

  const toggleFullscreen = () => {
    const doc = document.documentElement as any;
    const requestFS = doc.requestFullscreen || doc.webkitRequestFullscreen || doc.msRequestFullscreen;
    const exitFS = document.exitFullscreen || (document as any).webkitExitFullscreen || (document as any).msExitFullscreen;

    if (!document.fullscreenElement) {
      if (requestFS) requestFS.call(doc).catch(() => {});
    } else {
      if (exitFS) exitFS.call(document);
    }
  };

  // Replay Sequence Auto Player
  const startSequenceReplay = async () => {
    if (sequence.length < 2 || isPlaying || isReplaying) return;
    setIsReplaying(true);
    let index = 0;
    
    const playNextFrame = () => {
      if (index >= sequence.length) {
        setIsReplaying(false);
        return;
      }
      const frame = sequence[index];
      setBalls(frame.positions);
      setBallScores(frame.scores);
      setSelectedBall(frame.activeBallId);
      setAngle(frame.angle);
      setSpeed(frame.speed);
      setIsPowerShot(frame.isPowerShot);

      // Sync physics
      BALL_IDS.forEach(id => {
        physicsBalls.current[id].x = frame.positions[id].x;
        physicsBalls.current[id].z = frame.positions[id].z;
        physicsBalls.current[id].vx = 0;
        physicsBalls.current[id].vz = 0;
        physicsBalls.current[id].isRolling = false;
      });

      index++;
      setTimeout(playNextFrame, 1500); // 1.5s step delay
    };

    playNextFrame();
  };

  // Save/Load sequence files
  const downloadSequence = () => {
    if (sequence.length === 0) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(sequence));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `gateball_sequence_${Date.now()}.json`);
    dlAnchorElem.click();
    showToast("Sequence Saved");
  };

  const loadSequence = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const loaded = JSON.parse(event.target?.result as string);
        if (Array.isArray(loaded)) {
          setSequence(loaded);
          setBalls(loaded[0].positions);
          setBallScores(loaded[0].scores);
          showToast("Sequence Loaded Successfully");
        }
      } catch {
        showToast("Error loading sequence file");
      }
    };
    reader.readAsText(file);
  };

  const activeBall = selectedBall ? balls[selectedBall] : null;
  const isSelectedBallOffCourt = activeBall ? activeBall.x > 8.8 : true;

  const [isDraggingBall, setIsDraggingBall] = useState(false);
  const isDraggingBallRef   = useRef(false);
  const gotoPresetRef       = useRef<CameraPresetData | null>(null);
  const getCurrentCameraRef = useRef<(() => CameraPresetData) | null>(null);

  // --- Camera Presets (6 slots, persisted to localStorage) ---
  const PRESET_KEY = 'gateball-camera-presets-v1';
  const [cameraPresets, setCameraPresets] = useState<(CameraPresetData | null)[]>(() => {
    try {
      const saved = localStorage.getItem(PRESET_KEY);
      if (saved) return JSON.parse(saved) as (CameraPresetData | null)[];
    } catch { /* ignore */ }
    return Array(6).fill(null);
  });

  const saveCurrentViewToSlot = useCallback((index: number) => {
    const getter = getCurrentCameraRef.current;
    if (!getter) return;
    const current = getter();
    
    // Log to console so user can copy-paste from F12
    console.log(
      `--- Camera Preset ${index + 1} Saved ---\n` +
      `Position: [${current.position.map(n => n.toFixed(3)).join(', ')}]\n` +
      `Target: [${current.target.map(n => n.toFixed(3)).join(', ')}]\n` +
      `JSON for code: ${JSON.stringify(current)}`
    );

    setCameraPresets(prev => {
      const next = [...prev];
      next[index] = current;
      try { localStorage.setItem(PRESET_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    showToast(`View ${index + 1} saved`);
  }, []);

  const activateCameraPreset = useCallback((index: number) => {
    const preset = cameraPresets[index];
    if (!preset) { showToast(`View ${index + 1} not saved yet — Shift+${index + 1} to save`); return; }
    gotoPresetRef.current = preset;
  }, [cameraPresets]);

  // Keyboard shortcut listener — must come AFTER the preset declarations above
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key.toLowerCase() === 'p') {
        setIsPaused(prev => !prev);
      } else if (e.key.toLowerCase() === 'z' && e.ctrlKey) {
        if (drawMode) {
          setDrawings(prev => prev.slice(0, -1));
        } else {
          handleUndo();
        }
      }

      // Number keys 1–6: go to preset  |  Shift+1–6: save current view
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 6) {
        if (e.shiftKey) {
          saveCurrentViewToSlot(num - 1);
        } else {
          activateCameraPreset(num - 1);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, drawMode, activateCameraPreset, saveCurrentViewToSlot]);

  const isPlaying = isStriking || Object.values(balls).some((_, i) => {
    const id = BALL_IDS[i];
    // Stationary if docked or velocity zero
    const phys = physicsBalls.current[id];
    return phys.vx !== 0 || phys.vz !== 0 || phys.isRolling;
  });

  return (
    <div 
      onContextMenu={(e) => e.preventDefault()}
      style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', background: '#0a0f0d', position: 'relative' }}
    >
      {/* 3D WebGL Canvas Scene */}
      <Canvas camera={{ position: [-16, 12, 0], fov: 42, far: 200 }} shadows>
        <color attach="background" args={['#a0c4de']} />
        <fog attach="fog" args={['#a0c4de', 40, 150]} />
        
        <Suspense fallback={null}>
          <CameraController 
            selectedBall={selectedBall} 
            balls={balls}
            resetCounter={cameraResetCounter}
            isDraggingBallRef={isDraggingBallRef}
            gotoPresetRef={gotoPresetRef}
            getCurrentCameraRef={getCurrentCameraRef}
          />

        <AimLine
          selectedBall={selectedBall}
          balls={balls}
          angle={angle}
          ballSet={ballSet}
          visible={showAimingLines && !isStriking && !placementMode && sparkMode}
        />

        <PanoramaBackground />
        <DebugExporter />
        <ambientLight intensity={0.5} />
        <Environment preset="park" background={false} />
        {/* Fill light — creates specular glint on brushed-steel pole and gate wire */}
        <pointLight position={[3, 4, 3]} intensity={0.8} color="#d8eaf8" />
        <pointLight position={[-4, 3, -4]} intensity={0.4} color="#fde8c8" />
        
        <directionalLight 
          position={[20, 30, 15]} 
          castShadow 
          intensity={1.3} 
          shadow-mapSize-width={2048} 
          shadow-mapSize-height={2048}
          shadow-camera-left={-25}
          shadow-camera-right={25}
          shadow-camera-top={25}
          shadow-camera-bottom={-25}
          shadow-camera-near={0.5}
          shadow-camera-far={100}
          shadow-bias={-0.0001}
        />
        
        <CourtSurface />
        <ParkSurroundings />

        {/* Render drawings */}
        {drawings.map((drawing) => (
          <Line
            key={drawing.id}
            points={drawing.points}
            color={drawing.color}
            lineWidth={3.5}
            polygonOffset
            polygonOffsetFactor={-10}
            polygonOffsetUnits={-10}
          />
        ))}

        {/* Render current active drawing */}
        {isDrawingActive && currentDrawingPoints.length > 1 && (
          <Line
            points={currentDrawingPoints}
            color={drawColors[drawColorIndex]}
            lineWidth={3.5}
            polygonOffset
            polygonOffsetFactor={-10}
            polygonOffsetUnits={-10}
          />
        )}

        {/* 3D Goal Pole — 3× scaled spec: 60cm tall, 6cm diameter, brushed steel */}
        <mesh position={[GOAL_POLE_POS.x, 0.30, GOAL_POLE_POS.z]} castShadow receiveShadow>
          <cylinderGeometry args={[GOAL_POLE_RADIUS, GOAL_POLE_RADIUS * 1.04, 0.60, 32]} />
          <meshStandardMaterial
            color="#8a9198"
            metalness={0.90}
            roughness={0.25}
            envMapIntensity={2.0}
          />
        </mesh>
        {/* Rounded top cap */}
        <mesh position={[GOAL_POLE_POS.x, 0.60, GOAL_POLE_POS.z]}>
          <sphereGeometry args={[GOAL_POLE_RADIUS, 24, 24]} />
          <meshStandardMaterial
            color="#9aa2aa"
            metalness={0.92}
            roughness={0.18}
            envMapIntensity={2.2}
          />
        </mesh>

        {/* Gateball Gates */}
        {GATES.map(gate => (
          <GateballGate 
            key={gate.id} 
            id={gate.id} 
            pos={[gate.x, gate.y, gate.z]} 
            gateWidth={GATE_WIDTH} 
            rotationY={gate.rotationY}
          />
        ))}

        {/* 10 Numbered Gateball Balls */}
        {BALL_IDS.map((id) => {
          const number = parseInt(id.replace(/[^\d]/g, ''), 10);
          const isRed = id.startsWith('r');
          const activeSet = BALL_SETS[ballSet];
          const ballHex = isRed ? activeSet.red.hex : activeSet.white.hex;

          return (
            <GateballBall
              key={id}
              ballId={id}
              number={number}
              color={ballHex}
              x={balls[id].x}
              z={balls[id].z}
              isSelected={selectedBall === id}
              onPositionChange={(nx, nz) => handleBallChange(id, nx, nz)}
              onPointerDown={() => {
                setSelectedBall(id);
                setSparkTargetId(null);
                setPlayerState('hidden');
                if (autoPlayTimeout.current) clearTimeout(autoPlayTimeout.current);
              }}
              onDragStart={() => {
                physicsBalls.current[id].isDragging = true;
                isDraggingBallRef.current = true;
              }}
              onDragEnd={() => {
                physicsBalls.current[id].isDragging = false;
                isDraggingBallRef.current = false;
              }}
              ref={meshRefs.current[id]}
            />
          );
        })}

        {/* Unified Cartoon Player render block governed by playerState */}
        {(selectedBall || activeStriker) && playerState !== 'hidden' && (
          <CartoonPlayer
            ballId={activeStriker || selectedBall}
            ballPosition={strikeInitialPos.current}
            targetPosition={[
              strikeInitialPos.current[0] + Math.sin((strikeInitialAngle.current * Math.PI) / 180) * 10,
              BALL_RADIUS,
              strikeInitialPos.current[2] - Math.cos((strikeInitialAngle.current * Math.PI) / 180) * 10
            ]}
            isStriking={playerState === 'striking'}
            isStalking={playerState === 'stalking'}
            onImpact={handleImpact}
            onFinished={handleFinished}
            ballSet={ballSet}
            isPaused={isPaused}
          />
        )}

        {/* Ground Raycast Catcher */}
        <mesh 
          rotation={[-Math.PI / 2, 0, 0]} 
          position={[0, 0.03, 0]} 
          onPointerDown={handleCourtPointerDown}
          onPointerMove={handleCourtPointerMove}
          onPointerUp={handleCourtPointerUp}
        >
          <planeGeometry args={[100, 100]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>

        {/* Physics engine manager */}
        <PhysicsManager
          physicsBalls={physicsBalls}
          meshRefs={meshRefs}
          onPositionChange={handleBallChange}
          onGatePass={handleGatePass}
          onPegHit={handlePegHit}
          ballScores={ballScores}
          isPaused={isPaused}
        />

        <OrbitControls 
          makeDefault
          enabled={!drawMode || !isDrawingActive}
          maxPolarAngle={Math.PI / 2.1} 
          minDistance={3} 
          maxDistance={45} 
        />
        </Suspense>
      </Canvas>

      {/* --- HUD Glassmorphic Overlay UI --- */}
      {/* 1. Main Left Control Panel */}
      <div className="hud-panel" style={{ position: 'absolute', top: '20px', left: '20px', display: 'flex', flexDirection: 'column', gap: '12px', zIndex: 10 }}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }}></div>
          <h1 style={{ fontSize: '15px', fontWeight: '800', letterSpacing: '0.05em', color: '#ffffff', margin: 0, textTransform: 'uppercase' }}>Gateball 3D</h1>
        </div>

        {/* Column 1: Mode Selectors */}
        {/* Mode Selectors Removed for Unified Flow */}

        {/* Column 2: Selected Ball Info */}
        <div className="hud-left-column" style={{ padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="panel-title" style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px' }}>Selected Striker</div>
          {selectedBall ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '14px', height: '14px', borderRadius: '50%',
                background: selectedBall.startsWith('r') ? BALL_SETS[ballSet].red.hex : BALL_SETS[ballSet].white.hex,
                border: '1px solid rgba(255,255,255,0.2)'
              }} />
              <span style={{ fontSize: '11px', fontWeight: '700', color: '#ffffff' }}>
                Ball {selectedBall.replace(/[^\d]/g, '')} ({selectedBall.startsWith('r') ? 'Red' : 'White'})
              </span>
              {isSelectedBallOffCourt && <span style={{ fontSize: '8px', color: '#f59e0b', fontWeight: '600' }}>(Docked)</span>}
            </div>
          ) : (
            <span style={{ fontSize: '10px', color: '#64748b' }}>Select a ball from the sidebar</span>
          )}
        </div>

        {/* Column 3: Aim & Speed Wheels (Visible when a ball is selected) */}
        {!placementMode && selectedBall && (
          <div className="hud-left-column" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
              <input 
                type="checkbox" id="power-shot" checked={isPowerShot} 
                onChange={(e) => setIsPowerShot(e.target.checked)} 
                style={{ accentColor: '#10b981' }}
              />
              <label htmlFor="power-shot" style={{ fontSize: '9px', color: '#e2e8f0', fontWeight: '600', cursor: 'pointer' }}>Power Shot (2x Velocity)</label>
            </div>
          </div>
        )}

        {/* Action Button Row */}
        <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
          <button 
            className="hud-action-row" 
            onClick={playShot} 
            disabled={isPlaying || !selectedBall}
            style={{ flex: 1, padding: '10px 16px', background: '#10b981', color: '#000000', border: 'none', borderRadius: '30px', fontWeight: '800', fontSize: '11px', letterSpacing: '0.05em', cursor: 'pointer', boxShadow: '0 4px 12px rgba(16,185,129,0.3)', transition: 'transform 0.1s' }}
          >
            {sparkMode ? 'PLAY SPARK' : 'PLAY STROKE'}
          </button>
          
          <button 
            className="hud-action-row" 
            onClick={handleUndo} 
            disabled={history.length === 0 || isPlaying}
            style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            title="Undo (Ctrl+Z)"
          >
            ↩
          </button>
        </div>

        {/* Capture Panel */}
        <div className="hud-left-column" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 'bold' }}>Sequence Capture</span>
            <button 
              onClick={() => setFeatures(prev => ({ ...prev, recording: !prev.recording }))}
              style={{ fontSize: '8px', padding: '3px 8px', borderRadius: '4px', background: features.recording ? '#ef4444' : 'rgba(255,255,255,0.1)', color: '#ffffff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
            >
              {features.recording ? 'REC ON' : 'REC OFF'}
            </button>
          </div>
          {sequence.length > 0 && (
            <div style={{ display: 'flex', gap: '4px' }}>
              <button onClick={startSequenceReplay} disabled={isReplaying} style={{ flex: 1, fontSize: '8px', padding: '4px 0', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', color: '#ffffff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>Replay</button>
              <button onClick={downloadSequence} style={{ flex: 1, fontSize: '8px', padding: '4px 0', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', color: '#ffffff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>Save</button>
              <button onClick={handleReset} style={{ flex: 1, fontSize: '8px', padding: '4px 0', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', color: '#ffffff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>Clear</button>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 'bold', cursor: 'pointer', flex: 1 }}>Load File:</label>
            <input type="file" accept=".json" onChange={loadSequence} style={{ fontSize: '8px', color: '#64748b', width: '90px' }} />
          </div>
        </div>

      </div>

      {/* 2. Premium Glassmorphic Scoring Event Card (Top Center) */}
      {scoringEvent && (
        <div
          key={scoringEvent.id}
          style={{
            position: 'absolute',
            top: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(20px)',
            border: `1px solid ${scoringEvent.team === 'red' ? 'rgba(239, 68, 68, 0.35)' : scoringEvent.team === 'white' ? 'rgba(255, 255, 255, 0.35)' : 'rgba(255, 255, 255, 0.1)'}`,
            borderRadius: '16px',
            padding: '16px 32px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            zIndex: 1000,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
            animation: 'slideDownFade 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            pointerEvents: 'none'
          }}
        >
          <style>{`
            @keyframes slideDownFade {
              0% {
                transform: translate(-50%, -20px);
                opacity: 0;
              }
              100% {
                transform: translate(-50%, 0);
                opacity: 1;
              }
            }
          `}</style>
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: scoringEvent.team === 'red' ? '#ef4444' : scoringEvent.team === 'white' ? '#ffffff' : '#10b981',
              boxShadow: `0 0 12px ${scoringEvent.team === 'red' ? '#ef4444' : scoringEvent.team === 'white' ? '#ffffff' : '#10b981'}`
            }}
          />
          <span
            style={{
              fontSize: '14px',
              color: '#f8fafc',
              fontWeight: '700',
              letterSpacing: '0.02em',
              textTransform: 'uppercase'
            }}
          >
            {scoringEvent.text}
          </span>
        </div>
      )}

      {/* 3. Right Sidebar Ball Selector & Score Details */}
      {showScoresPanel && (
        <div className="hud-panel" style={{ position: 'absolute', top: '20px', right: '20px', display: 'flex', flexDirection: 'column', gap: '12px', zIndex: 10, width: '180px' }}>
        <div className="panel-title" style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '6px' }}>Balls & Scores</div>
        
        <div className="hud-ball-stack" style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '55vh', overflowY: 'auto' }}>
          {BALL_IDS.map(id => {
            const number = parseInt(id.replace(/[^\d]/g, ''), 10);
            const isRed = id.startsWith('r');
            const scores = ballScores[id];
            const activeSet = BALL_SETS[ballSet];
            const ballColorHex = isRed ? activeSet.red.hex : activeSet.white.hex;

            return (
              <div 
                key={id}
                onClick={() => { 
                  if (!isPlaying) { 
                    setSelectedBall(id); 
                    setSparkTargetId(null); 
                    setPlayerState('hidden');
                    if (autoPlayTimeout.current) clearTimeout(autoPlayTimeout.current);
                  } 
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 8px', borderRadius: '6px',
                  background: selectedBall === id ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.01)',
                  border: selectedBall === id ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.03)',
                  cursor: isPlaying ? 'not-allowed' : 'pointer',
                  transition: 'background 0.2s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{
                    width: '16px', height: '16px', borderRadius: '50%',
                    background: ballColorHex, border: '1px solid rgba(255,255,255,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <span style={{ fontSize: '8px', fontWeight: 'bold', color: isRed ? '#ffffff' : '#000000' }}>{number}</span>
                  </div>
                </div>

                {/* Score details badge per ball */}
                <div style={{ display: 'flex', gap: '3px' }}>
                  <span style={{ fontSize: '7px', fontWeight: '800', padding: '1px 3px', borderRadius: '2px', background: scores.gate1 ? '#10b981' : 'rgba(255,255,255,0.1)', color: scores.gate1 ? '#000000' : '#64748b' }}>G1</span>
                  <span style={{ fontSize: '7px', fontWeight: '800', padding: '1px 3px', borderRadius: '2px', background: scores.gate2 ? '#10b981' : 'rgba(255,255,255,0.1)', color: scores.gate2 ? '#000000' : '#64748b' }}>G2</span>
                  <span style={{ fontSize: '7px', fontWeight: '800', padding: '1px 3px', borderRadius: '2px', background: scores.gate3 ? '#10b981' : 'rgba(255,255,255,0.1)', color: scores.gate3 ? '#000000' : '#64748b' }}>G3</span>
                  <span style={{ fontSize: '7px', fontWeight: '800', padding: '1px 3px', borderRadius: '2px', background: scores.finished ? '#3b82f6' : 'rgba(255,255,255,0.1)', color: scores.finished ? '#ffffff' : '#64748b' }}>AG</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Ball Set Toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px' }}>
          <span style={{ fontSize: '9px', color: '#64748b', fontWeight: 'bold' }}>Color Set</span>
          <button 
            onClick={() => setBallSet(prev => prev === 'primary' ? 'secondary' : 'primary')}
            style={{ fontSize: '8px', padding: '3px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', color: '#ffffff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
          >
            {ballSet === 'primary' ? 'PRIMARY' : 'SECONDARY'}
          </button>
        </div>

        {/* Global Utilities */}
        <div style={{ display: 'flex', gap: '4px', width: '100%', marginTop: '6px' }}>
          <button onClick={() => setCameraResetCounter(c => c + 1)} style={{ flex: 1, fontSize: '8px', padding: '5px 0', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#ffffff', fontWeight: 'bold', cursor: 'pointer' }}>Recenter</button>
          <button onClick={toggleFullscreen} style={{ flex: 1, fontSize: '8px', padding: '5px 0', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#ffffff', fontWeight: 'bold', cursor: 'pointer' }}>Fullscreen</button>
        </div>
      </div>
      )}

      {/* Camera Preset Panel — top-right */}
      <div style={{
        position: 'absolute', top: '20px', right: '20px',
        background: 'rgba(9,13,22,0.65)', backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px',
        padding: '8px 12px', display: 'flex', alignItems: 'center',
        gap: '8px', zIndex: 10,
      }}>
        <span style={{ fontSize: '13px', lineHeight: 1 }}>📷</span>
        <span style={{ fontSize: '9px', color: '#64748b', fontWeight: '600', letterSpacing: '0.06em', textTransform: 'uppercase', marginRight: '2px' }}>Views</span>
        {cameraPresets.map((preset, i) => (
          <button
            key={i}
            title={preset
              ? `Go to View ${i + 1}  (key: ${i + 1})\nRight-click to overwrite  (Shift+${i + 1})`
              : `View ${i + 1} empty — right-click or press Shift+${i + 1} to save`}
            onClick={() => activateCameraPreset(i)}
            onContextMenu={e => { e.preventDefault(); saveCurrentViewToSlot(i); }}
            style={{
              width: '28px', height: '28px', borderRadius: '8px', cursor: 'pointer',
              border: preset ? '1px solid rgba(59,130,246,0.7)' : '1px dashed rgba(100,116,139,0.5)',
              background: preset ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.03)',
              color: preset ? '#93c5fd' : '#475569',
              fontSize: '11px', fontWeight: '800',
              boxShadow: preset ? '0 0 8px rgba(59,130,246,0.25)' : 'none',
              transition: 'all 0.15s ease',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* 4. Telestrator & Settings (Bottom Center) */}
      <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(9,13,22,0.65)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '30px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '10px', zIndex: 10 }}>
        
        {/* Draw toggle */}
        <button 
          onClick={() => {
            setDrawMode(!drawMode);
            if (drawMode) {
              setIsDrawingActive(false);
              setCurrentDrawingPoints([]);
            }
          }}
          style={{ fontSize: '9px', padding: '6px 14px', borderRadius: '20px', background: drawMode ? '#10b981' : 'rgba(255,255,255,0.05)', color: drawMode ? '#000000' : '#ffffff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
        >
          {drawMode ? 'Drawing On' : 'Draw Tools'}
        </button>

        {drawMode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button 
              onClick={() => setDrawTool('pencil')}
              style={{ fontSize: '8px', padding: '4px 10px', borderRadius: '15px', background: drawTool === 'pencil' ? '#ffe680' : 'rgba(255,255,255,0.1)', color: drawTool === 'pencil' ? '#000000' : '#ffffff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Pencil
            </button>
            <button 
              onClick={() => setDrawTool('arrow')}
              style={{ fontSize: '8px', padding: '4px 10px', borderRadius: '15px', background: drawTool === 'arrow' ? '#ffe680' : 'rgba(255,255,255,0.1)', color: drawTool === 'arrow' ? '#000000' : '#ffffff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Arrow
            </button>
            <button 
              onClick={() => setDrawTool('circle')}
              style={{ fontSize: '8px', padding: '4px 10px', borderRadius: '15px', background: drawTool === 'circle' ? '#ffe680' : 'rgba(255,255,255,0.1)', color: drawTool === 'circle' ? '#000000' : '#ffffff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Circle
            </button>

            {/* Colors */}
            <div style={{ display: 'flex', gap: '4px', margin: '0 4px' }}>
              {drawColors.map((c, i) => (
                <div 
                  key={c}
                  onClick={() => setDrawColorIndex(i)}
                  style={{
                    width: '12px', height: '12px', borderRadius: '50%',
                    background: c, border: drawColorIndex === i ? '2px solid #ffe680' : '1px solid rgba(255,255,255,0.3)',
                    cursor: 'pointer'
                  }}
                />
              ))}
            </div>

            <button 
              onClick={() => setDrawings(prev => prev.slice(0, -1))}
              disabled={drawings.length === 0}
              style={{ 
                fontSize: '8px', padding: '4px 10px', borderRadius: '15px', 
                background: drawings.length === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.1)', 
                color: drawings.length === 0 ? '#64748b' : '#ffffff', 
                border: drawings.length === 0 ? '1px solid rgba(255,255,255,0.03)' : '1px solid rgba(255,255,255,0.15)', 
                fontWeight: 'bold', cursor: drawings.length === 0 ? 'not-allowed' : 'pointer' 
              }}
            >
              Undo Last
            </button>

            <button 
              onClick={() => setDrawings([])}
              style={{ fontSize: '8px', padding: '4px 10px', borderRadius: '15px', background: 'rgba(239,68,68,0.2)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Clear
            </button>
          </div>
        )}

        <button 
          onClick={() => setShowScoresPanel(!showScoresPanel)}
          style={{ fontSize: '9px', padding: '6px 14px', borderRadius: '20px', background: showScoresPanel ? '#10b981' : 'rgba(255,255,255,0.05)', color: showScoresPanel ? '#000000' : '#ffffff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
        >
          {showScoresPanel ? 'Hide Panel' : 'Balls & Scores'}
        </button>

        <button 
          onClick={() => setShowHelp(!showHelp)}
          style={{ fontSize: '9px', padding: '6px 14px', borderRadius: '20px', background: showHelp ? '#3b82f6' : 'rgba(255,255,255,0.05)', color: '#ffffff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
        >
          {showHelp ? 'Hide Help' : 'Help Manual'}
        </button>

        <button 
          onClick={handleReset}
          style={{ fontSize: '9px', padding: '6px 14px', borderRadius: '20px', background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)', fontWeight: 'bold', cursor: 'pointer' }}
        >
          Reset Game
        </button>
      </div>

      {/* --- Help Overlay Modal --- */}
      {showHelp && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(9,13,22,0.85)', backdropFilter: 'blur(20px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontFamily: 'sans-serif' }}>
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '24px', padding: '32px', maxWidth: '500px', width: '90%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#ffe680' }}>3D Gateball Visualiser Manual</h2>
            <div style={{ fontSize: '13px', lineHeight: '1.6', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p>Welcome to <strong>Gateball 3D</strong>! This sandbox lets you model and visualise game play on a 20m x 15m court.</p>
              <p><strong>Striker Rules:</strong> Select a ball from the right sidebar or click on it directly in 3D. Odd balls are Red, Even balls are White.</p>
              <p><strong>Place Mode:</strong> Click on the court to place your selected ball. Balls start docked off-court. You can place them anywhere, but standard rules require launching them inside the <strong>Start Area</strong> (bottom right).</p>
              <p><strong>Aim Mode:</strong> Move your mouse over the court. Click to point your mallet towards that target spot. The mallet automatically snaps exactly 0.53m behind the ball. Adjust the angle or speed using the sliders in the left panel, and toggle Power Shot for double the punch.</p>
              <p><strong>Spark Mode:</strong> When your striker ball makes contact with another ball, they touch! In the sandbox, you can aim a spark shot by clicking where you want to send the sparked ball. Hit the striker, and the target ball launches while the striker ball remains stationary!</p>
              <p><strong>Gate Passing & Agari:</strong> Pass Gate 1, 2, and 3 in order to score 1 point each. Hit the central Goal Pole after running all 3 gates to get Agari (Finish) and earn 2 points!</p>
            </div>
            <button 
              onClick={() => setShowHelp(false)}
              style={{ padding: '10px 16px', background: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', marginTop: '8px' }}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* --- Screen Freeze Overlay --- */}
      {isPaused && (
        <div style={{ position: 'absolute', top: '15px', right: '50%', transform: 'translateX(50%)', background: 'rgba(239, 68, 68, 0.25)', border: '1.5px solid rgba(239, 68, 68, 0.5)', padding: '6px 16px', borderRadius: '30px', color: '#ff8a8a', fontSize: '9px', fontWeight: '800', letterSpacing: '0.15em', zIndex: 100, display: 'flex', alignItems: 'center', gap: '8px', pointerEvents: 'none' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px #ef4444' }}></span>
          SCREEN FROZEN (PRESS P TO UNFREEZE)
        </div>
      )}

      {/* --- Toast Banner --- */}
      {toastMessage && (
        <div style={{ position: 'absolute', bottom: '80px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(16,185,129,0.9)', border: '1px solid rgba(16,185,129,0.2)', padding: '10px 24px', borderRadius: '30px', color: '#000000', fontSize: '11px', fontWeight: '800', letterSpacing: '0.05em', zIndex: 999, boxShadow: '0 10px 30px rgba(16,185,129,0.4)', animation: 'slide-up-toast 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
          {toastMessage}
        </div>
      )}

    </div>
  );
}
