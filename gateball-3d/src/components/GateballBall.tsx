import { useState, useRef, useEffect, forwardRef, useMemo } from 'react';
import type { ThreeElements } from '@react-three/fiber';
import { useThree, useFrame } from '@react-three/fiber';
import { Line, Decal } from '@react-three/drei';
import * as THREE from 'three';

const textureCache: Record<string, THREE.CanvasTexture> = {};

function getNumberTexture(number: string | number, color: string): THREE.CanvasTexture {
  const key = `${number}-${color}`;
  if (textureCache[key]) return textureCache[key];

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  
  ctx.clearRect(0, 0, 512, 512);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Maximize the number on the canvas texture
  ctx.font = 'bold 400px Arial, sans-serif';
  ctx.fillStyle = color;
  ctx.fillText(number.toString(), 256, 280); // slight y offset for visual center
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 16;
  textureCache[key] = texture;
  
  return texture;
}

type GateballBallProps = Omit<ThreeElements['group'], 'position' | 'onPointerDown'> & {
  ballId: string;
  number: number;
  color: string;
  x: number;
  z: number;
  onPositionChange: (x: number, z: number) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onPointerDown?: (e: any) => void;
  isSelected?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
};

interface CustomThreeState {
  controls?: { enabled: boolean };
  raycaster: THREE.Raycaster;
}

function DashedSelectionRing({ radius }: { radius: number }) {
  // Both rings share the same ground-skimming Y — just above the court surface.
  const groundY = -radius + 0.021;
  const segments = 64;

  // Outer ring — light neutral dashed
  const outerR = radius + 0.075; // 0.2175 world units
  const outerPoints: [number, number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    outerPoints.push([Math.cos(theta) * outerR, groundY, Math.sin(theta) * outerR]);
  }

  // Inner ring — dark neutral solid
  const innerR = radius + 0.022; // 0.1645 world units
  const innerPoints: [number, number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    innerPoints.push([Math.cos(theta) * innerR, groundY, Math.sin(theta) * innerR]);
  }

  return (
    <group>
      {/* Outer dashed ring — warm light grey, readable against dark/green surfaces */}
      <Line
        points={outerPoints}
        color="#e8e8e8"
        lineWidth={2.0}
        dashed
        dashSize={0.055}
        gapSize={0.055}
        transparent
        opacity={0.85}
      />
      {/* Inner solid ring — near-black, readable against light/white balls and light surfaces */}
      <Line
        points={innerPoints}
        color="#1a1a1a"
        lineWidth={1.5}
        transparent
        opacity={0.65}
      />
    </group>
  );
}

