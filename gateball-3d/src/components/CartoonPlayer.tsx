import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

// Define Gateball Ball IDs type
type BallId = 'r1' | 'w2' | 'r3' | 'w4' | 'r5' | 'w6' | 'r7' | 'w8' | 'r9' | 'w10';

interface CartoonPlayerProps {
  ballId: BallId;
  ballPosition: [number, number, number];
  targetPosition: [number, number, number]; // Target position to align towards
  isStriking: boolean;
  isStalking: boolean;   // NEW: player walks up to ball from behind
  onImpact: () => void;
  onFinished: () => void;
  ballSet: 'primary' | 'secondary';
  isPaused: boolean;
}

// High fidelity color sets matching App.tsx
const BALL_SETS = {
  primary: {
    red: { hex: '#991b1b', text: '#ffffff' },
    white: { hex: '#f8fafc', text: '#991b1b' }
  },
  secondary: {
    red: { hex: '#f472b6', text: '#ffffff' },
    white: { hex: '#fde047', text: '#991b1b' }
  }
};

// Stalking constants
const STALK_DURATION   = 1.2;  // seconds — 3 steps
const STALK_START_DIST = 2.53; // metres behind ball (= 2.0 walk + 0.53 stance)
const STANCE_DIST      = 0.53; // metres behind ball at rest
const STEP_FREQ        = (Math.PI * 2 * 1.5) / STALK_DURATION; // 1.5 cycles = 3 steps

