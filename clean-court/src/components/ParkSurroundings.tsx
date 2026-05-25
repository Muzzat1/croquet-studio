import { useState, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { DoubleSide, Shape, CanvasTexture } from 'three';
import * as THREE from 'three';


// 1. Modular Fence Segment Component
interface FenceSegmentProps {
  start: [number, number];
  end: [number, number];
}

export function FenceSegment({ start, end }: FenceSegmentProps) {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dx, dz);

  const postSpacing = 2.0;
  const numPosts = Math.floor(length / postSpacing) + 1;

  const picketSpacing = 0.16;
  const numPickets = Math.floor(length / picketSpacing);

  const postHeight = 0.9;
  const postSize = 0.08;

  const picketHeight = 0.75;
  const picketWidth = 0.08;
  const picketThickness = 0.02;

  const railHeight1 = 0.22;
  const railHeight2 = 0.55;
  const railWidth = 0.04;
  const railThickness = 0.025;

  // Use useMemo so that posts and pickets are immediately recalculated when props (start, end) change
  const posts = useMemo(() => {
    const arr: number[] = [];
    if (numPosts <= 0) return arr;
    if (numPosts === 1) {
      arr.push(0);
      return arr;
    }
    for (let i = 0; i < numPosts; i++) {
      arr.push((i / (numPosts - 1)) * length);
    }
    return arr;
  }, [numPosts, length]);

  const pickets = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i <= numPickets; i++) {
      const z = (i / numPickets) * length;
      const nearPost = posts.some(pz => Math.abs(pz - z) < 0.10);
      if (!nearPost) {
        arr.push(z);
      }
    }
    return arr;
  }, [numPickets, length, posts]);

  return (
    <group position={[start[0], 0, start[1]]} rotation={[0, angle, 0]}>
      {/* Posts */}
      {posts.map((z, idx) => (
        <mesh key={`post-${idx}`} position={[0, postHeight / 2, z]} castShadow receiveShadow>
          <boxGeometry args={[postSize, postHeight, postSize]} />
          <meshStandardMaterial color="#ffffff" roughness={0.5} />
        </mesh>
      ))}

      {/* Rails */}
      <mesh position={[0, railHeight1, length / 2]} castShadow receiveShadow>
        <boxGeometry args={[railThickness, railWidth, length]} />
        <meshStandardMaterial color="#ffffff" roughness={0.5} />
      </mesh>
      <mesh position={[0, railHeight2, length / 2]} castShadow receiveShadow>
        <boxGeometry args={[railThickness, railWidth, length]} />
        <meshStandardMaterial color="#ffffff" roughness={0.5} />
      </mesh>

      {/* Pickets */}
      {pickets.map((z, idx) => (
        <mesh key={`picket-${idx}`} position={[0, picketHeight / 2, z]} castShadow receiveShadow>
          <boxGeometry args={[picketThickness, picketHeight, picketWidth]} />
          <meshStandardMaterial color="#ffffff" roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

// 2. Realistic Layered Tree Component
interface TreeProps {
  position: [number, number, number];
}

export function Tree({ position }: TreeProps) {
  // Use state to assign permanent random factors so they don't change on every render
  const [treeDims] = useState(() => {
    const trunkHeight = 0.9 + Math.random() * 0.4; // Sits lower for a lush conifer appearance
    const trunkRadius = 0.09 + Math.random() * 0.03;
    const baseRadius = 0.85 + Math.random() * 0.25; // Base radius of the bottom cone segment
    const treeHeight = 2.6 + Math.random() * 0.6; // Total foliage height of stacked cones
    return { trunkHeight, trunkRadius, baseRadius, treeHeight };
  });

  const H1 = treeDims.treeHeight * 0.5;
  const H2 = treeDims.treeHeight * 0.45;
  const H3 = treeDims.treeHeight * 0.4;

  const y1 = treeDims.trunkHeight + H1 / 2;
  const y2 = treeDims.trunkHeight + H1 * 0.4 + H2 / 2;
  const y3 = treeDims.trunkHeight + H1 * 0.4 + H2 * 0.4 + H3 / 2;

  return (
    <group position={position}>
      {/* Trunk */}
      <mesh position={[0, treeDims.trunkHeight / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[treeDims.trunkRadius * 0.7, treeDims.trunkRadius, treeDims.trunkHeight, 8]} />
        <meshStandardMaterial color="#4a3319" roughness={0.95} />
      </mesh>

      {/* Layered Conifer/Pine Foliage Cones */}
      {/* Bottom Layer - Deep Forest Green */}
      <mesh position={[0, y1, 0]} castShadow receiveShadow>
        <coneGeometry args={[treeDims.baseRadius, H1, 8]} />
        <meshStandardMaterial color="#1a3d1c" roughness={0.85} />
      </mesh>

      {/* Middle Layer - Classic Pine Green */}
      <mesh position={[0, y2, 0]} castShadow receiveShadow>
        <coneGeometry args={[treeDims.baseRadius * 0.76, H2, 8]} />
        <meshStandardMaterial color="#214d24" roughness={0.85} />
      </mesh>

      {/* Top Layer - Slightly Lighter Fresh Pine Green */}
      <mesh position={[0, y3, 0]} castShadow receiveShadow>
        <coneGeometry args={[treeDims.baseRadius * 0.52, H3, 8]} />
        <meshStandardMaterial color="#2c5c30" roughness={0.85} />
      </mesh>
    </group>
  );
}

// 3. Lush Bush Component
interface BushProps {
  position: [number, number, number];
  scale?: number;
}

export function Bush({ position, scale = 1.0 }: BushProps) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
        <sphereGeometry args={[0.35, 12, 12]} />
        <meshStandardMaterial color="#245119" roughness={0.85} />
      </mesh>
      <mesh position={[-0.2, 0.2, 0.1]} castShadow receiveShadow>
        <sphereGeometry args={[0.25, 10, 10]} />
        <meshStandardMaterial color="#1f4414" roughness={0.85} />
      </mesh>
      <mesh position={[0.2, 0.18, -0.1]} castShadow receiveShadow>
        <sphereGeometry args={[0.22, 10, 10]} />
        <meshStandardMaterial color="#2e5e22" roughness={0.85} />
      </mesh>
    </group>
  );
}

// 4. Wooden Spectator Bench Component
interface BenchProps {
  position: [number, number, number];
  rotation?: [number, number, number];
}

export function Bench({ position, rotation = [0, 0, 0] }: BenchProps) {
  const seatWidth = 1.5;
  const seatDepth = 0.5;
  const seatHeight = 0.04;
  const heightAboveGround = 0.45;

  return (
    <group position={position} rotation={rotation}>
      {/* Wood Seat Slat */}
      <mesh position={[0, heightAboveGround, 0]} castShadow receiveShadow>
        <boxGeometry args={[seatWidth, seatHeight, seatDepth]} />
        <meshStandardMaterial color="#8b5a2b" roughness={0.7} />
      </mesh>

      {/* Wood Backrest Slat */}
      <mesh position={[0, heightAboveGround + 0.28, -seatDepth / 2 + 0.02]} rotation={[-0.1, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[seatWidth, 0.25, seatHeight]} />
        <meshStandardMaterial color="#8b5a2b" roughness={0.7} />
      </mesh>

      {/* Metal Legs & Supports */}
      <group position={[-seatWidth / 2 + 0.1, 0, 0]}>
        <mesh position={[0, heightAboveGround / 2, 0]} castShadow>
          <boxGeometry args={[0.04, heightAboveGround, 0.04]} />
          <meshStandardMaterial color="#333333" metalness={0.6} roughness={0.3} />
        </mesh>
        <mesh position={[0, heightAboveGround + 0.2, -seatDepth / 2 + 0.02]} castShadow>
          <boxGeometry args={[0.04, 0.4, 0.04]} />
          <meshStandardMaterial color="#333333" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>

      <group position={[seatWidth / 2 - 0.1, 0, 0]}>
        <mesh position={[0, heightAboveGround / 2, 0]} castShadow>
          <boxGeometry args={[0.04, heightAboveGround, 0.04]} />
          <meshStandardMaterial color="#333333" metalness={0.6} roughness={0.3} />
        </mesh>
        <mesh position={[0, heightAboveGround + 0.2, -seatDepth / 2 + 0.02]} castShadow>
          <boxGeometry args={[0.04, 0.4, 0.04]} />
          <meshStandardMaterial color="#333333" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

// 5. Shaded Bench Component (Bench with a premium garden parasol umbrella)
interface ShadedBenchProps {
  position: [number, number, number];
  rotation?: [number, number, number];
}

export function ShadedBench({ position, rotation = [0, 0, 0] }: ShadedBenchProps) {
  return (
    <group position={position} rotation={rotation} scale={1.2}>
      {/* Wooden Bench at center */}
      <Bench position={[0, 0, 0]} />

      {/* Black & White Striped Awning covering the top and back of the bench */}
      <group>
        {/* Awning Metal Support Frame */}
        {/* Left Vertical Post */}
        <mesh position={[-0.83, 0.75, -0.4]} castShadow>
          <cylinderGeometry args={[0.02, 0.02, 1.5, 8]} />
          <meshStandardMaterial color="#2d2d2d" metalness={0.8} roughness={0.2} />
        </mesh>
        {/* Right Vertical Post */}
        <mesh position={[0.83, 0.75, -0.4]} castShadow>
          <cylinderGeometry args={[0.02, 0.02, 1.5, 8]} />
          <meshStandardMaterial color="#2d2d2d" metalness={0.8} roughness={0.2} />
        </mesh>

        {/* Left Slanted Rafter */}
        <mesh position={[-0.83, 1.35, -0.1]} rotation={[-0.46365, 0, 0]} castShadow>
          <cylinderGeometry args={[0.015, 0.015, 0.6708, 8]} />
          <meshStandardMaterial color="#2d2d2d" metalness={0.8} roughness={0.2} />
        </mesh>
        {/* Right Slanted Rafter */}
        <mesh position={[0.83, 1.35, -0.1]} rotation={[-0.46365, 0, 0]} castShadow>
          <cylinderGeometry args={[0.015, 0.015, 0.6708, 8]} />
          <meshStandardMaterial color="#2d2d2d" metalness={0.8} roughness={0.2} />
        </mesh>

        {/* Back Top Cross Beam */}
        <mesh position={[0, 1.5, -0.4]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.015, 0.015, 1.66, 8]} />
          <meshStandardMaterial color="#2d2d2d" metalness={0.8} roughness={0.2} />
        </mesh>
        {/* Front Top Cross Beam */}
        <mesh position={[0, 1.2, 0.2]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.015, 0.015, 1.66, 8]} />
          <meshStandardMaterial color="#2d2d2d" metalness={0.8} roughness={0.2} />
        </mesh>

        {/* Black and White Striped Awning Fabric (10 stripes along X-axis) */}
        {Array.from({ length: 10 }).map((_, i) => {
          const stripeWidth = 1.7 / 10;
          const x = -0.85 + (i + 0.5) * stripeWidth;
          const isBlack = i % 2 === 0;
          const color = isBlack ? '#161616' : '#fcfcf9';
          
          return (
            <group key={`stripe-${i}`}>
              {/* Back Fabric (Vertical) */}
              <mesh position={[x, 0.975, -0.4]} castShadow receiveShadow>
                <boxGeometry args={[stripeWidth, 1.05, 0.01]} />
                <meshStandardMaterial 
                  color={color} 
                  roughness={0.85} 
                  metalness={isBlack ? 0.2 : 0.0}
                  side={DoubleSide}
                />
              </mesh>

              {/* Top Fabric (Slanted Forward) */}
              <mesh 
                position={[x, 1.35, -0.1]} 
                rotation={[-0.46365, 0, 0]} 
                castShadow 
                receiveShadow
              >
                <boxGeometry args={[stripeWidth, 0.01, 0.6708]} />
                <meshStandardMaterial 
                  color={color} 
                  roughness={0.85} 
                  metalness={isBlack ? 0.2 : 0.0}
                  side={DoubleSide}
                />
              </mesh>

              {/* Front Hanging Valance (Vertical) */}
              <mesh position={[x, 1.15, 0.2]} castShadow receiveShadow>
                <boxGeometry args={[stripeWidth, 0.1, 0.01]} />
                <meshStandardMaterial 
                  color={color} 
                  roughness={0.85} 
                  metalness={isBlack ? 0.2 : 0.0}
                  side={DoubleSide}
                />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}

// 6. Realistic Volumetric 8-Foot Hedge Component
interface HedgeProps {
  start: [number, number];
  end: [number, number];
}

export function Hedge({ start, end }: HedgeProps) {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dx, dz);

  const hedgeHeight = 2.667; // 8 feet in yards (8 / 3)
  const hedgeThickness = 1.2;

  // Overlapping organic blocks along the length to look organic and volumetric
  const numBlocks = Math.ceil(length / 1.5);
  const blockSpacing = length / numBlocks;

  return (
    <group position={[start[0], 0, start[1]]} rotation={[0, angle, 0]}>
      {Array.from({ length: numBlocks }).map((_, i) => {
        const z = i * blockSpacing + blockSpacing / 2;
        // Subtle organic variations in height and thickness
        const hVar = 0.85 + (i % 3) * 0.08;
        const tVar = 0.9 + ((i * 2) % 3) * 0.06;
        const color = i % 2 === 0 ? '#1f4414' : '#245119';
        
        return (
          <group key={`hedge-block-${i}`} position={[0, (hedgeHeight * hVar) / 2, z]}>
            {/* Main Volumetric Hedge block */}
            <mesh castShadow receiveShadow>
              <boxGeometry args={[hedgeThickness * tVar, hedgeHeight * hVar, blockSpacing * 1.3]} />
              <meshStandardMaterial color={color} roughness={0.9} />
            </mesh>
            
            {/* Softening sphere shapes to break up straight edges */}
            <mesh position={[0, (hedgeHeight * hVar) / 2, 0]} castShadow receiveShadow>
              <sphereGeometry args={[(hedgeThickness * tVar) * 0.6, 8, 8]} />
              <meshStandardMaterial color="#2d5e2e" roughness={0.85} />
            </mesh>
            <mesh position={[(hedgeThickness * tVar) * 0.25, (hedgeHeight * hVar) * 0.25, -blockSpacing * 0.2]} castShadow receiveShadow>
              <sphereGeometry args={[(hedgeThickness * tVar) * 0.45, 8, 8]} />
              <meshStandardMaterial color="#2e6f3e" roughness={0.85} />
            </mesh>
            <mesh position={[-(hedgeThickness * tVar) * 0.25, (hedgeHeight * hVar) * 0.15, blockSpacing * 0.2]} castShadow receiveShadow>
              <sphereGeometry args={[(hedgeThickness * tVar) * 0.5, 8, 8]} />
              <meshStandardMaterial color="#1f4414" roughness={0.85} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// 7. Premium Striped Sling Deck Chair
interface DeckChairProps {
  position: [number, number, number];
  rotation?: [number, number, number];
}

export function DeckChair({ position, rotation = [0, 0, 0] }: DeckChairProps) {
  return (
    <group position={position} rotation={rotation}>
      {/* Wood Frame - Warm Cedar color #c3824b */}
      {/* Left Frame X-legs */}
      <mesh position={[-0.1, 0.3, -0.3]} rotation={[0, 0, -0.6]} castShadow>
        <boxGeometry args={[0.04, 0.8, 0.03]} />
        <meshStandardMaterial color="#c3824b" roughness={0.6} />
      </mesh>
      <mesh position={[0.1, 0.25, -0.3]} rotation={[0, 0, 0.6]} castShadow>
        <boxGeometry args={[0.04, 0.7, 0.03]} />
        <meshStandardMaterial color="#c3824b" roughness={0.6} />
      </mesh>

      {/* Right Frame X-legs */}
      <mesh position={[-0.1, 0.3, 0.3]} rotation={[0, 0, -0.6]} castShadow>
        <boxGeometry args={[0.04, 0.8, 0.03]} />
        <meshStandardMaterial color="#c3824b" roughness={0.6} />
      </mesh>
      <mesh position={[0.1, 0.25, 0.3]} rotation={[0, 0, 0.6]} castShadow>
        <boxGeometry args={[0.04, 0.7, 0.03]} />
        <meshStandardMaterial color="#c3824b" roughness={0.6} />
      </mesh>

      {/* Armrests */}
      <mesh position={[-0.05, 0.5, -0.3]} rotation={[0, 0, -0.15]} castShadow>
        <boxGeometry args={[0.6, 0.02, 0.06]} />
        <meshStandardMaterial color="#c3824b" roughness={0.6} />
      </mesh>
      <mesh position={[-0.05, 0.5, 0.3]} rotation={[0, 0, -0.15]} castShadow>
        <boxGeometry args={[0.6, 0.02, 0.06]} />
        <meshStandardMaterial color="#c3824b" roughness={0.6} />
      </mesh>

      {/* Transverse connector bars */}
      <mesh position={[-0.3, 0.65, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.015, 0.015, 0.6, 8]} />
        <meshStandardMaterial color="#c3824b" roughness={0.6} />
      </mesh>
      <mesh position={[0.25, 0.1, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.015, 0.015, 0.6, 8]} />
        <meshStandardMaterial color="#c3824b" roughness={0.6} />
      </mesh>

      {/* Black & White Striped Fabric Sling (rendered in physical stripes) */}
      {Array.from({ length: 5 }).map((_, idx) => {
        const stripeWidth = 0.52 / 5;
        const stripeZ = -0.26 + (idx + 0.5) * stripeWidth;
        const isBlack = idx % 2 === 0;
        const color = isBlack ? '#161616' : '#fcfcf9';
        
        return (
          <group key={`sling-${idx}`}>
            {/* Upper back fabric */}
            <mesh position={[-0.15, 0.45, stripeZ]} rotation={[0, 0, -0.7]} castShadow receiveShadow>
              <boxGeometry args={[0.45, 0.01, stripeWidth]} />
              <meshStandardMaterial color={color} roughness={0.9} />
            </mesh>
            {/* Seat fabric */}
            <mesh position={[0.1, 0.23, stripeZ]} rotation={[0, 0, 0.25]} castShadow receiveShadow>
              <boxGeometry args={[0.35, 0.01, stripeWidth]} />
              <meshStandardMaterial color={color} roughness={0.9} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// 7.5 Premium Terrace Table and Chair Components
interface TerraceTableProps {
  position: [number, number, number];
}

export function TerraceTable({ position }: TerraceTableProps) {
  return (
    <group position={position}>
      {/* Heavy Bronze Base */}
      <mesh position={[0, 0.02, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.22, 0.24, 0.04, 16]} />
        <meshStandardMaterial color="#222222" metalness={0.7} roughness={0.3} />
      </mesh>
      
      {/* Central Support Pillar */}
      <mesh position={[0, 0.38, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.68, 8]} />
        <meshStandardMaterial color="#222222" metalness={0.7} roughness={0.3} />
      </mesh>
      
      {/* Gold Tabletop Under-Ring/Trim */}
      <mesh position={[0, 0.735, 0]} castShadow>
        <cylinderGeometry args={[0.43, 0.43, 0.032, 32]} />
        <meshStandardMaterial color="#d4af37" metalness={0.9} roughness={0.1} />
      </mesh>
      
      {/* Wood Tabletop Insert */}
      <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.42, 0.42, 0.03, 32]} />
        <meshStandardMaterial color="#5c3818" roughness={0.6} />
      </mesh>
    </group>
  );
}

interface TerraceChairProps {
  position: [number, number, number];
  rotation?: [number, number, number];
}

export function TerraceChair({ position, rotation = [0, 0, 0] }: TerraceChairProps) {
  const seatHeight = 0.42;
  const woodColor = "#5c3818";
  const trimColor = "#d4af37";

  return (
    <group position={position} rotation={rotation}>
      {/* 4 Wooden Legs */}
      <mesh position={[-0.15, seatHeight / 2, -0.15]} castShadow>
        <boxGeometry args={[0.026, seatHeight, 0.026]} />
        <meshStandardMaterial color={woodColor} roughness={0.6} />
      </mesh>
      <mesh position={[0.15, seatHeight / 2, -0.15]} castShadow>
        <boxGeometry args={[0.026, seatHeight, 0.026]} />
        <meshStandardMaterial color={woodColor} roughness={0.6} />
      </mesh>
      <mesh position={[-0.15, seatHeight / 2, 0.15]} castShadow>
        <boxGeometry args={[0.026, seatHeight, 0.026]} />
        <meshStandardMaterial color={woodColor} roughness={0.6} />
      </mesh>
      <mesh position={[0.15, seatHeight / 2, 0.15]} castShadow>
        <boxGeometry args={[0.026, seatHeight, 0.026]} />
        <meshStandardMaterial color={woodColor} roughness={0.6} />
      </mesh>

      {/* Gold Leg Tips */}
      <mesh position={[-0.15, 0.02, -0.15]}>
        <boxGeometry args={[0.028, 0.04, 0.028]} />
        <meshStandardMaterial color={trimColor} metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[0.15, 0.02, -0.15]}>
        <boxGeometry args={[0.028, 0.04, 0.028]} />
        <meshStandardMaterial color={trimColor} metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[-0.15, 0.02, 0.15]}>
        <boxGeometry args={[0.028, 0.04, 0.028]} />
        <meshStandardMaterial color={trimColor} metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[0.15, 0.02, 0.15]}>
        <boxGeometry args={[0.028, 0.04, 0.028]} />
        <meshStandardMaterial color={trimColor} metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Wooden Seat */}
      <mesh position={[0, seatHeight, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.38, 0.02, 0.38]} />
        <meshStandardMaterial color={woodColor} roughness={0.6} />
      </mesh>

      {/* Backrest Side Posts */}
      <mesh position={[-0.15, seatHeight + 0.22, 0.16]} castShadow>
        <boxGeometry args={[0.026, 0.44, 0.026]} />
        <meshStandardMaterial color={woodColor} roughness={0.6} />
      </mesh>
      <mesh position={[0.15, seatHeight + 0.22, 0.16]} castShadow>
        <boxGeometry args={[0.026, 0.44, 0.026]} />
        <meshStandardMaterial color={woodColor} roughness={0.6} />
      </mesh>

      {/* Backrest Slats */}
      <mesh position={[0, seatHeight + 0.38, 0.16]} castShadow>
        <boxGeometry args={[0.28, 0.05, 0.015]} />
        <meshStandardMaterial color={woodColor} roughness={0.6} />
      </mesh>
      <mesh position={[0, seatHeight + 0.28, 0.16]} castShadow>
        <boxGeometry args={[0.28, 0.04, 0.015]} />
        <meshStandardMaterial color={woodColor} roughness={0.6} />
      </mesh>
      <mesh position={[0, seatHeight + 0.18, 0.16]} castShadow>
        <boxGeometry args={[0.28, 0.03, 0.015]} />
        <meshStandardMaterial color={woodColor} roughness={0.6} />
      </mesh>
    </group>
  );
}

interface SittingSpectatorProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  shirtColor: string;
  capColor: string;
  isLounge?: boolean;
}

export function SittingSpectator({
  position,
  rotation = [0, 0, 0],
  shirtColor,
  capColor,
  isLounge = false
}: SittingSpectatorProps) {
  const skinColor = "#fcd5b5";

  if (isLounge) {
    // Lounge character fits perfectly inside the sloped DeckChair
    return (
      <group position={position} rotation={rotation}>
        {/* Hips */}
        <mesh position={[0.04, 0.20, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.26, 0.08, 0.24]} />
          <meshStandardMaterial color="#333333" roughness={0.8} />
        </mesh>

        {/* Lounged Torso (tilted backward by 0.35 rad) */}
        <group position={[-0.04, 0.24, 0]} rotation={[0, 0, -0.35]}>
          <mesh position={[0, 0.20, 0]} castShadow>
            <cylinderGeometry args={[0.13, 0.15, 0.40, 10]} />
            <meshStandardMaterial color={shirtColor} roughness={0.5} />
          </mesh>
          {/* Collar */}
          <mesh position={[0, 0.41, 0]} rotation={[0.1, 0, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.10, 0.035, 10]} />
            <meshStandardMaterial color="#ffffff" roughness={0.5} />
          </mesh>
          {/* Head */}
          <mesh position={[0, 0.55, 0]} castShadow>
            <sphereGeometry args={[0.115, 16, 16]} />
            <meshStandardMaterial color={skinColor} roughness={0.7} />
          </mesh>
          {/* Cap */}
          <mesh position={[0, 0.65, 0.015]} rotation={[-0.1, 0, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.12, 0.03, 12]} />
            <meshStandardMaterial color={capColor} roughness={0.5} />
          </mesh>
          {/* Cap Visor */}
          <mesh position={[0, 0.64, 0.10]} rotation={[0.2, 0, 0]} castShadow>
            <boxGeometry args={[0.14, 0.012, 0.07]} />
            <meshStandardMaterial color={capColor} roughness={0.5} />
          </mesh>
          {/* Sunglasses */}
          <mesh position={[0, 0.56, 0.09]} castShadow>
            <boxGeometry args={[0.16, 0.026, 0.026]} />
            <meshStandardMaterial color="#111111" metalness={0.9} roughness={0.1} />
          </mesh>
        </group>

        {/* Lounging Arms (resting flat on DeckChair armrests) */}
        <mesh position={[0.04, 0.41, -0.28]} rotation={[0, 0, -0.15]} castShadow>
          <boxGeometry args={[0.34, 0.035, 0.035]} />
          <meshStandardMaterial color={shirtColor} roughness={0.5} />
        </mesh>
        <mesh position={[0.04, 0.41, 0.28]} rotation={[0, 0, -0.15]} castShadow>
          <boxGeometry args={[0.34, 0.035, 0.035]} />
          <meshStandardMaterial color={shirtColor} roughness={0.5} />
        </mesh>

        {/* Lounging Thighs (sloped slightly upward) */}
        <mesh position={[0.14, 0.23, -0.07]} rotation={[0, 0, 0.15]} castShadow>
          <boxGeometry args={[0.24, 0.05, 0.05]} />
          <meshStandardMaterial color="#333333" roughness={0.8} />
        </mesh>
        <mesh position={[0.14, 0.23, 0.07]} rotation={[0, 0, 0.15]} castShadow>
          <boxGeometry args={[0.24, 0.05, 0.05]} />
          <meshStandardMaterial color="#333333" roughness={0.8} />
        </mesh>

        {/* Lounging Calves (extending downward to meet the floor) */}
        <mesh position={[0.25, 0.12, -0.07]} castShadow>
          <cylinderGeometry args={[0.022, 0.022, 0.24, 8]} />
          <meshStandardMaterial color={skinColor} roughness={0.7} />
        </mesh>
        <mesh position={[0.25, 0.12, 0.07]} castShadow>
          <cylinderGeometry args={[0.022, 0.022, 0.24, 8]} />
          <meshStandardMaterial color={skinColor} roughness={0.7} />
        </mesh>

        {/* Shoes */}
        <mesh position={[0.27, 0.02, -0.07]} castShadow>
          <boxGeometry args={[0.07, 0.04, 0.05]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.8} />
        </mesh>
        <mesh position={[0.27, 0.02, 0.07]} castShadow>
          <boxGeometry args={[0.07, 0.04, 0.05]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.8} />
        </mesh>
      </group>
    );
  } else {
    // Upright character fits perfectly on standard TerraceChair
    return (
      <group position={position} rotation={rotation}>
        {/* Hips */}
        <mesh position={[0, 0.43, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.24, 0.06, 0.24]} />
          <meshStandardMaterial color="#333333" roughness={0.8} />
        </mesh>

        {/* Upright Torso */}
        <mesh position={[-0.04, 0.65, 0]} rotation={[0, 0, -0.04]} castShadow>
          <cylinderGeometry args={[0.13, 0.14, 0.38, 10]} />
          <meshStandardMaterial color={shirtColor} roughness={0.5} />
        </mesh>
        {/* Collar */}
        <mesh position={[-0.04, 0.84, 0]} rotation={[0.05, 0, -0.04]} castShadow>
          <cylinderGeometry args={[0.09, 0.10, 0.035, 10]} />
          <meshStandardMaterial color="#ffffff" roughness={0.5} />
        </mesh>
        {/* Head */}
        <mesh position={[-0.04, 0.97, 0]} castShadow>
          <sphereGeometry args={[0.115, 16, 16]} />
          <meshStandardMaterial color={skinColor} roughness={0.7} />
        </mesh>
        {/* Cap */}
        <mesh position={[-0.04, 1.07, 0.015]} rotation={[-0.08, 0, -0.04]} castShadow>
          <cylinderGeometry args={[0.12, 0.12, 0.03, 12]} />
          <meshStandardMaterial color={capColor} roughness={0.5} />
        </mesh>
        {/* Cap Visor */}
        <mesh position={[-0.04, 1.06, 0.10]} rotation={[0.2, 0, -0.04]} castShadow>
          <boxGeometry args={[0.14, 0.012, 0.07]} />
          <meshStandardMaterial color={capColor} roughness={0.5} />
        </mesh>
        {/* Sunglasses */}
        <mesh position={[-0.04, 0.98, 0.09]} castShadow>
          <boxGeometry args={[0.16, 0.026, 0.026]} />
          <meshStandardMaterial color="#111111" metalness={0.9} roughness={0.1} />
        </mesh>

        {/* Sitting Arms (resting on thighs / lap) */}
        {/* Upper arms */}
        <mesh position={[-0.04, 0.70, -0.13]} rotation={[0.1, 0, 0]} castShadow>
          <cylinderGeometry args={[0.022, 0.022, 0.18, 8]} />
          <meshStandardMaterial color={shirtColor} roughness={0.5} />
        </mesh>
        <mesh position={[-0.04, 0.70, 0.13]} rotation={[-0.1, 0, 0]} castShadow>
          <cylinderGeometry args={[0.022, 0.022, 0.18, 8]} />
          <meshStandardMaterial color={shirtColor} roughness={0.5} />
        </mesh>
        {/* Forearms */}
        <mesh position={[0.06, 0.60, -0.11]} rotation={[0, 0, Math.PI / 2.5]} castShadow>
          <cylinderGeometry args={[0.02, 0.02, 0.18, 8]} />
          <meshStandardMaterial color={skinColor} roughness={0.7} />
        </mesh>
        <mesh position={[0.06, 0.60, 0.11]} rotation={[0, 0, Math.PI / 2.5]} castShadow>
          <cylinderGeometry args={[0.02, 0.02, 0.18, 8]} />
          <meshStandardMaterial color={skinColor} roughness={0.7} />
        </mesh>

        {/* Upright Thighs (extending forward) */}
        <mesh position={[0.09, 0.43, -0.07]} castShadow>
          <boxGeometry args={[0.20, 0.05, 0.05]} />
          <meshStandardMaterial color="#333333" roughness={0.8} />
        </mesh>
        <mesh position={[0.09, 0.43, 0.07]} castShadow>
          <boxGeometry args={[0.20, 0.05, 0.05]} />
          <meshStandardMaterial color="#333333" roughness={0.8} />
        </mesh>

        {/* Upright Calves (extending downward to the floor) */}
        <mesh position={[0.19, 0.22, -0.07]} castShadow>
          <cylinderGeometry args={[0.022, 0.022, 0.38, 8]} />
          <meshStandardMaterial color={skinColor} roughness={0.7} />
        </mesh>
        <mesh position={[0.19, 0.22, 0.07]} castShadow>
          <cylinderGeometry args={[0.022, 0.022, 0.38, 8]} />
          <meshStandardMaterial color={skinColor} roughness={0.7} />
        </mesh>

        {/* Shoes */}
        <mesh position={[0.22, 0.02, -0.07]} castShadow>
          <boxGeometry args={[0.08, 0.04, 0.05]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.8} />
        </mesh>
        <mesh position={[0.22, 0.02, 0.07]} castShadow>
          <boxGeometry args={[0.08, 0.04, 0.05]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.8} />
        </mesh>
      </group>
    );
  }
}

// 7.5. Interactive Retractable Awning Component (Striped café-style fabric)
export function RetractableAwning() {
  const awningWidth = 16.3; // leaves a 0.05 yd gap from the deck railing
  const slopeAngle = 0.245; // ~14 degrees slope
  const maxExtension = 2.35;
  const hypotenuse = Math.sqrt(maxExtension * maxExtension + (maxExtension * 0.25) * (maxExtension * 0.25)); // ~2.42

  const [isExtended, setIsExtended] = useState(true);
  const extensionRef = useRef(1.0); // starts fully extended
  
  const fabricRef = useRef<THREE.Mesh>(null);
  const frontBarRef = useRef<THREE.Group>(null);
  
  const leftArmInnerRef = useRef<THREE.Mesh>(null);
  const centerArmInnerRef = useRef<THREE.Mesh>(null);
  const rightArmInnerRef = useRef<THREE.Mesh>(null);

  // Procedural black and white striped texture
  const stripedTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Background white
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 512, 512);
      
      // Black stripes (high contrast café style)
      ctx.fillStyle = '#181818';
      const numStripes = 16;
      const stripeWidth = 512 / numStripes;
      for (let i = 0; i < numStripes; i += 2) {
        ctx.fillRect(i * stripeWidth, 0, stripeWidth, 512);
      }
    }
    const texture = new CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    // Repeat the stripes across the Z-axis of the awning (width is 16.3 yards, so 32 repeats is perfect)
    texture.repeat.set(32, 1);
    return texture;
  }, []);

  useFrame((_, delta) => {
    const speed = 2.5; // smooth extension/retraction speed
    const target = isExtended ? 1.0 : 0.05; // 0.05 is almost fully retracted (inside cassette)
    const diff = target - extensionRef.current;
    
    if (Math.abs(diff) > 0.001) {
      extensionRef.current += Math.sign(diff) * Math.min(Math.abs(diff), speed * delta);
      const ext = extensionRef.current;
      
      const maxExtensionVal = 2.35; // depth from X=21.0 to X=18.65
      const slope = 0.25; // drop in Y per unit X (slope angle ~14 deg)
      
      // 1. Fabric scaling and positioning
      if (fabricRef.current) {
        // Scale along its local X-axis (extension direction)
        fabricRef.current.scale.x = ext;
        
        // Since geometry is centered, we shift the position as it scales:
        // Position X is the mid-point of the extended fabric
        fabricRef.current.position.x = -ext * maxExtensionVal / 2;
        fabricRef.current.position.y = -ext * maxExtensionVal * slope / 2;
      }
      
      // 2. Front bar positioning
      if (frontBarRef.current) {
        frontBarRef.current.position.x = -ext * maxExtensionVal;
        frontBarRef.current.position.y = -ext * maxExtensionVal * slope;
      }
      
      // 3. Telescoping Arms inner tube sliding out
      // Outer tube is fixed from wall to deck railings. Inner tube slides out from within it
      const slideX = ext * hypotenuse;
      if (leftArmInnerRef.current) {
        leftArmInnerRef.current.position.x = -slideX / 2;
        leftArmInnerRef.current.scale.x = ext;
      }
      if (centerArmInnerRef.current) {
        centerArmInnerRef.current.position.x = -slideX / 2;
        centerArmInnerRef.current.scale.x = ext;
      }
      if (rightArmInnerRef.current) {
        rightArmInnerRef.current.position.x = -slideX / 2;
        rightArmInnerRef.current.scale.x = ext;
      }
    }
  });

  const toggleAwning = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    setIsExtended(!isExtended);
  };

  const onHover = (e: ThreeEvent<PointerEvent>, state: boolean) => {
    e.stopPropagation();
    document.body.style.cursor = state ? 'pointer' : 'auto';
  };

  return (
    <group 
      position={[21.0 - 0.05, 2.65, 0]} 
      onPointerOver={(e) => onHover(e, true)}
      onPointerOut={(e) => onHover(e, false)}
      onClick={toggleAwning}
    >
      {/* A. Sleek anodized aluminum Cassette/Housing Cylinder */}
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.075, 0.075, awningWidth + 0.1, 16]} />
        <meshStandardMaterial color="#cccccc" metalness={0.85} roughness={0.15} />
      </mesh>
      {/* Decorative dark end caps */}
      <mesh position={[0, 0, -awningWidth / 2 - 0.055]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.078, 0.078, 0.02, 16]} />
        <meshStandardMaterial color="#222222" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, awningWidth / 2 + 0.055]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.078, 0.078, 0.02, 16]} />
        <meshStandardMaterial color="#222222" roughness={0.4} />
      </mesh>

      {/* B. Sloped Fabric Canopy Mesh Group (rotated to slope downwards) */}
      <group rotation={[0, 0, slopeAngle]}>
        <mesh ref={fabricRef} castShadow receiveShadow>
          <boxGeometry args={[hypotenuse, 0.004, awningWidth]} />
          <meshStandardMaterial 
            map={stripedTexture} 
            roughness={0.65} 
            side={DoubleSide} 
          />
        </mesh>
      </group>

      {/* C. Dynamic Front Support Bar & Valance */}
      <group ref={frontBarRef}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.028, 0.028, awningWidth + 0.04, 12]} />
          <meshStandardMaterial color="#cccccc" metalness={0.85} roughness={0.15} />
        </mesh>
        {/* Elegant scalloped/hanging front Valance (black & white striped, hangs straight down) */}
        <mesh position={[0, -0.09, 0]} castShadow>
          <boxGeometry args={[0.003, 0.18, awningWidth]} />
          <meshStandardMaterial 
            map={stripedTexture} 
            roughness={0.65} 
          />
        </mesh>
      </group>

      {/* D. Telescoping Support Arms (at ends and center: Z = -8.0, 0.0, 8.0) */}
      <group position={[0, -0.05, -7.9]} rotation={[0, 0, slopeAngle]}>
        <mesh position={[-hypotenuse / 2, 0, 0]} castShadow>
          <boxGeometry args={[hypotenuse, 0.035, 0.035]} />
          <meshStandardMaterial color="#dddddd" metalness={0.8} roughness={0.2} />
        </mesh>
        <mesh ref={leftArmInnerRef} castShadow>
          <boxGeometry args={[hypotenuse, 0.025, 0.025]} />
          <meshStandardMaterial color="#999999" metalness={0.8} roughness={0.2} />
        </mesh>
      </group>

      <group position={[0, -0.05, 0]} rotation={[0, 0, slopeAngle]}>
        <mesh position={[-hypotenuse / 2, 0, 0]} castShadow>
          <boxGeometry args={[hypotenuse, 0.035, 0.035]} />
          <meshStandardMaterial color="#dddddd" metalness={0.8} roughness={0.2} />
        </mesh>
        <mesh ref={centerArmInnerRef} castShadow>
          <boxGeometry args={[hypotenuse, 0.025, 0.025]} />
          <meshStandardMaterial color="#999999" metalness={0.8} roughness={0.2} />
        </mesh>
      </group>

      <group position={[0, -0.05, 7.9]} rotation={[0, 0, slopeAngle]}>
        <mesh position={[-hypotenuse / 2, 0, 0]} castShadow>
          <boxGeometry args={[hypotenuse, 0.035, 0.035]} />
          <meshStandardMaterial color="#dddddd" metalness={0.8} roughness={0.2} />
        </mesh>
        <mesh ref={rightArmInnerRef} castShadow>
          <boxGeometry args={[hypotenuse, 0.025, 0.025]} />
          <meshStandardMaterial color="#999999" metalness={0.8} roughness={0.2} />
        </mesh>
      </group>
    </group>
  );
}

