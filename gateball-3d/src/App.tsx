import React, { useState, useRef, useEffect, useMemo, useCallback, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Line, Environment, Html } from '@react-three/drei';
import * as THREE from 'three';
import CourtSurface from './components/CourtSurface';
import ParkSurroundings from './components/ParkSurroundings';
import GateballGate from './components/GateballGate';
import GateballBall from './components/GateballBall';
import CartoonPlayer from './components/CartoonPlayer';
import { TUTORIAL_STEPS, type DemoAction } from './data/gateballTutorialData';
import { useAudioNarration } from './utils/useAudioNarration';
import TutorialPlayer from './components/TutorialPlayer';
import Scoreboard from './components/Scoreboard';
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

// Check if a segment intersects a Gate opening in the valid WGU direction
// Gate locations and dimensions:
// Gate 1: x = 3.5, z = -8.0, posts in Z (rotationY = Math.PI / 2). Direction: East to West (-X)
// Gate 2: x = -5.5, z = 2.0, posts in X (rotationY = 0). Direction: South to North (+Z)
// Gate 3: x = 5.5, z = 0.0, posts in X (rotationY = 0). Direction: North to South (-Z)
const checkGatePass = (id: number, x1: number, z1: number, x2: number, z2: number) => {
  const gate = GATES.find(g => g.id === id);
  if (!gate) return false;

  const halfOpening = GATE_WIDTH / 2; // 0.345m (scaled 3x to match ball and screen visibility)

  if (id === 1) {
    // Gate 1: cross line is at X = 3.5, moving from East (x1 > 3.5) to West (x2 <= 3.5)
    const crossX = 3.5;
    if (x1 > crossX && x2 <= crossX) {
      const t = (crossX - x1) / (x2 - x1);
      const intersectZ = z1 + t * (z2 - z1);
      if (intersectZ >= -8.0 - halfOpening && intersectZ <= -8.0 + halfOpening) return true;
    }
  } else if (id === 2) {
    // Gate 2: cross line is at Z = 2.0, moving from South (z1 < 2.0) to North (z2 >= 2.0)
    const crossZ = 2.0;
    if (z1 < crossZ && z2 >= crossZ) {
      const t = (crossZ - z1) / (z2 - z1);
      const intersectX = x1 + t * (x2 - x1);
      if (intersectX >= -5.5 - halfOpening && intersectX <= -5.5 + halfOpening) return true;
    }
  } else if (id === 3) {
    // Gate 3: cross line is at Z = 0.0, moving from North (z1 > 0.0) to South (z2 <= 0.0)
    const crossZ = 0.0;
    if (z1 > crossZ && z2 <= crossZ) {
      const t = (crossZ - z1) / (z2 - z1);
      const intersectX = x1 + t * (x2 - x1);
      if (intersectX >= 5.5 - halfOpening && intersectX <= 5.5 + halfOpening) return true;
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
  resetCounter: number;
  gotoPresetRef: React.MutableRefObject<CameraPresetData | null>;
  getCurrentCameraRef: React.MutableRefObject<(() => CameraPresetData) | null>;
}

function CameraController({ resetCounter, gotoPresetRef, getCurrentCameraRef }: CameraControllerProps) {
  const { camera, controls } = useThree();
  const prevCounter = useRef(resetCounter);

  // --- Smooth preset lerp state ---
  const isLerpingRef   = useRef(false);
  const lerpProgRef    = useRef(0);
  const lerpFromPos    = useRef(new THREE.Vector3());
  const lerpFromTarget = useRef(new THREE.Vector3());
  const lerpToPos      = useRef(new THREE.Vector3());
  const lerpToTarget   = useRef(new THREE.Vector3());

  // Expose a getter so the App can read the current camera for saving (in effect to avoid render mutations)
  useEffect(() => {
    getCurrentCameraRef.current = () => ({
      position: camera.position.toArray() as [number, number, number],
      target:   [(controls as any).target.x, (controls as any).target.y, (controls as any).target.z],
    });
  }, [camera, controls, getCurrentCameraRef]);

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


// --- Spark Contact Ring ---
// Step 4 "Setting the Spark" — shows the valid placement locus (radius = 2*BALL_RADIUS).
// Color: green = teammate ball, orange = opponent ball (both legal in WGU rules).
interface SparkRingProps {
  strikerPos: [number, number, number];
  isTeammate: boolean;
  visible: boolean;
}

function SparkRing({ strikerPos, isTeammate, visible }: SparkRingProps) {
  if (!visible) return null;
  const ringColor = isTeammate ? '#22c55e' : '#f97316';
  const segments = 64;
  const ringR = 2 * BALL_RADIUS;
  const points: [number, number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    points.push([
      strikerPos[0] + Math.cos(theta) * ringR,
      0.025,
      strikerPos[2] + Math.sin(theta) * ringR
    ]);
  }
  return (
    <Line
      points={points}
      color={ringColor}
      lineWidth={2}
      dashed
      dashSize={0.04}
      gapSize={0.04}
      polygonOffset
      polygonOffsetFactor={-20}
      polygonOffsetUnits={-20}
    />
  );
}

// --- Spark Pin Indicator ---
// Step 3 "Stepping On Your Ball" — a small glowing disc on the striker ball shows it is
// anchored under the player's foot and cannot travel during the spark stroke.
interface SparkPinProps {
  strikerPos: [number, number, number];
  visible: boolean;
}

function SparkPinIndicator({ strikerPos, visible }: SparkPinProps) {
  if (!visible) return null;
  return (
    <group position={[strikerPos[0], strikerPos[1], strikerPos[2]]}>
      {/* Glowing foot-pin disc sitting on top of the ball */}
      <mesh position={[0, BALL_RADIUS + 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[BALL_RADIUS * 0.55, BALL_RADIUS * 0.85, 24]} />
        <meshBasicMaterial color="#facc15" transparent opacity={0.75} />
      </mesh>
      {/* Vertical pin needle above the ball */}
      <mesh position={[0, BALL_RADIUS * 2.2, 0]}>
        <cylinderGeometry args={[0.008, 0.008, BALL_RADIUS * 1.4, 8]} />
        <meshBasicMaterial color="#facc15" transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

// --- Spark Lightning Indicator ---
// A billboard ⚡ floating above the touched ball, visible from TOUCH_DETECTED until
// the spark stroke resolves (success or failure). Makes it immediately clear which
// ball has been touched and is awaiting a spark.
interface SparkLightningProps {
  ballPos: [number, number, number];
}

function SparkLightningIndicator({ ballPos }: SparkLightningProps) {
  return (
    <Html
      position={[ballPos[0], ballPos[1] + BALL_RADIUS * 4.5, ballPos[2]]}
      center
      zIndexRange={[100, 0]}
      style={{ pointerEvents: 'none' }}
    >
      <div style={{
        fontSize: '22px',
        lineHeight: 1,
        filter: 'drop-shadow(0 0 6px #facc15) drop-shadow(0 0 12px #f97316)',
        animation: 'spark-pulse 0.7s ease-in-out infinite alternate',
        userSelect: 'none',
      }}>
        ⚡
      </div>
    </Html>
  );
}

interface PhysicsManagerProps {
  physicsBalls: React.MutableRefObject<Record<BallId, PhysicsBallState>>;
  meshRefs: React.MutableRefObject<Record<BallId, React.RefObject<THREE.Object3D | null>>>;
  onPositionChange: (id: BallId, x: number, z: number) => void;
  onGatePass: (ballId: BallId, gateId: number) => void;
  onPegHit: (ballId: BallId) => void;
  onTouch?: (strikerId: BallId, touchedId: BallId) => void;
  activeStriker: BallId | null;
  ballScores: Record<BallId, BallScore>;
  isPaused: boolean;
}

function PhysicsManager({
  physicsBalls,
  meshRefs,
  onPositionChange,
  onGatePass,
  onPegHit,
  onTouch,
  activeStriker,
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
          onPositionChange(id, b.x, b.z);
          playSound(SOUNDS.miss, 0.4);
        } else if (isOutRight && !wasOutRight) {
          const t = b.vx ? (BOUNDARY_X + BALL_RADIUS - prevX) / b.vx : 0;
          b.z = prevZ + b.vz * t;
          b.x = BOUNDARY_X + (0.2 + BALL_RADIUS);
          b.vx = 0; b.vz = 0; b.isRolling = false;
          onPositionChange(id, b.x, b.z);
          playSound(SOUNDS.miss, 0.4);
        } else if (isOutTop && !wasOutTop) {
          const t = b.vz ? (-BOUNDARY_Z - BALL_RADIUS - prevZ) / b.vz : 0;
          b.x = prevX + b.vx * t;
          b.z = -BOUNDARY_Z - (0.2 + BALL_RADIUS);
          b.vx = 0; b.vz = 0; b.isRolling = false;
          onPositionChange(id, b.x, b.z);
          playSound(SOUNDS.miss, 0.4);
        } else if (isOutBottom && !wasOutBottom) {
          const t = b.vz ? (BOUNDARY_Z + BALL_RADIUS - prevZ) / b.vz : 0;
          b.x = prevX + b.vx * t;
          b.z = BOUNDARY_Z + (0.2 + BALL_RADIUS);
          b.vx = 0; b.vz = 0; b.isRolling = false;
          onPositionChange(id, b.x, b.z);
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
            onPositionChange(id, b.x, b.z);
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

        // 5. Clean up slow movements and sync to React on settling
        const speed = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
        if (speed < 0.04 && b.isRolling) {
          b.vx = 0; b.vz = 0; b.isRolling = false;
          onPositionChange(id, b.x, b.z);
        }
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
              // WGU Touch detection: active striker touches another ball on the court
              if (activeStriker && onTouch) {
                if (idA === activeStriker && bB.x <= 8.8) {
                  onTouch(idA, idB);
                } else if (idB === activeStriker && bA.x <= 8.8) {
                  onTouch(idB, idA);
                }
              }

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
  const ballScoresRef = useRef(ballScores);
  useEffect(() => {
    ballScoresRef.current = ballScores;
  }, [ballScores]);

  // Full turn snapshot for replaying strokes & sparks
  interface TurnHistorySnapshot {
    balls: Record<BallId, { x: number; z: number }>;
    scores: Record<BallId, BallScore>;
    selectedBall: BallId | null;
    activeStriker: BallId | null;
    sparkTargetId: BallId | null;
    sparkPhase: 'none' | 'positioning' | 'aiming';
    continuousStrokes: number;
    gateAndTouchSameStroke: boolean;
    angle: number;
  }

  // Undo history stack
  const [history, setHistory] = useState<TurnHistorySnapshot[]>([]);

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
  const [showAimingLines, setShowAimingLines] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showScoresPanel, setShowScoresPanel] = useState(true);
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

  // WGU Official Touch handler — called every sub-step while balls overlap,
  // but the one-shot guard ensures each unique touched ball registers only once.
  const handleTouch = useCallback((_strikerId: BallId, touchedId: BallId) => {
    // Guard 1: already queued for this stroke
    if (touchFiredThisStrokeRef.current.has(touchedId)) return;
    // Guard 2: already sparked this turn — touching again is a foul (WGU)
    if (sparkedBallsThisTurnRef.current.has(touchedId)) return;

    touchFiredThisStrokeRef.current.add(touchedId);
    sparkQueueRef.current.push(touchedId);

    // Sound — actual UI transitions happen when isPlaying → false (balls at rest)
    playSound(SOUNDS.collision, 0.5);
  }, []);

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
  const sparkMode = useMemo(() => !!sparkTargetId, [sparkTargetId]);

  // ── Phase-level spark state ─────────────────────────────────────────────
  // 'none'         — not sparking
  // 'positioning'  — player drags touched ball onto contact ring
  // 'aiming'       — direction locked, player clicks for power
  const [sparkPhase, setSparkPhase] = useState<'none' | 'positioning' | 'aiming'>('none');

  // One-shot guard: prevents handleTouch from firing multiple times per sub-step
  const touchFiredThisStrokeRef = useRef<Set<BallId>>(new Set());

  // Queue of touched balls waiting to be sparked (in order they were touched)
  const sparkQueueRef = useRef<BallId[]>([]);

  // Balls already sparked this turn — re-touching is a foul (WGU)
  const sparkedBallsThisTurnRef = useRef<Set<BallId>>(new Set());

  // Position of the spark target ball just BEFORE the spark impulse fires
  // Used for the >10cm (0.30 world-unit) success check
  const sparkBallPrePosRef = useRef<{ x: number; z: number } | null>(null);

  // Which ball was just sparked (needed in the resolution branch)
  const lastSparkedBallIdRef = useRef<BallId | null>(null);
  // ────────────────────────────────────────────────────────────────────────

  // WGU Continuous Strokes (Article 12 Clause 3)
  const [continuousStrokes, setContinuousStrokes] = useState<number>(0);
  const strokePassedGateRef = useRef(false);
  const gateAndTouchSameStrokeRef = useRef(false);
  const wasSparkStrokeRef = useRef(false);
  const wasStrokeActiveRef = useRef(false);

  // Tutorial State & Audio Narration
  const [isTutorialActive, setIsTutorialActive] = useState(false);
  const [currentTutorialStep, setCurrentTutorialStep] = useState(0);
  const [tutorialActionLabel, setTutorialActionLabel] = useState<string | null>(null);
  const isTutorialActiveRef = useRef(false);
  const currentDemoActionIdxRef = useRef<number>(-1);
  const currentDemoActionsRef = useRef<DemoAction[]>([]);
  const { isMuted, isSpeaking, toggleMute, speak, stop: stopNarration } = useAudioNarration();
  const tutorialDemoTimeout = useRef<any>(null);

  const executeTutorialAction = useCallback((actionIdx: number) => {
    if (!isTutorialActiveRef.current) return;
    const actions = currentDemoActionsRef.current;
    if (actionIdx >= actions.length) {
      setTutorialActionLabel(null);
      return;
    }

    currentDemoActionIdxRef.current = actionIdx;
    const action = actions[actionIdx];
    setTutorialActionLabel(action.label);

    const strikerId = action.ballId;
    setSelectedBall(strikerId);
    setActiveStriker(strikerId);

    const b = physicsBalls.current[strikerId];
    strikeInitialPos.current = [b.x, BALL_RADIUS, b.z];
    strikeInitialAngle.current = action.angle;
    strikeTargetDist.current = action.dist;
    setAngle(action.angle);

    if (action.isSpark && action.sparkTarget) {
      setSparkTargetId(action.sparkTarget);
    } else {
      setSparkTargetId(null);
    }

    setPlayerState('hidden');
    setShowAimingLines(true);

    tutorialDemoTimeout.current = setTimeout(() => {
      if (!isTutorialActiveRef.current) return;
      playShotRef.current();
    }, 450);
  }, []);

  const runTutorialStep = useCallback((stepIndex: number) => {
    if (stepIndex < 0 || stepIndex >= TUTORIAL_STEPS.length) return;
    const step = TUTORIAL_STEPS[stepIndex];
    if (tutorialDemoTimeout.current) clearTimeout(tutorialDemoTimeout.current);

    // 1. Pan camera smoothly to step focus
    gotoPresetRef.current = step.camera;

    // 2. Setup ball positions
    setBalls(step.balls);
    BALL_IDS.forEach(id => {
      const pos = step.balls[id];
      physicsBalls.current[id].x = pos.x;
      physicsBalls.current[id].z = pos.z;
      physicsBalls.current[id].vx = 0;
      physicsBalls.current[id].vz = 0;
      physicsBalls.current[id].isRolling = false;
      const mesh = meshRefs.current[id].current;
      if (mesh) {
        mesh.position.x = pos.x;
        mesh.position.z = pos.z;
      }
    });

    // 3. Setup initial scores (vital for gate circuit order and Agari goal pole finish)
    const freshScores = {} as Record<BallId, BallScore>;
    BALL_IDS.forEach(id => {
      freshScores[id] = {
        gate1: false, gate2: false, gate3: false, finished: false,
        ...(step.initialScores?.[id] || {})
      };
    });
    setBallScores(freshScores);

    // 4. Reset stroke states & refs
    setContinuousStrokes(0);
    strokePassedGateRef.current = false;
    gateAndTouchSameStrokeRef.current = false;
    wasSparkStrokeRef.current = false;
    wasStrokeActiveRef.current = false;
    setSparkTargetId(null);
    setTutorialActionLabel(null);

    // 5. Selection, stance, and aiming
    if (step.activeBallId) {
      setSelectedBall(step.activeBallId);
      setActiveStriker(step.activeBallId);
      setAngle(step.aimAngle ?? 0);
      strikeInitialPos.current = [step.balls[step.activeBallId].x, BALL_RADIUS, step.balls[step.activeBallId].z];
      strikeInitialAngle.current = step.aimAngle ?? 0;
      strikeTargetDist.current = step.demoActions?.[0]?.dist ?? step.demonstration?.dist ?? 4.0;
      setPlayerState('hidden');
      setShowAimingLines(true);
    } else {
      setSelectedBall(null);
      setActiveStriker(null);
      setPlayerState('hidden');
      setShowAimingLines(false);
    }

    // 6. Trigger voice narration
    speak(step.narration);

    // 7. Schedule Demo Actions
    currentDemoActionIdxRef.current = -1;
    currentDemoActionsRef.current = step.demoActions || [];

    if (step.demoActions && step.demoActions.length > 0) {
      const delay = step.demoActions[0].preDelayMs ?? 2000;
      tutorialDemoTimeout.current = setTimeout(() => {
        executeTutorialAction(0);
      }, delay);
    } else if (step.demonstration) {
      const demo = step.demonstration;
      tutorialDemoTimeout.current = setTimeout(() => {
        strikeInitialPos.current = [step.balls[demo.ballId].x, BALL_RADIUS, step.balls[demo.ballId].z];
        strikeInitialAngle.current = demo.angle;
        strikeTargetDist.current = demo.dist;
        setAngle(demo.angle);
        if (demo.isSpark && demo.sparkTarget) {
          setSparkTargetId(demo.sparkTarget);
        }
        playShotRef.current();
      }, 2000);
    }
  }, [speak, executeTutorialAction]);

  const startTutorial = useCallback(() => {
    isTutorialActiveRef.current = true;
    setIsTutorialActive(true);
    setCurrentTutorialStep(0);
    runTutorialStep(0);
  }, [runTutorialStep]);

  const nextTutorialStep = useCallback(() => {
    if (currentTutorialStep >= TUTORIAL_STEPS.length - 1) {
      isTutorialActiveRef.current = false;
      setIsTutorialActive(false);
      setTutorialActionLabel(null);
      stopNarration();
      showToast("Tutorial Complete! Enjoy the game.");
      return;
    }
    const nextIdx = currentTutorialStep + 1;
    setCurrentTutorialStep(nextIdx);
    runTutorialStep(nextIdx);
  }, [currentTutorialStep, runTutorialStep, stopNarration]);

  const prevTutorialStep = useCallback(() => {
    if (currentTutorialStep <= 0) return;
    const prevIdx = currentTutorialStep - 1;
    setCurrentTutorialStep(prevIdx);
    runTutorialStep(prevIdx);
  }, [currentTutorialStep, runTutorialStep]);

  const replayTutorialStep = useCallback(() => {
    runTutorialStep(currentTutorialStep);
  }, [currentTutorialStep, runTutorialStep]);

  const exitTutorial = useCallback(() => {
    isTutorialActiveRef.current = false;
    setIsTutorialActive(false);
    setTutorialActionLabel(null);
    stopNarration();
    if (tutorialDemoTimeout.current) clearTimeout(tutorialDemoTimeout.current);
    showToast("Exited Tutorial");
  }, [stopNarration]);

  // Sync state values with physics refs when modified (with dynamic drag collision)
  const handleBallChange = useCallback((id: BallId, targetX: number, targetZ: number) => {
    let finalX = targetX;
    let finalZ = targetZ;

    // ── SPARK POSITIONING: drag touched ball freely, snap to ring when close ──
    // The player drags the touched ball from wherever it rests toward their own ball.
    // Once within SNAP_THRESHOLD of the striker, the ball magnetically locks to the
    // contact ring (radius = 2*BALL_RADIUS) — freeing the player to orbit it to choose
    // the exact spark direction. Click the court to confirm and proceed to Step 5.
    if (sparkPhase === 'positioning' && id === sparkTargetId && activeStriker) {
      const striker = physicsBalls.current[activeStriker];
      const dx = finalX - striker.x;
      const dz = finalZ - striker.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const ringR = 2 * BALL_RADIUS;
      const SNAP_THRESHOLD = ringR * 4; // snap to ring once within ~4× ball diameter

      if (dist <= SNAP_THRESHOLD) {
        // Close enough — lock to ring at the current angle
        if (dist > 0.001) {
          finalX = striker.x + (dx / dist) * ringR;
          finalZ = striker.z + (dz / dist) * ringR;
        } else {
          finalX = striker.x;
          finalZ = striker.z - ringR;
        }
      }
      // else: too far away — allow free movement (player is still carrying the ball over)

      // Update physics + mesh + React state directly (no general overlap resolution needed)
      physicsBalls.current[id].x = finalX;
      physicsBalls.current[id].z = finalZ;
      const ringMesh = meshRefs.current[id].current;
      if (ringMesh) { ringMesh.position.x = finalX; ringMesh.position.z = finalZ; }
      setBalls(prev => ({ ...prev, [id]: { x: finalX, z: finalZ } }));
      return;
    }
    // ────────────────────────────────────────────────────────────────────────


    // Resolve overlaps so dragged balls cannot occupy another ball's space, the goal pole, or gates
    for (let iter = 0; iter < 3; iter++) {
      let resolvedAny = false;

      
      // 1. Other Balls
      for (const otherId of BALL_IDS) {
        if (otherId === id) continue;
        const otherPhys = physicsBalls.current[otherId as BallId];
        const dx = finalX - otherPhys.x;
        const dz = finalZ - otherPhys.z;
        const distSq = dx * dx + dz * dz;
        const minDist = 2 * BALL_RADIUS;
        
        if (distSq > 0 && distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq);
          const overlap = minDist - dist;
          finalX += (dx / dist) * overlap;
          finalZ += (dz / dist) * overlap;
          resolvedAny = true;
        }
      }

      // 2. Goal Pole
      const gdx = finalX - GOAL_POLE_POS.x;
      const gdz = finalZ - GOAL_POLE_POS.z;
      const gDistSq = gdx * gdx + gdz * gdz;
      const gMinDist = BALL_RADIUS + GOAL_POLE_RADIUS;
      if (gDistSq > 0 && gDistSq < gMinDist * gMinDist) {
        const dist = Math.sqrt(gDistSq);
        const overlap = gMinDist - dist;
        finalX += (gdx / dist) * overlap;
        finalZ += (gdz / dist) * overlap;
        resolvedAny = true;
      }

      // 3. Gate Legs
      for (const leg of GATE_LEGS) {
        const ldx = finalX - leg.x;
        const ldz = finalZ - leg.z;
        const lDistSq = ldx * ldx + ldz * ldz;
        const lMinDist = BALL_RADIUS + 0.03; // Approx leg radius
        if (lDistSq > 0 && lDistSq < lMinDist * lMinDist) {
          const dist = Math.sqrt(lDistSq);
          const overlap = lMinDist - dist;
          finalX += (ldx / dist) * overlap;
          finalZ += (ldz / dist) * overlap;
          resolvedAny = true;
        }
      }

      if (!resolvedAny) break;
    }

    setBalls(prev => ({ ...prev, [id]: { x: finalX, z: finalZ } }));
    physicsBalls.current[id].x = finalX;
    physicsBalls.current[id].z = finalZ;

    // Do not steal selection if dragging the sparked ball
    if (!(sparkPhase === 'positioning' && id === sparkTargetId)) {
      setSelectedBall(id);
    }

    // Instantly sync visual WebGL mesh if present (matches clean-court sync pattern to prevent wobbly drag)
    const mesh = meshRefs.current[id].current;
    if (mesh) {
      mesh.position.x = finalX;
      mesh.position.z = finalZ;
    }
  }, [sparkPhase, sparkTargetId, activeStriker]);

  const saveToHistory = useCallback(() => {
    const currentBalls: Record<BallId, { x: number; z: number }> = {} as any;
    BALL_IDS.forEach(id => {
      currentBalls[id] = {
        x: physicsBalls.current[id].x,
        z: physicsBalls.current[id].z
      };
    });

    const snapshot: TurnHistorySnapshot = {
      balls: currentBalls,
      scores: JSON.parse(JSON.stringify(ballScoresRef.current)),
      selectedBall,
      activeStriker: activeStriker || selectedBall,
      sparkTargetId,
      sparkPhase,
      continuousStrokes,
      gateAndTouchSameStroke: gateAndTouchSameStrokeRef.current,
      angle
    };

    setHistory(prev => {
      const next = [...prev, snapshot];
      if (next.length > 50) next.shift();
      return next;
    });
  }, [selectedBall, activeStriker, sparkTargetId, sparkPhase, continuousStrokes, angle]);

  const handleUndo = useCallback(() => {
    if (history.length === 0 || isStriking || isReplaying) return;
    if (autoPlayTimeout.current) clearTimeout(autoPlayTimeout.current);

    const prev = history[history.length - 1];
    setHistory(list => list.slice(0, -1));

    // 1. Sync physics balls & React state & visual Three.js meshes
    setBalls(prev.balls);
    BALL_IDS.forEach(id => {
      const pos = prev.balls[id];
      physicsBalls.current[id].x = pos.x;
      physicsBalls.current[id].z = pos.z;
      physicsBalls.current[id].vx = 0;
      physicsBalls.current[id].vz = 0;
      physicsBalls.current[id].isRolling = false;
      const mesh = meshRefs.current[id]?.current;
      if (mesh) {
        mesh.position.x = pos.x;
        mesh.position.z = pos.z;
      }
    });

    // 2. Restore score records
    setBallScores(prev.scores);

    // 3. Restore active selection and striker
    setSelectedBall(prev.selectedBall);
    setActiveStriker(prev.activeStriker);

    // 4. Restore Spark state (CRITICAL for replaying a spark!)
    setSparkTargetId(prev.sparkTargetId);
    if (prev.sparkTargetId) {
      // Return to spark aiming stance with direction locked along ball centers
      setSparkPhase(prev.sparkPhase !== 'none' ? prev.sparkPhase : 'aiming');
    } else {
      setSparkPhase('none');
    }

    // 5. Restore continuous strokes & combo flags
    setContinuousStrokes(prev.continuousStrokes);
    gateAndTouchSameStrokeRef.current = prev.gateAndTouchSameStroke;
    strokePassedGateRef.current = false;
    wasSparkStrokeRef.current = false;
    wasStrokeActiveRef.current = false;

    // 6. Restore angle & player stance
    setAngle(prev.angle);
    strikeInitialAngle.current = prev.angle;
    if (prev.selectedBall) {
      strikeInitialPos.current = [prev.balls[prev.selectedBall].x, BALL_RADIUS, prev.balls[prev.selectedBall].z];
    }
    setPlayerState('hidden');
    setShowAimingLines(false);

    const replayLabel = prev.sparkTargetId
      ? `Replay Spark: Ball ${prev.sparkTargetId.replace(/[^\d]/g, '')}`
      : prev.selectedBall
        ? `Replay Turn: Ball ${prev.selectedBall.replace(/[^\d]/g, '')}`
        : 'Turn Replayed';
    showToast(`↩ ${replayLabel}`);
  }, [history, isStriking, isReplaying]);

  // Hitting trigger
  const playShot = useCallback(() => {
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

    wasStrokeActiveRef.current = true;
    if (sparkPhase === 'aiming' && sparkTargetId) {
      // This is a spark stroke — mark it, record pre-spark position
      wasSparkStrokeRef.current = true;
      lastSparkedBallIdRef.current = sparkTargetId;
      const tb = physicsBalls.current[sparkTargetId];
      sparkBallPrePosRef.current = { x: tb.x, z: tb.z };
    } else {
      // Normal stroke — reset spark stroke tracking and clear the touch guard
      wasSparkStrokeRef.current = false;
      strokePassedGateRef.current = false;
      touchFiredThisStrokeRef.current.clear();
      sparkQueueRef.current = [];
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
  }, [isStriking, isReplaying, selectedBall, balls, saveToHistory, angle, features.recording, sequence.length, speed, isPowerShot, ballScores, sparkMode, sparkTargetId]);

  useEffect(() => {
    playShotRef.current = playShot;
  }, [playShot]);

  const handleImpact = () => {
    console.log("[DEBUG] handleImpact triggered! activeStriker:", activeStriker, "angle:", angle, "speed:", speed);
    if (!activeStriker) {
      console.log("[DEBUG] handleImpact ignored: activeStriker is null!");
      return;
    }
    playSound(SOUNDS.mallet, 0.7);

    // Velocity math
    const shotAngle = strikeInitialAngle.current !== undefined ? strikeInitialAngle.current : angle;
    const rad = (shotAngle * Math.PI) / 180;
    const velocityMultiplier = isPowerShot ? 2.0 : 1.0;
    
    // Calculate initial speed so that the ball rolls exactly the clicked target distance under k=0.85 deceleration.
    const dist = strikeTargetDist.current || 4.0;
    const targetSpeed = (dist * 0.85 + 0.04) * velocityMultiplier;
    console.log("[DEBUG] Target distance:", dist, "Target speed:", targetSpeed, "shotAngle:", shotAngle);
    const vx = Math.sin(rad) * targetSpeed;
    const vz = -Math.cos(rad) * targetSpeed;

    const b = physicsBalls.current[activeStriker];

    if (sparkPhase === 'aiming' && sparkTargetId) {
      // SPARK SHOT MECHANICS (WGU Articles 15 & 16)
      // Direction is LOCKED to the ball-to-ball axis (set during positioning)
      // Only power (magnitude) comes from the player's aim click.
      const targetBall = physicsBalls.current[sparkTargetId];

      // Compute the locked spark direction from the two ball centers at the moment of impact
      const sdx = targetBall.x - b.x;
      const sdz = targetBall.z - b.z;
      const slen = Math.sqrt(sdx * sdx + sdz * sdz);
      const snx = slen > 0.001 ? sdx / slen : Math.sin(rad);
      const snz = slen > 0.001 ? sdz / slen : -Math.cos(rad);

      // Apply impulse along the locked axis scaled by power
      const speed = Math.abs(Math.sqrt(vx * vx + vz * vz));
      targetBall.vx = snx * speed;
      targetBall.vz = snz * speed;
      targetBall.isRolling = true;

      // Striker stays pinned — zero velocity (foot-on-ball rule)
      b.vx = 0;
      b.vz = 0;
      b.isRolling = false;

      // Clear spark target & phase — resolution happens in turn-end effect
      setSparkTargetId(null);
      setSparkPhase('none');
    } else {
      // Standard Stroke
      b.vx = vx;
      b.vz = vz;
      b.isRolling = true;
    }

    // Reset aim angle and hide aim line during rolling
    setAngle(0);
    setShowAimingLines(false);
  };

  const handleFinished = () => {
    setIsStriking(false);
    setShowAimingLines(false);
    // Note: activeStriker and ball selection are evaluated once all balls settle in isPlaying effect
    
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
    if (ballId === activeStriker) {
      strokePassedGateRef.current = true;
    }
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
  }, [activeStriker]);

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

      // ── SPARK PHASE HANDLING ─────────────────────────────────────────────────
      if (sparkPhase === 'positioning' && sparkTargetId) {
        // A click during SPARK_POSITIONING locks the current ring angle as the direction
        // and transitions to SPARK_AIMING for power selection.
        const tbPhys = physicsBalls.current[sparkTargetId];
        const sparkDx = tbPhys.x - ball.x;
        const sparkDz = tbPhys.z - ball.z;
        // Compute the locked direction angle from the two ball centers
        let lockedAngle = Math.round((Math.atan2(sparkDx, -sparkDz) * 180) / Math.PI);
        if (lockedAngle < 0) lockedAngle += 360;
        setAngle(lockedAngle);
        strikeInitialPos.current = [ball.x, BALL_RADIUS, ball.z];
        strikeInitialAngle.current = lockedAngle;
        strikeTargetDist.current = Math.sqrt(aimDx * aimDx + aimDz * aimDz);
        setSparkPhase('aiming');
        setPlayerState('stalking');
        setShowAimingLines(true);
        if (autoPlayTimeout.current) clearTimeout(autoPlayTimeout.current);
        autoPlayTimeout.current = setTimeout(() => {
          if (playShotRef.current) playShotRef.current();
        }, 1200);
        return;
      }

      if (sparkPhase === 'aiming' && sparkTargetId) {
        // During SPARK_AIMING, direction is LOCKED — only power (click distance) matters.
        // Override angleDeg with the locked ball-to-ball axis.
        const tbPhys = physicsBalls.current[sparkTargetId];
        const sparkDx2 = tbPhys.x - ball.x;
        const sparkDz2 = tbPhys.z - ball.z;
        let lockedAngle = Math.round((Math.atan2(sparkDx2, -sparkDz2) * 180) / Math.PI);
        if (lockedAngle < 0) lockedAngle += 360;
        setAngle(lockedAngle);
        strikeInitialPos.current = [ball.x, BALL_RADIUS, ball.z];
        strikeInitialAngle.current = lockedAngle;
        strikeTargetDist.current = Math.sqrt(aimDx * aimDx + aimDz * aimDz);
        setPlayerState('stalking');
        setShowAimingLines(true);
        if (autoPlayTimeout.current) clearTimeout(autoPlayTimeout.current);
        autoPlayTimeout.current = setTimeout(() => {
          if (playShotRef.current) playShotRef.current();
        }, 1200);
        return;
      }
      // ─────────────────────────────────────────────────────────────────────────

      setAngle(angleDeg);

      // Lock player position, angle, and distance immediately
      strikeInitialPos.current = [ball.x, BALL_RADIUS, ball.z];
      strikeInitialAngle.current = angleDeg;
      strikeTargetDist.current = Math.sqrt(aimDx * aimDx + aimDz * aimDz);

      // Stalk the ball: player walks up from behind to stance, then auto-strikes
      setPlayerState('stalking');
      setShowAimingLines(true);

      if (autoPlayTimeout.current) clearTimeout(autoPlayTimeout.current);
      // After 1.2s of walking → automatically play stroke
      autoPlayTimeout.current = setTimeout(() => {
        if (playShotRef.current) playShotRef.current();
      }, 1200);

      // (Legacy manual spark detection removed — handled by PhysicsManager onTouch now)
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

  // Reset court positions
  const handleReset = useCallback(() => {
    saveToHistory();
    setBalls(resetPositions);
    setSparkTargetId(null);
    setSparkPhase('none');
    setContinuousStrokes(0);
    strokePassedGateRef.current = false;
    gateAndTouchSameStrokeRef.current = false;
    wasSparkStrokeRef.current = false;
    wasStrokeActiveRef.current = false;
    touchFiredThisStrokeRef.current.clear();
    sparkQueueRef.current = [];
    sparkedBallsThisTurnRef.current.clear();
    sparkBallPrePosRef.current = null;
    lastSparkedBallIdRef.current = null;

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
    
    // Default to camera angle 5 (index 4) on reset
    activateCameraPreset(4);
    
    showToast("Simulation Reset");
  }, [resetPositions, saveToHistory, activateCameraPreset]);

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
      } else if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        playShotRef.current();
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

  const prevIsPlayingRef = useRef(false);

  useEffect(() => {
    if (prevIsPlayingRef.current && !isPlaying && wasStrokeActiveRef.current && activeStriker) {
      wasStrokeActiveRef.current = false;
      const strikerId = activeStriker;
      const strikerPhys = physicsBalls.current[strikerId];
      strikeInitialPos.current = [strikerPhys.x, BALL_RADIUS, strikerPhys.z];

      const failedGate1 = !ballScoresRef.current[strikerId].gate1 && !strokePassedGateRef.current;
      
      // ── Find balls that moved and check boundaries ─────────────────────────
      const movedBalls = BALL_IDS.filter(id => {
        const pre = balls[id];
        const post = physicsBalls.current[id];
        return Math.abs(pre.x - post.x) > 0.001 || Math.abs(pre.z - post.z) > 0.001;
      });

      const outBalls = movedBalls.filter(id => {
        const phys = physicsBalls.current[id];
        return (Math.abs(phys.x) > 7.5 || Math.abs(phys.z) > 10.0) && phys.x < 8.8;
      });
      const isOutBall = outBalls.length > 0;

      // Sync physics positions back to React state so saveToHistory captures the new positions
      setBalls(prev => {
        const next = { ...prev };
        BALL_IDS.forEach(id => {
          next[id] = { x: physicsBalls.current[id].x, z: physicsBalls.current[id].z };
        });
        return next;
      });

      const getNextBallMessage = () => {
        const currentNum = parseInt(strikerId.replace(/[^\d]/g, ''), 10);
        const nextBallNum = (currentNum % 10) + 1;
        const nextBallId = BALL_IDS.find(id => id.replace(/[^\d]/g, '') === nextBallNum.toString());
        if (!nextBallId) return '';
        const scores = ballScoresRef.current[nextBallId];
        let target = 'Gate 1';
        if (scores.finished) target = 'Finished';
        else if (scores.gate3) target = 'Goal Pole';
        else if (scores.gate2) target = 'Gate 3';
        else if (scores.gate1) target = 'Gate 2';
        return `Next: Ball ${nextBallNum} (${target})`;
      };

      // ── Helper: end the turn entirely ──────────────────────────────────────
      const endTurn = (message: string) => {
        setSparkTargetId(null);
        setSparkPhase('none');
        wasSparkStrokeRef.current = false;
        sparkQueueRef.current = [];
        sparkedBallsThisTurnRef.current.clear();
        touchFiredThisStrokeRef.current.clear();
        setContinuousStrokes(0);
        setSelectedBall(null);
        setActiveStriker(null);
        setPlayerState('hidden');
        setShowAimingLines(false);
        showToast(message);
      };


      // ── Helper: enter SPARK_POSITIONING for next queued ball ────────────────
      // The touched ball stays exactly where it came to rest — the player drags
      // it against the striker ball themselves (Step 4: Setting the Spark).
      const enterSparkPositioning = (nextTouchedId: BallId) => {
        setSparkTargetId(nextTouchedId);
        setSparkPhase('positioning');
        setSelectedBall(strikerId);
        setPlayerState('hidden');
        setShowAimingLines(false);
        const ballNum = nextTouchedId.replace(/[^\d]/g, '');
        if (gateAndTouchSameStrokeRef.current) {
          showToast(`GATE & TOUCH! Drag Ball ${ballNum} against your ball to spark`);
        } else {
          showToast(`Touch! Drag Ball ${ballNum} against your ball to spark`);
        }
      };

      if (failedGate1) {
        // ── FIRST-STROKE GATE FAILURE: return to start row ──────────────────
        const resetPos = resetPositions[strikerId];
        handleBallChange(strikerId, resetPos.x, resetPos.z);
        endTurn(`Ball ${strikerId.replace(/[^\d]/g, '')} failed Gate 1. ${getNextBallMessage()}`);

      } else if (isOutBall && (!wasSparkStrokeRef.current || outBalls.includes(strikerId))) {
        // ── OUT BALL (Normal stroke, or Striker fouled during spark) ──────────
        const outBallNums = outBalls.map(id => id.replace(/[^\d]/g, '')).join(', ');
        endTurn(`Out Ball (Ball ${outBallNums})! ${getNextBallMessage()}`);

      } else if (wasSparkStrokeRef.current) {
        // ── SPARK STROKE JUST RESOLVED ────────────────────────────────────────
        wasSparkStrokeRef.current = false;
        const sparkedId = lastSparkedBallIdRef.current;
        const prePos = sparkBallPrePosRef.current;

        // Measure displacement (>10cm = 0.30 in 3× world scale = success)
        const SPARK_SUCCESS_THRESHOLD = 0.30;
        let sparkSucceeded = false;
        if (sparkedId && prePos) {
          const sp = physicsBalls.current[sparkedId];
          const disp = Math.sqrt((sp.x - prePos.x) ** 2 + (sp.z - prePos.z) ** 2);
          sparkSucceeded = disp >= SPARK_SUCCESS_THRESHOLD;
        }

        if (sparkedId) sparkedBallsThisTurnRef.current.add(sparkedId as BallId);
        sparkBallPrePosRef.current = null;

        if (!sparkSucceeded) {
          // Failed spark — turn ends immediately
          endTurn(`Spark failed! Turn ends. ${getNextBallMessage()}`);
        } else {
          // Successful spark — check if more balls are queued
          const nextQueued = sparkQueueRef.current.shift();
          if (nextQueued) {
            // Another touched ball to spark — re-enter SPARK_POSITIONING
            enterSparkPositioning(nextQueued);
          } else {
            // All sparks done — grant extra stroke(s)
            const extraStrokes = gateAndTouchSameStrokeRef.current ? 2 : 1;
            gateAndTouchSameStrokeRef.current = false;
            setContinuousStrokes(extraStrokes);
            setSelectedBall(strikerId);
            setPlayerState('hidden');
            setShowAimingLines(false);
            const msg = extraStrokes === 2
              ? 'Spark Complete! 2 CONTINUOUS STROKES (Gate + Touch combo)!'
              : 'Spark Complete! 1 CONTINUOUS STROKE gained!';
            showToast(msg);
          }
        }

      } else if (sparkQueueRef.current.length > 0) {
        // ── NORMAL STROKE JUST ENDED — touches detected, enter spark sequence ─
        if (strokePassedGateRef.current) {
          gateAndTouchSameStrokeRef.current = true;
          strokePassedGateRef.current = false;
        }
        const nextTouchedId = sparkQueueRef.current.shift()!;
        enterSparkPositioning(nextTouchedId);

      } else if (strokePassedGateRef.current) {
        strokePassedGateRef.current = false;
        setContinuousStrokes(1);
        setSelectedBall(strikerId);
        setPlayerState('hidden');
        setShowAimingLines(false);
        showToast('Gate Cleared! 1 CONTINUOUS STROKE gained!');
      } else if (continuousStrokes > 1) {
        setContinuousStrokes(prev => prev - 1);
        setSelectedBall(strikerId);
        setPlayerState('hidden');
        setShowAimingLines(false);
        showToast(`Continuous Stroke remaining: ${continuousStrokes - 1}`);
      } else if (continuousStrokes === 1) {
        setContinuousStrokes(0);
        sparkedBallsThisTurnRef.current.clear();
        setSelectedBall(null);
        setActiveStriker(null);
        setPlayerState('hidden');
        setShowAimingLines(false);
        showToast(`Turn Completed. ${getNextBallMessage()}`);
      } else {
        sparkedBallsThisTurnRef.current.clear();
        setSelectedBall(null);
        setActiveStriker(null);
        setPlayerState('hidden');
        setShowAimingLines(false);
        showToast(`Turn Completed. ${getNextBallMessage()}`);
      }

      // Tutorial next-action chaining
      if (isTutorialActiveRef.current && currentDemoActionIdxRef.current >= 0) {
        const nextIdx = currentDemoActionIdxRef.current + 1;
        const actions = currentDemoActionsRef.current;
        if (nextIdx < actions.length) {
          const nextAction = actions[nextIdx];
          const delay = nextAction.preDelayMs ?? 1800;
          tutorialDemoTimeout.current = setTimeout(() => {
            executeTutorialAction(nextIdx);
          }, delay);
        } else {
          setTutorialActionLabel(null);
        }
      }
    }
    prevIsPlayingRef.current = isPlaying;
  }, [isPlaying, activeStriker, sparkTargetId, continuousStrokes, executeTutorialAction, resetPositions, handleBallChange]);



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
            resetCounter={cameraResetCounter}
            gotoPresetRef={gotoPresetRef}
            getCurrentCameraRef={getCurrentCameraRef}
          />

        <AimLine
          selectedBall={selectedBall}
          balls={balls}
          angle={angle}
          ballSet={ballSet}
          visible={showAimingLines && !isStriking && !placementMode}
        />

        {/* Step 4 — Spark Contact Ring: shows where to place the touched ball */}
        {(sparkPhase === 'positioning' || sparkPhase === 'aiming') && activeStriker && (
          <SparkRing
            strikerPos={[balls[activeStriker].x, BALL_RADIUS, balls[activeStriker].z]}
            isTeammate={
              sparkTargetId
                ? (activeStriker.startsWith('r') === sparkTargetId.startsWith('r'))
                : false
            }
            visible={true}
          />
        )}

        {/* Step 3 — Foot Pin: glowing indicator shows striker ball is anchored under player's foot */}
        {(sparkPhase === 'positioning' || sparkPhase === 'aiming') && activeStriker && (
          <SparkPinIndicator
            strikerPos={[balls[activeStriker].x, 0, balls[activeStriker].z]}
            visible={true}
          />
        )}

        {/* ⚡ Lightning: shown above the touched/sparked ball from touch detection until spark resolves */}
        {sparkTargetId && balls[sparkTargetId] && balls[sparkTargetId].x < 8.8 && (
          <SparkLightningIndicator
            ballPos={[balls[sparkTargetId].x, BALL_RADIUS, balls[sparkTargetId].z]}
          />
        )}

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
                // Do not steal selection if clicking the sparked ball during spark setup
                if (sparkPhase === 'positioning' && id === sparkTargetId) return;

                if (!isPlaying) {
                  if (id !== selectedBall) {
                    setSelectedBall(id);
                    setSparkTargetId(null);
                    setContinuousStrokes(0);
                  }
                  setPlayerState('hidden');
                  if (autoPlayTimeout.current) clearTimeout(autoPlayTimeout.current);
                }
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
        {(selectedBall || activeStriker) && playerState !== 'hidden' && playerState !== 'aiming' && (
          <CartoonPlayer
            ballId={((activeStriker || selectedBall)!) as BallId}
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
          onTouch={handleTouch}
          activeStriker={activeStriker}
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
      <div className="hud-panel" style={{ position: 'absolute', top: '16px', left: '16px', display: 'flex', flexDirection: 'column', gap: '10px', zIndex: 10, width: '210px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }}></div>
          <h1 style={{ fontSize: '14px', fontWeight: '800', letterSpacing: '0.05em', color: '#ffffff', margin: 0, textTransform: 'uppercase' }}>Gateball 3D</h1>
        </div>

        {/* Selected Ball Info */}
        <div className="hud-left-column" style={{ padding: '8px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="panel-title" style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Selected Striker</div>
          {selectedBall ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '16px', height: '16px', borderRadius: '50%',
                background: selectedBall.startsWith('r') ? BALL_SETS[ballSet].red.hex : BALL_SETS[ballSet].white.hex,
                border: '1px solid rgba(255,255,255,0.2)'
              }} />
              <span style={{ fontSize: '11px', fontWeight: '700', color: '#ffffff' }}>
                Ball {selectedBall.replace(/[^\d]/g, '')} ({selectedBall.startsWith('r') ? 'Red' : 'White'})
              </span>
              {isSelectedBallOffCourt && <span style={{ fontSize: '8px', color: '#f59e0b', fontWeight: '600' }}>(Docked)</span>}
            </div>
          ) : (
            <span style={{ fontSize: '10px', color: '#64748b' }}>Select a ball to play</span>
          )}
        </div>

        {/* Power Shot Toggle */}
        {!placementMode && selectedBall && (
          <div className="hud-left-column" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)' }}>
            <input 
              type="checkbox" id="power-shot-left" checked={isPowerShot} 
              onChange={(e) => setIsPowerShot(e.target.checked)} 
              style={{ accentColor: '#10b981' }}
            />
            <label htmlFor="power-shot-left" style={{ fontSize: '10px', color: '#e2e8f0', fontWeight: '600', cursor: 'pointer' }}>Power Shot (2x Velocity)</label>
          </div>
        )}

        {/* Action Button: Play Stroke / Play Spark */}
        <button 
          className="hud-action-row" 
          onClick={playShot} 
          disabled={isPlaying || !selectedBall}
          style={{ 
            width: '100%',
            padding: '9px 14px', 
            background: sparkMode ? '#f59e0b' : continuousStrokes > 0 ? '#38bdf8' : '#10b981', 
            color: '#000000', 
            border: 'none', 
            borderRadius: '8px', 
            fontWeight: '800', 
            fontSize: '11px', 
            letterSpacing: '0.05em', 
            cursor: isPlaying || !selectedBall ? 'not-allowed' : 'pointer', 
            boxShadow: sparkMode 
              ? '0 4px 12px rgba(245,158,11,0.35)' 
              : continuousStrokes > 0 
                ? '0 4px 12px rgba(56,189,248,0.35)' 
                : '0 4px 12px rgba(16,185,129,0.3)', 
            transition: 'all 0.2s ease' 
          }}
        >
          {sparkMode 
            ? 'PLAY SPARK' 
            : continuousStrokes > 0 
              ? `CONTINUOUS STROKE (${continuousStrokes})` 
              : 'PLAY STROKE'}
        </button>

        {/* Undo / Replay Turn Button */}
        <button 
          onClick={handleUndo} 
          disabled={history.length === 0 || isPlaying}
          style={{ 
            width: '100%', 
            padding: '8px 12px', 
            borderRadius: '8px', 
            background: history.length === 0 || isPlaying ? 'rgba(255,255,255,0.03)' : 'rgba(59, 130, 246, 0.20)', 
            border: history.length === 0 || isPlaying ? '1px solid rgba(255,255,255,0.06)' : '1.5px solid rgba(59, 130, 246, 0.45)', 
            color: history.length === 0 || isPlaying ? '#475569' : '#93c5fd', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            gap: '6px',
            fontSize: '11px',
            fontWeight: '800',
            cursor: history.length === 0 || isPlaying ? 'not-allowed' : 'pointer',
            boxShadow: history.length > 0 && !isPlaying ? '0 4px 12px rgba(59, 130, 246, 0.25)' : 'none',
            transition: 'all 0.15s ease'
          }}
          title="Replay the current turn or spark (Undo)"
        >
          <span style={{ fontSize: '13px' }}>↩</span>
          <span>REPLAY TURN (UNDO)</span>
        </button>

        {/* Capture Panel */}
        <div className="hud-left-column" style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 'bold' }}>Sequence Capture</span>
            <button 
              onClick={() => setFeatures(prev => ({ ...prev, recording: !prev.recording }))}
              style={{ fontSize: '8px', padding: '2px 6px', borderRadius: '4px', background: features.recording ? '#ef4444' : 'rgba(255,255,255,0.1)', color: '#ffffff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
            >
              {features.recording ? 'REC ON' : 'REC OFF'}
            </button>
          </div>
          {sequence.length > 0 && (
            <div style={{ display: 'flex', gap: '4px' }}>
              <button onClick={startSequenceReplay} disabled={isReplaying} style={{ flex: 1, fontSize: '8px', padding: '3px 0', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', color: '#ffffff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>Replay</button>
              <button onClick={downloadSequence} style={{ flex: 1, fontSize: '8px', padding: '3px 0', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', color: '#ffffff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>Save</button>
              <button onClick={handleReset} style={{ flex: 1, fontSize: '8px', padding: '3px 0', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', color: '#ffffff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>Clear</button>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <label style={{ fontSize: '8px', color: '#94a3b8', fontWeight: 'bold', cursor: 'pointer', flex: 1 }}>Load:</label>
            <input type="file" accept=".json" onChange={loadSequence} style={{ fontSize: '8px', color: '#64748b', width: '85px' }} />
          </div>
        </div>
      </div>

      {/* --- Unified Top-Centre Information & Control Pill --- */}
      <div
        className="hud-pill-container"
        style={{
          position: 'absolute',
          top: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: 'rgba(15, 23, 42, 0.90)',
          backdropFilter: 'blur(20px)',
          border: '1.5px solid rgba(255, 255, 255, 0.18)',
          boxShadow: '0 12px 35px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
          borderRadius: '9999px',
          padding: '6px 14px 6px 16px',
          maxWidth: 'calc(100vw - 420px)',
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}
      >
        {/* 1. Selected Striker Section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {selectedBall ? (
            <>
              <div
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  background: selectedBall.startsWith('r') ? BALL_SETS[ballSet].red.hex : BALL_SETS[ballSet].white.hex,
                  color: selectedBall.startsWith('r') ? '#ffffff' : '#991b1b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: '900',
                  fontSize: '13px',
                  boxShadow: 'inset -1px -1px 3px rgba(0,0,0,0.4), 0 2px 5px rgba(0,0,0,0.3)',
                  border: '1.5px solid rgba(255,255,255,0.35)',
                  flexShrink: 0
                }}
              >
                {selectedBall.replace(/[^\d]/g, '')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                <span style={{ fontSize: '13px', fontWeight: '800', color: '#ffffff' }}>
                  Ball {selectedBall.replace(/[^\d]/g, '')}
                  <span style={{ fontSize: '11px', fontWeight: '600', color: selectedBall.startsWith('r') ? '#fca5a5' : '#cbd5e1', marginLeft: '4px' }}>
                    ({selectedBall.startsWith('r') ? 'Red' : 'White'})
                  </span>
                </span>
                {isSelectedBallOffCourt && (
                  <span style={{ fontSize: '10px', color: '#f59e0b', fontWeight: '700' }}>Docked (Drag to Start)</span>
                )}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '800' }}>?</div>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#94a3b8' }}>Select Striker</span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '24px', background: 'rgba(255, 255, 255, 0.16)' }} />

        {/* 2. Dynamic Context & Game Status (Large, highly readable text) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 4px', minWidth: '220px' }}>
          {toastMessage ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34d399', fontSize: '13px', fontWeight: '800', letterSpacing: '0.02em' }}>
              <span style={{ fontSize: '15px' }}>📢</span>
              <span>{toastMessage}</span>
            </div>
          ) : sparkPhase === 'positioning' && sparkTargetId ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fb923c', fontSize: '13px', fontWeight: '800', letterSpacing: '0.02em' }}>
              <span style={{ fontSize: '15px' }}>⚡</span>
              <span>
                STEP 4 — SET THE SPARK: Drag Ball {sparkTargetId.replace(/[^\d]/g, '')} against your ball
                {activeStriker && sparkTargetId && (activeStriker.startsWith('r') === sparkTargetId.startsWith('r'))
                  ? ' (Teammate)'
                  : ' (Opponent)'}
                {' '}· Click court to aim
              </span>
            </div>
          ) : sparkPhase === 'aiming' && sparkTargetId ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#facc15', fontSize: '13px', fontWeight: '800', letterSpacing: '0.02em' }}>
              <span style={{ fontSize: '15px' }}>🦶</span>
              <span>STEP 5 — STRIKE: Foot on ball · Direction locked · Click court to set power</span>
            </div>
          ) : continuousStrokes > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38bdf8', fontSize: '13px', fontWeight: '800', letterSpacing: '0.02em' }}>
              <span style={{ fontSize: '15px' }}>🎯</span>
              <span>CONTINUOUS STROKE · {continuousStrokes} stroke{continuousStrokes > 1 ? 's' : ''} remaining</span>
            </div>
          ) : selectedBall ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#e2e8f0', fontSize: '13px', fontWeight: '700' }}>
              <span style={{ fontSize: '15px' }}>🎯</span>
              <span>
                {isSelectedBallOffCourt
                  ? 'Drag ball into Start Area or onto court to play'
                  : 'Click court to aim & stroke, or click PLAY STROKE'}
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontSize: '13px', fontWeight: '600' }}>
              <span style={{ fontSize: '14px' }}>👈</span>
              <span>Select any ball on the scoreboard or court to begin turn</span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '24px', background: 'rgba(255, 255, 255, 0.16)' }} />

        {/* 3. Controls: Power Shot, Undo, Play */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Power Shot Toggle */}
          <button
            onClick={() => setIsPowerShot(!isPowerShot)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 10px',
              borderRadius: '16px',
              background: isPowerShot ? 'rgba(16, 185, 129, 0.22)' : 'rgba(255, 255, 255, 0.06)',
              border: isPowerShot ? '1.5px solid #10b981' : '1px solid rgba(255, 255, 255, 0.14)',
              color: isPowerShot ? '#34d399' : '#cbd5e1',
              fontSize: '12px',
              fontWeight: '700',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            title="Toggle 2x Velocity Power Shot"
          >
            <span>⚡</span>
            <span>Power {isPowerShot ? 'ON' : 'OFF'}</span>
          </button>

          {/* Undo Button */}
          <button
            onClick={handleUndo}
            disabled={history.length === 0 || isPlaying}
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              color: history.length === 0 || isPlaying ? '#475569' : '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              cursor: history.length === 0 || isPlaying ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease'
            }}
            title="Undo Stroke (Ctrl+Z)"
          >
            ↩
          </button>

          {/* Play Action Button */}
          <button
            onClick={playShot}
            disabled={isPlaying || !selectedBall}
            style={{
              padding: '6px 18px',
              borderRadius: '20px',
              background: sparkMode
                ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                : continuousStrokes > 0
                  ? 'linear-gradient(135deg, #38bdf8, #0284c7)'
                  : 'linear-gradient(135deg, #10b981, #059669)',
              color: '#ffffff',
              border: 'none',
              fontWeight: '800',
              fontSize: '12px',
              letterSpacing: '0.04em',
              cursor: isPlaying || !selectedBall ? 'not-allowed' : 'pointer',
              opacity: isPlaying || !selectedBall ? 0.45 : 1,
              boxShadow: sparkMode
                ? '0 4px 14px rgba(245, 158, 11, 0.45)'
                : continuousStrokes > 0
                  ? '0 4px 14px rgba(56, 189, 248, 0.45)'
                  : '0 4px 14px rgba(16, 185, 129, 0.35)',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease'
            }}
          >
            {sparkMode
              ? 'PLAY SPARK'
              : continuousStrokes > 0
                ? `CONTINUE (${continuousStrokes})`
                : 'PLAY STROKE'}
          </button>
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
            @keyframes spark-pulse {
              0%   { transform: scale(1)    translateY(0px);  opacity: 1; }
              100% { transform: scale(1.35) translateY(-4px); opacity: 0.8; }
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

      {/* 3. Right Scoreboard + Tool Pill (Digital Style, top-right) */}
      <Scoreboard
        showBody={showScoresPanel}
        ballScores={ballScores}
        selectedBall={selectedBall}
        onBallSelect={(id) => {
          if (sparkPhase === 'positioning' && id === sparkTargetId) return;
          if (!isPlaying) {
            if (id !== selectedBall) {
              setSelectedBall(id as BallId);
              setSparkTargetId(null);
              setContinuousStrokes(0);
            }
            setPlayerState('hidden');
            if (autoPlayTimeout.current) clearTimeout(autoPlayTimeout.current);
          }
        }}
        toolbar={
          <>
            {/* Reset stroke */}
            <button
              className="sb-toolbar-btn"
              onClick={handleReset}
              style={{ background: 'rgba(239,68,68,0.18)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.35)' }}
            >
              🔄 Reset
            </button>

            {/* Draw toggle */}
            <button
              className="sb-toolbar-btn"
              onClick={() => {
                setDrawMode(!drawMode);
                if (drawMode) { setIsDrawingActive(false); setCurrentDrawingPoints([]); }
              }}
              style={{ background: drawMode ? '#10b981' : 'rgba(255,255,255,0.07)', color: drawMode ? '#000' : '#e2e8f0', border: drawMode ? 'none' : '1px solid rgba(255,255,255,0.12)' }}
            >
              ✏️ {drawMode ? 'Drawing ON' : 'Draw'}
            </button>

            {/* Draw sub-tools — only when draw mode active */}
            {drawMode && (
              <>
                <button className="sb-toolbar-btn" onClick={() => setDrawTool('pencil')}
                  style={{ background: drawTool === 'pencil' ? '#ffe680' : 'rgba(255,255,255,0.08)', color: drawTool === 'pencil' ? '#000' : '#e2e8f0', border: 'none' }}>
                  Pencil
                </button>
                <button className="sb-toolbar-btn" onClick={() => setDrawTool('arrow')}
                  style={{ background: drawTool === 'arrow' ? '#ffe680' : 'rgba(255,255,255,0.08)', color: drawTool === 'arrow' ? '#000' : '#e2e8f0', border: 'none' }}>
                  Arrow
                </button>
                <button className="sb-toolbar-btn" onClick={() => setDrawTool('circle')}
                  style={{ background: drawTool === 'circle' ? '#ffe680' : 'rgba(255,255,255,0.08)', color: drawTool === 'circle' ? '#000' : '#e2e8f0', border: 'none' }}>
                  Circle
                </button>

                {/* Colour swatches */}
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  {drawColors.map((c, i) => (
                    <div
                      key={c}
                      onClick={() => setDrawColorIndex(i)}
                      style={{
                        width: '14px', height: '14px', borderRadius: '50%',
                        background: c, cursor: 'pointer',
                        border: drawColorIndex === i ? '2px solid #ffe680' : '1.5px solid rgba(255,255,255,0.3)',
                      }}
                    />
                  ))}
                </div>

                <button className="sb-toolbar-btn"
                  onClick={() => setDrawings(prev => prev.slice(0, -1))}
                  disabled={drawings.length === 0}
                  style={{ background: 'rgba(255,255,255,0.06)', color: drawings.length === 0 ? '#475569' : '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)', cursor: drawings.length === 0 ? 'not-allowed' : 'pointer' }}>
                  Undo
                </button>
                <button className="sb-toolbar-btn"
                  onClick={() => setDrawings([])}
                  style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
                  Clear
                </button>
              </>
            )}

            {/* Utility divider */}
            <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.12)', margin: '0 1px' }} />

            {/* Balls & Scores toggle */}
            <button className="sb-toolbar-btn"
              onClick={() => setShowScoresPanel(!showScoresPanel)}
              style={{ background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)' }}>
              📋 Panel
            </button>

            {/* Help */}
            <button className="sb-toolbar-btn"
              onClick={() => setShowHelp(!showHelp)}
              style={{ background: showHelp ? '#3b82f6' : 'rgba(255,255,255,0.06)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.1)' }}>
              ❓ Help
            </button>
          </>
        }
      />

      {/* Ball Set Toggle & Utilities (below scoreboard panel) */}
      {showScoresPanel && (
        <div className="hud-panel" style={{ position: 'absolute', top: '270px', right: '20px', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 10, width: '300px' }}>
          {/* Ball Set Toggle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 'bold' }}>Color Set</span>
            <button
              onClick={() => setBallSet(prev => prev === 'primary' ? 'secondary' : 'primary')}
              style={{ fontSize: '9px', padding: '3px 10px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', color: '#ffffff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
            >
              {ballSet === 'primary' ? 'PRIMARY' : 'SECONDARY'}
            </button>
          </div>

          {/* Recenter / Fullscreen */}
          <div style={{ display: 'flex', gap: '4px', width: '100%' }}>
            <button onClick={() => setCameraResetCounter(c => c + 1)} style={{ flex: 1, fontSize: '9px', padding: '5px 0', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#ffffff', fontWeight: 'bold', cursor: 'pointer' }}>Recenter</button>
            <button onClick={toggleFullscreen} style={{ flex: 1, fontSize: '9px', padding: '5px 0', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#ffffff', fontWeight: 'bold', cursor: 'pointer' }}>Fullscreen</button>
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
            {/* Interactive Tutorial Launcher Card */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(59, 130, 246, 0.15))',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              borderRadius: '16px',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              boxShadow: '0 4px 16px rgba(16, 185, 129, 0.15)'
            }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '800', color: '#6ee7b7' }}>Interactive Game Tutorial</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>6-step 3D demonstration with audio narration</div>
              </div>
              <button 
                onClick={() => {
                  setShowHelp(false);
                  startTutorial();
                }}
                style={{
                  padding: '10px 18px',
                  borderRadius: '24px',
                  background: '#10b981',
                  color: '#000000',
                  border: 'none',
                  fontWeight: '800',
                  fontSize: '11px',
                  letterSpacing: '0.05em',
                  cursor: 'pointer',
                  boxShadow: '0 2px 10px rgba(16, 185, 129, 0.4)',
                  whiteSpace: 'nowrap'
                }}
              >
                ▶ Start Tutorial
              </button>
            </div>

            <button 
              onClick={() => setShowHelp(false)}
              style={{ padding: '10px 16px', background: 'rgba(255, 255, 255, 0.1)', color: '#ffffff', border: '1px solid rgba(255, 255, 255, 0.2)', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', marginTop: '4px' }}
            >
              Close Manual
            </button>
          </div>
        </div>
      )}

      {/* --- Interactive Tutorial Overlay --- */}
      {isTutorialActive && (
        <TutorialPlayer
          currentStepIndex={currentTutorialStep}
          onNextStep={nextTutorialStep}
          onPrevStep={prevTutorialStep}
          onReplayStep={replayTutorialStep}
          onExitTutorial={exitTutorial}
          isMuted={isMuted}
          isSpeaking={isSpeaking}
          onToggleMute={toggleMute}
          actionLabel={tutorialActionLabel}
        />
      )}

      {/* --- Screen Freeze Overlay --- */}
      {isPaused && (
        <div style={{ position: 'absolute', top: '15px', right: '50%', transform: 'translateX(50%)', background: 'rgba(239, 68, 68, 0.25)', border: '1.5px solid rgba(239, 68, 68, 0.5)', padding: '6px 16px', borderRadius: '30px', color: '#ff8a8a', fontSize: '9px', fontWeight: '800', letterSpacing: '0.15em', zIndex: 100, display: 'flex', alignItems: 'center', gap: '8px', pointerEvents: 'none' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px #ef4444' }}></span>
          SCREEN FROZEN (PRESS P TO UNFREEZE)
        </div>
      )}

      {/* --- Spark Phase HUD Banner --- */}
      {/* Step 4: Set the Spark — drag the touched ball against the striker ball to choose direction */}
      {sparkPhase === 'positioning' && sparkTargetId && (
        <div style={{
          position: 'absolute', top: '52px', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(249, 115, 22, 0.93)', border: '1.5px solid rgba(249,115,22,0.6)',
          padding: '8px 20px', borderRadius: '30px', color: '#000000',
          fontSize: '11px', fontWeight: '800', letterSpacing: '0.05em',
          zIndex: 999, boxShadow: '0 6px 20px rgba(249,115,22,0.45)',
          display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap'
        }}>
          <span>🏃</span>
          <span>
            STEP 4 — SET THE SPARK: Drag Ball {sparkTargetId.replace(/[^\d]/g, '')} against your ball
            {activeStriker && sparkTargetId && (activeStriker.startsWith('r') === sparkTargetId.startsWith('r'))
              ? ' 🟢 Teammate'
              : ' 🟠 Opponent'}
            {' '}· Click court when ready to strike
          </span>
        </div>
      )}
      {/* Step 5: The Stroke — direction locked to ball-center axis, click sets power only */}
      {sparkPhase === 'aiming' && sparkTargetId && (
        <div style={{
          position: 'absolute', top: '52px', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(234, 179, 8, 0.93)', border: '1.5px solid rgba(234,179,8,0.6)',
          padding: '8px 20px', borderRadius: '30px', color: '#000000',
          fontSize: '11px', fontWeight: '800', letterSpacing: '0.05em',
          zIndex: 999, boxShadow: '0 6px 20px rgba(234,179,8,0.45)',
          display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap'
        }}>
          <span>🦶</span>
          <span>STEP 5 — STRIKE: Foot on ball · Direction locked · Click court to set power</span>
        </div>
      )}

      {/* --- Toast Banner --- */}
      {toastMessage && (
        <div style={{ position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(16,185,129,0.9)', border: '1px solid rgba(16,185,129,0.2)', padding: '8px 22px', borderRadius: '30px', color: '#000000', fontSize: '11px', fontWeight: '800', letterSpacing: '0.05em', zIndex: 999, boxShadow: '0 6px 20px rgba(16,185,129,0.4)', whiteSpace: 'nowrap' }}>
          {toastMessage}
        </div>
      )}




    </div>
  );
}
