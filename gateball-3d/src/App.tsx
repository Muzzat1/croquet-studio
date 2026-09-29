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
// Start Box: 2m×1m outside east boundary near Corner 4 (all values in 3× world scale)
const START_BOX = { xMin: 7.5, xMax: 8.5, zMin: -9.0, zMax: -7.0 };
const isInStartBox = (x: number, z: number) =>
  x >= START_BOX.xMin - BALL_RADIUS && x <= START_BOX.xMax + BALL_RADIUS &&
  z >= START_BOX.zMin - BALL_RADIUS && z <= START_BOX.zMax + BALL_RADIUS;
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
  gateArmed?: Record<number, boolean>;
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

  const halfOpening = GATE_WIDTH / 2; // 0.345m
  const CLEARANCE = 0.02 + BALL_RADIUS; // Leg thickness (0.02) + Ball radius (0.235)
  // Expand the acceptable intersect window slightly at the clearance line to allow for diagonal exits
  // A ball missing the gate entirely would be at least halfOpening + leg + radius = 0.6m away.
  const acceptableHalfOpening = halfOpening + 0.15;

  if (id === 1) {
    // Gate 1: center at X = 3.5. Moving from East to West (decreasing X)
    const crossX = 3.5 - CLEARANCE;
    if (x1 > crossX && x2 <= crossX) {
      const t = (crossX - x1) / (x2 - x1);
      const intersectZ = z1 + t * (z2 - z1);
      if (intersectZ >= -8.0 - acceptableHalfOpening && intersectZ <= -8.0 + acceptableHalfOpening) return true;
    }
  } else if (id === 2) {
    // Gate 2: center at Z = 2.0. Moving from Z < cross to Z >= cross (increasing Z)
    const crossZ = 2.0 + CLEARANCE;
    if (z1 < crossZ && z2 >= crossZ) {
      const t = (crossZ - z1) / (z2 - z1);
      const intersectX = x1 + t * (x2 - x1);
      if (intersectX >= -5.5 - acceptableHalfOpening && intersectX <= -5.5 + acceptableHalfOpening) return true;
    }
  } else if (id === 3) {
    // Gate 3: center at Z = 0.0. Moving from Z > cross to Z <= cross (decreasing Z)
    const crossZ = 0.0 - CLEARANCE;
    if (z1 > crossZ && z2 <= crossZ) {
      const t = (crossZ - z1) / (z2 - z1);
      const intersectX = x1 + t * (x2 - x1);
      if (intersectX >= 5.5 - acceptableHalfOpening && intersectX <= 5.5 + acceptableHalfOpening) return true;
    }
  }
  return false;
};