// 8. Modular Clubhouse Deck Component
export function ClubhouseDeck() {
  const deckWidth = 18.0; // Z direction (-9 to 9)
  const deckDepth = 2.5; // X direction (18.5 to 21)
  const deckHeight = 0.15;
  const deckXCenter = 19.75;
  const deckZCenter = 0.0;

  // Render planks running parallel to the fence/court (along Z axis)
  const numPlanks = 16;
  const plankWidth = 0.14;
  const spacing = (deckDepth - plankWidth * numPlanks) / (numPlanks + 1);

  // Spindles (balusters) for railings
  const spindlesNorth = useMemo(() => {
    const arr: number[] = [];
    const startX = 18.55;
    const endX = 20.95;
    const count = 8;
    for (let i = 0; i < count; i++) {
      arr.push(startX + (i / (count - 1)) * (endX - startX));
    }
    return arr;
  }, []);

  const spindlesSouth = useMemo(() => {
    const arr: number[] = [];
    const startX = 18.55;
    const endX = 20.95;
    const count = 8;
    for (let i = 0; i < count; i++) {
      arr.push(startX + (i / (count - 1)) * (endX - startX));
    }
    return arr;
  }, []);

  const spindlesWestNorth = useMemo(() => {
    const arr: number[] = [];
    const startZ = -8.95;
    const endZ = -1.55;
    const count = 22;
    for (let i = 0; i < count; i++) {
      arr.push(startZ + (i / (count - 1)) * (endZ - startZ));
    }
    return arr;
  }, []);

  const spindlesWestSouth = useMemo(() => {
    const arr: number[] = [];
    const startZ = 1.55;
    const endZ = 8.95;
    const count = 22;
    for (let i = 0; i < count; i++) {
      arr.push(startZ + (i / (count - 1)) * (endZ - startZ));
    }
    return arr;
  }, []);

  return (
    <group>
      {/* 1. Structural deck base frame (fascia) */}
      <mesh position={[deckXCenter, deckHeight / 2 - 0.01, deckZCenter]} castShadow receiveShadow>
        <boxGeometry args={[deckDepth, deckHeight - 0.02, deckWidth]} />
        <meshStandardMaterial color="#5c2c16" roughness={0.9} />
      </mesh>

      {/* 2. Individual Decking Planks */}
      {Array.from({ length: numPlanks }).map((_, i) => {
        const x = 18.5 + spacing + plankWidth / 2 + i * (plankWidth + spacing);
        const isDarker = i % 3 === 0;
        const plankColor = isDarker ? '#9c4d28' : i % 3 === 1 ? '#a8562e' : '#b25f35';
        
        return (
          <mesh key={`plank-${i}`} position={[x, deckHeight - 0.005, 0]} castShadow receiveShadow>
            <boxGeometry args={[plankWidth, 0.01, deckWidth - 0.02]} />
            <meshStandardMaterial color={plankColor} roughness={0.6} />
          </mesh>
        );
      })}

      {/* 3. Steps (Wide steps centered at Z = 0) */}
      {/* Bottom Step */}
      <mesh position={[18.0, 0.05, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.06, 2.8]} />
        <meshStandardMaterial color="#5c2c16" roughness={0.8} />
      </mesh>
      {/* Top Step */}
      <mesh position={[18.25, 0.10, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.06, 2.8]} />
        <meshStandardMaterial color="#5c2c16" roughness={0.8} />
      </mesh>

      {/* 4. Railing Corner Posts */}
      {/* NE Corner */}
      <mesh position={[21.0, deckHeight + 0.45, -9.0]} castShadow>
        <boxGeometry args={[0.06, 0.9, 0.06]} />
        <meshStandardMaterial color="#322a21" metalness={0.6} roughness={0.2} />
      </mesh>
      {/* NW Corner */}
      <mesh position={[18.5, deckHeight + 0.45, -9.0]} castShadow>
        <boxGeometry args={[0.06, 0.9, 0.06]} />
        <meshStandardMaterial color="#322a21" metalness={0.6} roughness={0.2} />
      </mesh>
      {/* SE Corner */}
      <mesh position={[21.0, deckHeight + 0.45, 9.0]} castShadow>
        <boxGeometry args={[0.06, 0.9, 0.06]} />
        <meshStandardMaterial color="#322a21" metalness={0.6} roughness={0.2} />
      </mesh>
      {/* SW Corner */}
      <mesh position={[18.5, deckHeight + 0.45, 9.0]} castShadow>
        <boxGeometry args={[0.06, 0.9, 0.06]} />
        <meshStandardMaterial color="#322a21" metalness={0.6} roughness={0.2} />
      </mesh>
      {/* West Steps Opening Posts */}
      <mesh position={[18.5, deckHeight + 0.45, -1.4]} castShadow>
        <boxGeometry args={[0.06, 0.9, 0.06]} />
        <meshStandardMaterial color="#322a21" metalness={0.6} roughness={0.2} />
      </mesh>
      <mesh position={[18.5, deckHeight + 0.45, 1.4]} castShadow>
        <boxGeometry args={[0.06, 0.9, 0.06]} />
        <meshStandardMaterial color="#322a21" metalness={0.6} roughness={0.2} />
      </mesh>

      {/* 5. Railing Top Rails */}
      {/* North Rail */}
      <mesh position={[19.75, deckHeight + 0.88, -9.0]} castShadow>
        <boxGeometry args={[2.56, 0.04, 0.04]} />
        <meshStandardMaterial color="#322a21" metalness={0.6} roughness={0.2} />
      </mesh>
      {/* South Rail */}
      <mesh position={[19.75, deckHeight + 0.88, 9.0]} castShadow>
        <boxGeometry args={[2.56, 0.04, 0.04]} />
        <meshStandardMaterial color="#322a21" metalness={0.6} roughness={0.2} />
      </mesh>
      {/* West Rail North Segment */}
      <mesh position={[18.5, deckHeight + 0.88, -5.2]} castShadow>
        <boxGeometry args={[0.04, 0.04, 7.6]} />
        <meshStandardMaterial color="#322a21" metalness={0.6} roughness={0.2} />
      </mesh>
      {/* West Rail South Segment */}
      <mesh position={[18.5, deckHeight + 0.88, 5.2]} castShadow>
        <boxGeometry args={[0.04, 0.04, 7.6]} />
        <meshStandardMaterial color="#322a21" metalness={0.6} roughness={0.2} />
      </mesh>

      {/* 6. Railing Spindles (Balusters) */}
      {/* North Spindles */}
      {spindlesNorth.map((x, idx) => (
        <mesh key={`spindle-n-${idx}`} position={[x, deckHeight + 0.42, -9.0]} castShadow>
          <boxGeometry args={[0.02, 0.8, 0.02]} />
          <meshStandardMaterial color="#2d2d2d" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
      {/* South Spindles */}
      {spindlesSouth.map((x, idx) => (
        <mesh key={`spindle-s-${idx}`} position={[x, deckHeight + 0.42, 9.0]} castShadow>
          <boxGeometry args={[0.02, 0.8, 0.02]} />
          <meshStandardMaterial color="#2d2d2d" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
      {/* West North Spindles */}
      {spindlesWestNorth.map((z, idx) => (
        <mesh key={`spindle-wn-${idx}`} position={[18.5, deckHeight + 0.42, z]} castShadow>
          <boxGeometry args={[0.02, 0.8, 0.02]} />
          <meshStandardMaterial color="#2d2d2d" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
      {/* West South Spindles */}
      {spindlesWestSouth.map((z, idx) => (
        <mesh key={`spindle-ws-${idx}`} position={[18.5, deckHeight + 0.42, z]} castShadow>
          <boxGeometry args={[0.02, 0.8, 0.02]} />
          <meshStandardMaterial color="#2d2d2d" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}

      {/* 7. Outdoor Seating & Dining Arrangement (facing West / Court-facing) */}
      {/* North Dining Set */}
      <TerraceTable position={[19.75, deckHeight, -5.0]} />
      <TerraceChair position={[19.75, deckHeight, -5.6]} rotation={[0, 0, 0]} />
      <TerraceChair position={[19.75, deckHeight, -4.4]} rotation={[0, Math.PI, 0]} />

      {/* Central Lounge Deck Chairs */}
      <DeckChair position={[19.8, deckHeight, -2.0]} rotation={[0, -Math.PI / 2 + 0.02, 0]} />
      <DeckChair position={[19.8, deckHeight, 2.0]} rotation={[0, -Math.PI / 2 - 0.02, 0]} />

      {/* Additional Lounge Seating for a more populated deck */}
      <DeckChair position={[19.8, deckHeight, -7.5]} rotation={[0, -Math.PI / 2 - 0.05, 0]} />
      <DeckChair position={[19.8, deckHeight, 7.5]} rotation={[0, -Math.PI / 2 + 0.05, 0]} />

      {/* South Dining Set */}
      <TerraceTable position={[19.75, deckHeight, 5.0]} />
      <TerraceChair position={[19.75, deckHeight, 4.4]} rotation={[0, 0, 0]} />
      <TerraceChair position={[19.75, deckHeight, 5.6]} rotation={[0, Math.PI, 0]} />

      {/* Spectators Watching the Croquet Court */}
      {/* 1. Spectator Lounging in the North-most Lounge Chair (Z = -7.5) */}
      <SittingSpectator 
        position={[19.8, deckHeight, -7.5]} 
        rotation={[0, -Math.PI / 2 - 0.05, 0]} 
        shirtColor="#2e7d32" 
        capColor="#1b5e20" 
        isLounge 
      />

      {/* 2. Spectator Lounging in the Central-North Lounge Chair (Z = -2.0) */}
      <SittingSpectator 
        position={[19.8, deckHeight, -2.0]} 
        rotation={[0, -Math.PI / 2 + 0.02, 0]} 
        shirtColor="#1565c0" 
        capColor="#0d47a1" 
        isLounge 
      />

      {/* 3. Spectator Sitting Upright on the South Dining Chair (Z = 5.6) */}
      <SittingSpectator 
        position={[19.75, deckHeight, 5.6]} 
        rotation={[0, Math.PI, 0]} 
        shirtColor="#e64a19" 
        capColor="#bf360c" 
        isLounge={false} 
      />

      {/* 7.5 Interactive Retractable Awning (Striped café-style fabric) */}
      <RetractableAwning />
    </group>
  );
}

// 9. Premium Single-Story Clubhouse Component
export function Clubhouse() {
  const wallHeight = 2.8;
  const ridgeHeight = 3.8;
  const buildingWidth = 16.0;
  const buildingDepth = 6.5;
  const xCenter = 24.25;
  const zCenter = 0.0;

  // Custom Shape for the triangular North and South gables
  const gableShape = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(-3.25, 0);
    shape.lineTo(3.25, 0);
    shape.lineTo(0, 1.0);
    shape.closePath();
    return shape;
  }, []);

  // Gold on bronze "CROQUET CLUB" plaque canvas texture
  const signTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 1024, 0);
      grad.addColorStop(0, '#1c1307');
      grad.addColorStop(0.5, '#3a2d18');
      grad.addColorStop(1, '#1c1307');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1024, 256);

      // Gold elegant border
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 14;
      ctx.strokeRect(20, 20, 984, 216);
      ctx.lineWidth = 4;
      ctx.strokeRect(34, 34, 956, 188);

      // Text shading for metallic 3D gold effect
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 4;
      ctx.shadowOffsetY = 4;

      // Font
      ctx.fillStyle = '#f6e297'; // Bright premium gold
      ctx.font = 'bold 105px "Times New Roman", Times, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('CROQUET CLUB', 512, 128);
    }
    const texture = new CanvasTexture(canvas);
    return texture;
  }, []);

  return (
    <group>
      {/* 1. Floor Slab */}
      <mesh position={[xCenter, 0.005, zCenter]} receiveShadow>
        <boxGeometry args={[buildingDepth - 0.05, 0.01, buildingWidth - 0.05]} />
        <meshStandardMaterial color="#ded7cb" roughness={0.8} />
      </mesh>

      {/* 2. Main Walls (Cream-white siding) */}
      {/* Back Wall (East, X = 27.5) */}
      <mesh position={[27.5, wallHeight / 2, zCenter]} castShadow receiveShadow>
        <boxGeometry args={[0.08, wallHeight, buildingWidth]} />
        <meshStandardMaterial color="#f0f0eb" roughness={0.85} />
      </mesh>

      {/* Side Walls */}
      {/* North Wall (Z = -8.0) */}
      <mesh position={[xCenter, wallHeight / 2, -8.0]} castShadow receiveShadow>
        <boxGeometry args={[buildingDepth, wallHeight, 0.08]} />
        <meshStandardMaterial color="#f0f0eb" roughness={0.85} />
      </mesh>
      {/* South Wall (Z = 8.0) */}
      <mesh position={[xCenter, wallHeight / 2, 8.0]} castShadow receiveShadow>
        <boxGeometry args={[buildingDepth, wallHeight, 0.08]} />
        <meshStandardMaterial color="#f0f0eb" roughness={0.85} />
      </mesh>

      {/* Front Walls (West, X = 21.0) with central door opening and large panoramic court-viewing windows */}
      {/* Left Front Siding Base (Z = -5.125, width = 5.75) */}
      <mesh position={[21.0, 0.3, -5.125]} castShadow receiveShadow>
        <boxGeometry args={[0.08, 0.6, 5.75]} />
        <meshStandardMaterial color="#f0f0eb" roughness={0.85} />
      </mesh>

      {/* Left Panoramic Window Frames & Glass */}
      <mesh position={[21.0, 0.62, -5.125]} castShadow>
        <boxGeometry args={[0.09, 0.04, 5.75]} />
        <meshStandardMaterial color="#2b2d2f" roughness={0.4} />
      </mesh>
      <mesh position={[21.0, 2.18, -5.125]} castShadow>
        <boxGeometry args={[0.09, 0.04, 5.75]} />
        <meshStandardMaterial color="#2b2d2f" roughness={0.4} />
      </mesh>
      <mesh position={[21.0, 1.4, -7.98]} castShadow>
        <boxGeometry args={[0.09, 1.52, 0.04]} />
        <meshStandardMaterial color="#2b2d2f" roughness={0.4} />
      </mesh>
      <mesh position={[21.0, 1.4, -2.27]} castShadow>
        <boxGeometry args={[0.09, 1.52, 0.04]} />
        <meshStandardMaterial color="#2b2d2f" roughness={0.4} />
      </mesh>
      <mesh position={[21.0, 1.4, -5.125]} castShadow>
        <boxGeometry args={[0.1, 1.52, 0.06]} />
        <meshStandardMaterial color="#2b2d2f" roughness={0.4} />
      </mesh>
      {/* Left Window Glass Panes (Semi-transparent & reflective) */}
      <mesh position={[21.01, 1.4, -6.55]} castShadow receiveShadow>
        <boxGeometry args={[0.02, 1.52, 2.75]} />
        <meshStandardMaterial 
          color="#a7c3d9" 
          transparent={true} 
          opacity={0.35} 
          roughness={0.05} 
          metalness={0.9} 
        />
      </mesh>
      <mesh position={[21.01, 1.4, -3.70]} castShadow receiveShadow>
        <boxGeometry args={[0.02, 1.52, 2.75]} />
        <meshStandardMaterial 
          color="#a7c3d9" 
          transparent={true} 
          opacity={0.35} 
          roughness={0.05} 
          metalness={0.9} 
        />
      </mesh>

      {/* Right Front Siding Base (Z = 5.125, width = 5.75) */}
      <mesh position={[21.0, 0.3, 5.125]} castShadow receiveShadow>
        <boxGeometry args={[0.08, 0.6, 5.75]} />
        <meshStandardMaterial color="#f0f0eb" roughness={0.85} />
      </mesh>

      {/* Right Panoramic Window Frames & Glass */}
      <mesh position={[21.0, 0.62, 5.125]} castShadow>
        <boxGeometry args={[0.09, 0.04, 5.75]} />
        <meshStandardMaterial color="#2b2d2f" roughness={0.4} />
      </mesh>
      <mesh position={[21.0, 2.18, 5.125]} castShadow>
        <boxGeometry args={[0.09, 0.04, 5.75]} />
        <meshStandardMaterial color="#2b2d2f" roughness={0.4} />
      </mesh>
      <mesh position={[21.0, 1.4, 2.27]} castShadow>
        <boxGeometry args={[0.09, 1.52, 0.04]} />
        <meshStandardMaterial color="#2b2d2f" roughness={0.4} />
      </mesh>
      <mesh position={[21.0, 1.4, 7.98]} castShadow>
        <boxGeometry args={[0.09, 1.52, 0.04]} />
        <meshStandardMaterial color="#2b2d2f" roughness={0.4} />
      </mesh>
      <mesh position={[21.0, 1.4, 5.125]} castShadow>
        <boxGeometry args={[0.1, 1.52, 0.06]} />
        <meshStandardMaterial color="#2b2d2f" roughness={0.4} />
      </mesh>
      {/* Right Window Glass Panes (Semi-transparent & reflective) */}
      <mesh position={[21.01, 1.4, 3.70]} castShadow receiveShadow>
        <boxGeometry args={[0.02, 1.52, 2.75]} />
        <meshStandardMaterial 
          color="#a7c3d9" 
          transparent={true} 
          opacity={0.35} 
          roughness={0.05} 
          metalness={0.9} 
        />
      </mesh>
      <mesh position={[21.01, 1.4, 6.55]} castShadow receiveShadow>
        <boxGeometry args={[0.02, 1.52, 2.75]} />
        <meshStandardMaterial 
          color="#a7c3d9" 
          transparent={true} 
          opacity={0.35} 
          roughness={0.05} 
          metalness={0.9} 
        />
      </mesh>
      {/* Header Wall Above Door */}
      <mesh position={[21.0, wallHeight - 0.3, zCenter]} castShadow receiveShadow>
        <boxGeometry args={[0.08, 0.6, buildingWidth]} />
        <meshStandardMaterial color="#f0f0eb" roughness={0.85} />
      </mesh>

      {/* 3. Gable End Triangular Walls */}
      {/* North Gable (Z = -8.0) */}
      <group position={[xCenter, wallHeight, -8.0]}>
        <mesh castShadow receiveShadow>
          <shapeGeometry args={[gableShape]} />
          <meshStandardMaterial color="#f0f0eb" roughness={0.85} side={DoubleSide} />
        </mesh>
      </group>
      {/* South Gable (Z = 8.0) */}
      <group position={[xCenter, wallHeight, 8.0]}>
        <mesh castShadow receiveShadow>
          <shapeGeometry args={[gableShape]} />
          <meshStandardMaterial color="#f0f0eb" roughness={0.85} side={DoubleSide} />
        </mesh>
      </group>

      {/* 4. Architectural White Trims and Corner Posts */}
      {/* Corner Posts */}
      <mesh position={[21.0, wallHeight / 2, -8.0]} castShadow>
        <boxGeometry args={[0.1, wallHeight, 0.1]} />
        <meshStandardMaterial color="#ffffff" roughness={0.5} />
      </mesh>
      <mesh position={[21.0, wallHeight / 2, 8.0]} castShadow>
        <boxGeometry args={[0.1, wallHeight, 0.1]} />
        <meshStandardMaterial color="#ffffff" roughness={0.5} />
      </mesh>
      <mesh position={[27.5, wallHeight / 2, -8.0]} castShadow>
        <boxGeometry args={[0.1, wallHeight, 0.1]} />
        <meshStandardMaterial color="#ffffff" roughness={0.5} />
      </mesh>
      <mesh position={[27.5, wallHeight / 2, 8.0]} castShadow>
        <boxGeometry args={[0.1, wallHeight, 0.1]} />
        <meshStandardMaterial color="#ffffff" roughness={0.5} />
      </mesh>
      {/* Top Frieze trim board */}
      <mesh position={[24.25, wallHeight - 0.05, -8.0]} castShadow>
        <boxGeometry args={[buildingDepth + 0.1, 0.1, 0.12]} />
        <meshStandardMaterial color="#ffffff" roughness={0.5} />
      </mesh>
      <mesh position={[24.25, wallHeight - 0.05, 8.0]} castShadow>
        <boxGeometry args={[buildingDepth + 0.1, 0.1, 0.12]} />
        <meshStandardMaterial color="#ffffff" roughness={0.5} />
      </mesh>
      <mesh position={[21.0, wallHeight - 0.05, zCenter]} castShadow>
        <boxGeometry args={[0.12, 0.1, buildingWidth + 0.1]} />
        <meshStandardMaterial color="#ffffff" roughness={0.5} />
      </mesh>
      <mesh position={[27.5, wallHeight - 0.05, zCenter]} castShadow>
        <boxGeometry args={[0.12, 0.1, buildingWidth + 0.1]} />
        <meshStandardMaterial color="#ffffff" roughness={0.5} />
      </mesh>

      {/* 5. Pitched Slate Roof (Charcoal slate roof) */}
      <mesh position={[22.475, 3.3, zCenter]} rotation={[0, 0, 0.274]} castShadow receiveShadow>
        <boxGeometry args={[3.69, 0.06, buildingWidth + 0.6]} />
        <meshStandardMaterial color="#2c3539" roughness={0.7} />
      </mesh>
      <mesh position={[26.025, 3.3, zCenter]} rotation={[0, 0, -0.274]} castShadow receiveShadow>
        <boxGeometry args={[3.69, 0.06, buildingWidth + 0.6]} />
        <meshStandardMaterial color="#2c3539" roughness={0.7} />
      </mesh>
      {/* Ridge Cap beam running along the peak */}
      <mesh position={[xCenter, ridgeHeight + 0.04, zCenter]} castShadow>
        <boxGeometry args={[0.1, 0.08, buildingWidth + 0.64]} />
        <meshStandardMaterial color="#1e2326" roughness={0.5} />
      </mesh>

      {/* 6. Glazed Sliding Double Doors (facing West, X = 21) */}
      <group position={[21.0, 0, zCenter]}>
        {/* Main door frame */}
        <mesh position={[0, 1.1, -2.25]} castShadow>
          <boxGeometry args={[0.06, 2.2, 0.06]} />
          <meshStandardMaterial color="#2b2d2f" roughness={0.4} />
        </mesh>
        <mesh position={[0, 1.1, 2.25]} castShadow>
          <boxGeometry args={[0.06, 2.2, 0.06]} />
          <meshStandardMaterial color="#2b2d2f" roughness={0.4} />
        </mesh>
        <mesh position={[0, 2.18, 0]} castShadow>
          <boxGeometry args={[0.06, 0.06, 4.5]} />
          <meshStandardMaterial color="#2b2d2f" roughness={0.4} />
        </mesh>
        <mesh position={[0, 1.1, 0]} castShadow>
          <boxGeometry args={[0.04, 2.2, 0.04]} />
          <meshStandardMaterial color="#2b2d2f" roughness={0.4} />
        </mesh>

        {/* Sliding Glass Panel Left */}
        <mesh position={[0.01, 1.1, -1.125]} castShadow receiveShadow>
          <boxGeometry args={[0.02, 2.14, 2.18]} />
          <meshStandardMaterial 
            color="#a7c3d9" 
            transparent={true} 
            opacity={0.35} 
            roughness={0.05} 
            metalness={0.9} 
          />
        </mesh>
        <mesh position={[0.01, 1.1, -2.18]} castShadow>
          <boxGeometry args={[0.03, 2.14, 0.03]} />
          <meshStandardMaterial color="#2b2d2f" roughness={0.4} />
        </mesh>
        <mesh position={[0.01, 1.1, -0.05]} castShadow>
          <boxGeometry args={[0.03, 2.14, 0.03]} />
          <meshStandardMaterial color="#2b2d2f" roughness={0.4} />
        </mesh>

        {/* Sliding Glass Panel Right */}
        <mesh position={[-0.01, 1.1, 1.125]} castShadow receiveShadow>
          <boxGeometry args={[0.02, 2.14, 2.18]} />
          <meshStandardMaterial 
            color="#a7c3d9" 
            transparent={true} 
            opacity={0.35} 
            roughness={0.05} 
            metalness={0.9} 
          />
        </mesh>
        <mesh position={[-0.01, 1.1, 0.05]} castShadow>
          <boxGeometry args={[0.03, 2.14, 0.03]} />
          <meshStandardMaterial color="#2b2d2f" roughness={0.4} />
        </mesh>
        <mesh position={[-0.01, 1.1, 2.18]} castShadow>
          <boxGeometry args={[0.03, 2.14, 0.03]} />
          <meshStandardMaterial color="#2b2d2f" roughness={0.4} />
        </mesh>
      </group>

      {/* 7. Side Windows with Cozy Warm Light Glow */}
      {/* North Side Window (Z = -8.0, X = 24.25, Y = 1.5) */}
      <group position={[24.25, 1.5, -8.0]}>
        <mesh position={[0, 0, 0]} castShadow>
          <boxGeometry args={[1.8, 1.2, 0.09]} />
          <meshStandardMaterial color="#2b2d2f" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0, -0.01]}>
          <boxGeometry args={[1.7, 1.1, 0.06]} />
          <meshStandardMaterial 
            color="#ffe699" 
            emissive="#ffcc66" 
            emissiveIntensity={0.25}
            roughness={0.3} 
          />
        </mesh>
      </group>
      {/* South Side Window (Z = 8.0, X = 24.25, Y = 1.5) */}
      <group position={[24.25, 1.5, 8.0]}>
        <mesh position={[0, 0, 0]} castShadow>
          <boxGeometry args={[1.8, 1.2, 0.09]} />
          <meshStandardMaterial color="#2b2d2f" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0, 0.01]}>
          <boxGeometry args={[1.7, 1.1, 0.06]} />
          <meshStandardMaterial 
            color="#ffe699" 
            emissive="#ffcc66" 
            emissiveIntensity={0.25}
            roughness={0.3} 
          />
        </mesh>
      </group>

      {/* 8. Gold and Bronze "CROQUET CLUB" Logo Plaque Sign */}
      <group position={[20.94, 2.45, zCenter]}>
        <mesh position={[0, 0, 0]} castShadow>
          <boxGeometry args={[0.04, 0.45, 3.0]} />
          <meshStandardMaterial color="#2c1e0e" roughness={0.3} metalness={0.8} />
        </mesh>
        <mesh position={[-0.005, 0, 0]}>
          <boxGeometry args={[0.042, 0.41, 2.96]} />
          <meshStandardMaterial map={signTexture} roughness={0.2} metalness={0.8} />
        </mesh>
      </group>
    </group>
  );
}

