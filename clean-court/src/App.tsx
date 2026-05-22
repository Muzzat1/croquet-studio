/* eslint-disable react-hooks/immutability */
import { useState, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import CourtSurface from './components/CourtSurface';
import ParkSurroundings from './components/ParkSurroundings';
import QuadwayHoop from './components/QuadwayHoop';
import CroquetBall from './components/CroquetBall';
import CartoonPlayer from './components/CartoonPlayer';

interface PhysicsBallState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  isRolling: boolean;
}

function PhysicsManager({
  physicsBalls,
  meshRefs,
  onPositionChange,
  selectedBall,
  selectedRingRef
}: {
  physicsBalls: React.MutableRefObject<Record<string, PhysicsBallState>>;
  meshRefs: React.MutableRefObject<Record<string, React.RefObject<THREE.Mesh | null>>>;
  onPositionChange: (color: 'blue' | 'red' | 'black' | 'yellow', x: number, z: number) => void;
  selectedBall: 'blue' | 'red' | 'black' | 'yellow';
  selectedRingRef: React.RefObject<THREE.Mesh | null>;
}) {
  // Perimeter boundaries based on picket fences:
  // Fences are at X = +/- 18, Z = +/- 21.5 yards.
  // Ball radius is 0.133375.
  const BOUNDARY_X = 18 - 0.133375;  // 17.866625
  const BOUNDARY_Z = 21.5 - 0.133375; // 21.366625

  // 12 Hoop Leg Positions (Offset from 6 hoops by +/- 0.1875 yards along the X axis)
  const HOOP_LEGS = [
    // Hoop 1: [-7, 10.5]
    { x: -7 - 0.1875, z: 10.5 },
    { x: -7 + 0.1875, z: 10.5 },
    // Hoop 2: [-7, -10.5]
    { x: -7 - 0.1875, z: -10.5 },
    { x: -7 + 0.1875, z: -10.5 },
    // Hoop 3: [7, -10.5]
    { x: 7 - 0.1875, z: -10.5 },
    { x: 7 + 0.1875, z: -10.5 },
    // Hoop 4: [7, 10.5]
    { x: 7 - 0.1875, z: 10.5 },
    { x: 7 + 0.1875, z: 10.5 },
    // Hoop 5: [0, -7]
    { x: 0 - 0.1875, z: -7 },
    { x: 0 + 0.1875, z: -7 },
    // Hoop 6: [0, 7]
    { x: 0 - 0.1875, z: 7 },
    { x: 0 + 0.1875, z: 7 }
  ];

  useFrame((_, delta) => {
    // Limit delta time steps to avoid tunnel-through behaviors during frame rate stutters
    const dt = Math.min(delta, 0.03);

    const balls = physicsBalls.current;
    const refs = meshRefs.current;
    const colors = ['blue', 'red', 'black', 'yellow'] as const;

    // 1. Process individual movement, lawn friction, obstacle/perimeter collisions
    colors.forEach(c => {
      const b = balls[c];
      if (b.vx !== 0 || b.vz !== 0 || b.isRolling) {
        b.x += b.vx * dt;
        b.z += b.vz * dt;

        // Apply turf grass friction deceleration (exponential decay)
        b.vx *= Math.exp(-0.85 * dt);
        b.vz *= Math.exp(-0.85 * dt);

        // --- PEG COLLISION ---
        const dxPeg = b.x - 0;
        const dzPeg = b.z - 0;
        const distPeg = Math.sqrt(dxPeg * dxPeg + dzPeg * dzPeg);
        const minPegDist = 0.208375; // 0.133375 (ball radius) + 0.075 (peg radius)
        if (distPeg < minPegDist && distPeg > 0.001) {
          const nx = dxPeg / distPeg;
          const nz = dzPeg / distPeg;
          const velAlongNormal = b.vx * nx + b.vz * nz;
          if (velAlongNormal < 0) {
            const j = -(1 + 0.5) * velAlongNormal;
            b.vx += j * nx;
            b.vz += j * nz;
            b.isRolling = true;
          }
          b.x = nx * minPegDist;
          b.z = nz * minPegDist;
        }

        // --- HOOP LEGS COLLISION ---
        const minLegDist = 0.168375; // 0.133375 (ball radius) + 0.035 (leg radius)
        HOOP_LEGS.forEach(leg => {
          const dxLeg = b.x - leg.x;
          const dzLeg = b.z - leg.z;
          const distLeg = Math.sqrt(dxLeg * dxLeg + dzLeg * dzLeg);
          if (distLeg < minLegDist && distLeg > 0.001) {
            const nx = dxLeg / distLeg;
            const nz = dzLeg / distLeg;
            const velAlongNormal = b.vx * nx + b.vz * nz;
            if (velAlongNormal < 0) {
              const j = -(1 + 0.4) * velAlongNormal;
              b.vx += j * nx;
              b.vz += j * nz;
              b.isRolling = true;
            }
            b.x = leg.x + nx * minLegDist;
            b.z = leg.z + nz * minLegDist;
          }
        });

        const speed = Math.sqrt(b.vx * b.vx + b.vz * b.vz);

        // Under 0.045 yards/sec, we come to a clean stop and synchronize to React state
        if (speed < 0.045) {
          b.vx = 0;
          b.vz = 0;
          b.isRolling = false;
          onPositionChange(c, b.x, b.z);
        }

        // Perimeter fence collisions (elastic reflection with 45% energy loss)
        if (b.x > BOUNDARY_X) {
          b.x = BOUNDARY_X;
          b.vx = -Math.abs(b.vx) * 0.55;
        } else if (b.x < -BOUNDARY_X) {
          b.x = -BOUNDARY_X;
          b.vx = Math.abs(b.vx) * 0.55;
        }

        if (b.z > BOUNDARY_Z) {
          b.z = BOUNDARY_Z;
          b.vz = -Math.abs(b.vz) * 0.55;
        } else if (b.z < -BOUNDARY_Z) {
          b.z = -BOUNDARY_Z;
          b.vz = Math.abs(b.vz) * 0.55;
        }

        // Apply immediate visual update directly to WebGL mesh
        const mesh = refs[c].current;
        if (mesh) {
          mesh.position.x = b.x;
          mesh.position.z = b.z;
        }

        // If this rolling ball is the selected ball, also update the selection ring position
        if (c === selectedBall && selectedRingRef.current) {
          selectedRingRef.current.position.x = b.x;
          selectedRingRef.current.position.z = b.z;
        }
      }
    });

    // 2. Process elastic ball-to-ball collisions with coordinate overlap resolutions
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        const cA = colors[i];
        const cB = colors[j];
        const bA = balls[cA];
        const bB = balls[cB];

        const dx = bA.x - bB.x;
        const dz = bA.z - bB.z;
        const distSq = dx * dx + dz * dz;
        const minContactDist = 0.26675; // 2 * 0.133375
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
            }

            const overlap = minContactDist - dist;
            const nx_pos = dx / dist;
            const nz_pos = dz / dist;
            bA.x += nx_pos * overlap / 2;
            bA.z += nz_pos * overlap / 2;
            bB.x -= nx_pos * overlap / 2;
            bB.z -= nz_pos * overlap / 2;

            bA.isRolling = true;
            bB.isRolling = true;

            // Instantly sync visual WebGL meshes
            const meshA = refs[cA].current;
            if (meshA) {
              meshA.position.x = bA.x;
              meshA.position.z = bA.z;
            }
            const meshB = refs[cB].current;
            if (meshB) {
              meshB.position.x = bB.x;
              meshB.position.z = bB.z;
            }

            // If either bumped ball is the selected ball, also update the selection ring position
            if (cA === selectedBall && selectedRingRef.current) {
              selectedRingRef.current.position.x = bA.x;
              selectedRingRef.current.position.z = bA.z;
            } else if (cB === selectedBall && selectedRingRef.current) {
              selectedRingRef.current.position.x = bB.x;
              selectedRingRef.current.position.z = bB.z;
            }
          }
        }
      }
    }
  });

  return null;
}

