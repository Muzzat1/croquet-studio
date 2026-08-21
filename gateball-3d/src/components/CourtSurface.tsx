import { Line, Text } from '@react-three/drei';

export default function CourtSurface() {
  // Official Gateball 20m x 15m boundary
  // X = Width (15 meters: -7.5 to +7.5)
  // Z = Length (20 meters: -10 to +10)
  const boundaryPoints: [number, number, number][] = [
    [-7.5, 0.020, -10.0], // Corner 3 (North-West)
    [7.5, 0.020, -10.0],  // Corner 4 (North-East / Clubhouse end)
    [7.5, 0.020, 10.0],   // Corner 1 (South-East / Clubhouse end)
    [-7.5, 0.020, 10.0],  // Corner 2 (South-West)
    [-7.5, 0.020, -10.0]  // Close the rectangle
  ];

  // Outer Field line (solid, 1m from inner field)
  const outerBoundaryPoints: [number, number, number][] = [
    [-8.5, 0.020, -11.0],
    [8.5, 0.020, -11.0],
    [8.5, 0.020, 11.0],
    [-8.5, 0.020, 11.0],
    [-8.5, 0.020, -11.0]
  ];

  // Start Area (2m x 1m outside the East edge, 1m to 3m from Corner 4)
  // Corner 4 is at [7.5, -10.0]. Start area is Z from -9 to -7, X from 7.5 to 8.5
  const startAreaPoints: [number, number, number][] = [
    [7.5, 0.020, -9.0],
    [8.5, 0.020, -9.0],
    [8.5, 0.020, -7.0],
    [7.5, 0.020, -7.0]
  ];

  // Stripe mowing lanes (15 lanes covering 15m width)
  const numStripes = 15;
  const stripeWidth = 15 / numStripes;
  const stripes = Array.from({ length: numStripes }, (_, i) => {
    const xCenter = -7.5 + (i + 0.5) * stripeWidth;
    const color = i % 2 === 0 ? '#1b4d24' : '#225c2c'; // Beautiful dark greens
    return { x: xCenter, color };
  });

  return (
    <group>
      {/* Vast park lawn extending into the background */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[2000, 2000]} />
        <meshStandardMaterial color="#143f1d" roughness={0.9} />
      </mesh>

      {/* Internal mowing stripes */}
      {stripes.map((stripe, idx) => (
        <mesh 
          key={`stripe-${idx}`} 
          position={[stripe.x, 0.010, 0]} 
          rotation={[-Math.PI / 2, 0, 0]} 
          receiveShadow
        >
          <planeGeometry args={[stripeWidth, 20]} />
          <meshStandardMaterial 
            color={stripe.color} 
            roughness={0.85} 
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>
      ))}

      {/* White Boundary Line */}
      <Line
        points={boundaryPoints}
        color="white"
        lineWidth={4.5} 
        polygonOffset
        polygonOffsetFactor={-10}
        polygonOffsetUnits={-10}
      />

      {/* Outer Field Line (Solid Mid-Grey, 1m from inner field) */}
      <Line
        points={outerBoundaryPoints}
        color="#888888"
        lineWidth={2}
        polygonOffset
        polygonOffsetFactor={-10}
        polygonOffsetUnits={-10}
      />

      {/* Start Area Rectangle */}
      <Line
        points={startAreaPoints}
        color="white"
        lineWidth={3.5}
        polygonOffset
        polygonOffsetFactor={-10}
        polygonOffsetUnits={-10}
      />

      {/* Start Area text indicator (Flat on grass to prevent billboard clipping) */}
      <Text
        position={[8.0, 0.015, -8.0]}
        rotation={[-Math.PI / 2, 0, -Math.PI / 2]}
        fontSize={0.25}
        color="#b3b3b3"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        START
      </Text>



      {/* Corner Labels (Flat on the grass, no flags) */}
      {/* Corner 1: Bottom-Right [7.5, 10.0] */}
      <Text
        position={[8.0, 0.015, 10.5]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.25}
        color="#cccccc"
        fontWeight="bold"
        anchorX="center"
        anchorY="middle"
      >
        Corner 1
      </Text>

      {/* Corner 2: Bottom-Left [-7.5, 10.0] */}
      <Text
        position={[-8.0, 0.015, 10.5]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.25}
        color="#cccccc"
        fontWeight="bold"
        anchorX="center"
        anchorY="middle"
      >
        Corner 2
      </Text>

      {/* Corner 3: Top-Left [-7.5, -10.0] */}
      <Text
        position={[-8.0, 0.015, -10.5]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.25}
        color="#cccccc"
        fontWeight="bold"
        anchorX="center"
        anchorY="middle"
      >
        Corner 3
      </Text>

      {/* Corner 4: Top-Right [7.5, -10.0] */}
      <Text
        position={[8.0, 0.015, -10.5]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.25}
        color="#cccccc"
        fontWeight="bold"
        anchorX="center"
        anchorY="middle"
      >
        Corner 4
      </Text>
    </group>
  );
}
