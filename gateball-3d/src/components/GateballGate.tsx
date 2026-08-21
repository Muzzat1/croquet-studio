import { Text } from '@react-three/drei';

interface GateballGateProps {
  id: number; // 1, 2, 3
  pos: [number, number, number]; // [x, y, z]
  gateWidth: number; // centre-to-centre of posts (real: 0.23m)
  rotationY?: number;
}

export default function GateballGate({ id, pos, gateWidth, rotationY = 0 }: GateballGateProps) {
  // 3× scaled spec: inner height 57cm, wire radius 1.5cm
  const height = 0.57;
  const postRadius = 0.015;
  const plaqueRadius = 0.15;

  // White painted gate wire
  const steelProps = {
    color: '#ffffff' as const,
    metalness: 0.05,
    roughness: 0.45,
    envMapIntensity: 0.5,
  };

  return (
    <group position={pos} rotation={[0, rotationY, 0]}>
      {/* Left Post */}
      <mesh position={[-gateWidth / 2, height / 2, 0]} castShadow>
        <cylinderGeometry args={[postRadius, postRadius, height, 12]} />
        <meshStandardMaterial {...steelProps} />
      </mesh>

      {/* Right Post */}
      <mesh position={[gateWidth / 2, height / 2, 0]} castShadow>
        <cylinderGeometry args={[postRadius, postRadius, height, 12]} />
        <meshStandardMaterial {...steelProps} />
      </mesh>

      {/* Crossbar */}
      <mesh position={[0, height, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[postRadius, postRadius, gateWidth + postRadius * 2, 12]} />
        <meshStandardMaterial {...steelProps} />
      </mesh>

      {/* Rounded caps on post tops */}
      <mesh position={[-gateWidth / 2, height, 0]}>
        <sphereGeometry args={[postRadius, 8, 8]} />
        <meshStandardMaterial {...steelProps} />
      </mesh>
      <mesh position={[gateWidth / 2, height, 0]}>
        <sphereGeometry args={[postRadius, 8, 8]} />
        <meshStandardMaterial {...steelProps} />
      </mesh>

      {/* Gate number badge — sits just above the crossbar */}
      <group position={[0, height + plaqueRadius * 0.7, 0]}>
        <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[plaqueRadius, plaqueRadius, 0.005, 16]} />
          <meshStandardMaterial color="#ffffff" metalness={0.05} roughness={0.4} />
        </mesh>
        <Text
          position={[0, 0, 0.012]}
          fontSize={0.270}
          color="#000000"
          anchorX="center"
          anchorY="middle"
          fontWeight="bold"
        >
          {id}
        </Text>
        <Text
          position={[0, 0, -0.012]}
          rotation={[0, Math.PI, 0]}
          fontSize={0.270}
          color="#000000"
          anchorX="center"
          anchorY="middle"
          fontWeight="bold"
        >
          {id}
        </Text>
      </group>
    </group>
  );
}
