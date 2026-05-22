/* eslint-disable react-hooks/immutability */
import { useState, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sky } from '@react-three/drei';
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

  useFrame((_, delta) => {
    // Limit delta time steps to avoid tunnel-through behaviors during frame rate stutters
    const dt = Math.min(delta, 0.03);

    const balls = physicsBalls.current;
    const refs = meshRefs.current;
    const colors = ['blue', 'red', 'black', 'yellow'] as const;

    // 1. Process individual movement, lawn friction, and perimeter bounces
    colors.forEach(c => {
      const b = balls[c];
      if (b.vx !== 0 || b.vz !== 0 || b.isRolling) {
        b.x += b.vx * dt;
        b.z += b.vz * dt;

        // Apply turf grass friction deceleration (exponential decay)
        // Adjust the multiplier (-0.9) to make the balls roll longer or shorter
        b.vx *= Math.exp(-0.85 * dt);
        b.vz *= Math.exp(-0.85 * dt);

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

        const dx = bB.x - bA.x;
        const dz = bB.z - bA.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const minDist = 0.26675; // sum of ball diameters (2 * 0.133375)

        if (dist < minDist && dist > 0.001) {
          const overlap = minDist - dist;
          const nx = dx / dist;
          const nz = dz / dist;

          // Push balls apart along normal vector to completely avoid clipping
          bA.x -= nx * overlap * 0.5;
          bA.z -= nz * overlap * 0.5;
          bB.x += nx * overlap * 0.5;
          bB.z += nz * overlap * 0.5;

          // Project velocities onto the normal impact vector
          const v1n = bA.vx * nx + bA.vz * nz;
          const v2n = bB.vx * nx + bB.vz * nz;

          // Swap components for standard equal-mass 1D elastic impact
          const vxA_new = bA.vx + (v2n - v1n) * nx;
          const vzA_new = bA.vz + (v2n - v1n) * nz;
          const vxB_new = bB.vx + (v1n - v2n) * nx;
          const vzB_new = bB.vz + (v1n - v2n) * nz;

          // Minor collision friction loss (5%)
          bA.vx = vxA_new * 0.95;
          bA.vz = vzA_new * 0.95;
          bB.vx = vxB_new * 0.95;
          bB.vz = vzB_new * 0.95;

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
  });

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
      // Cancel active ball rolls first to start clean from click target calculations
      const b = physicsBalls.current[selectedBall];
      b.vx = 0;
      b.vz = 0;
      b.isRolling = false;

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
      <Canvas camera={{ position: [0, 20, 25], fov: 45 }} shadows>
        <Sky sunPosition={[10, 20, -10]} distance={450000} />
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
              setSelectedBall('yellow');
            }
          }}
        />

        <OrbitControls makeDefault maxPolarAngle={Math.PI / 2 - 0.05} minDistance={5} maxDistance={60} />
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
      </div>

    </div>
  );
}
