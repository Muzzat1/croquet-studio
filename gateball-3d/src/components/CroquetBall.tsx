import { useState, useRef, useEffect, forwardRef } from 'react';
import type { ThreeElements } from '@react-three/fiber';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

type CroquetBallProps = Omit<ThreeElements['group'], 'position' | 'onPointerDown'> & {
  color: string;
  x: number;
  z: number;
  onPositionChange: (x: number, z: number) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onPointerDown?: (e: any) => void;
  isSelected?: boolean;
};

interface CustomThreeState {
  controls?: {
    enabled: boolean;
  };
  raycaster: THREE.Raycaster;
}

const CroquetBall = forwardRef<THREE.Object3D, CroquetBallProps>(
  ({ color, x, z, onPositionChange, isSelected = false, ...props }, ref) => {
    // Hoop clearance width between legs: crownWidth - 2 * staveRadius = 0.375 - 2 * 0.05 = 0.275
    // Ball diameter = 97% of 0.275 = 0.26675
    // Ball radius = 0.26675 / 2 = 0.133375
    const radius = 0.133375;

    const [isDragging, setIsDragging] = useState(false);
    const [isHovered, setIsHovered] = useState(false);

  // Retrieve R3F state properties and store them in mutable refs to avoid react-hooks/immutability lint warnings.
  const threeState = useThree() as unknown as CustomThreeState;
  
  const controlsRef = useRef(threeState.controls);
  const raycasterRef = useRef(threeState.raycaster);

  // Update the refs in an effect to comply with the react-hooks/refs rule (no ref updates during render)
  useEffect(() => {
    controlsRef.current = threeState.controls;
    raycasterRef.current = threeState.raycaster;
  }, [threeState.controls, threeState.raycaster]);

  // Pre-allocate Three.js math objects to avoid garbage collection overhead
  const dragPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), -radius));
  const intersectionPoint = useRef(new THREE.Vector3());
  const dragHasMoved = useRef(false);
  const pointerDownCoords = useRef({ x: 0, y: 0 });

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    setIsDragging(true);

    const clientX = e.clientX ?? e.nativeEvent?.clientX ?? 0;
    const clientY = e.clientY ?? e.nativeEvent?.clientY ?? 0;
    pointerDownCoords.current = { x: clientX, y: clientY };
    dragHasMoved.current = false;

    // Disable camera movement in OrbitControls
    if (controlsRef.current) {
      controlsRef.current.enabled = false;
    }

    // Set pointer capture so we track mouse moves even outside the ball boundaries
    if (e.target && typeof e.target.setPointerCapture === 'function') {
      e.target.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: any) => {
    if (!isDragging) return;
    e.stopPropagation();

    const clientX = e.clientX ?? e.nativeEvent?.clientX ?? 0;
    const clientY = e.clientY ?? e.nativeEvent?.clientY ?? 0;
    const dx = clientX - pointerDownCoords.current.x;
    const dy = clientY - pointerDownCoords.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // If pointer moves more than 6 pixels, it is a drag, not a click selection
    if (dist > 6) {
      dragHasMoved.current = true;
    }

    // Raycast onto our horizontal plane at Y = radius
    if (raycasterRef.current && raycasterRef.current.ray) {
      raycasterRef.current.ray.intersectPlane(dragPlane.current, intersectionPoint.current);
      onPositionChange(intersectionPoint.current.x, intersectionPoint.current.z);
    }
  };

  const handlePointerUp = (e: any) => {
    if (!isDragging) return;
    e.stopPropagation();
    setIsDragging(false);

    // Bubble selection click event up ONLY if the user did NOT drag the ball
    if (!dragHasMoved.current && props.onPointerDown) {
      props.onPointerDown(e);
    }

    // Re-enable camera movement in OrbitControls
    if (controlsRef.current) {
      controlsRef.current.enabled = true;
    }

    // Release pointer capture
    if (e.target && typeof e.target.releasePointerCapture === 'function') {
      try {
        e.target.releasePointerCapture(e.pointerId);
      } catch {
        // ignore if already released or failed
      }
    }
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <group 
      ref={ref} 
      position={[x, radius, z]}
      {...props}
    >
      {/* 1. Visual Ball Mesh (Remains realistic physical size) */}
      <mesh castShadow>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial 
          color={
            isSelected
              ? (color.toLowerCase() === '#1565c0' || color.toLowerCase() === 'blue' ? '#3b82f6' : // Bright royal blue
                 color.toLowerCase() === '#d32f2f' || color.toLowerCase() === 'red' ? '#ef4444' :  // Bright light red
                 color.toLowerCase() === '#212121' || color.toLowerCase() === 'black' ? '#444444' : // Dark grey
                 color.toLowerCase() === '#fbc02d' || color.toLowerCase() === 'yellow' ? '#ffeb3b' : // Vibrant yellow
                 color)
              : color
          } 
          roughness={0.4} 
          metalness={0.1}
          // Highlight ball with white emissive glow on hover, its own color/white on selected, or its own color on drag
          emissive={
            isSelected
              ? (color.toLowerCase() === '#212121' || color.toLowerCase() === 'black' ? '#000000' : color)
              : (isDragging ? color : (isHovered ? '#ffffff' : '#000000'))
          }
          emissiveIntensity={
            isSelected
              ? (color.toLowerCase() === '#212121' || color.toLowerCase() === 'black' ? 0 : 0.35)
              : (isDragging ? 0.25 : (isHovered ? 0.2 : 0))
          }
        />
      </mesh>

      {/* 2. Invisible Click & Pointer Interaction Helper (Generous clickable area: radius = 0.35) */}
      <mesh
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerOver={(e) => {
          e.stopPropagation();
          setIsHovered(true);
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setIsHovered(false);
        }}
      >
        <sphereGeometry args={[0.145, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
});

export default CroquetBall;
