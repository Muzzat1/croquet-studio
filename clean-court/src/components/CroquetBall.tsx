import { useState, useRef, useEffect, forwardRef } from 'react';
import type { ThreeElements } from '@react-three/fiber';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

type CroquetBallProps = Omit<ThreeElements['mesh'], 'position' | 'onPointerDown'> & {
  color: string;
  x: number;
  z: number;
  onPositionChange: (x: number, z: number) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onPointerDown?: (e: any) => void;
};

interface CustomThreeState {
  controls?: {
    enabled: boolean;
  };
  raycaster: THREE.Raycaster;
}

const CroquetBall = forwardRef<THREE.Mesh, CroquetBallProps>(
  ({ color, x, z, onPositionChange, ...props }, ref) => {
    // Hoop clearance width between legs: crownWidth - 2 * staveRadius = 0.375 - 2 * 0.05 = 0.275
    // Ball diameter = 97% of 0.275 = 0.26675
    // Ball radius = 0.26675 / 2 = 0.133375
    const radius = 0.133375;

    const [isDragging, setIsDragging] = useState(false);

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

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    setIsDragging(true);

    // Bubble pointer down event to parent (for selection tracking)
    if (props.onPointerDown) {
      props.onPointerDown(e);
    }

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
    <mesh
      ref={ref}
      position={[x, radius, z]}
      {...props}
      castShadow
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <sphereGeometry args={[radius, 32, 32]} />
      <meshStandardMaterial 
        color={color} 
        roughness={0.4} 
        metalness={0.1}
        // Visually highlight the ball during dragging by adding a subtle emissive glow
        emissive={isDragging ? color : '#000000'}
        emissiveIntensity={isDragging ? 0.25 : 0}
      />
    </mesh>
  );
});

export default CroquetBall;
