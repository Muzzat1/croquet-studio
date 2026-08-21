import { useRef, useState, useMemo } from 'react';
import type { ThreeElements } from '@react-three/fiber';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

type ScoringClipProps = ThreeElements['group'] & {
  color: string;
  isSelected?: boolean;
  onSelect?: () => void;
};

export default function ScoringClip({
  color,
  isSelected = false,
  onSelect,
  ...props
}: ScoringClipProps) {
  const [hovered, setHovered] = useState(false);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (glowRef.current && isSelected) {
      const pulse = 1.0 + Math.sin(state.clock.getElapsedTime() * 6.0) * 0.15;
      glowRef.current.scale.set(pulse, pulse, pulse);
    }
  });

  // 50% longer clip profile matching reference image
  const clipGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    const t = 0.0085; // Wall thickness of the plastic clip ribbon

    // Outer boundary (clockwise)
    // Start at bottom-left entrance lip
    shape.moveTo(-0.024, -0.022);
    // Outer lower left corner
    shape.lineTo(-0.044, 0.018);
    // Outer left clamping jaw (elongated body)
    shape.lineTo(-0.044, 0.112);
    // Outer left neck
    shape.lineTo(-0.026, 0.145);
    // Outer bulbous circular handle loop (larger 50% longer handle)
    shape.absarc(0, 0.215, 0.045, Math.PI * 1.15, -Math.PI * 0.15, false);
    // Outer right neck
    shape.lineTo(0.026, 0.145);
    // Outer right clamping jaw
    shape.lineTo(0.044, 0.112);
    // Outer lower right corner
    shape.lineTo(0.044, 0.018);
    // Outer bottom-right entrance lip
    shape.lineTo(0.024, -0.022);

    // Tip of right lip
    shape.lineTo(0.024 - t * 0.8, -0.022 + t * 0.5);

    // Inner boundary (counter-clockwise back to start)
    // Inner lower right corner
    shape.lineTo(0.044 - t, 0.018 + t * 0.6);
    // Inner right clamping jaw
    shape.lineTo(0.044 - t, 0.108);
    // Inner right neck
    shape.lineTo(0.026 - t, 0.142);
    // Inner bulbous loop
    shape.absarc(0, 0.215, 0.045 - t, -Math.PI * 0.18, Math.PI * 1.18, true);
    // Inner left neck
    shape.lineTo(-0.026 + t, 0.142);
    // Inner left clamping jaw
    shape.lineTo(-0.044 + t, 0.108);
    // Inner lower left corner
    shape.lineTo(-0.044 + t, 0.018 + t * 0.6);
    // Tip of left lip
    shape.lineTo(-0.024 + t * 0.8, -0.022 + t * 0.5);

    shape.closePath();

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      steps: 1,
      depth: 0.052, // Same width along the bar
      bevelEnabled: true,
      bevelThickness: 0.003,
      bevelSize: 0.0025,
      bevelOffset: 0,
      bevelSegments: 3
    };

    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geom.center();
    return geom;
  }, []);

  return (
    <group
      {...props}
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = 'auto';
      }}
    >
      {/* Invisible enlarged click hit-box */}
      <mesh position={[0, 0.08, 0]}>
        <boxGeometry args={[0.22, 0.34, 0.22]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Selection Glow Wireframe Halo */}
      {(isSelected || hovered) && (
        <mesh ref={glowRef} position={[0, 0.08, 0]}>
          <boxGeometry args={[0.13, 0.32, 0.13]} />
          <meshBasicMaterial
            color={isSelected ? '#ffe680' : '#ffffff'}
            transparent
            opacity={isSelected ? 0.6 : 0.3}
            wireframe
          />
        </mesh>
      )}

      {/* 3D Extruded Modern Croquet Clip Mesh (50% longer) */}
      <mesh geometry={clipGeometry} castShadow receiveShadow>
        <meshStandardMaterial
          color={color}
          roughness={0.25}
          metalness={0.12}
          emissive={isSelected ? color : '#000000'}
          emissiveIntensity={isSelected ? 0.35 : 0}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
