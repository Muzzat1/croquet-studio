import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import type { ThreeElements } from '@react-three/fiber';
import * as THREE from 'three';

type CornerFlagProps = ThreeElements['group'] & {
  color: string;
};

function CornerFlag({ color, ...props }: CornerFlagProps) {
  // 36 inches high (3x scale)
  const poleHeight = 1.0;
  const poleRadius = 0.045;
  
  // 3x scale flag size (square)
  const flagWidth = 0.6;
  const flagHeight = 0.6;

  // Custom 4-sided square shape
  const flagShape = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); // Bottom-left (attached to pole)
    shape.lineTo(0, flagHeight); // Top-left (attached to pole)
    shape.lineTo(flagWidth, flagHeight); // Top-right
    shape.lineTo(flagWidth, 0); // Bottom-right
    shape.closePath();
    return shape;
  }, [flagWidth, flagHeight]);

  const extrudeSettings = useMemo(() => ({
    depth: 0.005,
    bevelEnabled: false
  }), []);

  return (
    <group {...props}>
      {/* Flag Pole (Height = 12" / 0.3333 yards) */}
      <mesh position={[0, poleHeight / 2, 0]} castShadow>
        <cylinderGeometry args={[poleRadius, poleRadius, poleHeight, 8]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      
      {/* 3-Sided Triangle Flag Cloth (2x Larger, Extruded) */}
      <mesh position={[poleRadius, poleHeight - flagHeight, 0]} castShadow>
        <extrudeGeometry args={[flagShape, extrudeSettings]} />
        <meshStandardMaterial color={color} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

interface HalfwayPegProps {
  position: [number, number, number];
}

function HalfwayPeg({ position }: HalfwayPegProps) {
  return (
    <group position={position}>
      {/* Vertical Peg body (9 inches / 0.25 yards tall, 1.4 inches / 0.04 yards wide) */}
      <mesh position={[0, 0.125, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.25, 8]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} metalness={0.1} />
      </mesh>
      {/* Premium dark cap on top of the white peg */}
      <mesh position={[0, 0.245, 0]} castShadow>
        <cylinderGeometry args={[0.021, 0.021, 0.015, 8]} />
        <meshStandardMaterial color="#222222" roughness={0.4} />
      </mesh>
    </group>
  );
}

// Parametric math helper to generate points for circle arcs in 3D
function getArcPoints(
  centerX: number,
  centerZ: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  segments: number = 32
): [number, number, number][] {
  const points: [number, number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = startAngle + (i / segments) * (endAngle - startAngle);
    points.push([
      centerX + Math.cos(angle) * radius,
      0.020, // raised to Level 3 height to completely resolve z-fighting at sweeping camera angles
      centerZ + Math.sin(angle) * radius
    ]);
  }
  return points;
}

export default function CourtSurface() {
  // Official 28x35 yard boundary coordinates
  // X = Width (28 yards: -14 to +14)
  // Z = Length (35 yards: -17.5 to +17.5)
  const boundaryPoints: [number, number, number][] = [
    [-14, 0.020, -17.5], // Corner 2 (North-West)
    [14, 0.020, -17.5],  // Corner 3 (North-East)
    [14, 0.020, 17.5],   // Corner 4 (South-East)
    [-14, 0.020, 17.5],  // Corner 1 (South-West)
    [-14, 0.020, -17.5]  // Close the rectangle
  ];

  // 12 equal longitudinal stripes covering the 28-yard wide internal grass area
  // Each stripe is exactly 28 / 12 = ~2.33 yards wide (narrower stripes)
  const numStripes = 12;
  const stripeWidth = 28 / numStripes;
  const stripes = Array.from({ length: numStripes }, (_, i) => {
    const xCenter = -14 + (i + 0.5) * stripeWidth;
    // Alternating shades of green representing the opposite directions of two-way mowing (low contrast)
    const color = i % 2 === 0 ? '#2b6639' : '#317843';
    return { x: xCenter, color };
  });

  // Halfway pegs (offside markers) coordinates
  const halfwayPegPositions: [number, number, number][] = useMemo(() => [
    // North boundary short edge (Z = -17.5): at X = -3.5, 0, 3.5
    [-3.5, 0, -17.5],
    [0, 0, -17.5],
    [3.5, 0, -17.5],
    
    // South boundary short edge (Z = 17.5): at X = -3.5, 0, 3.5
    [-3.5, 0, 17.5],
    [0, 0, 17.5],
    [3.5, 0, 17.5],
    
    // West boundary long edge (X = -14) center halfway point: Z = 0
    [-14, 0, 0],
    
    // East boundary long edge (X = 14) center halfway point: Z = 0
    [14, 0, 0]
  ], []);

  // WCF Starting Area quarter-circle (Corner 4, South-East: X = 14, Z = 17.5, radius = 1yd)
  // Inside the court means sweeps from angle PI (West) to 1.5 * PI (North)
  const startingAreaPoints = useMemo(() => {
    return getArcPoints(14, 17.5, 1.0, Math.PI, 1.5 * Math.PI);
  }, []);

  // West Penalty Area semi-circle centered on West boundary halfway (X = -14, Z = 0, radius = 1yd)
  // Inside court means sweeps from -0.5 * PI (North) to 0.5 * PI (South)
  const westPenaltyPoints = useMemo(() => {
    return getArcPoints(-14, 0, 1.0, -0.5 * Math.PI, 0.5 * Math.PI);
  }, []);

  // East Penalty Area semi-circle centered on East boundary halfway (X = 14, Z = 0, radius = 1yd)
  // Inside court means sweeps from 0.5 * PI (South) to 1.5 * PI (North)
  const eastPenaltyPoints = useMemo(() => {
    return getArcPoints(14, 0, 1.0, 0.5 * Math.PI, 1.5 * Math.PI);
  }, []);

  return (
    <group>
      {/* Vast park lawn that extends all the way into the background */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[2000, 2000]} />
        <meshStandardMaterial color="#2e6f3e" roughness={0.9} />
      </mesh>

      {/* Internal longitudinal mowing stripes (placed at Y = 0.010 to avoid z-fighting with the lawn) */}
      {stripes.map((stripe, idx) => (
        <mesh 
          key={`stripe-${idx}`} 
          position={[stripe.x, 0.010, 0]} 
          rotation={[-Math.PI / 2, 0, 0]} 
          receiveShadow
        >
          <planeGeometry args={[stripeWidth, 35]} />
          <meshStandardMaterial 
            color={stripe.color} 
            roughness={0.85} 
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>
      ))}

      {/* The White Boundary Line (Thicker and Bolder) */}
      <Line
        points={boundaryPoints}
        color="white"
        lineWidth={4.5} 
        polygonOffset
        polygonOffsetFactor={-10}
        polygonOffsetUnits={-10}
      />

      {/* 1-yard starting area boundary quarter-circle arc */}
      <Line
        points={startingAreaPoints}
        color="white"
        lineWidth={3.5}
        polygonOffset
        polygonOffsetFactor={-10}
        polygonOffsetUnits={-10}
      />

      {/* 1-yard West penalty area boundary semi-circle arc */}
      <Line
        points={westPenaltyPoints}
        color="white"
        lineWidth={3.5}
        polygonOffset
        polygonOffsetFactor={-10}
        polygonOffsetUnits={-10}
      />

      {/* 1-yard East penalty area boundary semi-circle arc */}
      <Line
        points={eastPenaltyPoints}
        color="white"
        lineWidth={3.5}
        polygonOffset
        polygonOffsetFactor={-10}
        polygonOffsetUnits={-10}
      />

      {/* Standard WCF Corner Flags */}
      {/* Corner 1 (South-West) */}
      <CornerFlag position={[-14, 0, 17.5]} color="#0055ff" /> 
      
      {/* Corner 2 (North-West) */}
      <CornerFlag position={[-14, 0, -17.5]} color="#ff0000" />
      
      {/* Corner 3 (North-East) */}
      <CornerFlag position={[14, 0, -17.5]} color="#222222" /> 
      
      {/* Corner 4 (South-East) */}
      <CornerFlag position={[14, 0, 17.5]} color="#ffcc00" />

      {/* Standard WCF Halfway Pegs (Offside Markers) */}
      {halfwayPegPositions.map((pos, idx) => (
        <HalfwayPeg key={`halfway-peg-${idx}`} position={pos} />
      ))}
    </group>
  );
}
