import { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sky, Line } from '@react-three/drei';
import * as THREE from 'three';
import CourtSurface from './CourtSurface';
import ParkSurroundings from './ParkSurroundings';
import QuadwayHoop from './QuadwayHoop';
import CroquetBall from './CroquetBall';
import CartoonPlayer from './CartoonPlayer';
import {
  to3DX,
  to3DZ,
  PEG_POS,
  HOOPS,
  DISPLAY_RADIUS,
  SCALE,
  BALL_RADIUS,
  isBallDocked,
} from '../../physics/CroquetPhysics';

interface Ball {
  id: 'blue' | 'red' | 'yellow' | 'black';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
}

interface Path {
  points: { x: number; y: number }[];
  color: string;
  type: 'freehand' | 'straight';
}

interface CroquetCanvas3DProps {
  balls: Record<'blue' | 'red' | 'yellow' | 'black', Ball>;
  selectedBall: 'blue' | 'red' | 'yellow' | 'black';
  angle: number;
  speed: number;
  drawings: Path[];
  currentPath: Path | null;
  cleanFeed: boolean;
  ghostBallEnabled: boolean;
  isPlaying: boolean;
  ballSet: 'primary' | 'secondary';
  onSelectedBallChange: (id: 'blue' | 'red' | 'yellow' | 'black') => void;
  onBallsChange: (balls: Record<'blue' | 'red' | 'yellow' | 'black', Ball>) => void;
  
  // Aiming / Shooting properties
  placementMode: boolean;
  onAngleChange: (angle: number) => void;
  onSpeedChange: (speed: number) => void;
  onTargetSpotChange: (spot: { x: number; y: number } | null) => void;

  // Active procedural striker player states
  activeStriker: 'blue' | 'red' | 'yellow' | 'black' | null;
  isStriking: boolean;
  strikeTarget: { x: number; z: number } | null;
  onImpact: () => void;
  onFinished: () => void;
}