function PanoramaBackground() {
  const texture = useTexture('/parkland_panorama.png');
  texture.colorSpace = THREE.SRGBColorSpace;
  return (
    <mesh rotation={[0, -Math.PI / 2, 0]} scale={[1, -1, 1]}>
      <sphereGeometry args={[1000, 60, 40]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} toneMapped={false} fog={false} />
    </mesh>
  );
}

// Custom Camera Controller inside the Canvas to handle programmatically updating OrbitControls & camera positions
interface CameraControllerProps {
  resetCounter: number;
}

function CameraController({ resetCounter }: CameraControllerProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const threeState = useThree() as any;
  const camera = threeState.camera;
  const controls = threeState.controls;
  const lastReset = useRef(0);

  useEffect(() => {
    if (resetCounter > 0 && resetCounter !== lastReset.current) {
      lastReset.current = resetCounter;
      
      // Custom camera position requested by user: [48.27, 10.84, 27.98]
      camera.position.set(48.27, 10.84, 27.98);
      camera.fov = 15.0; // Set deep telephoto zoom (fov = 15) to focus on the starting area
      camera.updateProjectionMatrix();

      if (controls) {
        // Target pointing directly to the requested area: [12.81, 2.21, 18.04]
        controls.target.set(12.81, 2.21, 18.04);
        controls.update();
      }
    }
  }, [resetCounter, camera, controls]);

  // Option A: Add a 'keydown' listener. Pressing 'c' logs the active camera angle vectors
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'c') {
        const camPos = camera.position;
        const targetPos = controls ? (controls as unknown as { target: THREE.Vector3 }).target : new THREE.Vector3();
        console.log(
          `%c[Camera Angle Captured]%c\nPosition: [${camPos.x.toFixed(2)}, ${camPos.y.toFixed(2)}, ${camPos.z.toFixed(2)}]\nTarget: [${targetPos.x.toFixed(2)}, ${targetPos.y.toFixed(2)}, ${targetPos.z.toFixed(2)}]\nFOV: ${camera.fov.toFixed(1)}`,
          'color: #f6e297; font-weight: bold; font-size: 13px; text-shadow: 0 1px 2px rgba(0,0,0,0.5);',
          'color: #8bc34a; font-weight: 500;'
        );
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [camera, controls]);

  return null;
}