export default function CartoonPlayer({
  ballId,
  ballPosition,
  targetPosition,
  isStriking,
  isStalking,
  onImpact,
  onFinished,
  ballSet,
  isPaused
}: CartoonPlayerProps) {
  const armGroupRef    = useRef<THREE.Group>(null);
  const playerGroupRef = useRef<THREE.Group>(null);
  const leftFootRef    = useRef<THREE.Mesh>(null);
  const rightFootRef   = useRef<THREE.Mesh>(null);
  const swingTimeRef   = useRef(0);
  const stalkTimeRef   = useRef(0);
  const hasImpactedRef = useRef(false);

  // --- Direction maths ---
  const dx   = targetPosition[0] - ballPosition[0];
  const dz   = targetPosition[2] - ballPosition[2];
  const dist = Math.sqrt(dx * dx + dz * dz);
  const ux   = dist > 0 ? dx / dist : 0;
  const uz   = dist > 0 ? dz / dist : -1;

  // Stance position (approach-end): 0.53 m behind ball
  const stancePx = ballPosition[0] - ux * STANCE_DIST;
  const stancePz = ballPosition[2] - uz * STANCE_DIST;

  // Stalk start position: STALK_START_DIST behind ball
  const stalkStartPx = ballPosition[0] - ux * STALK_START_DIST;
  const stalkStartPz = ballPosition[2] - uz * STALK_START_DIST;

  // Facing angle (toward target)
  const angle = Math.atan2(ux, uz);

  // Ball details
  const number = parseInt(ballId.replace(/[^\d]/g, ''), 10);
  const isRed  = ballId.startsWith('r');

  // Reset swing clock when strike initiates
  useEffect(() => {
    if (isStriking) {
      swingTimeRef.current   = 0;
      hasImpactedRef.current = false;
    }
  }, [isStriking]);

  // Reset stalk clock when stalking begins
  useEffect(() => {
    if (isStalking) {
      stalkTimeRef.current = 0;
    }
  }, [isStalking]);

  useFrame((_, delta) => {
    const player    = playerGroupRef.current;
    const arm       = armGroupRef.current;
    const leftFoot  = leftFootRef.current;
    const rightFoot = rightFootRef.current;
    if (!player) return;

    // ── STALKING: walk up to the ball ──────────────────────────────────────
    if (isStalking && !isStriking) {
      const dt = Math.min(delta, 0.03);
      stalkTimeRef.current = Math.min(stalkTimeRef.current + dt, STALK_DURATION);
      const t  = stalkTimeRef.current;

      // Smooth ease-in-out progress 0→1
      const rawT  = t / STALK_DURATION;
      const eased = rawT < 0.5
        ? 2 * rawT * rawT
        : 1 - Math.pow(-2 * rawT + 2, 2) / 2;

      // Lerp position from start → stance
      const walkX = stalkStartPx + (stancePx - stalkStartPx) * eased;
      const walkZ = stalkStartPz + (stancePz - stalkStartPz) * eased;

      // Slight body bob (up twice per step cycle)
      const bob = Math.abs(Math.sin(t * STEP_FREQ)) * 0.018;
      player.position.set(walkX, bob, walkZ);

      // Foot swing: alternating lift and forward stride
      const swing = Math.sin(t * STEP_FREQ);
      if (leftFoot) {
        leftFoot.position.set(-0.12, 0.04 + Math.max(0,  swing) * 0.07,  swing * 0.14);
      }
      if (rightFoot) {
        rightFoot.position.set( 0.12, 0.04 + Math.max(0, -swing) * 0.07, -swing * 0.14);
      }

      // Gentle arm counter-swing during walk
      if (arm) {
        arm.rotation.x = swing * 0.15;
      }
      return;
    }

    // ── AIMING STANCE: steady at stance position ───────────────────────────
    player.position.set(stancePx, 0, stancePz);
    if (leftFoot)  leftFoot.position.set(-0.12, 0.04, 0);
    if (rightFoot) rightFoot.position.set( 0.12, 0.04, 0);

    if (!isStriking) {
      if (arm) arm.rotation.x = 0;
      return;
    }

    if (isPaused) return;

    // ── SWING: per AGENTS.md phase durations ──────────────────────────────
    // Delta Capping to prevent stutter skips (Max 30ms step)
    const dt = Math.min(delta, 0.03);
    swingTimeRef.current += dt;

    const swt = swingTimeRef.current;
    let localRotationX = 0;

    if (swt < 0.40) {
      // Backswing
      localRotationX = (swt / 0.40) * (Math.PI / 6);
    } else if (swt < 0.48) {
      // Downswing
      localRotationX = ((0.48 - swt) / 0.08) * (Math.PI / 6);
    } else if (swt < 0.65) {
      // Follow-through
      localRotationX = -((swt - 0.48) / 0.17) * (Math.PI / 12);
    } else if (swt < 0.80) {
      // Return
      localRotationX = -((0.80 - swt) / 0.15) * (Math.PI / 12);
    } else {
      localRotationX = 0;
      onFinished();
    }

    if (arm) arm.rotation.x = localRotationX;

    // Consistent impact moment detection (AGENTS.md)
    const impactTime = 0.48;
    if (swt - dt < impactTime && swt >= impactTime && !hasImpactedRef.current) {
      hasImpactedRef.current = true;
      onImpact();
    }
  });

  // Bib colors matching the ball set
  const activeSet   = BALL_SETS[ballSet];
  const bibColor    = isRed ? activeSet.red.hex    : activeSet.white.hex;
  const bibTextColor = isRed ? activeSet.red.text  : activeSet.white.text;
  const shirtColor  = '#1e2229';

  return (
    <group ref={playerGroupRef} position={[stancePx, 0, stancePz]} rotation={[0, angle, 0]}>
      {/* 1. Feet */}
      <mesh ref={leftFootRef} position={[-0.12, 0.04, 0]} castShadow>
        <boxGeometry args={[0.08, 0.08, 0.18]} />
        <meshStandardMaterial color="#2d2d2d" roughness={0.8} />
      </mesh>
      <mesh ref={rightFootRef} position={[0.12, 0.04, 0]} castShadow>
        <boxGeometry args={[0.08, 0.08, 0.18]} />
        <meshStandardMaterial color="#2d2d2d" roughness={0.8} />
      </mesh>

      {/* 2. Legs */}
      <mesh position={[-0.12, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.36, 8]} />
        <meshStandardMaterial color="#fcd5b5" roughness={0.7} />
      </mesh>
      <mesh position={[0.12, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.36, 8]} />
        <meshStandardMaterial color="#fcd5b5" roughness={0.7} />
      </mesh>

      {/* 3. Torso */}
      <mesh position={[0, 0.65, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.18, 0.5, 12]} />
        <meshStandardMaterial color={shirtColor} roughness={0.6} />
      </mesh>

      {/* Polo Collar */}
      <mesh position={[0, 0.9, 0]} rotation={[0.1, 0, 0]} castShadow>
        <cylinderGeometry args={[0.10, 0.12, 0.04, 12]} />
        <meshStandardMaterial color="#ffffff" roughness={0.5} />
      </mesh>

      {/* 3.5 Netball Bib — Front */}
      <group position={[0, 0.65, 0.172]}>
        <mesh castShadow>
          <planeGeometry args={[0.22, 0.22]} />
          <meshStandardMaterial color={bibColor} roughness={0.5} side={THREE.DoubleSide} />
        </mesh>
        <Text position={[0, 0, 0.005]} fontSize={0.16} color={bibTextColor} fontWeight="bold" anchorX="center" anchorY="middle">
          {number}
        </Text>
      </group>

      {/* Bib — Back */}
      <group position={[0, 0.65, -0.172]} rotation={[0, Math.PI, 0]}>
        <mesh castShadow>
          <planeGeometry args={[0.22, 0.22]} />
          <meshStandardMaterial color={bibColor} roughness={0.5} side={THREE.DoubleSide} />
        </mesh>
        <Text position={[0, 0, 0.005]} fontSize={0.16} color={bibTextColor} fontWeight="bold" anchorX="center" anchorY="middle">
          {number}
        </Text>
      </group>

      {/* Neck */}
      <mesh position={[0, 0.95, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.05, 0.08, 12]} />
        <meshStandardMaterial color="#fcd5b5" roughness={0.7} />
      </mesh>

      {/* 4. Head */}
      <mesh position={[0, 1.07, 0]} castShadow>
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshStandardMaterial color="#fcd5b5" roughness={0.7} />
      </mesh>

      {/* 5. White Panama Hat */}
      <mesh position={[0, 1.18, 0.01]} rotation={[-0.05, 0, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.24, 0.01, 24]} />
        <meshStandardMaterial color="#faf9f6" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.205, 0.01]} rotation={[-0.05, 0, 0]} castShadow>
        <cylinderGeometry args={[0.136, 0.137, 0.03, 18]} />
        <meshStandardMaterial color="#111111" roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.25, 0.01]} rotation={[-0.05, 0, 0]} castShadow>
        <cylinderGeometry args={[0.125, 0.135, 0.07, 18]} />
        <meshStandardMaterial color="#faf9f6" roughness={0.9} />
      </mesh>

      {/* 6. Sunglasses */}
      <group position={[0, 1.08, 0.07]}>
        <mesh position={[-0.045, 0, 0.06]} castShadow>
          <sphereGeometry args={[0.035, 12, 12]} />
          <meshStandardMaterial color="#222222" metalness={0.9} roughness={0.1} />
        </mesh>
        <mesh position={[0.045, 0, 0.06]} castShadow>
          <sphereGeometry args={[0.035, 12, 12]} />
          <meshStandardMaterial color="#222222" metalness={0.9} roughness={0.1} />
        </mesh>
        <mesh position={[0, 0.01, 0.06]} castShadow>
          <boxGeometry args={[0.05, 0.008, 0.01]} />
          <meshStandardMaterial color="#d4af37" metalness={0.9} roughness={0.1} />
        </mesh>
      </group>

      {/* 7. Swing Arm & Mallet Assembly */}
      <group ref={armGroupRef} position={[0, 0.85, 0.10]}>
        {/* Left Arm */}
        <mesh position={[-0.18, -0.22, 0.08]} rotation={[-0.18, 0, 0]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 0.42, 8]} />
          <meshStandardMaterial color={shirtColor} roughness={0.5} />
        </mesh>
        {/* Right Arm */}
        <mesh position={[0.18, -0.22, 0.08]} rotation={[-0.18, 0, 0]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 0.42, 8]} />
          <meshStandardMaterial color={shirtColor} roughness={0.5} />
        </mesh>

        {/* Mallet */}
        <group position={[0, -0.34, 0.16]} rotation={[-0.28, 0, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.012, 0.012, 0.72, 8]} />
            <meshStandardMaterial color="#8b5a2b" roughness={0.8} />
          </mesh>
          <mesh position={[0, -0.36, 0]} rotation={[Math.PI / 2 + 0.28, 0, 0]} castShadow>
            <cylinderGeometry args={[0.055, 0.055, 0.22, 12]} />
            <meshStandardMaterial color="#3a2512" roughness={0.9} />
          </mesh>
          <mesh position={[0, -0.36, -0.11]} rotation={[Math.PI / 2 + 0.28, 0, 0]}>
            <cylinderGeometry args={[0.056, 0.056, 0.015, 12]} />
            <meshStandardMaterial color={bibColor} metalness={0.9} roughness={0.1} />
          </mesh>
          <mesh position={[0, -0.36, 0.11]} rotation={[Math.PI / 2 + 0.28, 0, 0]}>
            <cylinderGeometry args={[0.056, 0.056, 0.015, 12]} />
            <meshStandardMaterial color={bibColor} metalness={0.9} roughness={0.1} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