// 9.5. Interactive Closeable Clubhouse Gate
interface ClubhouseGateProps {
  position: [number, number, number];
}

export function ClubhouseGate({ position }: ClubhouseGateProps) {
  const [isOpen, setIsOpen] = useState(false);
  const targetRotation = isOpen ? Math.PI / 2 : 0; // Swing open outwards towards X > 18 (steps)
  const currentRotationLeft = useRef(0);
  const currentRotationRight = useRef(0);
  const leftGateRef = useRef<THREE.Group>(null);
  const rightGateRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    const speed = 6.0; // Quick smooth swing rotation speed
    const step = speed * delta;
    
    // Smooth interpolation for left gate (rotates by -angle when open)
    const targetLeft = -targetRotation;
    const diffLeft = targetLeft - currentRotationLeft.current;
    if (Math.abs(diffLeft) > 0.001) {
      currentRotationLeft.current += Math.sign(diffLeft) * Math.min(Math.abs(diffLeft), step);
      if (leftGateRef.current) {
        leftGateRef.current.rotation.y = currentRotationLeft.current;
      }
    }

    // Smooth interpolation for right gate (rotates by +angle when open)
    const targetRight = targetRotation;
    const diffRight = targetRight - currentRotationRight.current;
    if (Math.abs(diffRight) > 0.001) {
      currentRotationRight.current += Math.sign(diffRight) * Math.min(Math.abs(diffRight), step);
      if (rightGateRef.current) {
        rightGateRef.current.rotation.y = currentRotationRight.current;
      }
    }
  });

  const gateWidth = 1.15; // 2.3 yards total gate width
  const picketHeight = 0.75;
  const picketWidth = 0.08;
  const picketThickness = 0.02;
  const railHeight1 = 0.22;
  const railHeight2 = 0.55;
  const railWidth = 0.04;
  const railThickness = 0.025;

  const numGatePickets = 5;

  return (
    <group position={position}>
      {/* Left Gate Post */}
      <mesh position={[0, 0.45, -gateWidth - 0.06]} castShadow receiveShadow>
        <boxGeometry args={[0.1, 0.9, 0.1]} />
        <meshStandardMaterial color="#ffffff" roughness={0.5} />
      </mesh>
      {/* Right Gate Post */}
      <mesh position={[0, 0.45, gateWidth + 0.06]} castShadow receiveShadow>
        <boxGeometry args={[0.1, 0.9, 0.1]} />
        <meshStandardMaterial color="#ffffff" roughness={0.5} />
      </mesh>

      {/* Left Gate Wing (Swings from Z = -gateWidth to Z = 0) */}
      <group 
        ref={leftGateRef} 
        position={[0, 0, -gateWidth]} 
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
      >
        <group position={[0, 0, gateWidth / 2]}>
          {/* Rails */}
          <mesh position={[0, railHeight1, 0]} castShadow receiveShadow>
            <boxGeometry args={[railThickness, railWidth, gateWidth]} />
            <meshStandardMaterial color="#ffffff" roughness={0.5} />
          </mesh>
          <mesh position={[0, railHeight2, 0]} castShadow receiveShadow>
            <boxGeometry args={[railThickness, railWidth, gateWidth]} />
            <meshStandardMaterial color="#ffffff" roughness={0.5} />
          </mesh>

          {/* Pickets */}
          {Array.from({ length: numGatePickets }).map((_, idx) => {
            const z = -gateWidth / 2 + (idx / (numGatePickets - 1)) * gateWidth;
            return (
              <mesh key={`lpicket-${idx}`} position={[0, picketHeight / 2, z]} castShadow receiveShadow>
                <boxGeometry args={[picketThickness, picketHeight, picketWidth]} />
                <meshStandardMaterial color="#ffffff" roughness={0.5} />
              </mesh>
            );
          })}
        </group>
      </group>

      {/* Right Gate Wing (Swings from Z = gateWidth to Z = 0) */}
      <group 
        ref={rightGateRef} 
        position={[0, 0, gateWidth]} 
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
      >
        <group position={[0, 0, -gateWidth / 2]}>
          {/* Rails */}
          <mesh position={[0, railHeight1, 0]} castShadow receiveShadow>
            <boxGeometry args={[railThickness, railWidth, gateWidth]} />
            <meshStandardMaterial color="#ffffff" roughness={0.5} />
          </mesh>
          <mesh position={[0, railHeight2, 0]} castShadow receiveShadow>
            <boxGeometry args={[railThickness, railWidth, gateWidth]} />
            <meshStandardMaterial color="#ffffff" roughness={0.5} />
          </mesh>

          {/* Pickets */}
          {Array.from({ length: numGatePickets }).map((_, idx) => {
            const z = -gateWidth / 2 + (idx / (numGatePickets - 1)) * gateWidth;
            return (
              <mesh key={`rpicket-${idx}`} position={[0, picketHeight / 2, z]} castShadow receiveShadow>
                <boxGeometry args={[picketThickness, picketHeight, picketWidth]} />
                <meshStandardMaterial color="#ffffff" roughness={0.5} />
              </mesh>
            );
          })}
        </group>
      </group>
    </group>
  );
}

