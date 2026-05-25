import type { ThreeElements } from '@react-three/fiber';

type QuadwayHoopProps = ThreeElements['group'] & {
  crownColor?: string;
};

export default function QuadwayHoop({ crownColor = '#ffffff', ...props }: QuadwayHoopProps) {
  // Scaled to 50% of the 5x size (factor of 2.5x original):
  const crownWidth = 0.375; // 0.75 * 0.5
  const height = 0.875;     // 1.75 * 0.5
  const staveRadius = 0.035; // 30% smaller (originally 0.05)
  const crownSize = 0.07;    // 30% smaller (originally 0.1)

  return (
    <group {...props}>
      {/* Left Upright */}
      <mesh position={[-crownWidth / 2, height / 2, 0]} castShadow>
        <cylinderGeometry args={[staveRadius, staveRadius, height, 16]} />
        <meshStandardMaterial color="#c0c0c0" metalness={0.8} roughness={0.2} />
      </mesh>
      
      {/* Right Upright */}
      <mesh position={[crownWidth / 2, height / 2, 0]} castShadow>
        <cylinderGeometry args={[staveRadius, staveRadius, height, 16]} />
        <meshStandardMaterial color="#c0c0c0" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Quadway Crown */}
      <mesh position={[0, height, 0]} castShadow>
        <boxGeometry args={[crownWidth + crownSize, crownSize, crownSize]} />
        <meshStandardMaterial 
          color={crownColor} 
          metalness={0.1} 
          roughness={0.3}
          emissive={crownColor}
          emissiveIntensity={0.25}
        />
      </mesh>
    </group>
  );
}
