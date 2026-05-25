/* eslint-disable react-hooks/set-state-in-effect */
import { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface CartoonPlayerProps {
  color: 'blue' | 'red' | 'black' | 'yellow';
  ballColor: string; // The hex color of the ball matching primary/secondary set
  ballPosition: [number, number, number];
  targetPosition: [number, number, number]; // Target position to align towards
  isStriking: boolean;
  onImpact: () => void;
  onFinished: () => void;
}

export default function CartoonPlayer({
  color,
  ballColor,
  ballPosition,
  targetPosition,
  isStriking,
  onImpact,
  onFinished
}: CartoonPlayerProps) {
  const armGroupRef = useRef<THREE.Group>(null);
  const playerGroupRef = useRef<THREE.Group>(null);
  const [phase, setPhase] = useState<'idle' | 'backswing' | 'downswing' | 'followthrough'>('idle');
  const timer = useRef(0);
  const impactTriggered = useRef(false);

  // Position player behind the ball based on target direction
  const dx = targetPosition[0] - ballPosition[0];
  const dz = targetPosition[2] - ballPosition[2];
  const dist = Math.sqrt(dx * dx + dz * dz);
  const ux = dist > 0 ? dx / dist : 0;
  const uz = dist > 0 ? dz / dist : -1;

  const playerDistance = 0.65; // yards behind ball
  const px = ballPosition[0] - ux * playerDistance;
  const py = 0; // standing on grass
  const pz = ballPosition[2] - uz * playerDistance;
  
  // Angle facing the target peg
  const angle = Math.atan2(ux, uz);

  // Reset animations when striker changes
  useEffect(() => {
    if (isStriking) {
      setPhase('backswing');
      timer.current = 0;
      impactTriggered.current = false;
      if (armGroupRef.current) {
        armGroupRef.current.rotation.x = 0;
      }
    } else {
      setPhase('idle');
    }
  }, [isStriking, color]);

  useFrame((_, delta) => {
    if (!isStriking) return;

    timer.current += delta;
    const arm = armGroupRef.current;
    if (!arm) return;

    // --- ANIMATION STATE MACHINE ---
    if (phase === 'backswing') {
      // Rotate mallet back slowly: 0 -> Math.PI / 3.2 over 0.4s
      const progress = Math.min(timer.current / 0.4, 1);
      arm.rotation.x = progress * (Math.PI / 3.2);
      
      if (progress >= 1) {
        setPhase('downswing');
        timer.current = 0;
      }
    } 
    
    else if (phase === 'downswing') {
      // Rapid forward swing: Math.PI / 3.2 -> -Math.PI / 6 over 0.12s
      const progress = Math.min(timer.current / 0.12, 1);
      const startAngle = Math.PI / 3.2;
      const endAngle = -Math.PI / 6;
      arm.rotation.x = startAngle + progress * (endAngle - startAngle);

      // Trigger impact at midpoint of swing (approx 65% of the downswing)
      if (progress >= 0.6 && !impactTriggered.current) {
        impactTriggered.current = true;
        onImpact();
      }

      if (progress >= 1) {
        setPhase('followthrough');
        timer.current = 0;
      }
    } 
    
    else if (phase === 'followthrough') {
      // Smoothly return to resting position over 0.3s
      const progress = Math.min(timer.current / 0.3, 1);
      const startAngle = -Math.PI / 6;
      arm.rotation.x = startAngle + progress * (0 - startAngle);
      
      if (progress >= 1) {
        setPhase('idle');
        onFinished();
      }
    }
  });

  if (!isStriking) return null;

  return (
    <group ref={playerGroupRef} position={[px, py, pz]} rotation={[0, angle, 0]}>
      {/* 1. Flat Shoes / Feet */}
      <mesh position={[-0.12, 0.04, 0]} castShadow>
        <boxGeometry args={[0.08, 0.08, 0.18]} />
        <meshStandardMaterial color="#333333" roughness={0.8} />
      </mesh>
      <mesh position={[0.12, 0.04, 0]} castShadow>
        <boxGeometry args={[0.08, 0.08, 0.18]} />
        <meshStandardMaterial color="#333333" roughness={0.8} />
      </mesh>

      {/* 2. Slender Cartoon Legs */}
      <mesh position={[-0.12, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.36, 8]} />
        <meshStandardMaterial color="#fcd5b5" roughness={0.7} />
      </mesh>
      <mesh position={[0.12, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.36, 8]} />
        <meshStandardMaterial color="#fcd5b5" roughness={0.7} />
      </mesh>

      {/* 3. Torso (Polo Shirt matching ball color) */}
      <mesh position={[0, 0.65, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.18, 0.5, 12]} />
        <meshStandardMaterial color={ballColor} roughness={0.5} />
      </mesh>
      {/* Polo Collar */}
      <mesh position={[0, 0.9, 0]} rotation={[0.1, 0, 0]} castShadow>
        <cylinderGeometry args={[0.10, 0.12, 0.04, 12]} />
        <meshStandardMaterial color="#ffffff" roughness={0.5} />
      </mesh>

      {/* 4. Head */}
      <mesh position={[0, 1.08, 0]} castShadow>
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshStandardMaterial color="#fcd5b5" roughness={0.7} />
      </mesh>

      {/* 5. Stylized Cap (matching shirt color) */}
      <mesh position={[0, 1.20, 0.02]} rotation={[-0.1, 0, 0]} castShadow>
        <cylinderGeometry args={[0.145, 0.145, 0.04, 12]} />
        <meshStandardMaterial color={ballColor} roughness={0.5} />
      </mesh>
      {/* Cap Visor Rim */}
      <mesh position={[0, 1.19, 0.12]} rotation={[0.2, 0, 0]} castShadow>
        <boxGeometry args={[0.17, 0.015, 0.09]} />
        <meshStandardMaterial color={ballColor} roughness={0.5} />
      </mesh>

      {/* 6. Cartoon Sunglasses/Eyes for visual flair */}
      <mesh position={[0, 1.10, 0.11]} castShadow>
        <boxGeometry args={[0.19, 0.03, 0.03]} />
        <meshStandardMaterial color="#111111" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* 7. Swing Arm & Mallet Assembly */}
      <group ref={armGroupRef} position={[0, 0.85, 0]}>
        {/* Left Arm holding mallet */}
        <mesh position={[-0.18, -0.22, 0.06]} rotation={[-0.35, 0, 0]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 0.42, 8]} />
          <meshStandardMaterial color={ballColor} roughness={0.5} />
        </mesh>
        {/* Right Arm holding mallet */}
        <mesh position={[0.18, -0.22, 0.06]} rotation={[-0.35, 0, 0]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 0.42, 8]} />
          <meshStandardMaterial color={ballColor} roughness={0.5} />
        </mesh>

        {/* 3D Croquet Mallet */}
        <group position={[0, -0.32, 0.12]} rotation={[-Math.PI / 2.3, 0, 0]}>
          {/* Wooden Shaft */}
          <mesh castShadow>
            <cylinderGeometry args={[0.012, 0.012, 0.72, 8]} />
            <meshStandardMaterial color="#8b5a2b" roughness={0.8} />
          </mesh>
          {/* Mallet Hammer Head */}
          <mesh position={[0, -0.36, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.055, 0.055, 0.22, 12]} />
            <meshStandardMaterial color="#3a2512" roughness={0.9} />
          </mesh>
          {/* Gold Brass End-Caps */}
          <mesh position={[0, -0.36, -0.11]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.056, 0.056, 0.015, 12]} />
            <meshStandardMaterial color="#d4af37" metalness={0.9} roughness={0.1} />
          </mesh>
          <mesh position={[0, -0.36, 0.11]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.056, 0.056, 0.015, 12]} />
            <meshStandardMaterial color="#d4af37" metalness={0.9} roughness={0.1} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