const GateballBall = forwardRef<THREE.Object3D, GateballBallProps>(
  ({ ballId, number, color, x, z, onPositionChange, isSelected = false, onDragStart, onDragEnd, ...props }, ref) => {
    const radius = 0.1425; // 3× real (0.0475 × 3)

    const [isDragging, setIsDragging] = useState(false);
    const [isHovered, setIsHovered] = useState(false);

    // Mirror clean-court pattern: store controls/raycaster in refs updated via effect
    const threeState = useThree() as unknown as CustomThreeState;
    const controlsRef = useRef(threeState.controls);
    const raycasterRef = useRef(threeState.raycaster);

    useEffect(() => {
      controlsRef.current = threeState.controls;
      raycasterRef.current = threeState.raycaster;
    }, [threeState.controls, threeState.raycaster]);

    const dragPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), -radius));
    const intersectionPoint = useRef(new THREE.Vector3());
    const dragHasMoved = useRef(false);
    const pointerDownCoords = useRef({ x: 0, y: 0 });

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const handlePointerDown = (e: any) => {
      if (e.button !== 0) return; // Only own left-mouse gestures
      e.stopPropagation();

      const clientX = e.clientX ?? e.nativeEvent?.clientX ?? 0;
      const clientY = e.clientY ?? e.nativeEvent?.clientY ?? 0;
      pointerDownCoords.current = { x: clientX, y: clientY };
      dragHasMoved.current = false;
      setIsDragging(true);

      // Lock controls immediately to prevent OrbitControls from responding to short clicks
      if (controlsRef.current) controlsRef.current.enabled = false;
      if (e.target && typeof e.target.setPointerCapture === 'function') {
        e.target.setPointerCapture(e.pointerId);
      }
    };

    const handlePointerMove = (e: any) => {
      if (!isDragging) return;
      if (e.buttons === 0 && e.type !== 'pointerup') {
        handlePointerUp(e);
        return;
      }

      const clientX = e.clientX ?? e.nativeEvent?.clientX ?? 0;
      const clientY = e.clientY ?? e.nativeEvent?.clientY ?? 0;
      const dx = clientX - pointerDownCoords.current.x;
      const dy = clientY - pointerDownCoords.current.y;

      if (!dragHasMoved.current) {
        // Haven't crossed the threshold yet — check now
        if (Math.sqrt(dx * dx + dy * dy) < 6) return; // still a click, don't move ball

        // Threshold crossed: commit to drag
        dragHasMoved.current = true;
        onDragStart?.();
        // (controls and pointer capture were already locked on pointer-down)
      }

      // Raycast onto horizontal plane at Y = radius
      if (raycasterRef.current?.ray) {
        raycasterRef.current.ray.intersectPlane(dragPlane.current, intersectionPoint.current);
        onPositionChange(intersectionPoint.current.x, intersectionPoint.current.z);
      }
    };

    const handlePointerUp = (e: any) => {
      if (!isDragging) return;
      setIsDragging(false);

      // Always restore controls and release capture on pointer up/cancel
      if (controlsRef.current) controlsRef.current.enabled = true;
      if (e.target && typeof e.target.releasePointerCapture === 'function') {
        try { e.target.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      }

      if (dragHasMoved.current) {
        // Was a real drag — clean up
        onDragEnd?.();
      } else {
        // Was a click — fire the selection callback
        if (props.onPointerDown) props.onPointerDown(e);
      }
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // Failsafe 1: re-enable controls if isDragging clears unexpectedly
    useEffect(() => {
      if (isDragging) return;
      if (controlsRef.current) controlsRef.current.enabled = true;
    }, [isDragging]);

    // Failsafe 2: ensure controls are always re-enabled if the component unmounts
    useEffect(() => {
      return () => {
        if (controlsRef.current) controlsRef.current.enabled = true;
      };
    }, []);

    const rollingBodyRef = useRef<THREE.Group>(null);
    const groupRef = useRef<THREE.Group>(null);
    
    // Sync the forwarded ref with our internal ref
    useEffect(() => {
      if (typeof ref === 'function') {
        ref(groupRef.current);
      } else if (ref) {
        (ref as React.MutableRefObject<THREE.Object3D | null>).current = groupRef.current;
      }
    }, [ref]);

    const lastPos = useRef({ x, z });

    useEffect(() => { lastPos.current = { x, z }; }, []);

    useFrame(() => {
      if (!groupRef.current) return;
      const currentX = groupRef.current.position.x;
      const currentZ = groupRef.current.position.z;

      const dx = currentX - lastPos.current.x;
      const dz = currentZ - lastPos.current.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 0.001) {
        if (dist > 1.0) {
          rollingBodyRef.current?.rotation.set(0, 0, 0);
        } else {
          const rollAngle = dist / radius;
          const axis = new THREE.Vector3(dz, 0, -dx).normalize(); // up × travel_dir = correct forward spin
          rollingBodyRef.current?.rotateOnWorldAxis(axis, rollAngle);
        }
        lastPos.current = { x: currentX, z: currentZ };
      }
    });

    const isRed = ballId.startsWith('r');
    const textStyleColor = isRed ? '#ffffff' : '#991b1b';
    const numberTexture = useMemo(() => getNumberTexture(number, textStyleColor), [number, textStyleColor]);

    return (
      <group ref={groupRef} position={[x, radius, z]} {...props}>
        {/* Wrapper to rotate the ball sideways if docked so the number faces the court */}
        <group rotation={[0, x > 8.8 ? Math.PI / 2 : 0, 0]}>
          <group ref={rollingBodyRef}>
            <mesh castShadow receiveShadow>
              <sphereGeometry args={[radius, 32, 32]} />
              <meshStandardMaterial
                color={color}
                roughness={0.3}
                metalness={0.1}
                emissive={isDragging ? color : (isHovered ? '#ffffff' : '#000000')}
                emissiveIntensity={isDragging ? 0.25 : (isHovered ? 0.15 : 0)}
              />
              <Decal position={[0, 0, radius]} rotation={[0, 0, 0]} scale={[radius * 2.0, radius * 2.0, radius]}>
                <meshStandardMaterial
                  map={numberTexture}
                  transparent
                  polygonOffset
                  polygonOffsetFactor={-1}
                  roughness={0.3}
                  metalness={0.1}
                />
              </Decal>
              <Decal position={[0, 0, -radius]} rotation={[0, Math.PI, 0]} scale={[radius * 2.0, radius * 2.0, radius]}>
                <meshStandardMaterial
                  map={numberTexture}
                  transparent
                  polygonOffset
                  polygonOffsetFactor={-1}
                  roughness={0.3}
                  metalness={0.1}
                />
              </Decal>
            </mesh>
          </group>
        </group>

        {isSelected && (
          <DashedSelectionRing radius={radius} />
        )}

        {/* Interactive helper — pointer capture keeps move events firing even outside ball bounds */}
        <mesh
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerOver={() => { /* e.stopPropagation(); Removed to allow aiming clicks to bubble up */ setIsHovered(true); }}
          onPointerOut={() => { /* e.stopPropagation(); Removed to allow aiming clicks to bubble up */ setIsHovered(false); }}
        >
          <sphereGeometry args={[radius * 1.0, 16, 16]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    );
  }
);

export default GateballBall;
