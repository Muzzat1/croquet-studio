import { useState, useRef, useEffect, forwardRef } from 'react';
import type { ThreeElements } from '@react-three/fiber';
import { useThree, useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

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
      e.stopPropagation();

      // Record where the pointer went down — but don't start dragging yet.
      // We commit to a drag only after the pointer moves beyond the threshold,
      // so that short clicks near the ball don't accidentally disable OrbitControls.
      const clientX = e.clientX ?? e.nativeEvent?.clientX ?? 0;
      const clientY = e.clientY ?? e.nativeEvent?.clientY ?? 0;
      pointerDownCoords.current = { x: clientX, y: clientY };
      dragHasMoved.current = false;
      setIsDragging(true);
    };

    const handlePointerMove = (e: any) => {
      if (!isDragging) return;

      const clientX = e.clientX ?? e.nativeEvent?.clientX ?? 0;
      const clientY = e.clientY ?? e.nativeEvent?.clientY ?? 0;
      const dx = clientX - pointerDownCoords.current.x;
      const dy = clientY - pointerDownCoords.current.y;

      if (!dragHasMoved.current) {
        // Haven't crossed the threshold yet — check now
        if (Math.sqrt(dx * dx + dy * dy) < 6) return; // still a click, don't move ball

        // Threshold crossed: commit to drag, lock controls and pointer
        dragHasMoved.current = true;
        onDragStart?.();
        if (controlsRef.current) controlsRef.current.enabled = false;
        if (e.target && typeof e.target.setPointerCapture === 'function') {
          e.target.setPointerCapture(e.pointerId);
        }
      }

      e.stopPropagation();

      // Raycast onto horizontal plane at Y = radius
      if (raycasterRef.current?.ray) {
        raycasterRef.current.ray.intersectPlane(dragPlane.current, intersectionPoint.current);
        onPositionChange(intersectionPoint.current.x, intersectionPoint.current.z);
      }
    };

    const handlePointerUp = (e: any) => {
      if (!isDragging) return;
      e.stopPropagation();
      setIsDragging(false);

      if (dragHasMoved.current) {
        // Was a real drag — clean up
        onDragEnd?.();
        if (controlsRef.current) controlsRef.current.enabled = true;
        if (e.target && typeof e.target.releasePointerCapture === 'function') {
          try { e.target.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
        }
      } else {
        // Was a click — fire the selection callback
        if (props.onPointerDown) props.onPointerDown(e);
      }
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // Failsafe: re-enable controls if pointer leaves canvas unexpectedly
    useEffect(() => {
      if (isDragging) return;
      if (controlsRef.current) controlsRef.current.enabled = true;
    }, [isDragging]);

    const rollingBodyRef = useRef<THREE.Group>(null);
    const lastPos = useRef({ x, z });

    useEffect(() => { lastPos.current = { x, z }; }, []);

    useFrame(() => {
      const dx = x - lastPos.current.x;
      const dz = z - lastPos.current.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 0.001) {
        if (dist > 1.0) {
          rollingBodyRef.current?.rotation.set(0, 0, 0);
        } else {
          const rollAngle = dist / radius;
          const axis = new THREE.Vector3(dz, 0, -dx).normalize(); // up × travel_dir = correct forward spin
          rollingBodyRef.current?.rotateOnWorldAxis(axis, rollAngle);
        }
        lastPos.current = { x, z };
      }
    });

    const isRed = ballId.startsWith('r');
    const textStyleColor = isRed ? '#ffffff' : '#991b1b';

    return (
      <group ref={ref} position={[x, radius, z]} {...props}>
        {/* Wrapper to rotate the ball sideways if docked so the number faces the court */}
        <group rotation={[0, x > 8.8 ? Math.PI / 2 : 0, 0]}>
          <group ref={rollingBodyRef}>
            <mesh castShadow receiveShadow>
              <sphereGeometry args={[radius, 32, 32]} />
              <meshStandardMaterial
                color={color}
                roughness={0.3}
                metalness={0.1}
                emissive={isSelected ? color : (isDragging ? color : (isHovered ? '#ffffff' : '#000000'))}
                emissiveIntensity={isSelected ? 0.35 : (isDragging ? 0.25 : (isHovered ? 0.15 : 0))}
              />
            </mesh>
            <Text position={[0, 0, radius + 0.002]} fontSize={radius * 1.2} color={textStyleColor} fontWeight="bold" anchorX="center" anchorY="middle">
              {number}
            </Text>
            <Text position={[0, 0, -(radius + 0.002)]} rotation={[0, Math.PI, 0]} fontSize={radius * 1.2} color={textStyleColor} fontWeight="bold" anchorX="center" anchorY="middle">
              {number}
            </Text>
          </group>
        </group>

        {isSelected && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -radius + 0.021, 0]}>
            <ringGeometry args={[radius + 0.06, radius + 0.09, 32]} />
            <meshBasicMaterial color={color} transparent opacity={0.8} />
          </mesh>
        )}

        {/* Interactive helper — pointer capture keeps move events firing even outside ball bounds */}
        <mesh
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerOver={(e) => { e.stopPropagation(); setIsHovered(true); }}
          onPointerOut={(e) => { e.stopPropagation(); setIsHovered(false); }}
        >
          <sphereGeometry args={[radius * 1.30, 16, 16]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    );
  }
);

export default GateballBall;
