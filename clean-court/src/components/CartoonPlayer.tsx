/* eslint-disable react-hooks/set-state-in-effect */
import { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface CartoonPlayerProps {
  color: 'blue' | 'red' | 'black' | 'yellow';
  ballPosition: [number, number, number];
  targetPosition: [number, number, number]; // Target position to align towards
  isStriking: boolean;
  onImpact: () => void;
  onFinished: () => void;
  ballSet: 'primary' | 'secondary';
  isPaused: boolean;
}

export default function CartoonPlayer({
  color,
  ballPosition,
  targetPosition,
  isStriking,
  onImpact,
  onFinished,
  ballSet,
  isPaused
}: CartoonPlayerProps) {
  const armGroupRef = useRef<THREE.Group>(null);
  const playerGroupRef = useRef<THREE.Group>(null);
  const leftFootRef = useRef<THREE.Mesh>(null);
  const rightFootRef = useRef<THREE.Mesh>(null);
  const [phase, setPhase] = useState<'idle' | 'stalking' | 'aiming' | 'backswing' | 'downswing' | 'followthrough'>('idle');
  const timer = useRef(0);
  const impactTriggered = useRef(false);

  // Freeze ballPosition and targetPosition when striking begins to prevent character from moving/sliding with the ball
  const frozenBallPos = useRef<[number, number, number]>(ballPosition);
  const frozenTargetPos = useRef<[number, number, number]>(targetPosition);
  const wasStriking = useRef(false);

  if (isStriking && !wasStriking.current) {
    frozenBallPos.current = ballPosition;
    frozenTargetPos.current = targetPosition;
    wasStriking.current = true;
  } else if (!isStriking) {
    wasStriking.current = false;
  }

  const frozenBall = frozenBallPos.current;
  const frozenTarget = frozenTargetPos.current;

  // Hex colors matching our court balls
  const colorMap = {
    blue: ballSet === 'primary' ? '#2196f3' : '#00e676',
    red: ballSet === 'primary' ? '#ff1744' : '#ff4081',
    black: ballSet === 'primary' ? '#424242' : '#8d6e63',
    yellow: ballSet === 'primary' ? '#ffea00' : '#ffffff'
  };

  // Position player behind the ball based on target direction
  const dx = frozenTarget[0] - frozenBall[0];
  const dz = frozenTarget[2] - frozenBall[2];
  const dist = Math.sqrt(dx * dx + dz * dz);
  const ux = dist > 0 ? dx / dist : 0;
  const uz = dist > 0 ? dz / dist : -1;

  const playerDistance = 0.55; // yards behind ball (approx 20 inches for natural stance and close arm hang)
  const px = frozenBall[0] - ux * playerDistance;
  const py = 0; // standing on grass
  const pz = frozenBall[2] - uz * playerDistance;
  
  // Angle facing the target peg
  const angle = Math.atan2(ux, uz);

  // Reset animations when striker changes
  useEffect(() => {
    if (isStriking) {
      setPhase('stalking');
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
    if (isPaused || !isStriking) return;

    timer.current += delta;
    const arm = armGroupRef.current;
    const player = playerGroupRef.current;
    const leftFoot = leftFootRef.current;
    const rightFoot = rightFootRef.current;

    // --- ANIMATION STATE MACHINE ---
    if (phase === 'stalking') {
      const progress = Math.min(timer.current / 1.5, 1);
      const currentDistance = 1.6 - progress * (1.6 - 0.55);
      
      const currPx = frozenBall[0] - ux * currentDistance;
      const currPz = frozenBall[2] - uz * currentDistance;
      const bobY = Math.abs(Math.sin(timer.current * Math.PI * 3.5)) * 0.025;

      if (player) {
        player.position.set(currPx, bobY, currPz);
      }

      // Leg swing & walk bobbing animation
      if (leftFoot) {
        leftFoot.position.y = 0.04 + Math.abs(Math.sin(timer.current * Math.PI * 3.5)) * 0.04;
        leftFoot.position.z = Math.sin(timer.current * Math.PI * 3.5) * 0.08;
      }
      if (rightFoot) {
        rightFoot.position.y = 0.04 + Math.abs(Math.cos(timer.current * Math.PI * 3.5)) * 0.04;
        rightFoot.position.z = -Math.sin(timer.current * Math.PI * 3.5) * 0.08;
      }

      if (progress >= 1) {
        // Reset player posture to settled standard stance
        if (player) player.position.set(frozenBall[0] - ux * 0.55, 0, frozenBall[2] - uz * 0.55);
        if (leftFoot) leftFoot.position.set(-0.12, 0.04, 0);
        if (rightFoot) rightFoot.position.set(0.12, 0.04, 0);
        
        setPhase('aiming');
        timer.current = 0;
      }
    }

    else if (phase === 'aiming') {
      const progress = Math.min(timer.current / 1.5, 1);
      if (arm) {
        // Two gentle practice waggles (always >= 0 to only swing backward and back to the ball, never cutting through it)
        arm.rotation.x = (1 - Math.cos(progress * Math.PI * 4)) * (Math.PI / 40);
      }

      if (progress >= 1) {
        setPhase('backswing');
        timer.current = 0;
      }
    }

    else if (phase === 'backswing') {
      // Rotate mallet back slowly: 0 -> Math.PI / 3.2 over 0.6s
      const progress = Math.min(timer.current / 0.6, 1);
      if (arm) {
        arm.rotation.x = progress * (Math.PI / 3.2);
      }
      
      if (progress >= 1) {
        setPhase('downswing');
        timer.current = 0;
      }
    } 
    
    else if (phase === 'downswing') {
      // Forward swing: Math.PI / 3.2 -> -Math.PI / 6 over 0.06s (extremely quick impact)
      const progress = Math.min(timer.current / 0.06, 1);
      const startAngle = Math.PI / 3.2;
      const endAngle = -Math.PI / 6;
      if (arm) {
        arm.rotation.x = startAngle + progress * (endAngle - startAngle);
      }

      // Trigger impact at precise vertical midpoint (65% of the swing path)
      if (progress >= 0.65 && !impactTriggered.current) {
        impactTriggered.current = true;
        onImpact();
      }

      if (progress >= 1) {
        setPhase('followthrough');
        timer.current = 0;
      }
    } 
    
    else if (phase === 'followthrough') {
      // Smoothly return to resting position over 0.5s
      const progress = Math.min(timer.current / 0.5, 1);
      const startAngle = -Math.PI / 6;
      if (arm) {
        arm.rotation.x = startAngle + progress * (0 - startAngle);
      }
      
      if (progress >= 1) {
        setPhase('idle');
        onFinished();
      }
    }
  });



  return (
    <group ref={playerGroupRef} position={[px, py, pz]} rotation={[0, angle, 0]}>
      {/* 1. Flat Shoes / Feet */}
      <mesh ref={leftFootRef} position={[-0.12, 0.04, 0]} castShadow>
        <boxGeometry args={[0.08, 0.08, 0.18]} />
        <meshStandardMaterial color="#333333" roughness={0.8} />
      </mesh>
      <mesh ref={rightFootRef} position={[0.12, 0.04, 0]} castShadow>
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
        <meshStandardMaterial color={colorMap[color]} roughness={0.5} />
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
        <meshStandardMaterial color={colorMap[color]} roughness={0.5} />
      </mesh>
      {/* Cap Visor Rim */}
      <mesh position={[0, 1.19, 0.12]} rotation={[0.2, 0, 0]} castShadow>
        <boxGeometry args={[0.17, 0.015, 0.09]} />
        <meshStandardMaterial color={colorMap[color]} roughness={0.5} />
      </mesh>

      {/* 6. Cartoon Sunglasses/Eyes for visual flair */}
      <mesh position={[0, 1.10, 0.11]} castShadow>
        <boxGeometry args={[0.19, 0.03, 0.03]} />
        <meshStandardMaterial color="#111111" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* 7. Swing Arm & Mallet Assembly */}
      <group ref={armGroupRef} position={[0, 0.85, 0.10]}>
        {/* Left Arm holding mallet */}
        <mesh position={[-0.18, -0.22, 0.08]} rotation={[-0.18, 0, 0]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 0.42, 8]} />
          <meshStandardMaterial color={colorMap[color]} roughness={0.5} />
        </mesh>
        {/* Right Arm holding mallet */}
        <mesh position={[0.18, -0.22, 0.08]} rotation={[-0.18, 0, 0]} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 0.42, 8]} />
          <meshStandardMaterial color={colorMap[color]} roughness={0.5} />
        </mesh>

        {/* 3D Croquet Mallet */}
        <group position={[0, -0.34, 0.16]} rotation={[-0.28, 0, 0]}>
          {/* Wooden Shaft */}
          <mesh castShadow>
            <cylinderGeometry args={[0.012, 0.012, 0.72, 8]} />
            <meshStandardMaterial color="#8b5a2b" roughness={0.8} />
          </mesh>
          {/* Mallet Hammer Head */}
          <mesh position={[0, -0.36, 0]} rotation={[Math.PI / 2 + 0.28, 0, 0]} castShadow>
            <cylinderGeometry args={[0.055, 0.055, 0.22, 12]} />
            <meshStandardMaterial color="#3a2512" roughness={0.9} />
          </mesh>
          {/* Gold Brass End-Caps */}
          <mesh position={[0, -0.36, -0.11]} rotation={[Math.PI / 2 + 0.28, 0, 0]}>
            <cylinderGeometry args={[0.056, 0.056, 0.015, 12]} />
            <meshStandardMaterial color="#d4af37" metalness={0.9} roughness={0.1} />
          </mesh>
          <mesh position={[0, -0.36, 0.11]} rotation={[Math.PI / 2 + 0.28, 0, 0]}>
            <cylinderGeometry args={[0.056, 0.056, 0.015, 12]} />
            <meshStandardMaterial color="#d4af37" metalness={0.9} roughness={0.1} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