export default function CroquetCanvas3D({
  balls,
  selectedBall,
  angle,
  speed,
  drawings,
  currentPath,
  cleanFeed,
  ghostBallEnabled,
  isPlaying,
  ballSet,
  onSelectedBallChange,
  onBallsChange,
  placementMode,
  onTargetSpotChange,
  activeStriker,
  isStriking,
  strikeTarget,
  onImpact,
  onFinished,
}: CroquetCanvas3DProps) {
  const selectedRingRef = useRef<THREE.Mesh>(null);
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  // Ball radius in yards
  const radius = DISPLAY_RADIUS / SCALE;

  const handleBallPositionChange = (color: 'blue' | 'red' | 'yellow' | 'black', x2d: number, y2d: number) => {
    if (isPlaying || isStriking) return;
    const updatedBalls = {
      ...balls,
      [color]: { ...balls[color], x: x2d, y: y2d },
    };
    onBallsChange(updatedBalls);
  };

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const handleCourtPointerDown = (e: any) => {
    if (activeStriker !== null || isPlaying) return;
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleCourtPointerUp = (e: any) => {
    if (activeStriker !== null || isPlaying || !pointerDownPos.current) return;

    const dx = e.clientX - pointerDownPos.current.x;
    const dy = e.clientY - pointerDownPos.current.y;
    const dragDistance = Math.sqrt(dx * dx + dy * dy);

    pointerDownPos.current = null;

    // Filter out camera orbit rotation drags
    if (dragDistance > 6) return;

    e.stopPropagation();
    const clickPoint = e.point;
    if (clickPoint) {
      // In 3D: clickPoint.x corresponds to 2D y, clickPoint.z corresponds to 2D x
      const x2d = clickPoint.z * SCALE + PEG_POS.x;
      const y2d = clickPoint.x * SCALE + PEG_POS.y;

      if (placementMode) {
        // Set shoot target
        onTargetSpotChange({ x: x2d, y: y2d });
      } else {
        // Trigger active striking
        onTargetSpotChange({ x: x2d, y: y2d });
      }
    }
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const activeBall = balls[selectedBall];
  const isStrikingBallDocked = activeBall ? isBallDocked(activeBall) : true;

  // Aiming vector & ghost ball calculations
  let aimingLinePoints: [number, number, number][] | null = null;
  let ghostBallPos: [number, number, number] | null = null;
  let ghostTargetLinePoints: [number, number, number][] | null = null;

  if (!cleanFeed && activeBall && !isStrikingBallDocked && !isPlaying && !isStriking) {
    const rad = (angle * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);
    const distance = (speed / 100) * 35 * SCALE;

    aimingLinePoints = [
      [to3DX(activeBall.y), 0.008, to3DZ(activeBall.x)],
      [to3DX(activeBall.y + dy * distance), 0.008, to3DZ(activeBall.x + dx * distance)],
    ];

    if (ghostBallEnabled) {
      let firstImpact: { ball: Ball; t: number } | null = null;
      const otherBalls = Object.values(balls).filter(
        (b) => b.id !== selectedBall && !isBallDocked(b)
      );

      for (const b of otherBalls) {
        const R2 = (2 * BALL_RADIUS) ** 2;
        const a_q = dx * dx + dy * dy;
        const b_q = 2 * (dx * (activeBall.x - b.x) + dy * (activeBall.y - b.y));
        const c_q = (activeBall.x - b.x) ** 2 + (activeBall.y - b.y) ** 2 - R2;
        const discriminant = b_q * b_q - 4 * a_q * c_q;
        if (discriminant >= 0) {
          const t = (-b_q - Math.sqrt(discriminant)) / (2 * a_q);
          if (t > 0 && (!firstImpact || t < firstImpact.t)) {
            firstImpact = { ball: b, t };
          }
        }
      }

      if (firstImpact && firstImpact.t < distance) {
        const ghostX = activeBall.x + firstImpact.t * dx;
        const ghostY = activeBall.y + firstImpact.t * dy;

        ghostBallPos = [to3DX(ghostY), radius, to3DZ(ghostX)];
        ghostTargetLinePoints = [
          [to3DX(ghostY), 0.008, to3DZ(ghostX)],
          [to3DX(firstImpact.ball.y), 0.008, to3DZ(firstImpact.ball.x)],
        ];
      }
    }
  }

  // Set ring highlight color
  const ringColor =
    selectedBall === 'blue'
      ? (ballSet === 'primary' ? '#3b82f6' : '#4ade80')
      : selectedBall === 'red'
      ? (ballSet === 'primary' ? '#ef4444' : '#fbcfe8')
      : selectedBall === 'black'
      ? (ballSet === 'primary' ? '#e4e4e7' : '#f59e0b')
      : (ballSet === 'primary' ? '#fde047' : '#ffffff');

  return (
    <div className="w-full h-full relative" style={{ background: '#0a0f0d' }}>
      <Canvas camera={{ position: [0, 18, 22], fov: 45 }} shadows>
        <Sky sunPosition={[10, 20, -10]} distance={450000} />
        <ambientLight intensity={0.55} />
        <directionalLight
          position={[25, 45, 25]}
          castShadow
          intensity={1.45}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-40}
          shadow-camera-right={40}
          shadow-camera-top={40}
          shadow-camera-bottom={-40}
          shadow-camera-near={0.5}
          shadow-camera-far={150}
          shadow-bias={-0.0001}
        />

        <CourtSurface />
        <ParkSurroundings />

        {/* Center Peg */}
        <mesh position={[0, 0.65625, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.075, 0.075, 1.3125, 16]} />
          <meshStandardMaterial color="#ffffff" roughness={0.3} metalness={0.1} />
        </mesh>
        
        {/* Peg Colored Bands */}
        {[
          [1.13125, '#1565c0'], // Blue (Top)
          [1.00625, '#d32f2f'], // Red
          [0.88125, '#212121'], // Black
          [0.75625, '#fbc02d'], // Yellow
        ].map(([y, col], idx) => (
          <mesh key={idx} position={[0, y as number, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.08, 0.1, 16]} />
            <meshStandardMaterial color={col as string} roughness={0.2} />
          </mesh>
        ))}

        {/* 6 Quadway Hoop Meshes positioned via mapped physics coordinates */}
        {HOOPS.map((hoop) => {
          const hx = to3DX(hoop.y);
          const hzMapped = to3DZ(hoop.x);
          return (
            <QuadwayHoop
              key={`hoop-${hoop.id}`}
              position={[hx, 0, hzMapped]}
              crownColor={hoop.topColor || '#ffffff'}
            />
          );
        })}

        {/* Active Cartoon Striker swing animation */}
        {activeStriker && balls[activeStriker] && (
          <CartoonPlayer
            color={activeStriker}
            ballColor={balls[activeStriker].color}
            ballPosition={[to3DX(balls[activeStriker].y), radius, to3DZ(balls[activeStriker].x)]}
            targetPosition={
              strikeTarget
                ? [strikeTarget.x, radius, strikeTarget.z]
                : [0, radius, 0]
            }
            isStriking={isStriking}
            onImpact={onImpact}
            onFinished={onFinished}
          />
        )}

        {/* Dynamic Croquet Balls */}
        {Object.values(balls).map((ball) => (
          <CroquetBall
            key={`ball-${ball.id}`}
            color={ball.color}
            x={ball.x}
            y={ball.y}
            onPositionChange={(nx, ny) => handleBallPositionChange(ball.id, nx, ny)}
            onPointerDown={() => {
              if (activeStriker === null && !isPlaying) {
                onSelectedBallChange(ball.id);
              }
            }}
          />
        ))}

        {/* Selected Ball Ring Visualizer */}
        {!cleanFeed && activeBall && !isPlaying && !isStriking && (
          <mesh
            ref={selectedRingRef}
            position={[to3DX(activeBall.y), 0.006, to3DZ(activeBall.x)]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[radius * 1.25, radius * 1.55, 32]} />
            <meshBasicMaterial color={ringColor} side={THREE.DoubleSide} />
          </mesh>
        )}

        {/* Aiming guideline */}
        {aimingLinePoints && (
          <Line points={aimingLinePoints} color={ringColor} lineWidth={2.5} dashed dashScale={1.5} />
        )}

        {/* Ghost ball projection */}
        {ghostBallPos && (
          <mesh position={ghostBallPos}>
            <sphereGeometry args={[radius, 16, 16]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.25} wireframe />
          </mesh>
        )}

        {ghostTargetLinePoints && (
          <Line points={ghostTargetLinePoints} color="rgba(255, 255, 255, 0.45)" lineWidth={1.5} dashed />
        )}

        {/* 3D Whiteboard Drawings Projection */}
        {!cleanFeed && drawings.map((path, pIdx) => {
          if (path.points.length < 2) return null;
          const pts3d = path.points.map((pt) => [to3DX(pt.y), 0.006, to3DZ(pt.x)] as [number, number, number]);
          return (
            <Line key={`draw-${pIdx}`} points={pts3d} color={path.color} lineWidth={2} />
          );
        })}

        {!cleanFeed && currentPath && currentPath.points.length >= 2 && (
          <Line
            points={currentPath.points.map((pt) => [to3DX(pt.y), 0.006, to3DZ(pt.x)] as [number, number, number])}
            color={currentPath.color}
            lineWidth={2.5}
          />
        )}

        {/* Invisible court surface clicking helper */}
        <mesh
          position={[0, 0.003, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerDown={handleCourtPointerDown}
          onPointerUp={handleCourtPointerUp}
        >
          <planeGeometry args={[120, 120]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>

        <OrbitControls makeDefault maxPolarAngle={Math.PI / 2 - 0.03} minDistance={4} maxDistance={55} />
      </Canvas>
    </div>
  );
}