// 10. Consolidated surroundings component
export default function ParkSurroundings() {
  // Bounding box defined by the official court dimensions of 35 standard yards by 28 standard yards
  const courtLength = 35; // yards (North-South)
  const courtWidth = 28;  // yards (East-West)
  const outerMargin = 4.0; // Consistent, uniform outer margin for spectator seating

  // Corner coordinates for the enclosing rectangular loop
  const boundaryX = courtWidth / 2 + outerMargin;   // 18.0 yards
  const boundaryZ = courtLength / 2 + outerMargin;  // 21.5 yards

  return (
    <group>
      {/* White Picket Fence enclosing the croquet court in a continuous, closed rectangular loop */}
      {/* North: NW corner to NE corner */}
      <FenceSegment start={[-boundaryX, -boundaryZ]} end={[boundaryX, -boundaryZ]} />
      {/* East: split to place closeable double gate at Z = 0 (clubhouse viewing deck steps) */}
      <FenceSegment start={[boundaryX, -boundaryZ]} end={[boundaryX, -1.21]} />
      <ClubhouseGate position={[boundaryX, 0, 0]} />
      <FenceSegment start={[boundaryX, 1.21]} end={[boundaryX, boundaryZ]} />
      {/* South: SE corner to SW corner */}
      <FenceSegment start={[boundaryX, boundaryZ]} end={[-boundaryX, boundaryZ]} />
      {/* West: SW corner to NW corner */}
      <FenceSegment start={[-boundaryX, boundaryZ]} end={[-boundaryX, -boundaryZ]} />

      {/* Shaded Benches placed in the spectator corridor, facing the court */}
      {/* Sideline Seats (West) */}
      <ShadedBench position={[-16, 0, -6]} rotation={[0, Math.PI / 2, 0]} />
      <ShadedBench position={[-16, 0, 6]} rotation={[0, Math.PI / 2, 0]} />
      
      {/* Sideline Seats (East) */}
      <ShadedBench position={[16, 0, -6]} rotation={[0, -Math.PI / 2, 0]} />
      <ShadedBench position={[16, 0, 6]} rotation={[0, -Math.PI / 2, 0]} />

      {/* Endline Seats (North) */}
      <ShadedBench position={[-4, 0, -19.5]} rotation={[0, 0, 0]} />
      <ShadedBench position={[4, 0, -19.5]} rotation={[0, 0, 0]} />

      {/* Endline Seats (South) */}
      <ShadedBench position={[-4, 0, 19.5]} rotation={[0, Math.PI, 0]} />
      <ShadedBench position={[4, 0, 19.5]} rotation={[0, Math.PI, 0]} />

      {/* 8-Foot Hedge running outside the West (Blue/Red corner) fence */}
      <Hedge start={[-20, -22.5]} end={[-20, 22.5]} />

      {/* 3D Spectator Clubhouse & Viewing Deck (Outside the East fence line) */}
      <ClubhouseDeck />
      <Clubhouse />

      {/* Scattered Park Trees (Placed outside the picket fence) */}
      {/* North / South Background Trees */}
      <Tree position={[-12, 0, -26]} />
      <Tree position={[0, 0, -27]} />
      <Tree position={[12, 0, -26]} />
      <Tree position={[-10, 0, 27]} />
      <Tree position={[10, 0, 27]} />
      
      {/* East Sideline Background Trees (Framing the Clubhouse) */}
      <Tree position={[23, 0, -15]} />
      {/* Tree at [25, 0, 0] removed to make room for Clubhouse */}
      <Tree position={[23, 0, 15]} />

      {/* Organic Bushes blending corners and bench areas */}
      <Bush position={[-19, 0, -22.5]} scale={1.2} />
      <Bush position={[19, 0, -22.5]} scale={1.1} />
      <Bush position={[19, 0, 22.5]} scale={1.2} />
      <Bush position={[-19, 0, 22.5]} scale={1.0} />
      {/* Two inner-fence shrubs removed to leave the lawn pristine */}
      <Bush position={[-22.5, 0, -5]} scale={1.3} />
      {/* Bushes shifted out to frame the Clubhouse corners beautifully */}
      <Bush position={[20, 0, -11]} scale={1.1} />
      <Bush position={[22, 0, 11]} scale={1.2} />
      <Bush position={[-23, 0, 10]} scale={1.0} />
    </group>
  );
}