// --- Custom Camera Controller ---
interface CameraPresetData {
  position: [number, number, number];
  target:   [number, number, number];
  duration?: number;
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
  const lerpDurationRef = useRef(1.6);
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
        camera.position.set(0, 6, 11);
        (controls as any).update();
      }
    }
  }, [resetCounter, camera, controls]);



  useFrame((state, delta) => {
    if (!controls) return;
    
    // Start a new lerp if App requested a preset transition
    if (gotoPresetRef.current) {
      const p = gotoPresetRef.current;
      gotoPresetRef.current = null;
      lerpFromPos.current.copy(state.camera.position);
      lerpFromTarget.current.copy((controls as any).target);
      lerpToPos.current.set(...p.position);
      lerpToTarget.current.set(...p.target);
      lerpDurationRef.current = p.duration || 1.6;
      lerpProgRef.current = 0;
      isLerpingRef.current = true;
    }

    if (!isLerpingRef.current) {
      if (controls) {
        const orbit = controls as any;
        if (orbit.target.y < -0.1) {
          orbit.target.y = -0.1;
          orbit.update();
        }
      }
      return;
    }

    // Ease-in-out over specified duration
    lerpProgRef.current = Math.min(lerpProgRef.current + delta / lerpDurationRef.current, 1);
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
  wasSparkStrokeRef: React.MutableRefObject<boolean>;
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
  isPaused,
  wasSparkStrokeRef
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
        // k=0.85 for smooth natural rolling, snap to high friction once nearly stopped
        const spd = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
        const frictionK = spd < 0.05 ? 6.0 : 0.85;
        b.vx *= Math.exp(-frictionK * subDt);
        b.vz *= Math.exp(-frictionK * subDt);

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

          if (!b.gateArmed) b.gateArmed = {};
          const wasArmed = b.gateArmed[gateId];

          if (canRun && wasArmed && checkGatePass(gateId, prevX, prevZ, b.x, b.z)) {
            onGatePass(id, gateId);
          }

          // Update arming state AFTER scoring check
          const CLEARANCE = 0.02 + BALL_RADIUS;
          if (gateId === 1) {
            if (b.x > 3.5 + CLEARANCE) b.gateArmed[1] = true;
            else if (b.x < 3.5 - CLEARANCE) b.gateArmed[1] = false;
          } else if (gateId === 2) {
            if (b.z < 2.0 - CLEARANCE) b.gateArmed[2] = true;
            else if (b.z > 2.0 + CLEARANCE) b.gateArmed[2] = false;
          } else if (gateId === 3) {
            if (b.z > 0.0 + CLEARANCE) b.gateArmed[3] = true;
            else if (b.z < 0.0 - CLEARANCE) b.gateArmed[3] = false;
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
        if (speed < 0.015 && b.isRolling) {
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

          // Ignore collisions with finished balls (Agari magnet effect on pole)
          if (ballScores[idA]?.finished || ballScores[idB]?.finished) continue;

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
              let currentStriker = activeStriker;
              if (!currentStriker) {
                if (bA.isDragging || bA.vx !== 0 || bA.vz !== 0) currentStriker = idA;
                else if (bB.isDragging || bB.vx !== 0 || bB.vz !== 0) currentStriker = idB;
                else currentStriker = idA;
              }

              if (currentStriker && onTouch) {
                if (idA === currentStriker && bB.x <= 8.8) {
                  onTouch(idA, idB);
                } else if (idB === currentStriker && bA.x <= 8.8) {
                  onTouch(idB, idA);
                }
              }

              if (wasSparkStrokeRef.current && (idA === activeStriker || idB === activeStriker)) {
                // FOOT-ON-BALL SPARK RULE
                // The striker ball is pinned under the player's foot and cannot move.
                // It transfers 100% of the impulse to the target (handled in playShot),
                // so we just ignore elastic collision and resolve overlap unilaterally.
                const isAStriker = idA === activeStriker;
                const striker = isAStriker ? bA : bB;
                const target = isAStriker ? bB : bA;
                
                striker.vx = 0;
                striker.vz = 0;
                striker.isRolling = false;
                
                // Unilateral overlap resolution (push target away, striker stays pinned)
                const overlap = minContactDist - dist;
                if (overlap > 0) {
                  const nx_pos = dx / dist;
                  const nz_pos = dz / dist;
                  target.x += (isAStriker ? -1 : 1) * nx_pos * overlap;
                  target.z += (isAStriker ? -1 : 1) * nz_pos * overlap;
                  target.isRolling = true;
                }
              } else {
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

                if (overlap > 0.001 || dotProduct < 0) {
                  bA.isRolling = true;
                  bB.isRolling = true;
                }
              }
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
    r1: { x: 8.5, z: -6.0 },
    w2: { x: 8.5, z: -5.5 },
    r3: { x: 8.5, z: -5.0 },
    w4: { x: 8.5, z: -4.5 },
    r5: { x: 8.5, z: -4.0 },
    w6: { x: 8.5, z: -3.5 },
    r7: { x: 8.5, z: -3.0 },
    w8: { x: 8.5, z: -2.5 },
    r9: { x: 8.5, z: -2.0 },
    w10: { x: 8.5, z: -1.5 }
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

  // Handler to manually update score for a ball in Free Play mode
  const handleScoreChange = useCallback((ballId: string, newScore: number) => {
    setBallScores(prev => {
      let gate1 = false;
      let gate2 = false;
      let gate3 = false;
      let finished = false;

      if (newScore >= 1) gate1 = true;
      if (newScore >= 2) gate2 = true;
      if (newScore >= 3) gate3 = true;
      if (newScore >= 5) finished = true;

      const next = {
        ...prev,
        [ballId as BallId]: { gate1, gate2, gate3, finished }
      };
      ballScoresRef.current = next;
      return next;
    });
  }, []);

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
    strictPlayerId: BallId;
  }

  // Undo history stack
  const [history, setHistory] = useState<TurnHistorySnapshot[]>([]);

  // Sequence Capture Replay state
  const [replayIndex, setReplayIndex] = useState(-1);

  // Game Modes
  type GameMode = 'unselected' | 'free' | 'strict';
  const [gameMode, setGameMode] = useState<GameMode>('unselected');
  const [strictPlayerId, setStrictPlayerId] = useState<BallId>('r1');

  // Toast / HUD banner notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = (message: string) => {
    if (gameMode === 'free') return;
    if (!showMessages) return;
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    setToastMessage(message);
    toastTimeoutRef.current = window.setTimeout(() => setToastMessage(null), 3000);
  };

  // State controls
  const [selectedBall, setSelectedBall] = useState<BallId | null>(null);
  const [activeStriker, setActiveStriker] = useState<BallId | null>(null);
  const [isStriking, setIsStriking] = useState(false);
  const [ballSet] = useState<'primary' | 'secondary'>('primary');
  const [angle, setAngle] = useState(0); // Aim Angle (0 to 360)
  const [speed, setSpeed] = useState(80); // Speed/power slider (1 to 200)
  const [isPowerShot, setIsPowerShot] = useState(false);
  const [placementMode] = useState(false); // Play/Aim mode is always default now
  const [showAimingLines, setShowAimingLines] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showScoresPanel, setShowScoresPanel] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [cameraResetCounter] = useState(0);
  const [scoringEvent, setScoringEvent] = useState<{ text: string; team: 'red' | 'white' | 'generic'; id: number } | null>(null);
  const [turnTimeLeft, setTurnTimeLeft] = useState(10);
  const [gameTimeLeft, setGameTimeLeft] = useState(30 * 60);
  const [isGameClockRunning, setIsGameClockRunning] = useState(false);
  const endTurnRef = useRef<((msg: string) => void) | null>(null);
  
  const [turnGates, setTurnGates] = useState<number[]>([]);
  const [showPlayerPill, setShowPlayerPill] = useState(false);
  const [showMessages, setShowMessages] = useState(true);

  useEffect(() => {
    if (!scoringEvent) return;
    const t = setTimeout(() => setScoringEvent(null), 4000);
    return () => clearTimeout(t);
  }, [scoringEvent]);

  // Annotation (Telestrator)
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [drawMode, setDrawMode] = useState(false);
  const [screenshotPrefix, setScreenshotPrefix] = useState("Gateball_Screenshot");
  const [drawColorIndex, setDrawColorIndex] = useState(0);
  const drawColors = useMemo(() => ['#ffffff', '#ef4444', '#facc15'], []);
  const [drawings, setDrawings] = useState<Array<{ id: string; points: [number, number, number][]; color: string }>>([]);
  const [currentDrawingPoints, setCurrentDrawingPoints] = useState<[number, number, number][]>([]);
  const [isDrawingActive, setIsDrawingActive] = useState(false);
  const [drawTool, setDrawTool] = useState<'pencil' | 'arrow' | 'circle'>('pencil');

  useEffect(() => {
    (window as any).THREE = THREE;
  }, []);




  const [features] = useState({ recording: false });
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
  const handleTouch = useCallback((strikerId: BallId, touchedId: BallId) => {
    // Ignore touches if either ball is off court
    const sBall = physicsBalls.current[strikerId];
    const tBall = physicsBalls.current[touchedId];
    if (sBall && tBall) {
      // Court is ±7.5m × ±10m. Ball radius ≈ 0.235m.
      // A ball is off-court only when its CENTRE crosses the line by more than its radius.
      const isOffCourt = (x: number, z: number) => Math.abs(x) > 7.735 || Math.abs(z) > 10.235;
      if (isOffCourt(sBall.x, sBall.z) || isOffCourt(tBall.x, tBall.z)) {
        return;
      }
    }

    // Guard 1: already queued for this stroke
    if (touchFiredThisStrokeRef.current.has(touchedId)) return;
    // Guard 2: already sparked this turn — touching again is a foul (WGU)
    if (sparkedBallsThisTurnRef.current.has(touchedId)) {
      doubleTouchFoulRef.current = true;
      return;
    }

    touchFiredThisStrokeRef.current.add(touchedId);
    sparkQueueRef.current.push(touchedId);

    showToast('Touch');

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
  const doubleTouchFoulRef = useRef<boolean>(false);

  // Position of the spark target ball just BEFORE the spark impulse fires
  // Used for the >10cm (0.30 world-unit) success check
  const sparkBallPrePosRef = useRef<{ x: number; z: number } | null>(null);

  // Which ball was just sparked (needed in the resolution branch)
  const lastSparkedBallIdRef = useRef<BallId | null>(null);
  // ────────────────────────────────────────────────────────────────────────

  // WGU Continuous Strokes (Article 12 Clause 3)
  const [continuousStrokes, setContinuousStrokes] = useState<number>(0);
  const strokePassedGateRef = useRef(false);
  const lastGatePassedRef = useRef<number | null>(null);
  const gateAndTouchSameStrokeRef = useRef(false);
  const wasSparkStrokeRef = useRef(false);
  const wasStrokeActiveRef = useRef(false);
  const preStrokePositionsRef = useRef<Record<BallId, { x: number; z: number }>>(resetPositions);

  // Tutorial State & Audio Narration
  const [isTutorialActive, setIsTutorialActive] = useState(false);
  const [currentTutorialStep, setCurrentTutorialStep] = useState(0);
  const [tutorialActionLabel, setTutorialActionLabel] = useState<string | null>(null);
  const isTutorialActiveRef = useRef(false);
  const currentDemoActionIdxRef = useRef<number>(-1);
  const currentDemoActionsRef = useRef<DemoAction[]>([]);
  const { isMuted, isSpeaking, toggleMute, speak, stop: stopNarration } = useAudioNarration();
  const tutorialDemoTimeout = useRef<any>(null);

  const isPlaying = isStriking || Object.values(balls).some((_, i) => {
    const id = BALL_IDS[i];
    // Stationary if docked or velocity zero
    const phys = physicsBalls.current[id];
    return phys.vx !== 0 || phys.vz !== 0 || phys.isRolling;
  });

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
      if (gameMode === 'strict' && id !== strictPlayerId) {
        // showToast(`Strict Play: It's Player ${strictPlayerId.replace(/[^\d]/g, '')}'s turn!`);
      } else {
        setSelectedBall(id);
      }
    }

    // Instantly sync visual WebGL mesh if present (matches clean-court sync pattern to prevent wobbly drag)
    const mesh = meshRefs.current[id].current;
    if (mesh) {
      mesh.position.x = finalX;
      mesh.position.z = finalZ;
    }

    // When a pre-Gate-1 ball is dragged into the Start Box, confirm placement
    if (!ballScoresRef.current[id]?.gate1 && isInStartBox(finalX, finalZ) && finalX <= 8.5) {
      setIsGameClockRunning(true);
      showToast(`Ball ${id.replace(/[^\d]/g, '')} in Start Box — ready to play!`);
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
      angle,
      strictPlayerId
    };

    setHistory(prev => {
      const next = [...prev, snapshot];
      if (next.length > 10) next.shift();
      return next;
    });
  }, [selectedBall, activeStriker, sparkTargetId, sparkPhase, continuousStrokes, angle, strictPlayerId]);

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
    setStrictPlayerId(prev.strictPlayerId);

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
    if (isStriking || !selectedBall) {
      return;
    }
    // Block shot if ball hasn't passed Gate 1 and is still docked in lineup
    // (WGU rule: ball must be dragged from lineup into Start Box before stroking)
    // Only block if NOT already placed in the start box zone
    const bPhys = physicsBalls.current[selectedBall];
    if (!ballScoresRef.current[selectedBall].gate1 &&
        bPhys.x > 7.5 &&
        !isInStartBox(bPhys.x, bPhys.z)) {
      showToast(`Drag Ball ${selectedBall.replace(/[^\d]/g, '')} into the Start Box first!`);
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
    setIsGameClockRunning(true);
    
    const snap: any = {};
    BALL_IDS.forEach(id => { snap[id] = { x: physicsBalls.current[id].x, z: physicsBalls.current[id].z }; });
    preStrokePositionsRef.current = snap;
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

    setTurnTimeLeft(10);
    setPlayerState('striking');
    setActiveStriker(selectedBall);
    setIsStriking(true);

    // Setup sequence capture if active
    if (features.recording && !isReplaying && sequence.length === 0) {
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



  // ── 30 Minute Game Timer ──
  useEffect(() => {
    if (gameMode === 'unselected' || isPaused || isTutorialActive || !isGameClockRunning) {
      return;
    }
    const timerId = setInterval(() => {
      setGameTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerId);
          showToast('Game Over! 30 Minutes Expired.');
          setIsGameClockRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerId);
  }, [gameMode, isPaused, isTutorialActive, isGameClockRunning]);

  useEffect(() => {
    if (gameMode !== 'unselected') {
      setGameTimeLeft(30 * 60);
      setTurnTimeLeft(10);
      setIsGameClockRunning(false);
    }
  }, [gameMode]);

  // ── 10 Second Stroke Timer ──
  useEffect(() => {
    if (gameMode === 'unselected' || isPlaying || isReplaying || isPaused || isTutorialActive || !isGameClockRunning) {
      return;
    }
    const timerId = setInterval(() => {
      setTurnTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerId);
          showToast('10 Seconds Expired! Turn ends.');
          if (endTurnRef.current) endTurnRef.current('Time violation');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerId);
  }, [gameMode, isPlaying, isReplaying, isPaused, isTutorialActive, isGameClockRunning]);

  useEffect(() => {
    if (!isPlaying && gameMode !== 'unselected') {
      setTurnTimeLeft(10);
    }
  }, [isPlaying, strictPlayerId, gameMode, continuousStrokes, sparkPhase]);

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

      // NOTE: Do NOT clear sparkPhase/sparkTargetId here — they are cleared in the
      // turn-resolution effect (after balls settle) so wasSparkStrokeRef is
      // evaluated against the correct state.
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
    if (features.recording && !isReplaying) {
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
    if (ballId === activeStriker) {
      strokePassedGateRef.current = true;
      lastGatePassedRef.current = gateId;
      // Note: WGU rule - you cannot touch the same ball twice in a turn even after passing a gate
    }
    setBallScores(prev => {
      const key = `gate${gateId}` as keyof BallScore;
      const nextScores = { ...prev, [ballId]: { ...prev[ballId], [key]: true } };
      if (ballId === activeStriker) {
        setTurnGates([gateId]);
      }
      setShowScoresPanel(true);
      return nextScores;
    });
  }, [activeStriker]);

  const handlePegHit = useCallback((ballId: BallId) => {
    playSound(SOUNDS.cheer, 0.7);
    const ballNum = ballId.replace(/[^\d]/g, '');
    // Move finished balls beyond the outside line in corner 4 after 2 seconds
    setTimeout(() => {
      const ballNumInt = parseInt(ballNum, 10);
      const finishX = 7.5 - (ballNumInt * 0.5); // Arrange neatly starting from corner 4
      const finishZ = -11.5; // Beyond the outer line
      handleBallChange(ballId, finishX, finishZ);
    }, 2000);

    setBallScores(prev => {
      const nextScores = { ...prev, [ballId]: { ...prev[ballId], finished: true } };
      if (ballId === activeStriker) {
        setTurnGates([4]);
      } else {
        showToast(`PLAYER ${ballNum} - AGARI`);
      }
      setShowScoresPanel(true);
      return nextScores;
    });
  }, [handleBallChange]);

  const drawStartPoint = useRef<[number, number, number] | null>(null);
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  const handleCourtPointerDown = (e: any) => {
    if (gameMode === 'unselected') return;
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
    console.log("[DEBUG] handleCourtPointerUp triggered. isPlaying:", isPlaying, "isReplaying:", isReplaying);
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
      console.log("[DEBUG] clickPoint and selectedBall found. selectedBall:", selectedBall, "dragDistance:", dragDistance);
      const clickX = clickPoint.x;
      const clickZ = clickPoint.z;
      const ball = balls[selectedBall];
      
      // Any camera orbit drag cancels the action entirely
      if (dragDistance > 6) { console.log("[DEBUG] dragDistance > 6"); return; }

      // Only act if the selected ball is on the court, in the Start Box, or an out-ball.
      // We block playing docked balls or balls randomly dragged far off the court.
      const isOnCourt = Math.abs(ball.x) <= 7.5 && Math.abs(ball.z) <= 10.0;
      const isInStartBox = ball.x >= 7.0 && ball.x <= 9.0 && ball.z >= -9.5 && ball.z <= -6.5; // Generous Start Box bounds
      const isDocked = ball.x >= 8.2 && ball.x <= 8.8 && ball.z >= -6.5 && ball.z <= -1.0; // Dock rack bounds
      const isOutBall = !isOnCourt && !isDocked && Math.abs(ball.x) <= 8.5 && Math.abs(ball.z) <= 11.0;

      if (!isOnCourt && !isInStartBox && !isOutBall) {
        console.log("[DEBUG] Ball is off court (docked or invalid). Ignoring play click.");
        return;
      }

      // Standard Aiming/Striking Logic (Only runs if the ball is already on the court)
      const aimDx = clickX - ball.x;
      const aimDz = clickZ - ball.z;
      
      // Ignore the click if it was directly on or very near the selected ball itself
      // (prevents accidental self-aiming when a player tries to re-select the live ball)
      const distFromBall = Math.sqrt(aimDx * aimDx + aimDz * aimDz);
      if (distFromBall < 0.35) { // BALL_RADIUS is 0.235
        console.log("[DEBUG] Clicked on the live ball, ignoring to prevent accidental aim");
        return;
      }

      let angleDeg = Math.round((Math.atan2(aimDx, -aimDz) * 180) / Math.PI);
      if (angleDeg < 0) angleDeg += 360;

      // ── SPARK PHASE HANDLING ─────────────────────────────────────────────────
      if (sparkPhase === 'positioning' && sparkTargetId) {
        // The click itself determines the exact spark angle and power, ignoring physical placement
        setAngle(angleDeg);
        strikeInitialPos.current = [ball.x, BALL_RADIUS, ball.z];
        strikeInitialAngle.current = angleDeg;
        strikeTargetDist.current = distFromBall;
        setSpeed(Math.min(100, distFromBall * 10)); // Simplified speed calc
        
        // Teleport/snap the sparked ball to perfectly align with the clicked aim direction
        const rad = (angleDeg * Math.PI) / 180;
        const tbPhys = physicsBalls.current[sparkTargetId];
        tbPhys.x = ball.x + Math.sin(rad) * (2 * BALL_RADIUS);
        tbPhys.z = ball.z - Math.cos(rad) * (2 * BALL_RADIUS);
        // Force sync back to React state so it renders correctly
        setBalls(prev => ({ ...prev, [sparkTargetId]: { x: tbPhys.x, z: tbPhys.z } }));

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
        // If they click again during the 1.2s aiming delay, allow them to override the aim
        setAngle(angleDeg);
        strikeInitialPos.current = [ball.x, BALL_RADIUS, ball.z];
        strikeInitialAngle.current = angleDeg;
        strikeTargetDist.current = distFromBall;
        
        const rad = (angleDeg * Math.PI) / 180;
        const tbPhys = physicsBalls.current[sparkTargetId];
        tbPhys.x = ball.x + Math.sin(rad) * (2 * BALL_RADIUS);
        tbPhys.z = ball.z - Math.cos(rad) * (2 * BALL_RADIUS);
        setBalls(prev => ({ ...prev, [sparkTargetId]: { x: tbPhys.x, z: tbPhys.z } }));

        if (autoPlayTimeout.current) clearTimeout(autoPlayTimeout.current);
        playShotRef.current();
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
  /*
  const startSequenceReplay = () => {
    if (sequence.length === 0 || isPlaying || isReplaying) return;
    setIsReplaying(true);
    setReplayIndex(0);
  };
  */

  useEffect(() => {
    if (!isReplaying || replayIndex < 0) return;

    if (replayIndex >= sequence.length) {
      setIsReplaying(false);
      setReplayIndex(-1);
      showToast("Replay Complete");
      return;
    }

    if (!isPlaying) {
      const frame = sequence[replayIndex];
      
      setBalls(frame.positions);
      setBallScores(frame.scores);
      setSelectedBall(frame.activeBallId);
      setAngle(frame.angle);
      setSpeed(frame.speed);
      setIsPowerShot(frame.isPowerShot);
      
      BALL_IDS.forEach(id => {
        physicsBalls.current[id].x = frame.positions[id].x;
        physicsBalls.current[id].z = frame.positions[id].z;
        physicsBalls.current[id].vx = 0;
        physicsBalls.current[id].vz = 0;
        physicsBalls.current[id].isRolling = false;
        const mesh = meshRefs.current[id]?.current;
        if (mesh) {
          mesh.position.x = frame.positions[id].x;
          mesh.position.z = frame.positions[id].z;
        }
      });
      
      const t = setTimeout(() => {
        playShotRef.current();
      }, 500);
      
      return () => clearTimeout(t);
    }
  }, [isReplaying, replayIndex, isPlaying, sequence]);

  // Save/Load sequence files
  /*
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
  */

  // const activeBall = selectedBall ? balls[selectedBall] : null;
  // const isSelectedBallOffCourt = activeBall ? activeBall.x > 8.8 : true;

  const isDraggingBallRef   = useRef(false);
  const gotoPresetRef       = useRef<CameraPresetData | null>(null);
  const getCurrentCameraRef = useRef<(() => CameraPresetData) | null>(null);

  useEffect(() => {
    (window as any).testCamera = () => {
      gotoPresetRef.current = { position: [0, 16, 2], target: [0, 0, 0], duration: 1.2 };
      console.log("Triggered testCamera!");
    };
  }, []);

  // --- Camera Presets (6 slots, persisted to localStorage) ---
  const PRESET_KEY = 'gateball-camera-presets-v3';
  const DEFAULT_CAMERA_PRESETS: (CameraPresetData | null)[] = [
    { position: [21.182, 9.336, -8.115], target: [2.215, 0, -5.652] }, // 1: User Custom View
    { position: [11.5, 4.5, -12.5], target: [4.5, 0, -4.5] }, // 2: Start Box & Gate 1
    { position: [-10.5, 4.5, 1.5], target: [-4.0, 0, 2.5] }, // 3: Gate 2
    { position: [10.5, 4.5, 7.5], target: [3.5, 0, 6.0] },  // 4: Gate 3
    { position: [-1, 6, -9], target: [0, 0, 0] },         // 5: Center Peg
    { position: [-13, 3, 0], target: [0, 0, 0] }          // 6: Low Side View
  ];

  const [cameraPresets, setCameraPresets] = useState<(CameraPresetData | null)[]>(() => {
    try {
      const saved = localStorage.getItem(PRESET_KEY);
      if (saved) return JSON.parse(saved) as (CameraPresetData | null)[];
    } catch { /* ignore */ }
    return DEFAULT_CAMERA_PRESETS;
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

  const handleTakeScreenshot = useCallback(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    
    const prefix = window.prompt("Enter a base name for your screenshot (the time will be appended):", screenshotPrefix);
    if (!prefix) return; // User cancelled
    
    setScreenshotPrefix(prefix); // Remember for next time

    // Format current time
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { hour12: false }).replace(/:/g, '-');
    const fullFileName = `${prefix}_${timeString}`;

    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `${fullFileName}.png`;
    link.href = dataUrl;
    link.click();
  }, [screenshotPrefix]);

  // Reset court positions
  const handleReset = useCallback(() => {
    setGameMode('unselected');
    setStrictPlayerId('r1');
    setHistory([]);
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
    setSelectedBall('r1');
    setActiveStriker(null);
    sparkBallPrePosRef.current = null;
    lastSparkedBallIdRef.current = null;
    setTurnGates([]);
    setShowPlayerPill(false);

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
    
    // Cinematic intro: Look at clubhouse first, then slow pan to starting corner
    gotoPresetRef.current = { position: [-5, 6, 0], target: [25, 0, 0], duration: 0.001 };
    setTimeout(() => {
      const p = cameraPresets[0];
      if (p) gotoPresetRef.current = { ...p, duration: 6.0 };
    }, 100);
    setTimeout(() => setShowPlayerPill(true), 6100);
    
    showToast("Simulation Reset");
  }, [resetPositions, saveToHistory, activateCameraPreset]);

  // Initial camera setup
  useEffect(() => {
    // Cinematic intro: Look at clubhouse first, then slow pan to starting corner
    gotoPresetRef.current = { position: [-5, 6, 0], target: [25, 0, 0], duration: 0.001 };
    setTimeout(() => {
      const p = cameraPresets[0];
      if (p) gotoPresetRef.current = { ...p, duration: 6.0 };
    }, 100);
    setTimeout(() => setShowPlayerPill(true), 6100);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      if (e.code && e.code.startsWith('Digit')) {
        const num = parseInt(e.code.replace('Digit', ''), 10);
        if (num >= 1 && num <= 6) {
          if (e.shiftKey) {
            saveCurrentViewToSlot(num - 1);
          } else {
            activateCameraPreset(num - 1);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, drawMode, activateCameraPreset, saveCurrentViewToSlot]);

  const prevIsPlayingRef = useRef(false);

  useEffect(() => {
    if (prevIsPlayingRef.current && !isPlaying && wasStrokeActiveRef.current && activeStriker) {
      wasStrokeActiveRef.current = false;
      const strikerId = activeStriker;
      const strikerPhys = physicsBalls.current[strikerId];
      strikeInitialPos.current = [strikerPhys.x, BALL_RADIUS, strikerPhys.z];

      if (isReplaying) {
        setReplayIndex(prev => prev + 1);
      } else {

      const failedGate1 = gameMode !== 'free' && !ballScoresRef.current[strikerId].gate1 && !strokePassedGateRef.current;
      
      // ── Find balls that moved and check boundaries ─────────────────────────
      const movedBalls = BALL_IDS.filter(id => {
        const pre = preStrokePositionsRef.current[id];
        const post = physicsBalls.current[id];
        return Math.abs(pre.x - post.x) > 0.001 || Math.abs(pre.z - post.z) > 0.001;
      });

      const outBalls = movedBalls.filter(id => {
        const phys = physicsBalls.current[id];
        // A ball is only OUT if it completely crosses the boundary line.
        // The ball radius is ~0.14, so the center must exceed the line by at least that amount.
        return (Math.abs(phys.x) > 7.64 || Math.abs(phys.z) > 10.14) && phys.x < 8.8;
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

      const getNextBallId = () => {
        const currentNum = parseInt(strikerId.replace(/[^\d]/g, ''), 10);
        const nextBallNum = (currentNum % 10) + 1;
        return BALL_IDS.find(id => id.replace(/[^\d]/g, '') === nextBallNum.toString()) as BallId;
      };

      const getNextBallMessage = () => {
        const nextId = getNextBallId();
        const nextNum = nextId.replace(/[^\d]/g, '');
        return `Player ${nextNum}`;
      };

      // ── Helper: end the turn entirely ──────────────────────────────────────
      const endTurn = (_message: string) => {
        setTurnTimeLeft(10);
        setTurnGates([]);
        setSparkTargetId(null);
        setSparkPhase('none');
        wasSparkStrokeRef.current = false;
        sparkQueueRef.current = [];
        sparkedBallsThisTurnRef.current.clear();
        touchFiredThisStrokeRef.current.clear();
        setContinuousStrokes(0);
        setActiveStriker(null);
        setPlayerState('hidden');
        setShowAimingLines(false);
        if (gameMode === 'strict') {
          const nextId = getNextBallId();
          setStrictPlayerId(nextId);
          setSelectedBall(nextId);
        } else {
          setSelectedBall(null);
        }
        // showToast(getNextBallMessage());
      };
      endTurnRef.current = endTurn;


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
          showToast(`GATE & TOUCH! Click court to set spark direction for Ball ${ballNum}`);
        } else {
          showToast(`Touch! Click court to set spark direction for Ball ${ballNum}`);
        }
      };

      if (failedGate1) {
        // ── FIRST-STROKE GATE FAILURE: return ball to docked lineup position ───
        // Any other balls that were bumped go back to their pre-stroke positions
        movedBalls.forEach(id => {
          if (id !== strikerId) {
            const pre = preStrokePositionsRef.current[id];
            handleBallChange(id, pre.x, pre.z);
          }
        });

        // Return striker to its docked reset position in the lineup
        const resetPos = resetPositions[strikerId];
        handleBallChange(strikerId, resetPos.x, resetPos.z);
        endTurn(`Miss — Ball ${strikerId.replace(/[^\d]/g, '')} returns to lineup`);

      } else if (doubleTouchFoulRef.current) {
        // ── DOUBLE TOUCH FOUL (Chokinggai) ────────────────────────────────────
        doubleTouchFoulRef.current = false;
        endTurn("Foul: Touching the same ball twice!");

      } else if (isOutBall && (!wasSparkStrokeRef.current || outBalls.includes(strikerId))) {
        // ── OUT BALL (Normal stroke, or Striker fouled during spark) ──────────
        endTurn('Out Ball');

      } else if (wasSparkStrokeRef.current || sparkPhase === 'aiming') {
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
          if (sparkQueueRef.current.length > 0) {
            const nextQueued = sparkQueueRef.current.shift()!;
            enterSparkPositioning(nextQueued);
          } else {
            // All sparks done — grant extra stroke(s)
            const extraStrokes = gateAndTouchSameStrokeRef.current ? 2 : 1;
            gateAndTouchSameStrokeRef.current = false;
            setContinuousStrokes(extraStrokes);
            setSelectedBall(strikerId);
            setPlayerState('hidden');
            setShowAimingLines(false);
            setSparkPhase('none');
            setSparkTargetId(null);
          }
        }

      } else if (sparkQueueRef.current.length > 0) {
        // ── NORMAL STROKE JUST ENDED — touches detected, enter spark sequence ─
        if (strokePassedGateRef.current) {
          if (lastGatePassedRef.current !== null && lastGatePassedRef.current > 1) {
            gateAndTouchSameStrokeRef.current = true;
          }
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
        // showToast(`Gate ${lastGatePassedRef.current}`);
      } else if (continuousStrokes > 1) {
        setContinuousStrokes(prev => prev - 1);
        setSelectedBall(strikerId);
        setPlayerState('hidden');
        setShowAimingLines(false);
        // showToast(`Continuation Stroke remaining: ${continuousStrokes - 1}`);
      } else if (continuousStrokes === 1) {
        setContinuousStrokes(0);
        setTurnGates([]);
        sparkedBallsThisTurnRef.current.clear();
        setActiveStriker(null);
        setPlayerState('hidden');
        setShowAimingLines(false);
        if (gameMode === 'strict') {
          const nextId = getNextBallId();
          setStrictPlayerId(nextId);
          setSelectedBall(nextId);
        } else {
          setSelectedBall(null);
        }
      } else {
        setTurnGates([]);
        sparkedBallsThisTurnRef.current.clear();
        setActiveStriker(null);
        setPlayerState('hidden');
        setShowAimingLines(false);
        if (gameMode === 'strict') {
          const nextId = getNextBallId();
          setStrictPlayerId(nextId);
          setSelectedBall(nextId);
        } else {
          setSelectedBall(null);
        }
      }
      } // End of !isReplaying block

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
  }, [isPlaying, activeStriker, sparkTargetId, continuousStrokes, executeTutorialAction, resetPositions, handleBallChange, isReplaying]);



  return (
    <div 
      onContextMenu={(e) => e.preventDefault()}
      style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', background: '#0a0f0d', position: 'relative' }}
    >
      {/* 3D WebGL Canvas Scene */}
      <Canvas dpr={[1, 2]} gl={{ preserveDrawingBuffer: true }} camera={{ position: [0, 6, 11], fov: 42, far: 200 }} shadows>
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
              isSelected={selectedBall === id || (gameMode === 'strict' && strictPlayerId === id) || (gameMode === 'free' && !selectedBall && !isPlaying && strictPlayerId === id)}
              onPositionChange={(nx, nz) => handleBallChange(id, nx, nz)}
              onPointerDown={() => {
                if (gameMode === 'unselected') return;
                // Do not steal selection if clicking any ball during spark setup
                if (sparkPhase !== 'none') return;

                if (!isPlaying) {
                  if (gameMode === 'strict' && id !== strictPlayerId) {
                    // showToast(`Strict Play: It's Player ${strictPlayerId.replace(/[^\d]/g, '')}'s turn!`);
                    return;
                  }
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
                
                // Allow manual drag-to-touch triggering in Free Play
                if (gameMode === 'free' && !isPlaying && sparkPhase === 'none') {
                  const bA = physicsBalls.current[id];
                  for (const bId of BALL_IDS) {
                    if (bId === id) continue;
                    const bB = physicsBalls.current[bId];
                    if (bB.x > 8.8) continue;
                    const dx = bA.x - bB.x;
                    const dz = bA.z - bB.z;
                    // If balls overlap physically
                    if (dx * dx + dz * dz < (2 * BALL_RADIUS) * (2 * BALL_RADIUS)) {
                      handleTouch(id as BallId, bId);
                      wasStrokeActiveRef.current = true;
                      prevIsPlayingRef.current = true;
                      setActiveStriker(id as BallId);
                      break;
                    }
                  }
                }
                
                // Generous spark recognition: if dropping the ball anywhere near the striker, auto-snap and advance!
                if (sparkPhase === 'positioning' && id === sparkTargetId && activeStriker) {
                  const tbPhys = physicsBalls.current[id];
                  const striker = physicsBalls.current[activeStriker];
                  const dx = tbPhys.x - striker.x;
                  const dz = tbPhys.z - striker.z;
                  const dist = Math.sqrt(dx * dx + dz * dz);
                  
                  // Tolerance: anything within ~3 ball radii is considered an intent to spark
                  if (dist < 3.0 * BALL_RADIUS) {
                    let lockedAngle = Math.round((Math.atan2(dx, -dz) * 180) / Math.PI);
                    if (lockedAngle < 0) lockedAngle += 360;
                    
                    // Physically snap it perfectly to the contact ring
                    const rad = (lockedAngle * Math.PI) / 180;
                    tbPhys.x = striker.x + Math.sin(rad) * (2 * BALL_RADIUS);
                    tbPhys.z = striker.z - Math.cos(rad) * (2 * BALL_RADIUS);
                    handleBallChange(id as BallId, tbPhys.x, tbPhys.z);
                    
                    // Set the initial aim to match their drag placement
                    setAngle(lockedAngle);
                    strikeInitialPos.current = [striker.x, BALL_RADIUS, striker.z];
                    strikeInitialAngle.current = lockedAngle;
                    
                    setSparkPhase('aiming');
                    // showToast("Spark Set! Click court to aim & play.");
                  }
                }
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
          wasSparkStrokeRef={wasSparkStrokeRef}
        />

        <OrbitControls 
          makeDefault
          enabled={!drawMode || !isDrawingActive}
          maxPolarAngle={Math.PI / 2 - 0.1} 
          minDistance={3} 
          maxDistance={45} 
        />
        </Suspense>
      </Canvas>

      {/* --- HUD Glassmorphic Overlay UI --- */}
      {gameMode === 'unselected' && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) scale(0.75)', zIndex: 1000, background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(20px)', border: '2px solid rgba(255, 255, 255, 0.2)', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', boxShadow: '0 12px 30px rgba(0, 0, 0, 0.8)' }}>
          <h2 style={{ color: '#fff', margin: 0, fontSize: '18px', fontWeight: '800', letterSpacing: '0.05em', textShadow: '0 2px 6px rgba(0,0,0,0.5)' }}>Select Game Mode</h2>
          <div style={{ display: 'flex', gap: '16px' }}>
            <button onClick={() => setGameMode('strict')} style={{ padding: '12px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '800', cursor: 'pointer', fontSize: '14px', transition: 'transform 0.2s', boxShadow: '0 4px 12px rgba(59,130,246,0.5)' }}>Strict Play</button>
            <button onClick={() => setGameMode('free')} style={{ padding: '12px 24px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: '800', cursor: 'pointer', fontSize: '14px', transition: 'transform 0.2s', boxShadow: '0 4px 12px rgba(16,185,129,0.5)' }}>Free Play</button>
          </div>
        </div>
      )}

      {/* 1. Main Left Control Panel */}
      <div className="hud-panel" style={{ 
        position: 'absolute', top: '16px', left: '16px', display: 'flex', flexDirection: 'column', gap: '10px', 
        zIndex: 10, width: '210px',
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(30, 58, 138, 0.55))',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(16, 185, 129, 0.35)',
        borderRadius: '16px',
        padding: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        transform: isLeftPanelOpen ? 'translateX(0)' : 'translateX(calc(-100% - 16px))',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}>
        {/* Toggle Button */}
        <button
          onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
          style={{
            position: 'absolute',
            right: '-24px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '24px',
            height: '48px',
            background: 'linear-gradient(90deg, rgba(16, 185, 129, 0.35), rgba(30, 58, 138, 0.65))',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            borderLeft: 'none',
            borderRadius: '0 8px 8px 0',
            backdropFilter: 'blur(16px)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
            boxShadow: '4px 0 12px rgba(0, 0, 0, 0.2)'
          }}
        >
          <span style={{ fontSize: '10px', fontWeight: 'bold' }}>{isLeftPanelOpen ? '◀' : '▶'}</span>
        </button>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }}></div>
          <h1 style={{ fontSize: '14px', fontWeight: '800', letterSpacing: '0.05em', color: '#ffffff', margin: 0, lineHeight: '1.2' }}>
            3D GATEBALL<br />
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>by Murray ©2026</span>
          </h1>
        </div>

        {/* Main Controls */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
          <button
            onClick={handleReset}
            style={{ flex: '1', padding: '6px', fontSize: '11px', fontWeight: 'bold', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.2)', color: '#fca5a5', cursor: 'pointer', transition: 'all 0.2s' }}
          >
            🔄 Restart
          </button>
          <button
            onClick={handleUndo}
            disabled={history.length === 0 || isPlaying}
            style={{ flex: '1', padding: '6px', fontSize: '11px', fontWeight: 'bold', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#e2e8f0', cursor: history.length === 0 || isPlaying ? 'not-allowed' : 'pointer', opacity: history.length === 0 || isPlaying ? 0.5 : 1, transition: 'all 0.2s' }}
          >
            ↩ Undo
          </button>
          <button
            onClick={() => setShowScoresPanel(!showScoresPanel)}
            style={{
              width: '100%',
              padding: '6px',
              fontSize: '11px',
              fontWeight: 'bold',
              borderRadius: '6px',
              border: showScoresPanel ? '1px solid rgba(16,185,129,0.5)' : '1px solid rgba(255,255,255,0.2)',
              background: showScoresPanel ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.1)',
              color: showScoresPanel ? '#a7f3d0' : '#e2e8f0',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            🎯 Scoreboard: {showScoresPanel ? 'On' : 'Off'}
          </button>
        </div>





        {/* Capture Panel (Hidden for now) */}
        {/*
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
        */}

        {/* Camera Views Selector (Moved from top-right) */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px',
          padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '13px', lineHeight: 1 }}>📷</span>
            <span style={{ fontSize: '10px', color: '#ffe680', fontWeight: '800', letterSpacing: '0.08em', textTransform: 'uppercase', textShadow: '0 0 8px rgba(255, 230, 128, 0.3)' }}>Camera Views</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
            {cameraPresets.map((preset, i) => (
              <button
                key={i}
                title={preset
                  ? `Go to View ${i + 1}  (key: ${i + 1})\nRight-click to overwrite  (Shift+${i + 1})`
                  : `View ${i + 1} empty — right-click or press Shift+${i + 1} to save`}
                onClick={() => activateCameraPreset(i)}
                onContextMenu={e => { e.preventDefault(); saveCurrentViewToSlot(i); }}
                style={{
                  height: '24px', borderRadius: '8px', cursor: 'pointer',
                  background: '#0f172a',
                  border: preset ? '1px solid #10b981' : '1px solid transparent',
                  color: preset ? '#10b981' : '#475569',
                  boxShadow: preset ? '0 0 12px rgba(16,185,129,0.5)' : 'inset 0 2px 4px rgba(0,0,0,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', fontWeight: '900', transition: 'all 0.2s'
                }}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>

        {/* Draw Tools */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '8px 10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', color: '#ffe680', fontWeight: '800', letterSpacing: '0.08em', textTransform: 'uppercase', textShadow: '0 0 8px rgba(255, 230, 128, 0.3)' }}>✏️ Draw Tools</span>
            <div 
              onClick={() => { setDrawMode(!drawMode); if (drawMode) { setIsDrawingActive(false); setCurrentDrawingPoints([]); } }}
              style={{
                width: '36px', height: '18px', borderRadius: '10px',
                background: drawMode ? '#10b981' : 'rgba(255,255,255,0.2)',
                position: 'relative', cursor: 'pointer', transition: 'background 0.3s',
                boxShadow: drawMode ? '0 0 8px rgba(16, 185, 129, 0.5)' : 'inset 0 2px 4px rgba(0,0,0,0.3)'
              }}
            >
              <div style={{
                width: '14px', height: '14px', borderRadius: '50%', background: '#ffffff',
                position: 'absolute', top: '2px', left: drawMode ? '20px' : '2px',
                transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)', boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
              }} />
            </div>
          </div>
          {drawMode && (
            <>
              <div style={{ display: 'flex', gap: '6px' }}>
                {['pencil', 'arrow', 'circle'].map(tool => (
                  <button key={tool} onClick={() => setDrawTool(tool as any)} style={{
                    flex: 1, fontSize: '9px', padding: '5px 0', borderRadius: '8px', cursor: 'pointer',
                    background: '#0f172a',
                    color: drawTool === tool ? '#10b981' : '#475569',
                    border: drawTool === tool ? '1px solid #10b981' : '1px solid transparent',
                    boxShadow: drawTool === tool ? '0 0 12px rgba(16,185,129,0.5)' : 'inset 0 2px 4px rgba(0,0,0,0.3)',
                    fontWeight: '900', textTransform: 'uppercase', transition: 'all 0.2s'
                  }}>
                    {tool}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {drawColors.map((c, i) => (
                    <div key={c} onClick={() => setDrawColorIndex(i)} style={{ width: '12px', height: '12px', borderRadius: '50%', background: c, cursor: 'pointer', border: drawColorIndex === i ? '2px solid #ffe680' : '1px solid rgba(255,255,255,0.3)' }} />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => setDrawings(prev => prev.slice(0, -1))} disabled={drawings.length === 0} style={{ fontSize: '8px', padding: '3px 8px', borderRadius: '6px', background: '#0f172a', color: drawings.length === 0 ? '#334155' : '#94a3b8', border: '1px solid transparent', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)', cursor: drawings.length === 0 ? 'not-allowed' : 'pointer', fontWeight: '900', textTransform: 'uppercase' }}>Undo</button>
                  <button onClick={() => setDrawings([])} style={{ fontSize: '8px', padding: '3px 8px', borderRadius: '6px', background: '#0f172a', color: '#ef4444', border: '1px solid rgba(239,68,68,0.5)', boxShadow: '0 0 8px rgba(239,68,68,0.3)', cursor: 'pointer', fontWeight: '900', textTransform: 'uppercase' }}>Clear</button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Help Button */}
        <button onClick={() => setShowHelp(!showHelp)} style={{ width: '100%', fontSize: '10px', padding: '8px 0', borderRadius: '8px', background: '#0f172a', border: showHelp ? '1px solid #10b981' : '1px solid transparent', color: showHelp ? '#10b981' : '#cbd5e1', boxShadow: showHelp ? '0 0 12px rgba(16,185,129,0.5)' : 'inset 0 2px 4px rgba(0,0,0,0.3)', fontWeight: '900', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', transition: 'all 0.2s' }}>
          ❓ Help
        </button>

        {/* Messages Toggle */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '8px 10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', color: '#93c5fd', fontWeight: '800', letterSpacing: '0.08em', textTransform: 'uppercase', textShadow: '0 0 8px rgba(147, 197, 253, 0.3)' }}>💬 Messages</span>
            <div
              onClick={() => setShowMessages(v => !v)}
              style={{
                width: '36px', height: '18px', borderRadius: '10px',
                background: showMessages ? '#10b981' : 'rgba(255,255,255,0.2)',
                position: 'relative', cursor: 'pointer', transition: 'background 0.3s',
                boxShadow: showMessages ? '0 0 8px rgba(16, 185, 129, 0.5)' : 'inset 0 2px 4px rgba(0,0,0,0.3)'
              }}
            >
              <div style={{
                width: '14px', height: '14px', borderRadius: '50%', background: '#ffffff',
                position: 'absolute', top: '2px', left: showMessages ? '20px' : '2px',
                transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)', boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
              }} />
            </div>
          </div>
        </div>

        {/* Fullscreen Button */}
        <button onClick={toggleFullscreen} style={{ width: '100%', fontSize: '10px', padding: '8px 0', borderRadius: '8px', background: '#0f172a', border: '1px solid transparent', color: '#cbd5e1', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)', fontWeight: '900', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', transition: 'all 0.2s', marginBottom: '8px' }}>
          ⛶ Full Screen
        </button>

        {/* Screenshot Button */}
        <button onClick={handleTakeScreenshot} style={{ width: '100%', fontSize: '10px', padding: '8px 0', borderRadius: '8px', background: '#0f172a', border: '1px solid transparent', color: '#cbd5e1', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)', fontWeight: '900', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em', transition: 'all 0.2s' }}>
          📷 Screenshot
        </button>
      </div>

      {/* --- Unified Top-Centre Information & Control Pill removed --- */}

      {/* 1.5. Top-Center Player Pill */}
      {showPlayerPill && gameMode !== 'unselected' && (
        <div style={{
          position: 'absolute',
          top: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          background: 'rgba(15, 23, 42, 0.90)',
          backdropFilter: 'blur(20px)',
          border: '1.5px solid rgba(255, 255, 255, 0.18)',
          boxShadow: '0 12px 35px rgba(0, 0, 0, 0.55)',
          borderRadius: '9999px',
          padding: '8px 24px',
          color: '#e2e8f0',
          fontSize: '18px',
          fontWeight: '800',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          pointerEvents: 'none'
        }}>
          {(() => {
            const currentPlayerId = (gameMode === 'free' && selectedBall) ? selectedBall : strictPlayerId;
            const activePlayerNum = currentPlayerId.replace(/[^\d]/g, '');
            const gateText = turnGates.length > 0 
              ? turnGates.map(g => g === 4 ? 'AGARI' : `Gate ${g}`).join(', ')
              : '';
            return `PLAYER ${activePlayerNum}${gateText ? ` - ${gateText}` : ''}`;
          })()}
        </div>
      )}

      {/* Ready-to-Play indicator: shown when balls settled & a ball is awaiting a stroke */}
      {!isPlaying && !isStriking && (selectedBall || (gameMode === 'strict' && strictPlayerId)) && gameMode !== 'unselected' && sparkPhase === 'none' && (
        <div style={{
          position: 'absolute',
          bottom: '120px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 200,
          pointerEvents: 'none',
        }}>
          <style>{`
            @keyframes ready-pulse {
              0%   { box-shadow: 0 0 0 0 rgba(16,185,129,0.7); }
              70%  { box-shadow: 0 0 0 14px rgba(16,185,129,0); }
              100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
            }
            @keyframes ready-fadein {
              from { opacity: 0; transform: translateY(8px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(16px)',
            border: (() => {
              const ballId = selectedBall || strictPlayerId;
              const bPhys = physicsBalls.current[ballId];
              const needsStartBox = !ballScores[ballId]?.gate1 && bPhys?.x > 7.5 && !isInStartBox(bPhys?.x, bPhys?.z);
              return `1.5px solid ${needsStartBox ? 'rgba(245,158,11,0.7)' : 'rgba(16,185,129,0.6)'}`;
            })(),
            borderRadius: '9999px',
            padding: '7px 20px 7px 14px',
            animation: 'ready-fadein 0.35s ease both, ready-pulse 1.6s ease-in-out infinite',
            whiteSpace: 'nowrap',
          }}>
            <div style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: (() => {
                const ballId = selectedBall || strictPlayerId;
                const bPhys = physicsBalls.current[ballId];
                const needsStartBox = !ballScores[ballId]?.gate1 && bPhys?.x > 7.5 && !isInStartBox(bPhys?.x, bPhys?.z);
                return needsStartBox ? '#f59e0b' : '#10b981';
              })(),
              flexShrink: 0,
            }} />
            <span style={{
              color: '#e2e8f0',
              fontSize: '13px',
              fontWeight: '800',
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
            }}>
              {(() => {
                const ballId = selectedBall || strictPlayerId;
                const ballNum = ballId.replace(/[^\d]/g, '');
                const bPhys = physicsBalls.current[ballId];
                const needsStartBox = !ballScores[ballId]?.gate1 && bPhys?.x > 7.5 && !isInStartBox(bPhys?.x, bPhys?.z);
                if (needsStartBox) {
                  return `Ball ${ballNum} · Drag to Start Box to play`;
                }
                if (continuousStrokes > 0) {
                  return `Ball ${ballNum} · ${continuousStrokes} continuation stroke${continuousStrokes > 1 ? 's' : ''}`;
                }
                return `Ball ${ballNum} · Ready — click court to aim`;
              })()}
            </span>
          </div>
        </div>
      )}

      {/* 2. Premium Glassmorphic Scoring Event Card (Top Center) */}

      {scoringEvent && (
        <div
          key={scoringEvent.id}
          style={{
            position: 'absolute',
            top: '76px',
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
        timerValue={gameMode === 'strict' ? turnTimeLeft : null}
        gameTimeValue={gameMode === 'strict' ? gameTimeLeft : null}
        showBody={gameMode !== 'unselected' && showScoresPanel}
        onToggleShow={gameMode !== 'unselected' ? () => setShowScoresPanel(prev => !prev) : undefined}
        isEditable={gameMode === 'free'}
        onScoreChange={handleScoreChange}
        onStartScoreEditing={() => {
          // Immediately clear the active player so clicking off the scoreboard
          // doesn't trigger an accidental shot at the click-off point
          setSelectedBall(null);
          setActiveStriker(null);
          setPlayerState('hidden');
          setSparkTargetId(null);
          setSparkPhase('none');
          if (autoPlayTimeout.current) clearTimeout(autoPlayTimeout.current);
        }}
        ballScores={ballScores}
        selectedBall={selectedBall}
        onBallSelect={(id) => {
          if (gameMode === 'unselected') return;
          if (sparkPhase !== 'none') return;
          if (!isPlaying) {
            if (gameMode === 'strict' && id !== strictPlayerId) {
              showToast(`Strict Play: It's Player ${strictPlayerId.replace(/[^\d]/g, '')}'s turn!`);
              return;
            }
            if (id !== selectedBall) {
              setSelectedBall(id as BallId);
              setSparkTargetId(null);
              setContinuousStrokes(0);
            }
            setPlayerState('hidden');
            if (autoPlayTimeout.current) clearTimeout(autoPlayTimeout.current);
          }
        }}
      />




      {/* --- Help Overlay Modal --- */}
      {showHelp && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(9,13,22,0.85)', backdropFilter: 'blur(20px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontFamily: 'sans-serif' }}>
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '24px', padding: '32px', maxWidth: '500px', width: '90%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#ffe680', lineHeight: '1.2' }}>
              3D GATEBALL VISUALISER<br />
              <span style={{ fontSize: '14px', color: '#94a3b8' }}>by Murray ©2026 Manual</span>
            </h2>
            <div style={{ fontSize: '13px', lineHeight: '1.6', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p>Welcome to the<strong> 3D GATEBALL VISUALISER</strong>! This interactive sandbox lets you model, visualise, and plan game play on a full 20m x 15m court.</p>
              <p><strong>1. Court Navigation:</strong> Use your mouse to explore the court! <strong>Left-Click & Drag</strong> the background to rotate the camera, <strong>Right-Click & Drag</strong> to pan across the surface, and use the <strong>Scroll Wheel</strong> to zoom in and out.</p>
              <p><strong>2. Strict Play or Free Play:</strong> Selection of Strict Play will put the app into rules based gateball and the model tries to simulate the actual game of Gateball. In this mode the scoreboard will show scores and the active player. This enables the user to learn, practice or replay the game. Selection of Free Play will enable balls to be played in any order and dragged on to the lawn to demonstrate game rules, tactics and play routines.</p>
              <p><strong>3. Select & Move:</strong> Select a ball by clicking on it with your left mouse button and dragging it into the <strong>Start Area</strong> in the 3D court or via the right-hand scoreboard. Once selected, <strong>Drag and Drop</strong> the ball to move it anywhere on the court. Balls start docked off-court.</p>
              <p><strong>4. Standard Strokes:</strong> With a ball selected, simply <strong>click anywhere on the court</strong> to aim. The mallet will automatically appear, stalk to the ball, and execute the stroke. To skip the stalking animation, just click the court again to fire instantly!</p>
              <p><strong>5. Sparking (Touch):</strong> When you touch another ball, you must perform a spark. Drag the <strong>touched ball</strong> and drop it against <strong>your strokers ball</strong>. It will magically snap into perfect contact! Next, click a target on or off the court to set the spark target direction, and <strong>PLAY SPARK STROKE</strong>.</p>
              <p><strong>6. Camera Views:</strong> Click the buttons 1-6 in the <strong>Camera Views</strong> grid (or press number keys 1-6) to instantly jump to your saved camera angles.</p>
              <p><strong>7. Setting Custom Cameras:</strong> Move the camera to your desired angle using your mouse. Then, <strong>Right-Click</strong> any of the 1-6 buttons in the left panel (or press Shift + 1-6) to save your custom view to that slot. The button will light up green to show a view is saved!</p>
              <p><strong>8. Drawing:</strong> Use the Line, Arrow and Circle tools located in the top left Panel to draw coaching or tactical lines on the court. To enable these tools ensure <strong>Drawing Tools</strong> is active. You must turn it off to resume play</p>
              <p style={{ textAlign: 'center', marginTop: '16px' }}>Please enjoy! Suggestions and Enquiries to <a href="mailto:2tinkers@gmail.com" style={{ color: '#3b82f6', textDecoration: 'underline' }}>Murray Tinker</a></p>
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

      {/* --- Spark Phase HUD Banner (Removed per request) --- */}
      {/* --- Toast Banner (Now styled like Player Pill) --- */}
      {toastMessage && (
        <div style={{ 
          position: 'absolute', 
          top: '86px', 
          left: '50%', 
          transform: 'translateX(-50%)', 
          background: 'rgba(15, 23, 42, 0.90)', 
          backdropFilter: 'blur(20px)',
          border: '1.5px solid rgba(255, 255, 255, 0.18)', 
          padding: '8px 24px', 
          borderRadius: '9999px', 
          color: '#e2e8f0', 
          fontSize: '18px', 
          fontWeight: '800', 
          letterSpacing: '0.05em', 
          zIndex: 999, 
          boxShadow: '0 12px 35px rgba(0, 0, 0, 0.55)', 
          whiteSpace: 'nowrap',
          textTransform: 'uppercase',
          pointerEvents: 'none' 
        }}>
          {toastMessage}
        </div>
      )}




    </div>
  );
}