export default function App() {
  // React State for initial ball positioning & synchronization (drag and drop)
  const [balls, setBalls] = useState<Record<string, { x: number; z: number }>>({
    blue: { x: -2, z: 5 },
    red: { x: 2, z: 5 },
    black: { x: -2, z: -5 },
    yellow: { x: 2, z: -5 }
  });

  // Undo position history stack (capped at 50 entries)
  const [history, setHistory] = useState<Record<string, { x: number; z: number }>[]>([]);
  
  // Reset trigger state counter for the CameraController
  const [cameraResetCounter, setCameraResetCounter] = useState(0);

  // Striker State Machine parameters
  const [activeStriker, setActiveStriker] = useState<'blue' | 'red' | 'black' | 'yellow' | null>(null);
  const [isStriking, setIsStriking] = useState(false);

  // Selection & striking target state
  const [selectedBall, setSelectedBall] = useState<'blue' | 'red' | 'black' | 'yellow'>('blue');
  const [strikeTarget, setStrikeTarget] = useState<{ x: number; z: number } | null>(null);

  // Mesh reference map for zero-render physics loops
  const blueMeshRef = useRef<THREE.Mesh>(null);
  const redMeshRef = useRef<THREE.Mesh>(null);
  const blackMeshRef = useRef<THREE.Mesh>(null);
  const yellowMeshRef = useRef<THREE.Mesh>(null);

  const meshRefs = useRef<Record<string, React.RefObject<THREE.Mesh | null>>>({
    blue: blueMeshRef,
    red: redMeshRef,
    black: blackMeshRef,
    yellow: yellowMeshRef
  });

  // Selection ring ref
  const selectedRingRef = useRef<THREE.Mesh>(null);

  // Drag tracking to distinguish camera rotating from clicking to shoot
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  // Physics engine coordinate, velocity, and state refs
  const physicsBalls = useRef<Record<string, PhysicsBallState>>({
    blue: { x: -2, z: 5, vx: 0, vz: 0, isRolling: false },
    red: { x: 2, z: 5, vx: 0, vz: 0, isRolling: false },
    black: { x: -2, z: -5, vx: 0, vz: 0, isRolling: false },
    yellow: { x: 2, z: -5, vx: 0, vz: 0, isRolling: false }
  });

  // Save current layout of all balls to history before any action
  const saveToHistory = () => {
    const snapshot = {
      blue: { x: physicsBalls.current.blue.x, z: physicsBalls.current.blue.z },
      red: { x: physicsBalls.current.red.x, z: physicsBalls.current.red.z },
      black: { x: physicsBalls.current.black.x, z: physicsBalls.current.black.z },
      yellow: { x: physicsBalls.current.yellow.x, z: physicsBalls.current.yellow.z }
    };
    
    setHistory(prev => {
      const next = [...prev, snapshot];
      if (next.length > 50) {
        next.shift(); // Cap history to 50 items
      }
      return next;
    });
  };

  // Undo the last movement or strike
  const handleUndo = () => {
    if (activeStriker !== null) return;
    const isAnyBallMoving = Object.values(physicsBalls.current).some(b => b.vx !== 0 || b.vz !== 0 || b.isRolling);
    if (isAnyBallMoving) return;

    if (history.length === 0) return;

    const previousSnapshot = history[history.length - 1];
    setHistory(prev => prev.slice(0, prev.length - 1));

    // Restore the balls state
    setBalls(previousSnapshot);

    // Sync physics reference engine and instant visual meshes
    const colors = ['blue', 'red', 'black', 'yellow'] as const;
    colors.forEach(c => {
      physicsBalls.current[c].x = previousSnapshot[c].x;
      physicsBalls.current[c].z = previousSnapshot[c].z;
      physicsBalls.current[c].vx = 0;
      physicsBalls.current[c].vz = 0;
      physicsBalls.current[c].isRolling = false;

      const mesh = meshRefs.current[c].current;
      if (mesh) {
        mesh.position.x = previousSnapshot[c].x;
        mesh.position.z = previousSnapshot[c].z;
      }
    });

    // Update selection ring positions
    if (selectedRingRef.current) {
      selectedRingRef.current.position.x = previousSnapshot[selectedBall].x;
      selectedRingRef.current.position.z = previousSnapshot[selectedBall].z;
    }
  };

  // Reset the simulation state
  const handleReset = () => {
    if (activeStriker !== null) return;
    const isAnyBallMoving = Object.values(physicsBalls.current).some(b => b.vx !== 0 || b.vz !== 0 || b.isRolling);
    if (isAnyBallMoving) return;

    // Snapshot the current state before resetting so that reset itself can be undone!
    saveToHistory();

    // 6 inches back: south boundary is Z = 17.5 yards, 6 inches back is Z = 17.6667
    // Spaced out near starting flag (X = 14) to prevent overlap
    const resetPositions = {
      blue: { x: 13.8, z: 17.6667 },
      red: { x: 13.4, z: 17.6667 },
      black: { x: 13.0, z: 17.6667 },
      yellow: { x: 12.6, z: 17.6667 }
    };

    setBalls(resetPositions);

    const colors = ['blue', 'red', 'black', 'yellow'] as const;
    colors.forEach(c => {
      physicsBalls.current[c].x = resetPositions[c].x;
      physicsBalls.current[c].z = resetPositions[c].z;
      physicsBalls.current[c].vx = 0;
      physicsBalls.current[c].vz = 0;
      physicsBalls.current[c].isRolling = false;

      const mesh = meshRefs.current[c].current;
      if (mesh) {
        mesh.position.x = resetPositions[c].x;
        mesh.position.z = resetPositions[c].z;
      }
    });

    // Set selection back to Blue as default
    setSelectedBall('blue');

    if (selectedRingRef.current) {
      selectedRingRef.current.position.x = resetPositions.blue.x;
      selectedRingRef.current.position.z = resetPositions.blue.z;
    }

    // Increment camera reset counter to trigger custom positioning and fov change
    setCameraResetCounter(prev => prev + 1);
  };

  // Handler for syncing positions from drags and stops
  const handleBallChange = (color: 'blue' | 'red' | 'black' | 'yellow', x: number, z: number) => {
    setBalls(prev => ({
      ...prev,
      [color]: { x, z }
    }));
    physicsBalls.current[color].x = x;
    physicsBalls.current[color].z = z;

    // Instantly sync visual WebGL mesh if present
    const mesh = meshRefs.current[color].current;
    if (mesh) {
      mesh.position.x = x;
      mesh.position.z = z;
    }

    // Instantly sync selection ring if this is the selected ball
    if (color === selectedBall && selectedRingRef.current) {
      selectedRingRef.current.position.x = x;
      selectedRingRef.current.position.z = z;
    }
  };

  // HUD Button Selection handler
  const handleHUDSelect = (color: 'blue' | 'red' | 'black' | 'yellow') => {
    if (activeStriker !== null) return; // Prevent selection changes during active striking
    setSelectedBall(color);
  };

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const handleCourtPointerDown = (e: any) => {
    if (activeStriker !== null) return;
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleCourtPointerUp = (e: any) => {
    if (activeStriker !== null || !pointerDownPos.current) return;

    const dx = e.clientX - pointerDownPos.current.x;
    const dy = e.clientY - pointerDownPos.current.y;
    const dragDistance = Math.sqrt(dx * dx + dy * dy);

    pointerDownPos.current = null;

    // Filter out OrbitControls camera drags
    if (dragDistance > 6) return;

    e.stopPropagation();
    const clickPoint = e.point;
    if (clickPoint) {
      // Cancel all active ball rolls and synchronize their physical positions back to React state
      const colors = ['blue', 'red', 'black', 'yellow'] as const;
      colors.forEach(c => {
        const b = physicsBalls.current[c];
        if (b.isRolling || b.vx !== 0 || b.vz !== 0 || c === selectedBall) {
          b.vx = 0;
          b.vz = 0;
          b.isRolling = false;
          handleBallChange(c, b.x, b.z);
        }
      });

      saveToHistory(); // Save snapshot before strike begins

      setStrikeTarget({ x: clickPoint.x, z: clickPoint.z });
      setActiveStriker(selectedBall);
      setIsStriking(true);
    }
  };

  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Mallet-to-Ball collision impulse frame event
  const handleImpact = () => {
    if (!activeStriker) return;
    const b = physicsBalls.current[activeStriker];

    // Determine target location: click point or center peg fallback
    const targetX = strikeTarget ? strikeTarget.x : 0;
    const targetZ = strikeTarget ? strikeTarget.z : 0;

    const dx = targetX - b.x;
    const dz = targetZ - b.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    const ux = dist > 0 ? dx / dist : 0;
    const uz = dist > 0 ? dz / dist : -1;

    // Apply Turf grass deceleration friction math to stop exactly on target.
    // v(t) = v0 * e^(-0.85 * t)
    // d = (v0 - 0.045) / 0.85 => v0 = d * 0.85 + 0.045
    // Capped at 25.0 yards/second.
    const targetSpeed = dist * 0.85 + 0.045;
    const impulseSpeed = Math.min(targetSpeed, 25.0);

    b.vx = ux * impulseSpeed;
    b.vz = uz * impulseSpeed;
    b.isRolling = true;
  };

  // End of player swing cycle
  const handleFinished = () => {
    setActiveStriker(null);
    setIsStriking(false);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', background: '#0a0f0d', position: 'relative' }}>
      
      {/* 3D WebGL Canvas Scene */}
      <Canvas camera={{ position: [0, 20, 25], fov: 45, far: 5000 }} shadows>
        <color attach="background" args={['#a0c4de']} />
        <fog attach="fog" args={['#a0c4de', 40, 150]} />
        <CameraController resetCounter={cameraResetCounter} />
        <PanoramaBackground />
        <ambientLight intensity={0.5} />
        <directionalLight 
          position={[25, 45, 25]} 
          castShadow 
          intensity={1.4} 
          shadow-mapSize-width={4096} 
          shadow-mapSize-height={4096}
          shadow-camera-left={-80}
          shadow-camera-right={80}
          shadow-camera-top={80}
          shadow-camera-bottom={-80}
          shadow-camera-near={0.5}
          shadow-camera-far={200}
          shadow-bias={-0.00002}
        />
        
        <CourtSurface />
        <ParkSurroundings />

        {/* Center Peg (Height = 1.3125, Radius = 0.075) */}
        <mesh position={[0, 0.65625, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.075, 0.075, 1.3125, 16]} />
          <meshStandardMaterial color="#ffffff" roughness={0.3} metalness={0.1} />
        </mesh>
        
        {/* Peg Colored Bands from top: Blue, Red, Black, Yellow */}
        {[
          [1.13125, '#1565c0'], // Blue (Top)
          [1.00625, '#d32f2f'], // Red
          [0.88125, '#212121'], // Black
          [0.75625, '#fbc02d']  // Yellow
        ].map(([y, color], idx) => (
          <mesh key={idx} position={[0, y as number, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.08, 0.1, 16]} />
            <meshStandardMaterial color={color as string} roughness={0.2} />
          </mesh>
        ))}

        {/* Official Quadway Hoop Coordinates */}
        <QuadwayHoop position={[-7, 0, 10.5]} crownColor="#1565c0" />
        <QuadwayHoop position={[-7, 0, -10.5]} crownColor="#ffffff" />
        <QuadwayHoop position={[7, 0, -10.5]} crownColor="#d32f2f" />
        <QuadwayHoop position={[7, 0, 10.5]} crownColor="#ffffff" />
        <QuadwayHoop position={[0, 0, -7]} crownColor="#ffffff" />
        <QuadwayHoop position={[0, 0, 7]} crownColor="#ffffff" />

        {/* Active Procedural Cartoon Player */}
        {activeStriker && (
          <CartoonPlayer
            color={activeStriker}
            ballPosition={[balls[activeStriker].x, 0.133375, balls[activeStriker].z]}
            targetPosition={
              strikeTarget 
                ? [strikeTarget.x, 0.133375, strikeTarget.z] 
                : [0, 0.133375, 0]
            }
            isStriking={isStriking}
            onImpact={handleImpact}
            onFinished={handleFinished}
          />
        )}

        {/* Physics Manager Engine */}
        <PhysicsManager 
          physicsBalls={physicsBalls} 
          meshRefs={meshRefs} 
          onPositionChange={handleBallChange}
          selectedBall={selectedBall}
          selectedRingRef={selectedRingRef}
        />

        {/* Selected Ball Ring Visualizer */}
        <mesh
          ref={selectedRingRef}
          position={[balls[selectedBall].x, 0.006, balls[selectedBall].z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.16, 0.20, 32]} />
          <meshBasicMaterial 
            color={
              selectedBall === 'blue' ? '#1565c0' :
              selectedBall === 'red' ? '#d32f2f' :
              selectedBall === 'black' ? '#ffffff' :
              '#fbc02d'
            } 
            side={THREE.DoubleSide} 
          />
        </mesh>

        {/* Invisible court surface clicking helper to capture striking clicks */}
        <mesh 
          position={[0, 0.003, 0]} 
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerDown={handleCourtPointerDown}
          onPointerUp={handleCourtPointerUp}
        >
          <planeGeometry args={[120, 120]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>

        {/* Dynamic Croquet Balls */}
        <CroquetBall
          ref={blueMeshRef}
          color="#1565c0"
          x={balls.blue.x}
          z={balls.blue.z}
          onPositionChange={(x, z) => handleBallChange('blue', x, z)}
          onPointerDown={() => {
            if (activeStriker === null) {
              saveToHistory();
              setSelectedBall('blue');
            }
          }}
        />
        <CroquetBall
          ref={redMeshRef}
          color="#d32f2f"
          x={balls.red.x}
          z={balls.red.z}
          onPositionChange={(x, z) => handleBallChange('red', x, z)}
          onPointerDown={() => {
            if (activeStriker === null) {
              saveToHistory();
              setSelectedBall('red');
            }
          }}
        />
        <CroquetBall
          ref={blackMeshRef}
          color="#212121"
          x={balls.black.x}
          z={balls.black.z}
          onPositionChange={(x, z) => handleBallChange('black', x, z)}
          onPointerDown={() => {
            if (activeStriker === null) {
              saveToHistory();
              setSelectedBall('black');
            }
          }}
        />
        <CroquetBall
          ref={yellowMeshRef}
          color="#fbc02d"
          x={balls.yellow.x}
          z={balls.yellow.z}
          onPositionChange={(x, z) => handleBallChange('yellow', x, z)}
          onPointerDown={() => {
            if (activeStriker === null) {
              saveToHistory();
              setSelectedBall('yellow');
            }
          }}
        />

        <OrbitControls makeDefault maxPolarAngle={Math.PI / 2 - 0.05} minDistance={5} maxDistance={250} />
      </Canvas>

      {/* Floating Control Panel HUD (HTML Overlay) */}
      <div className="floating-control-panel">
        <div className="panel-title">Active Ball</div>
        <div className="btn-container">
          <button 
            className={`strike-btn btn-blue ${selectedBall === 'blue' ? 'selected' : ''}`} 
            onClick={() => handleHUDSelect('blue')} 
            title="Select Blue Ball"
            disabled={activeStriker !== null}
          />
          <button 
            className={`strike-btn btn-red ${selectedBall === 'red' ? 'selected' : ''}`} 
            onClick={() => handleHUDSelect('red')} 
            title="Select Red Ball"
            disabled={activeStriker !== null}
          />
          <button 
            className={`strike-btn btn-black ${selectedBall === 'black' ? 'selected' : ''}`} 
            onClick={() => handleHUDSelect('black')} 
            title="Select Black Ball"
            disabled={activeStriker !== null}
          />
          <button 
            className={`strike-btn btn-yellow ${selectedBall === 'yellow' ? 'selected' : ''}`} 
            onClick={() => handleHUDSelect('yellow')} 
            title="Select Yellow Ball"
            disabled={activeStriker !== null}
          />
        </div>

        {/* Premium Divider and simulation controls */}
        <div className="panel-divider" />
        
        <div className="panel-title">Controls</div>
        <div className="btn-container" style={{ gap: '12px' }}>
          <button 
            className="control-action-btn" 
            onClick={handleUndo} 
            disabled={activeStriker !== null || history.length === 0}
            title="Undo Last Action"
            style={{ minWidth: '85px' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="control-icon">
              <path d="M3 7v6h6"/>
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
            </svg>
            <span>Undo</span>
          </button>
          
          <button 
            className="control-action-btn" 
            onClick={handleReset} 
            disabled={activeStriker !== null}
            title="Reset Game State"
            style={{ minWidth: '85px' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="control-icon">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Signature Watermark Overlay */}
      <div className="signature-watermark">
        <div className="signature-name">Murray Tinker's</div>
        <div className="signature-title">GC Croquet 3D Visualiser (0.12 BETA)</div>
      </div>

    </div>
  );
}
