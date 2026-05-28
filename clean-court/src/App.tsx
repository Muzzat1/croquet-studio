/* eslint-disable react-hooks/immutability */
import { useState, useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useTexture, Line, Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import CourtSurface from './components/CourtSurface';
import ParkSurroundings from './components/ParkSurroundings';
import QuadwayHoop from './components/QuadwayHoop';
import CroquetBall from './components/CroquetBall';
import CartoonPlayer from './components/CartoonPlayer';

const BOUNDARY_X = 18 - 0.133375;  // 17.866625
const BOUNDARY_Z = 21.5 - 0.133375; // 21.366625

// 12 Hoop Leg Positions (Offset from 6 hoops by +/- 0.1875 yards along the X axis)
const HOOP_LEGS = [
  // Hoop 1: [-7, 10.5]
  { x: -7 - 0.1875, z: 10.5 },
  { x: -7 + 0.1875, z: 10.5 },
  // Hoop 2: [-7, -10.5]
  { x: -7 - 0.1875, z: -10.5 },
  { x: -7 + 0.1875, z: -10.5 },
  // Hoop 3: [7, -10.5]
  { x: 7 - 0.1875, z: -10.5 },
  { x: 7 + 0.1875, z: -10.5 },
  // Hoop 4: [7, 10.5]
  { x: 7 - 0.1875, z: 10.5 },
  { x: 7 + 0.1875, z: 10.5 },
  // Hoop 5: [0, -7]
  { x: 0 - 0.1875, z: -7 },
  { x: 0 + 0.1875, z: -7 },
  // Hoop 6: [0, 7]
  { x: 0 - 0.1875, z: 7 },
  { x: 0 + 0.1875, z: 7 }
];

interface PhysicsBallState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  isRolling: boolean;
}

function PhysicsManager({
  physicsBalls,
  meshRefs,
  onPositionChange,
  selectedBall,
  selectedRingRef
}: {
  physicsBalls: React.MutableRefObject<Record<string, PhysicsBallState>>;
  meshRefs: React.MutableRefObject<Record<string, React.RefObject<THREE.Object3D | null>>>;
  onPositionChange: (color: 'blue' | 'red' | 'black' | 'yellow', x: number, z: number) => void;
  selectedBall: 'blue' | 'red' | 'black' | 'yellow' | null;
  selectedRingRef: React.RefObject<THREE.Mesh | null>;
}) {

  const outOfBoundsCrossing = useRef<Record<string, { x: number; z: number } | null>>({
    blue: null,
    red: null,
    black: null,
    yellow: null
  });

  useFrame((_, delta) => {
    // Limit delta time steps to avoid tunnel-through behaviors during frame rate stutters
    const dt = Math.min(delta, 0.03);
    const SUB_STEPS = 10;
    const subDt = dt / SUB_STEPS;

    const balls = physicsBalls.current;
    const refs = meshRefs.current;
    const colors = ['blue', 'red', 'black', 'yellow'] as const;

    for (let step = 0; step < SUB_STEPS; step++) {
      // 1. Process individual movement, lawn friction, obstacle/perimeter collisions
      colors.forEach(c => {
        const b = balls[c];
        if (b.vx !== 0 || b.vz !== 0 || b.isRolling) {
          const prevX = b.x;
          const prevZ = b.z;

          b.x += b.vx * subDt;
          b.z += b.vz * subDt;

          // Track if the ball is currently outside the court boundaries (X = +/- 14, Z = +/- 17.5)
          const isInside = Math.abs(b.x) <= 14 && Math.abs(b.z) <= 17.5;
          if (isInside) {
            // If the ball is inside the court, it has not left yet (or has re-entered), so clear crossing point
            outOfBoundsCrossing.current[c] = null;
          } else {
            // The ball is outside the court!
            if (!outOfBoundsCrossing.current[c]) {
              const wasInside = Math.abs(prevX) <= 14 && Math.abs(prevZ) <= 17.5;
              if (wasInside) {
                // Determine exact crossing point using linear interpolation
                let crossX = b.x;
                let crossZ = b.z;
                if (Math.abs(b.x) > 14 && Math.abs(b.z) <= 17.5) {
                  const boundaryX = b.x > 0 ? 14 : -14;
                  const dx = b.x - prevX;
                  const t = dx !== 0 ? (boundaryX - prevX) / dx : 0;
                  crossX = boundaryX;
                  crossZ = prevZ + t * (b.z - prevZ);
                } else if (Math.abs(b.z) > 17.5 && Math.abs(b.x) <= 14) {
                  const boundaryZ = b.z > 0 ? 17.5 : -17.5;
                  const dz = b.z - prevZ;
                  const t = dz !== 0 ? (boundaryZ - prevZ) / dz : 0;
                  crossX = prevX + t * (b.x - prevX);
                  crossZ = boundaryZ;
                } else if (Math.abs(b.x) > 14 && Math.abs(b.z) > 17.5) {
                  // Crossed near the corner, project to closest boundary
                  const boundaryX = b.x > 0 ? 14 : -14;
                  const boundaryZ = b.z > 0 ? 17.5 : -17.5;
                  const tX = (b.x - prevX) !== 0 ? (boundaryX - prevX) / (b.x - prevX) : 1;
                  const tZ = (b.z - prevZ) !== 0 ? (boundaryZ - prevZ) / (b.z - prevZ) : 1;
                  if (tX < tZ) {
                    crossX = boundaryX;
                    crossZ = prevZ + tX * (b.z - prevZ);
                  } else {
                    crossX = prevX + tZ * (b.x - prevX);
                    crossZ = boundaryZ;
                  }
                }
                outOfBoundsCrossing.current[c] = { x: crossX, z: crossZ };
              } else {
                // Ball started outside and moved further outside: project current position to closest boundary
                let crossX = b.x;
                let crossZ = b.z;
                if (Math.abs(b.x) - 14 > Math.abs(b.z) - 17.5) {
                  crossX = b.x > 0 ? 14 : -14;
                  crossZ = Math.min(Math.max(b.z, -17.5), 17.5);
                } else {
                  crossX = Math.min(Math.max(b.x, -14), 14);
                  crossZ = b.z > 0 ? 17.5 : -17.5;
                }
                outOfBoundsCrossing.current[c] = { x: crossX, z: crossZ };
              }
            }
          }

          // Apply turf grass friction deceleration (exponential decay)
          b.vx *= Math.exp(-0.85 * subDt);
          b.vz *= Math.exp(-0.85 * subDt);

          // --- PEG COLLISION ---
          const dxPeg = b.x - 0;
          const dzPeg = b.z - 0;
          const distPeg = Math.sqrt(dxPeg * dxPeg + dzPeg * dzPeg);
          const minPegDist = 0.208375; // 0.133375 (ball radius) + 0.075 (peg radius)
          if (distPeg < minPegDist && distPeg > 0.001) {
            const nx = dxPeg / distPeg;
            const nz = dzPeg / distPeg;
            const velAlongNormal = b.vx * nx + b.vz * nz;
            if (velAlongNormal < 0) {
              const j = -(1 + 0.5) * velAlongNormal;
              b.vx += j * nx;
              b.vz += j * nz;
              b.isRolling = true;
            }
            b.x = nx * minPegDist;
            b.z = nz * minPegDist;
          }

          // --- HOOP RUNNING GROOVE & CENTERING ASSIST ---
          // In real croquet, the grass under a hoop becomes worn into a subtle "groove" 
          // that naturally guides balls straight through. If the ball enters the mouth 
          // of a hoop, we apply a gentle alignment assist to help it run the hoop.
          const HOOPS = [
            { x: -7, z: 10.5 },
            { x: -7, z: -10.5 },
            { x: 7, z: -10.5 },
            { x: 7, z: 10.5 },
            { x: 0, z: -7 },
            { x: 0, z: 7 }
          ];

          HOOPS.forEach(hoop => {
            const dx = b.x - hoop.x;
            const dz = b.z - hoop.z;
            // If the ball is between the hoop legs (X-offset < 0.175 yards) 
            // and close to passing through the hoop opening (Z-offset within 0.35 yards)
            if (Math.abs(dx) < 0.175 && Math.abs(dz) < 0.35) {
              if (Math.abs(b.vz) > 0.05) {
                // Gently guide X position toward the exact center line (the groove)
                b.x += (hoop.x - b.x) * 0.15 * subDt * 60; // 15% centering force per frame
                // Softly damp lateral X velocity to allow a smooth slide rather than a ricochet
                b.vx *= Math.exp(-2.5 * subDt);
              }
            }
          });

          // --- HOOP LEGS COLLISION ---
          const minLegDist = 0.168375; // 0.133375 (ball radius) + 0.035 (leg radius)
          HOOP_LEGS.forEach(leg => {
            const dxLeg = b.x - leg.x;
            const dzLeg = b.z - leg.z;
            const distLeg = Math.sqrt(dxLeg * dxLeg + dzLeg * dzLeg);
            if (distLeg < minLegDist && distLeg > 0.001) {
              const nx = dxLeg / distLeg;
              const nz = dzLeg / distLeg;
              const velAlongNormal = b.vx * nx + b.vz * nz;
              if (velAlongNormal < 0) {
                // Reduced restitution from 0.4 to 0.02 (highly absorbing steel legs)
                // This mimics the sliding physical reaction of hitting a heavy steel hoop leg at an angle.
                const j = -(1 + 0.02) * velAlongNormal;
                b.vx += j * nx;
                b.vz += j * nz;
                b.isRolling = true;
              }
              b.x = leg.x + nx * minLegDist;
              b.z = leg.z + nz * minLegDist;
            }
          });

          const speed = Math.sqrt(b.vx * b.vx + b.vz * b.vz);

          // Under 0.045 yards/sec, we come to a clean stop and synchronize to React state
          if (speed < 0.045) {
            b.vx = 0;
            b.vz = 0;
            b.isRolling = false;

            // Place back on the outside of the boundary line where it left the court
            const crossing = outOfBoundsCrossing.current[c];
            if (crossing) {
              const radius = 0.133375;
              let placedX = crossing.x;
              let placedZ = crossing.z;

              // Determine which boundary (X=14, X=-14, Z=17.5, Z=-17.5) the crossing point is closest to
              const distToRight = Math.abs(crossing.x - 14);
              const distToLeft = Math.abs(crossing.x - (-14));
              const distToTop = Math.abs(crossing.z - 17.5);
              const distToBottom = Math.abs(crossing.z - (-17.5));
              const minDist = Math.min(distToRight, distToLeft, distToTop, distToBottom);

              if (minDist === distToRight) {
                placedX = 14 + radius;
              } else if (minDist === distToLeft) {
                placedX = -14 - radius;
              } else if (minDist === distToTop) {
                placedZ = 17.5 + radius;
              } else if (minDist === distToBottom) {
                placedZ = -17.5 - radius;
              }

              b.x = placedX;
              b.z = placedZ;
              outOfBoundsCrossing.current[c] = null;
            }

            onPositionChange(c, b.x, b.z);
          }

          // Perimeter fence collisions (elastic reflection with 95% energy loss - 5% bounce)
          if (b.x > BOUNDARY_X) {
            b.x = BOUNDARY_X;
            b.vx = -Math.abs(b.vx) * 0.05;
          } else if (b.x < -BOUNDARY_X) {
            b.x = -BOUNDARY_X;
            b.vx = Math.abs(b.vx) * 0.05;
          }

          if (b.z > BOUNDARY_Z) {
            b.z = BOUNDARY_Z;
            b.vz = -Math.abs(b.vz) * 0.05;
          } else if (b.z < -BOUNDARY_Z) {
            b.z = -BOUNDARY_Z;
            b.vz = Math.abs(b.vz) * 0.05;
          }

          // Apply immediate visual update directly to WebGL mesh
          const mesh = refs[c].current;
          if (mesh) {
            mesh.position.x = b.x;
            mesh.position.z = b.z;
          }

          // If this rolling ball is the selected ball, also update the selection ring position
          if (c === selectedBall && selectedRingRef.current) {
            selectedRingRef.current.position.x = b.x;
            selectedRingRef.current.position.z = b.z;
          }
        } else {
          // Reset out-of-bounds crossing tracker if the ball is completely stationary (or dragged)
          outOfBoundsCrossing.current[c] = null;
        }
      });

      // 2. Process elastic ball-to-ball collisions with coordinate overlap resolutions
      for (let i = 0; i < colors.length; i++) {
        for (let j = i + 1; j < colors.length; j++) {
          const cA = colors[i];
          const cB = colors[j];
          const bA = balls[cA];
          const bB = balls[cB];

          const dx = bA.x - bB.x;
          const dz = bA.z - bB.z;
          const distSq = dx * dx + dz * dz;
          const minContactDist = 0.26675; // 2 * 0.133375
          const minContactDistSq = minContactDist * minContactDist;

          if (distSq < minContactDistSq) {
            const dist = Math.sqrt(distSq);
            if (dist > 0.001) {
              const relVX = bA.vx - bB.vx;
              const relVZ = bA.vz - bB.vz;
              const dotProduct = dx * relVX + dz * relVZ;

              if (dotProduct < 0) {
                const nx = dx / dist;
                const nz = dz / dist;
                const v_dot_n = relVX * nx + relVZ * nz;
                
                const restitution = 0.92;
                const j_impulse = (-(1 + restitution) * v_dot_n) / 2;

                bA.vx += j_impulse * nx;
                bA.vz += j_impulse * nz;
                bB.vx -= j_impulse * nx;
                bB.vz -= j_impulse * nz;
              }

              const overlap = minContactDist - dist;
              const nx_pos = dx / dist;
              const nz_pos = dz / dist;
              bA.x += nx_pos * overlap / 2;
              bA.z += nz_pos * overlap / 2;
              bB.x -= nx_pos * overlap / 2;
              bB.z -= nz_pos * overlap / 2;

              bA.isRolling = true;
              bB.isRolling = true;

              // Instantly sync visual WebGL meshes
              const meshA = refs[cA].current;
              if (meshA) {
                meshA.position.x = bA.x;
                meshA.position.z = bA.z;
              }
              const meshB = refs[cB].current;
              if (meshB) {
                meshB.position.x = bB.x;
                meshB.position.z = bB.z;
              }

              // If either bumped ball is the selected ball, also update the selection ring position
              if (cA === selectedBall && selectedRingRef.current) {
                selectedRingRef.current.position.x = bA.x;
                selectedRingRef.current.position.z = bA.z;
              } else if (cB === selectedBall && selectedRingRef.current) {
                selectedRingRef.current.position.x = bB.x;
                selectedRingRef.current.position.z = bB.z;
              }
            }
          }
        }
      }
    }
  });

  return null;
}

function PanoramaBackground() {
  const baseTexture = useTexture('/coastal_panorama.jpg');
  
  const texture = useMemo(() => {
    const img = baseTexture.image as HTMLImageElement;
    if (!img || !img.width) return baseTexture;

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return baseTexture;

    // Draw the original photograph
    ctx.drawImage(img, 0, 0);

    // Create a smooth horizontal blend region to stitch the seam where U=0 meets U=1
    const blendWidth = Math.floor(img.width * 0.15); // Blend over 15% of the total texture width
    const stripCanvas = document.createElement('canvas');
    stripCanvas.width = blendWidth;
    stripCanvas.height = img.height;
    const stripCtx = stripCanvas.getContext('2d');
    
    if (stripCtx) {
      // 1. Copy a strip of the left edge [0, blendWidth]
      stripCtx.drawImage(img, 0, 0, blendWidth, img.height, 0, 0, blendWidth, img.height);

      // 2. Apply a linear opacity gradient (0% opacity on the left, 100% opacity on the right)
      const grad = stripCtx.createLinearGradient(0, 0, blendWidth, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,1)');

      stripCtx.globalCompositeOperation = 'destination-in';
      stripCtx.fillStyle = grad;
      stripCtx.fillRect(0, 0, blendWidth, img.height);

      // 3. Draw the masked strip on the right edge [width - blendWidth, width]
      ctx.drawImage(stripCanvas, img.width - blendWidth, 0);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [baseTexture]);

  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ camera }) => {
    if (meshRef.current) {
      // Offset the background sphere slightly downward to align the aerial horizon naturally with the lawn edge
      meshRef.current.position.set(
        camera.position.x,
        camera.position.y - 120,
        camera.position.z
      );
    }
  });

  return (
    <mesh ref={meshRef} rotation={[0, -Math.PI / 3, 0]} scale={[-1, 1, 1]}>
      <sphereGeometry args={[1000, 60, 40]} />
      <meshBasicMaterial map={texture} side={THREE.BackSide} toneMapped={false} fog={false} />
    </mesh>
  );
}

// Custom Camera Controller inside the Canvas to handle programmatically updating OrbitControls & camera positions
// Custom Camera Controller inside the Canvas to handle programmatically updating OrbitControls & camera positions
interface CameraControllerProps {
  resetCounter: number;
  selectedBall: 'blue' | 'red' | 'black' | 'yellow' | null;
  balls: Record<string, { x: number; z: number }>;
}

function CameraController({ resetCounter, selectedBall, balls }: CameraControllerProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const threeState = useThree() as any;
  const camera = threeState.camera;
  const controls = threeState.controls;
  const lastReset = useRef(0);

  // Smooth cinematic camera transition targets
  const targetPosition = useRef<THREE.Vector3 | null>(null);
  const targetTarget = useRef<THREE.Vector3 | null>(null);
  const targetFov = useRef<number | null>(null);

  useEffect(() => {
    if (resetCounter > 0 && resetCounter !== lastReset.current) {
      lastReset.current = resetCounter;
      
      // Smoothly transition to Preset 0 coordinates
      targetPosition.current = new THREE.Vector3(41.79, 7.23, 24.46);
      targetFov.current = 15.0;
      if (controls) {
        targetTarget.current = new THREE.Vector3(-3.45, 1.52, 10.27);
      }
    }
  }, [resetCounter, camera, controls]);

  useFrame((_, delta) => {
    // Limit delta time steps to prevent huge jumps during frame hiccups
    const dt = Math.min(delta, 0.1);
    const lerpSpeed = 2.1; // Speed multiplier for smooth camera gliding (halved for a more cinematic, slower pace)
    const step = lerpSpeed * dt;

    let needsUpdate = false;

    if (targetPosition.current) {
      // Spherical orbital sweep to pan around the court beautifully
      const r_curr = Math.max(camera.position.length(), 0.1);
      const theta_curr = Math.acos(camera.position.y / r_curr);
      const phi_curr = Math.atan2(camera.position.z, camera.position.x);

      const r_targ = Math.max(targetPosition.current.length(), 0.1);
      const theta_targ = Math.acos(targetPosition.current.y / r_targ);
      let phi_targ = Math.atan2(targetPosition.current.z, targetPosition.current.x);

      // Interpolate along the shortest path on the azimuthal circle
      let diff = phi_targ - phi_curr;
      while (diff < -Math.PI) { diff += 2 * Math.PI; phi_targ += 2 * Math.PI; }
      while (diff > Math.PI) { diff -= 2 * Math.PI; phi_targ -= 2 * Math.PI; }

      // Adjust transition speed depending on the size of the azimuthal arc sweep
      const sweepSpeedFactor = Math.abs(diff) > 2.0 ? 0.72 : 1.0;
      const adaptiveStep = step * sweepSpeedFactor;

      const r_next = THREE.MathUtils.lerp(r_curr, r_targ, adaptiveStep);
      const theta_next = THREE.MathUtils.lerp(theta_curr, theta_targ, adaptiveStep);
      const phi_next = THREE.MathUtils.lerp(phi_curr, phi_targ, adaptiveStep);

      camera.position.x = r_next * Math.sin(theta_next) * Math.cos(phi_next);
      camera.position.y = r_next * Math.cos(theta_next);
      camera.position.z = r_next * Math.sin(theta_next) * Math.sin(phi_next);

      if (camera.position.distanceTo(targetPosition.current) < 0.05) {
        camera.position.copy(targetPosition.current);
        targetPosition.current = null;
      }
      needsUpdate = true;
    }

    if (targetTarget.current && controls) {
      controls.target.lerp(targetTarget.current, step);
      if (controls.target.distanceTo(targetTarget.current) < 0.01) {
        controls.target.copy(targetTarget.current);
        targetTarget.current = null;
      }
      needsUpdate = true;
    }

    if (targetFov.current) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov.current, step);
      camera.updateProjectionMatrix();
      if (Math.abs(camera.fov - targetFov.current) < 0.1) {
        camera.fov = targetFov.current;
        targetFov.current = null;
      }
    }

    if (controls && (needsUpdate || targetPosition.current || targetTarget.current)) {
      controls.update();
    }

    if (controls) {
      // Prevent focus target from dipping below ground level
      if (controls.target.y < 0.0) {
        controls.target.y = 0.0;
        controls.update();
      }
      // Guarantee camera altitude never drops below ground level
      if (camera.position.y < 0.1) {
        camera.position.y = 0.1;
        camera.updateProjectionMatrix();
      }
    }
  });

  // Listen for 'c' to log and custom keys (0-9, N, W, E, S, O) to snap to camera views
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'c') {
        const camPos = camera.position;
        const targetPos = controls ? (controls as unknown as { target: THREE.Vector3 }).target : new THREE.Vector3();
        console.log(
          `%c 📷 CAMERA ANGLE CAPTURED %c\n` +
          `%c  Position %c: [${camPos.x.toFixed(4)}, ${camPos.y.toFixed(4)}, ${camPos.z.toFixed(4)}]\n` +
          `%c  Target   %c: [${targetPos.x.toFixed(4)}, ${targetPos.y.toFixed(4)}, ${targetPos.z.toFixed(4)}]\n` +
          `%c  FOV      %c: ${camera.fov.toFixed(1)}°`,
          'background: #1e3c2f; color: #ffe680; font-weight: bold; padding: 4px 8px; border-radius: 4px; border-left: 3px solid #d4af37;',
          '',
          'color: #ffe680; font-weight: bold;', 'color: #38bdf8;',
          'color: #ffe680; font-weight: bold;', 'color: #38bdf8;',
          'color: #ffe680; font-weight: bold;', 'color: #38bdf8;'
        );
        return;
      }

      // Smooth zoom in or out 20% per keypress (+/-)
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        const currentFov = targetFov.current ?? camera.fov;
        targetFov.current = Math.max(5.0, currentFov * 0.8);
        return;
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        const currentFov = targetFov.current ?? camera.fov;
        targetFov.current = Math.min(75.0, currentFov * 1.25);
        return;
      }

      // Snapping to custom camera views (0-6, N, W, E, S, O)
      const numKey = e.key;
      if (['0', '1', '2', '3', '4', '5', '6', 'n', 'N', 'w', 'W', 'e', 'E', 's', 'S', 'o', 'O'].includes(numKey)) {
        let posX = -7.0;
        let posY = 18.25;
        let posZ = 54.79;
        let tarX = -7.0;
        let tarY = 1.52;
        let tarZ = 10.27;
        let fovValue = 15.0;

        switch (numKey) {
          case 'o':
          case 'O': { // Custom Preset O (Top-down overhead view)
            const isLandscape = window.innerWidth > window.innerHeight;
            if (isLandscape) {
              posX = -0.1; posY = 50.0; posZ = 0.0;
            } else {
              posX = 0.0; posY = 50.0; posZ = 0.1;
            }
            tarX = 0.0; tarY = 0.0; tarZ = 0.0;
            fovValue = 45.0;
            break;
          }
          case 's':
          case 'S': // Custom Preset S (South View Looking North - Symmetrical to N)
            posX = -2.35; posY = 30.77; posZ = 89.13;
            tarX = 0.26; tarY = 0.00; tarZ = 1.87;
            fovValue = 15.0;
            break;
          case 'w':
          case 'W': // Custom Preset W (West View)
            posX = -31.49; posY = 13.87; posZ = -0.11;
            tarX = -3.19; tarY = 0.17; tarZ = 0.28;
            fovValue = 45.0;
            break;
          case 'n':
          case 'N': // Custom Preset N (North View)
            posX = -2.35; posY = 30.77; posZ = -89.13;
            tarX = 0.26; tarY = -0.00; tarZ = -1.87;
            fovValue = 15.0;
            break;
          case '0': // Custom Preset 0
            posX = 41.79; posY = 7.23; posZ = 24.46;
            tarX = -3.45; tarY = 1.52; tarZ = 10.27;
            fovValue = 15.0;
            break;
          case '1': // Hoop 1 (South-West Corner looking straight North)
            posX = -7.0; posY = 18.25; posZ = 54.79;
            tarX = -7.0; tarY = 1.52; tarZ = 10.27;
            fovValue = 15.0;
            break;
          case '2': // Hoop 2 (North-West Corner looking straight South)
            posX = -7.0; posY = 18.25; posZ = -54.79;
            tarX = -7.0; tarY = 1.52; tarZ = -10.27;
            fovValue = 15.0;
            break;
          case '3': // Hoop 3 (North-East Corner looking straight South)
            posX = 7.0; posY = 18.25; posZ = -54.79;
            tarX = 7.0; tarY = 1.52; tarZ = -10.27;
            fovValue = 15.0;
            break;
          case '4': // Hoop 4 (South-East Corner looking straight North)
            posX = 7.0; posY = 18.25; posZ = 54.79;
            tarX = 7.0; tarY = 1.52; tarZ = 10.27;
            fovValue = 15.0;
            break;
          case '5': // South Boundary View pointing at South Center Hoop
            posX = 0.0; posY = 18.25; posZ = 51.29;
            tarX = 0.0; tarY = 1.52; tarZ = 6.77;
            fovValue = 15.0;
            break;
          case 'e':
          case 'E': // Custom Preset E (East View Looking West)
            posX = 36.0; posY = 16.0; posZ = 0.0;
            tarX = 0.0; tarY = 0.0; tarZ = 0.0;
            fovValue = 35.0;
            break;
          case '6': // North Boundary View pointing at North Center Hoop
            posX = 0.0; posY = 18.25; posZ = -51.29;
            tarX = 0.0; tarY = 1.52; tarZ = -6.77;
            fovValue = 15.0;
            break;
        }

        targetPosition.current = new THREE.Vector3(posX, posY, posZ);
        targetFov.current = fovValue;

        if (controls) {
          targetTarget.current = new THREE.Vector3(tarX, tarY, tarZ);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [camera, controls, selectedBall, balls]);

  return null;
}
interface TacticalTubeProps {
  points: [number, number, number][];
  color: string;
}

function TacticalTube({ points, color }: TacticalTubeProps) {
  const curve = useMemo(() => {
    // Filter out duplicate consecutive points
    const uniquePoints = points.filter((p, i) => {
      if (i === 0) return true;
      const prev = points[i - 1];
      const dx = p[0] - prev[0];
      const dz = p[2] - prev[2];
      return Math.sqrt(dx * dx + dz * dz) > 0.005;
    });

    if (uniquePoints.length < 2) return null;
    
    if (uniquePoints.length === 2) {
      const p0 = uniquePoints[0];
      const p1 = uniquePoints[1];
      const mid: [number, number, number] = [
        (p0[0] + p1[0]) / 2,
        (p0[1] + p1[1]) / 2,
        (p0[2] + p1[2]) / 2
      ];
      uniquePoints.splice(1, 0, mid);
    }

    const vecPoints = uniquePoints.map(p => new THREE.Vector3(p[0], p[1], p[2]));
    return new THREE.CatmullRomCurve3(vecPoints);
  }, [points]);

  if (!curve) return null;

  return (
    <mesh>
      <tubeGeometry args={[curve, Math.max(30, points.length * 2), 0.045, 6, false]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

interface AimLineControllerProps {
  showAimingLines: boolean;
  selectedBall: 'blue' | 'red' | 'black' | 'yellow' | null;
  activeStriker: 'blue' | 'red' | 'black' | 'yellow' | null;
  setHoverPoint: (point: { x: number; z: number } | null) => void;
  balls: Record<string, { x: number; z: number }>;
  hoverPoint: { x: number; z: number } | null;
  ballSet: 'primary' | 'secondary';
}

function AimLineController({
  showAimingLines,
  selectedBall,
  activeStriker,
  setHoverPoint,
  balls,
  hoverPoint,
  ballSet
}: AimLineControllerProps) {
  const { raycaster } = useThree();
  const groundPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);

  useFrame(() => {
    if (showAimingLines && selectedBall && activeStriker === null) {
      const target = new THREE.Vector3();
      const intersection = raycaster.ray.intersectPlane(groundPlane, target);
      if (intersection) {
        setHoverPoint({ x: target.x, z: target.z });
      } else {
        setHoverPoint(null);
      }
    } else {
      setHoverPoint(null);
    }
  });

  if (!showAimingLines || !selectedBall || activeStriker !== null || !hoverPoint) {
    return null;
  }

  const activeBall = balls[selectedBall];
  const dx = hoverPoint.x - activeBall.x;
  const dz = hoverPoint.z - activeBall.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.01) return null;

  const ux = dx / dist;
  const uz = dz / dist;

  let firstCollision: {
    type: 'ball' | 'peg' | 'leg';
    id?: string;
    x: number;
    z: number;
    t: number;
    radius: number;
  } | null = null;

  // 1. Collision with other balls
  const otherBalls = (['blue', 'red', 'black', 'yellow'] as const).filter(c => c !== selectedBall);
  for (const c of otherBalls) {
    const ob = balls[c];
    const isOffCourt = Math.abs(ob.x) > 18 || Math.abs(ob.z) > 21.5;
    if (isOffCourt) continue;

    const R_contact = 2 * 0.133375;
    const obDx = activeBall.x - ob.x;
    const obDz = activeBall.z - ob.z;
    const b_q = 2 * (ux * obDx + uz * obDz);
    const c_q = obDx * obDx + obDz * obDz - R_contact * R_contact;
    const disc = b_q * b_q - 4 * c_q;
    if (disc >= 0) {
      const t = (-b_q - Math.sqrt(disc)) / 2;
      if (t > 0 && (firstCollision === null || t < firstCollision.t)) {
        firstCollision = {
          type: 'ball',
          id: c,
          x: ob.x,
          z: ob.z,
          t,
          radius: 0.133375
        };
      }
    }
  }

  // 2. Collision with center peg
  const R_contactPeg = 0.133375 + 0.075;
  const pegDx = activeBall.x - 0;
  const pegDz = activeBall.z - 0;
  const pegB = 2 * (ux * pegDx + uz * pegDz);
  const pegC = pegDx * pegDx + pegDz * pegDz - R_contactPeg * R_contactPeg;
  const pegDisc = pegB * pegB - 4 * pegC;
  if (pegDisc >= 0) {
    const t = (-pegB - Math.sqrt(pegDisc)) / 2;
    if (t > 0 && (firstCollision === null || t < firstCollision.t)) {
      firstCollision = {
        type: 'peg',
        x: 0,
        z: 0,
        t,
        radius: 0.075
      };
    }
  }

  // 3. Collision with hoop legs
  for (const leg of HOOP_LEGS) {
    const R_contactLeg = 0.133375 + 0.035;
    const legDx = activeBall.x - leg.x;
    const legDz = activeBall.z - leg.z;
    const legB = 2 * (ux * legDx + uz * legDz);
    const legC = legDx * legDx + legDz * legDz - R_contactLeg * R_contactLeg;
    const legDisc = legB * legB - 4 * legC;
    if (legDisc >= 0) {
      const t = (-legB - Math.sqrt(legDisc)) / 2;
      if (t > 0 && (firstCollision === null || t < firstCollision.t)) {
        firstCollision = {
          type: 'leg',
          x: leg.x,
          z: leg.z,
          t,
          radius: 0.035
        };
      }
    }
  }

  let linePoints: [number, number, number][] = [];
  let scatterStrikerPoints: [number, number, number][] = [];
  let scatterTargetPoints: [number, number, number][] = [];
  let ghostPos: { x: number; z: number } | null = null;

  const getBallColor = (color: string) => {
    if (ballSet === 'primary') {
      if (color === 'blue') return '#1565c0';
      if (color === 'red') return '#d32f2f';
      if (color === 'black') return '#888888'; // Lighter stands out better on lawn than pure black
      if (color === 'yellow') return '#fbc02d';
    } else {
      if (color === 'blue') return '#22c55e'; // Green
      if (color === 'red') return '#f472b6';   // Pink
      if (color === 'black') return '#8b5a2b'; // Brown (lighter for 3D guide overlay)
      if (color === 'yellow') return '#ffffff'; // White
    }
    return '#ffffff';
  };

  const activeColor = getBallColor(selectedBall);
  let hitTargetColor = '#ffffff';

  if (firstCollision) {
    const c = firstCollision as any;
    const impactX = activeBall.x + c.t * ux;
    const impactZ = activeBall.z + c.t * uz;
    ghostPos = { x: impactX, z: impactZ };

    linePoints = [
      [activeBall.x, 0.133375, activeBall.z],
      [impactX, 0.133375, impactZ]
    ];

    // Compute split-shot scattering angles
    const normX = c.x - impactX;
    const normZ = c.z - impactZ;
    const normDist = Math.sqrt(normX * normX + normZ * normZ);
    const nx = normDist > 0 ? normX / normDist : 0;
    const nz = normDist > 0 ? normZ / normDist : 0;

    const v_dot_n = ux * nx + uz * nz;
    const targetVx = v_dot_n * nx;
    const targetVz = v_dot_n * nz;
    const strikerVx = ux - targetVx;
    const strikerVz = uz - targetVz;

    const targetMag = Math.sqrt(targetVx * targetVx + targetVz * targetVz);
    const strikerMag = Math.sqrt(strikerVx * strikerVx + strikerVz * strikerVz);

    const scatterLength = 3.0; // yards to draw in 3D space

    if (strikerMag > 0.01) {
      const sDirX = strikerVx / strikerMag;
      const sDirZ = strikerVz / strikerMag;
      scatterStrikerPoints = [
        [impactX, 0.133375, impactZ],
        [impactX + sDirX * scatterLength, 0.133375, impactZ + sDirZ * scatterLength]
      ];
    }

    if (c.type === 'ball') {
      hitTargetColor = getBallColor(c.id);
      if (targetMag > 0.01) {
        const tDirX = targetVx / targetMag;
        const tDirZ = targetVz / targetMag;
        scatterTargetPoints = [
          [c.x, 0.133375, c.z],
          [c.x + tDirX * scatterLength, 0.133375, c.z + tDirZ * scatterLength]
        ];
      }
    }
  } else {
    linePoints = [
      [activeBall.x, 0.133375, activeBall.z],
      [hoverPoint.x, 0.133375, hoverPoint.z]
    ];
  }

  return (
    <>
      {/* 3D Ghost Ball representation */}
      {ghostPos && (
        <mesh position={[ghostPos.x, 0.133375, ghostPos.z]} castShadow>
          <sphereGeometry args={[0.133375, 32, 32]} />
          <meshStandardMaterial
            color={activeColor}
            transparent
            opacity={0.35}
            roughness={0.2}
            metalness={0.1}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Main dashed aim line */}
      {linePoints.length > 0 && (
        <Line
          points={linePoints}
          color="#ffffff"
          lineWidth={2.5}
          dashed
          dashScale={1.5}
          frustumCulled={false}
        />
      )}

      {/* Striker scattering path */}
      {scatterStrikerPoints.length > 0 && (
        <Line
          points={scatterStrikerPoints}
          color={activeColor}
          lineWidth={2.0}
          dashed
          dashScale={2.0}
          frustumCulled={false}
        />
      )}

      {/* Target scattering path */}
      {scatterTargetPoints.length > 0 && (
        <Line
          points={scatterTargetPoints}
          color={hitTargetColor}
          lineWidth={2.0}
          dashed
          dashScale={2.0}
          frustumCulled={false}
        />
      )}
    </>
  );
}

function HoopTeardrop({ pos, label }: { pos: [number, number, number]; label: string }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (groupRef.current) {
      // Gentle floating up and down oscillation
      groupRef.current.position.y = pos[1] + Math.sin(state.clock.getElapsedTime() * 2.5 + pos[0]) * 0.08;
    }
  });

  return (
    <Billboard position={[pos[0], pos[1], pos[2]]} follow={true}>
      <group ref={groupRef}>
        {/* Luminous, highly distinct warm-gold map-pin teardrop shape pointing down (25% Larger!) */}
        {/* Sphere at top */}
        <mesh position={[0, 0.275, 0]}>
          <sphereGeometry args={[0.225, 32, 32]} />
          <meshStandardMaterial 
            color="#ffe680" 
            roughness={0.1} 
            metalness={0.1} 
            emissive="#ffb300" 
            emissiveIntensity={0.65} 
          />
        </mesh>
        {/* Cone at bottom pointing down (rotated 180 degrees) */}
        <mesh position={[0, 0.05, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.225, 0.45, 32]} />
          <meshStandardMaterial 
            color="#ffe680" 
            roughness={0.1} 
            metalness={0.1} 
            emissive="#ffb300" 
            emissiveIntensity={0.65} 
          />
        </mesh>
        
        {/* Crispy 3D Text centered on the round pin head (Dark Green and 25% Larger!) */}
        <Text
          fontSize={0.25}
          color="#0a3a0e"
          anchorX="center"
          anchorY="middle"
          position={[0, 0.275, 0.245]} // Positioned in front of the sphere (radius 0.225 + 0.02 offset) to prevent clipping
          fontWeight="bold"
        >
          {label}
        </Text>
      </group>
    </Billboard>
  );
}

export default function App() {
  // 1. Security Origin Guard & PWA Offline Prevention
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    // A. Detect if opened as a downloaded local file
    const isLocalFile = window.location.protocol === 'file:';
    
    // B. Detect if run on an unauthorized hostname (supports preview pages ending in .pages.dev)
    const isAllowedDomain = 
      window.location.hostname === 'localhost' || 
      window.location.hostname === '127.0.0.1' || 
      window.location.hostname.endsWith('.pages.dev');

    if (isLocalFile || !isAllowedDomain) {
      // Instantly clear body and render premium glassmorphic lock screen
      document.body.innerHTML = `
        <div style="
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          width: 100vw;
          margin: 0;
          padding: 24px;
          box-sizing: border-box;
          background: radial-gradient(circle at center, #111827 0%, #030712 100%);
          color: #ef4444;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          text-align: center;
        ">
          <div style="
            padding: 40px;
            border-radius: 24px;
            background: rgba(17, 24, 39, 0.6);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(239, 68, 68, 0.2);
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05);
            max-width: 440px;
            width: 100%;
          ">
            <div style="
              width: 72px;
              height: 72px;
              border-radius: 20px;
              background: rgba(239, 68, 68, 0.15);
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0 auto 24px auto;
              border: 1px solid rgba(239, 68, 68, 0.3);
            ">
              <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 32px; height: 32px;">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
            <h1 style="
              font-size: 26px;
              font-weight: 800;
              color: #ffffff;
              margin: 0 0 12px 0;
              letter-spacing: -0.025em;
            ">Security Access Alert</h1>
            <p style="
              color: #94a3b8;
              font-size: 15px;
              line-height: 1.6;
              margin: 0;
            ">This application is protected and cannot be downloaded or hosted on unauthorized domains.<br/><br/>Please access the official live version online.</p>
          </div>
        </div>
      `;
      throw new Error("Unauthorized local copy or domain detected.");
    }

    // Print premium developer console welcome banner
    console.log(
      `%c 👑 GC CROQUET 3D VISUALISER %c Version 0.62 Beta %c\n` +
      `%cMurray Tinker's Professional Coaching Suite%c\n` +
      `--------------------------------------------------\n` +
      `• Host Domain     : ${window.location.hostname}\n` +
      `• Connection      : ${navigator.onLine ? 'ONLINE 🟢' : 'OFFLINE 🔴'}\n` +
      `• Origin Guard    : LOCKED ✅\n` +
      `--------------------------------------------------\n` +
      `👉 Press 'C' key on the lawn to capture exact 3D camera coordinates!`,
      'background: #111827; color: #ffe680; font-weight: bold; font-size: 13px; padding: 4px 8px; border-radius: 4px 0 0 4px; border-left: 4px solid #d4af37;',
      'background: #d4af37; color: #000000; font-weight: bold; font-size: 11px; padding: 4px 8px; border-radius: 0 4px 4px 0;',
      '',
      'color: #ffe680; font-weight: bold; font-size: 11px; margin-top: 6px;',
      'color: #94a3b8; font-size: 10px;'
    );

    // C. Register online/offline event listeners
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // React State for initial ball positioning & synchronization (drag and drop)
  const [balls, setBalls] = useState<Record<string, { x: number; z: number }>>({
    blue: { x: 13.8, z: 17.6667 },
    red: { x: 13.4, z: 17.6667 },
    black: { x: 13.0, z: 17.6667 },
    yellow: { x: 12.6, z: 17.6667 }
  });

  // Toast state for premium notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = (message: string) => {
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(message);
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Undo position history stack (capped at 50 entries)
  const [history, setHistory] = useState<Record<string, { x: number; z: number }>[]>([]);
  
  // Reset trigger state counter for the CameraController
  const [cameraResetCounter, setCameraResetCounter] = useState(0);

  // Striker State Machine parameters
  const [activeStriker, setActiveStriker] = useState<'blue' | 'red' | 'black' | 'yellow' | null>(null);
  const [isStriking, setIsStriking] = useState(false);

  // Selection & striking target state
  const [selectedBall, setSelectedBall] = useState<'blue' | 'red' | 'black' | 'yellow' | null>(null);
  const [ballSet, setBallSet] = useState<'primary' | 'secondary'>('primary');
  const [strikeTarget, setStrikeTarget] = useState<{ x: number; z: number } | null>(null);

  // Aiming guides state
  const [showAimingLines, setShowAimingLines] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [hasClickedStart, setHasClickedStart] = useState(false);
  const [hoverPoint, setHoverPoint] = useState<{ x: number; z: number } | null>(null);

  // Telestrator / Annotation state variables
  const [drawMode, setDrawMode] = useState(false);
  const [drawColorIndex, setDrawColorIndex] = useState(3); // Default to 3 (Yellow in primary, White in secondary)
  const primaryDrawColors = useMemo(() => ['#2196f3', '#ff1744', '#000000', '#ffea00'], []);
  const secondaryDrawColors = useMemo(() => ['#4caf50', '#ff4081', '#8d6e63', '#ffffff'], []);
  const drawColor = ballSet === 'primary' ? primaryDrawColors[drawColorIndex] : secondaryDrawColors[drawColorIndex];
  const [drawings, setDrawings] = useState<Array<{ id: string; points: [number, number, number][]; color: string }>>([]);
  const [currentDrawingPoints, setCurrentDrawingPoints] = useState<[number, number, number][]>([]);
  const [isDrawingActive, setIsDrawingActive] = useState(false);
  const [drawTool, setDrawTool] = useState<'freehand' | 'line' | 'circle'>('freehand');
  const drawStartPoint = useRef<[number, number, number] | null>(null);

  // Track spacebar held state for "Drive Mode" (blast ball off court)
  const isSpaceDown = useRef(false);
  const isDriveMode = useRef(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isHPressed, setIsHPressed] = useState(false);

  // Fullscreen & orientation tracking state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);

  const toggleFullscreen = () => {
    const doc = document.documentElement as any;
    const requestFS = doc.requestFullscreen || doc.webkitRequestFullscreen || doc.msRequestFullscreen;
    const exitFS = document.exitFullscreen || (document as any).webkitExitFullscreen || (document as any).msExitFullscreen;

    if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
      if (requestFS) {
        requestFS.call(doc).then(() => {
          if (window.screen && window.screen.orientation && (window.screen.orientation as any).lock) {
            (window.screen.orientation as any).lock('landscape').catch(() => { });
          }
        }).catch(() => { });
      }
    } else {
      if (exitFS) {
        exitFS.call(document);
      }
      if (window.screen && window.screen.orientation && window.screen.orientation.unlock) {
        window.screen.orientation.unlock();
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFS = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsFullscreen(isFS);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const checkMobileAndOrientation = () => {
      const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
      setIsMobile(mobile);
      setIsPortrait(window.innerHeight > window.innerWidth);
    };

    checkMobileAndOrientation();
    window.addEventListener('resize', checkMobileAndOrientation);
    window.addEventListener('orientationchange', checkMobileAndOrientation);
    return () => {
      window.removeEventListener('resize', checkMobileAndOrientation);
      window.removeEventListener('orientationchange', checkMobileAndOrientation);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      if (e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setShowAimingLines(prev => !prev);
        return;
      }

      if (e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setDrawMode(prev => {
          if (prev) {
            setIsDrawingActive(false);
            setCurrentDrawingPoints([]);
          }
          return !prev;
        });
        return;
      }

      if (e.key.toLowerCase() === 'x') {
        e.preventDefault();
        setDrawings([]);
        setCurrentDrawingPoints([]);
        return;
      }

      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        setDrawings(prev => prev.slice(0, -1));
        return;
      }

      if (e.key.toLowerCase() === 'h') {
        e.preventDefault();
        setIsHPressed(true);
        return;
      }

      if (e.code === 'Space') {
        // Prevent default spacebar scrolling
        e.preventDefault();
        isSpaceDown.current = true;
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'h') {
        setIsHPressed(false);
      }
      if (e.code === 'Space') {
        isSpaceDown.current = false;
        setIsSpacePressed(false);
      }
    };
    const handleBlur = () => {
      setIsHPressed(false);
      isSpaceDown.current = false;
      setIsSpacePressed(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Automatically shut off aiming lines if the selected ball is off-court, if no ball is selected, or if any ball starts moving
  useEffect(() => {
    if (!selectedBall) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowAimingLines(false);
      return;
    }
    const coords = balls[selectedBall];
    const isOff = Math.abs(coords.x) > 14 || Math.abs(coords.z) > 17.5;
    if (isOff && showAimingLines) {
      setShowAimingLines(false);
    }
  }, [balls, selectedBall, showAimingLines]);

  // Mesh reference map for zero-render physics loops
  const blueMeshRef = useRef<THREE.Object3D>(null);
  const redMeshRef = useRef<THREE.Object3D>(null);
  const blackMeshRef = useRef<THREE.Object3D>(null);
  const yellowMeshRef = useRef<THREE.Object3D>(null);

  const meshRefs = useRef<Record<string, React.RefObject<THREE.Object3D | null>>>({
    blue: blueMeshRef,
    red: redMeshRef,
    black: blackMeshRef,
    yellow: yellowMeshRef
  });

  // Selection ring ref
  const selectedRingRef = useRef<THREE.Mesh>(null);

  // Drag tracking to distinguish camera rotating from clicking to shoot
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  // Physics engine coordinate, velocity, and state refs
  const physicsBalls = useRef<Record<string, PhysicsBallState>>({
    blue: { x: 13.8, z: 17.6667, vx: 0, vz: 0, isRolling: false },
    red: { x: 13.4, z: 17.6667, vx: 0, vz: 0, isRolling: false },
    black: { x: 13.0, z: 17.6667, vx: 0, vz: 0, isRolling: false },
    yellow: { x: 12.6, z: 17.6667, vx: 0, vz: 0, isRolling: false }
  });

  // Save current layout of all balls to history before any action
  const saveToHistory = () => {
    const snapshot = {
      blue: { x: physicsBalls.current.blue.x, z: physicsBalls.current.blue.z },
      red: { x: physicsBalls.current.red.x, z: physicsBalls.current.red.z },
      black: { x: physicsBalls.current.black.x, z: physicsBalls.current.black.z },
      yellow: { x: physicsBalls.current.yellow.x, z: physicsBalls.current.yellow.z }
    };
    
    setHistory(prev => {
      const next = [...prev, snapshot];
      if (next.length > 50) {
        next.shift(); // Cap history to 50 items
      }
      return next;
    });
  };

  // Undo the last movement or strike
  const handleUndo = () => {
    if (activeStriker !== null) return;
    const isAnyBallMoving = Object.values(physicsBalls.current).some(b => b.vx !== 0 || b.vz !== 0 || b.isRolling);
    if (isAnyBallMoving) return;

    if (history.length === 0) return;

    const previousSnapshot = history[history.length - 1];
    setHistory(prev => prev.slice(0, prev.length - 1));

    // Restore the balls state
    setBalls(previousSnapshot);

    // Sync physics reference engine and instant visual meshes
    const colors = ['blue', 'red', 'black', 'yellow'] as const;
    colors.forEach(c => {
      physicsBalls.current[c].x = previousSnapshot[c].x;
      physicsBalls.current[c].z = previousSnapshot[c].z;
      physicsBalls.current[c].vx = 0;
      physicsBalls.current[c].vz = 0;
      physicsBalls.current[c].isRolling = false;

      const mesh = meshRefs.current[c].current;
      if (mesh) {
        mesh.position.x = previousSnapshot[c].x;
        mesh.position.z = previousSnapshot[c].z;
      }
    });

    // Update selection ring positions
    if (selectedRingRef.current && selectedBall) {
      selectedRingRef.current.position.x = previousSnapshot[selectedBall].x;
      selectedRingRef.current.position.z = previousSnapshot[selectedBall].z;
    }
  };

  // Reset the simulation state
  const handleReset = () => {
    if (activeStriker !== null) return;
    const isAnyBallMoving = Object.values(physicsBalls.current).some(b => b.vx !== 0 || b.vz !== 0 || b.isRolling);
    if (isAnyBallMoving) return;

    setHasClickedStart(true); // Disable the cartoon animated arrow overlay permanently

    // Snapshot the current state before resetting so that reset itself can be undone!
    saveToHistory();

    // 6 inches back: south boundary is Z = 17.5 yards, 6 inches back is Z = 17.6667
    // Spaced out near starting flag (X = 14) to prevent overlap
    const resetPositions = {
      blue: { x: 13.8, z: 17.6667 },
      red: { x: 13.4, z: 17.6667 },
      black: { x: 13.0, z: 17.6667 },
      yellow: { x: 12.6, z: 17.6667 }
    };

    setBalls(resetPositions);

    const colors = ['blue', 'red', 'black', 'yellow'] as const;
    colors.forEach(c => {
      physicsBalls.current[c].x = resetPositions[c].x;
      physicsBalls.current[c].z = resetPositions[c].z;
      physicsBalls.current[c].vx = 0;
      physicsBalls.current[c].vz = 0;
      physicsBalls.current[c].isRolling = false;

      const mesh = meshRefs.current[c].current;
      if (mesh) {
        mesh.position.x = resetPositions[c].x;
        mesh.position.z = resetPositions[c].z;
      }
    });

    // Clear selection on reset
    setSelectedBall(null);

    if (selectedRingRef.current) {
      selectedRingRef.current.position.x = resetPositions.blue.x;
      selectedRingRef.current.position.z = resetPositions.blue.z;
    }

    // Increment camera reset counter to trigger custom positioning and fov change
    setCameraResetCounter(prev => prev + 1);
  };

  // Handler for syncing positions from drags and stops
  const handleBallChange = (color: 'blue' | 'red' | 'black' | 'yellow', x: number, z: number) => {
    setBalls(prev => ({
      ...prev,
      [color]: { x, z }
    }));
    physicsBalls.current[color].x = x;
    physicsBalls.current[color].z = z;

    // Instantly sync visual WebGL mesh if present
    const mesh = meshRefs.current[color].current;
    if (mesh) {
      mesh.position.x = x;
      mesh.position.z = z;
    }

    // Instantly sync selection ring if this is the selected ball
    if (color === selectedBall && selectedRingRef.current) {
      selectedRingRef.current.position.x = x;
      selectedRingRef.current.position.z = z;
    }
  };

  // HUD Button Selection handler
  const handleHUDSelect = (color: 'blue' | 'red' | 'black' | 'yellow') => {
    if (activeStriker !== null) return; // Prevent selection changes during active striking
    setHasClickedStart(true); // Dismiss initial start arrow on direct ball selection
    setSelectedBall(selectedBall === color ? null : color);
  };

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const handleCourtPointerDown = (e: any) => {
    if (activeStriker !== null) return;
    if (drawMode) {
      e.stopPropagation();
      setIsDrawingActive(true);
      const pt = e.point;
      if (pt) {
        drawStartPoint.current = [pt.x, 0.045, pt.z];
        setCurrentDrawingPoints([[pt.x, 0.045, pt.z]]);
      }
      return;
    }
    const clientX = e.clientX ?? e.nativeEvent?.clientX ?? 0;
    const clientY = e.clientY ?? e.nativeEvent?.clientY ?? 0;
    pointerDownPos.current = { x: clientX, y: clientY };
  };

  const handleCourtPointerMove = (e: any) => {
    if (activeStriker !== null) return;
    if (drawMode && isDrawingActive) {
      e.stopPropagation();
      const pt = e.point;
      if (pt && drawStartPoint.current) {
        if (drawTool === 'freehand') {
          setCurrentDrawingPoints(prev => {
            if (prev.length === 0) return [[pt.x, 0.045, pt.z]];
            const lastPoint = prev[prev.length - 1];
            const dx = pt.x - lastPoint[0];
            const dz = pt.z - lastPoint[2];
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > 0.01) {
              return [...prev, [pt.x, 0.045, pt.z]];
            }
            return prev;
          });
        } else if (drawTool === 'line') {
          setCurrentDrawingPoints([
            drawStartPoint.current,
            [pt.x, 0.045, pt.z]
          ]);
        } else if (drawTool === 'circle') {
          const startPt = drawStartPoint.current;
          const dx = pt.x - startPt[0];
          const dz = pt.z - startPt[2];
          const radius = Math.sqrt(dx * dx + dz * dz);
          
          const circlePts: [number, number, number][] = [];
          const segments = 64;
          for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;
            circlePts.push([
              startPt[0] + radius * Math.cos(theta),
              0.045,
              startPt[2] + radius * Math.sin(theta)
            ]);
          }
          setCurrentDrawingPoints(circlePts);
        }
      }
    }
  };

  const handleCourtPointerUp = (e: any) => {
    if (activeStriker !== null) return;
    if (drawMode) {
      e.stopPropagation();
      if (isDrawingActive) {
        setIsDrawingActive(false);
        if (currentDrawingPoints.length >= 2) {
          setDrawings(prev => [
            ...prev,
            {
              id: Math.random().toString(),
              points: currentDrawingPoints,
              color: drawColor
            }
          ]);
        }
        setCurrentDrawingPoints([]);
        drawStartPoint.current = null;
      }
      return;
    }
    if (!pointerDownPos.current) return;

    setHasClickedStart(true); // Dismiss initial start arrow on click/strike

    const clientX = e.clientX ?? e.nativeEvent?.clientX ?? 0;
    const clientY = e.clientY ?? e.nativeEvent?.clientY ?? 0;
    const dx = clientX - pointerDownPos.current.x;
    const dy = clientY - pointerDownPos.current.y;
    const dragDistance = Math.sqrt(dx * dx + dy * dy);

    pointerDownPos.current = null;

    // Filter out OrbitControls camera drags (if mouse moved more than 6px, it is a drag, not a click)
    if (dragDistance > 6) return;

    e.stopPropagation();
    const clickPoint = e.point;
    if (clickPoint) {
      if (!selectedBall) return;
      // Check if selected ball is off-court (Width: 28yd [-14, 14], Length: 35yd [-17.5, 17.5])
      const activeBallCoords = physicsBalls.current[selectedBall];
      const isOffCourt = Math.abs(activeBallCoords.x) > 14 || Math.abs(activeBallCoords.z) > 17.5;
      if (isOffCourt) {
        // Block off-court strikes silently (warnings are only triggered when the ball is explicitly selected/clicked)
        return;
      }

      // Cancel all active ball rolls and synchronize their physical positions back to React state
      const colors = ['blue', 'red', 'black', 'yellow'] as const;
      colors.forEach(c => {
        const b = physicsBalls.current[c];
        if (b.isRolling || b.vx !== 0 || b.vz !== 0 || c === selectedBall) {
          b.vx = 0;
          b.vz = 0;
          b.isRolling = false;
          handleBallChange(c, b.x, b.z);
        }
      });

      saveToHistory(); // Save snapshot before strike begins
      isDriveMode.current = isSpaceDown.current;

      setStrikeTarget({ x: clickPoint.x, z: clickPoint.z });
      setActiveStriker(selectedBall);
      setIsStriking(true);
      setSelectedBall(null); // Clear selected ball as the shot is now being played!
      setHoverPoint(null); // Hide aiming line immediately when strike is initiated
      setShowAimingLines(false); // Deactivate aiming lines globally once the shot is played
    }
  };

  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Mallet-to-Ball collision impulse frame event
  const handleImpact = () => {
    if (!activeStriker) return;
    const b = physicsBalls.current[activeStriker];

    // Determine target location: click point or center peg fallback
    const targetX = strikeTarget ? strikeTarget.x : 0;
    const targetZ = strikeTarget ? strikeTarget.z : 0;

    const dx = targetX - b.x;
    const dz = targetZ - b.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    const ux = dist > 0 ? dx / dist : 0;
    const uz = dist > 0 ? dz / dist : -1;

    // Apply Turf grass deceleration friction math to stop exactly on target.
    // v(t) = v0 * e^(-0.85 * t)
    // d = (v0 - 0.045) / 0.85 => v0 = d * 0.85 + 0.045
    // Capped at 60.0 yards/second (perfectly accommodating power mode speed and extreme diagonal boundary shots).
    let targetSpeed = dist * 0.85 + 0.045;

    // If Drive Mode is active (Spacebar was held down during click),
    // set initial speed to a high constant driving speed (54.0 yards/second, which is 50% faster than 36.0)
    // that will easily blast the ball off the court in a split second!
    if (isDriveMode.current) {
      targetSpeed = 54.0;
    }

    const impulseSpeed = Math.min(targetSpeed, 60.0);

    b.vx = ux * impulseSpeed;
    b.vz = uz * impulseSpeed;
    b.isRolling = true;

    // Striking player stays active for exactly 2 seconds from the impact moment, then disappears
    setTimeout(() => {
      setActiveStriker(null);
    }, 2000);
  };

  // End of player swing cycle
  const handleFinished = () => {
    setIsStriking(false);
  };

  const activeBallCoords = selectedBall ? balls[selectedBall] : null;
  const isSelectedBallOffCourt = activeBallCoords 
    ? (Math.abs(activeBallCoords.x) > 14 || Math.abs(activeBallCoords.z) > 17.5)
    : true;

  const isGameReset = 
    balls.blue.x === 13.8 && balls.blue.z === 17.6667 &&
    balls.red.x === 13.4 && balls.red.z === 17.6667 &&
    balls.black.x === 13.0 && balls.black.z === 17.6667 &&
    balls.yellow.x === 12.6 && balls.yellow.z === 17.6667;

  if (!isOnline) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100vw',
        background: '#090d16',
        color: '#fbc02d',
        fontFamily: 'sans-serif',
        textAlign: 'center',
        padding: '20px',
        boxSizing: 'border-box'
      }}>
        <div style={{
          padding: '40px',
          borderRadius: '24px',
          background: 'rgba(17, 24, 39, 0.6)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(251, 192, 45, 0.2)',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
          maxWidth: '440px',
          width: '100%'
        }}>
          <div style={{
            width: '72px',
            height: '72px',
            borderRadius: '20px',
            background: 'rgba(251, 192, 45, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px auto',
            border: '1px solid rgba(251, 192, 45, 0.3)'
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#fbc02d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '32px', height: '32px' }}>
              <line x1="1" y1="1" x2="23" y2="23"></line>
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
              <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
              <line x1="12" y1="20" x2="12.01" y2="20"></line>
            </svg>
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#ffffff', margin: '0 0 12px 0' }}>Connection Lost</h2>
          <p style={{ color: '#94a3b8', fontSize: '15px', lineHeight: '1.6', margin: 0 }}>An active internet connection is required to run the visualiser. Please check your network connection.</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      onContextMenu={(e) => e.preventDefault()}
      style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', background: '#0a0f0d', position: 'relative' }}
    >
      
      {/* Premium Glassmorphic Mobile Landscape Prompt */}
      {isMobile && isPortrait && !isFullscreen && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(9, 13, 22, 0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          boxSizing: 'border-box',
          textAlign: 'center',
          color: '#ffffff',
          fontFamily: 'sans-serif'
        }}>
          <div style={{
            padding: '32px 24px',
            borderRadius: '24px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1.5px solid rgba(212, 175, 55, 0.4)',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
            maxWidth: '340px',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(212, 175, 55, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px',
              border: '1px solid rgba(212, 175, 55, 0.3)',
              animation: 'rotate-phone-anim 2s infinite ease-in-out'
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#ffe680" strokeWidth="2.0" strokeLinecap="round" strokeLinejoin="round" style={{ width: '28px', height: '28px' }}>
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                <path d="M12 18h.01" />
              </svg>
            </div>
            
            <h3 style={{ margin: '0 0 10px 0', fontSize: '20px', fontWeight: '800', color: '#ffe680', letterSpacing: '-0.02em' }}>
              Landscape Recommended
            </h3>
            
            <p style={{ margin: '0 0 24px 0', fontSize: '14px', lineHeight: '1.5', color: '#94a3b8' }}>
              For the best 3D perspective and ball controls, rotate your phone or enter Fullscreen mode.
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '12px' }}>
              <button 
                onClick={toggleFullscreen}
                style={{
                  background: 'linear-gradient(135deg, #d4af37 0%, #aa8010 100%)',
                  border: 'none',
                  borderRadius: '12px',
                  color: '#000000',
                  padding: '12px 20px',
                  fontSize: '15px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(212, 175, 55, 0.4)',
                  transition: 'all 0.2s'
                }}
              >
                Enter Fullscreen Landscape
              </button>
              
              <button 
                onClick={() => {
                  setIsMobile(false);
                }}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '12px',
                  color: '#94a3b8',
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Continue in Portrait
              </button>
            </div>
          </div>
          
          <style>{`
            @keyframes rotate-phone-anim {
              0% { transform: rotate(0deg); }
              50% { transform: rotate(90deg); }
              100% { transform: rotate(0deg); }
            }
          `}</style>
        </div>
      )}

      {/* 3D WebGL Canvas Scene */}
      <Canvas camera={{ position: [-31.49, 13.87, -0.11], fov: 45.0, far: 5000 }} shadows>
        <color attach="background" args={['#a0c4de']} />
        <fog attach="fog" args={['#a0c4de', 80, 500]} />
        <CameraController 
          resetCounter={cameraResetCounter} 
          selectedBall={selectedBall}
          balls={balls}
        />
        <AimLineController
          showAimingLines={showAimingLines}
          selectedBall={selectedBall}
          activeStriker={activeStriker}
          setHoverPoint={setHoverPoint}
          balls={balls}
          hoverPoint={hoverPoint}
          ballSet={ballSet}
        />
        <PanoramaBackground />
        <ambientLight intensity={0.5} />
        <directionalLight 
          position={[25, 45, 25]} 
          castShadow 
          intensity={1.4} 
          shadow-mapSize-width={4096} 
          shadow-mapSize-height={4096}
          shadow-camera-left={-80}
          shadow-camera-right={80}
          shadow-camera-top={80}
          shadow-camera-bottom={-80}
          shadow-camera-near={0.5}
          shadow-camera-far={200}
          shadow-bias={-0.00002}
        />
        
        <CourtSurface />
        <ParkSurroundings />

        {/* Center Peg (Height = 1.3125, Radius = 0.075) */}
        <mesh position={[0, 0.65625, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.075, 0.075, 1.3125, 16]} />
          <meshStandardMaterial color="#ffffff" roughness={0.3} metalness={0.1} />
        </mesh>
        
        {/* Peg Colored Bands from top: Blue, Red, Black, Yellow */}
        {[
          [1.13125, '#1565c0'], // Blue (Top)
          [1.00625, '#d32f2f'], // Red
          [0.88125, '#212121'], // Black
          [0.75625, '#fbc02d']  // Yellow
        ].map(([y, color], idx) => (
          <mesh key={idx} position={[0, y as number, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.08, 0.1, 16]} />
            <meshStandardMaterial color={color as string} roughness={0.2} />
          </mesh>
        ))}

        {/* Official Quadway Hoop Coordinates */}
        <QuadwayHoop position={[-7, 0, 10.5]} crownColor="#1565c0" />
        <QuadwayHoop position={[-7, 0, -10.5]} crownColor="#ffffff" />
        <QuadwayHoop position={[7, 0, -10.5]} crownColor="#d32f2f" />
        <QuadwayHoop position={[7, 0, 10.5]} crownColor="#ffffff" />
        <QuadwayHoop position={[0, 0, -7]} crownColor="#ffffff" />
        <QuadwayHoop position={[0, 0, 7]} crownColor="#ffffff" />

        {isHPressed && (
          <>
            <HoopTeardrop pos={[-7, 0.55, 10.5]} label="1" />
            <HoopTeardrop pos={[-7, 0.55, -10.5]} label="2" />
            <HoopTeardrop pos={[7, 0.55, -10.5]} label="3" />
            <HoopTeardrop pos={[7, 0.55, 10.5]} label="4" />
            <HoopTeardrop pos={[0, 0.55, 7]} label="5" />
            <HoopTeardrop pos={[0, 0.55, -7]} label="6" />
          </>
        )}

        {/* Active Procedural Cartoon Player */}
        {activeStriker && (
          <CartoonPlayer
            color={activeStriker}
            ballPosition={[balls[activeStriker].x, 0.133375, balls[activeStriker].z]}
            targetPosition={
              strikeTarget 
                ? [strikeTarget.x, 0.133375, strikeTarget.z] 
                : [0, 0.133375, 0]
            }
            isStriking={isStriking}
            onImpact={handleImpact}
            onFinished={handleFinished}
            ballSet={ballSet}
          />
        )}

        {/* Physics Manager Engine */}
        <PhysicsManager 
          physicsBalls={physicsBalls} 
          meshRefs={meshRefs} 
          onPositionChange={handleBallChange}
          selectedBall={selectedBall}
          selectedRingRef={selectedRingRef}
        />



        <mesh 
          position={[0, 0.015, 0]} 
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerDown={handleCourtPointerDown}
          onPointerMove={handleCourtPointerMove}
          onPointerUp={handleCourtPointerUp}
        >
          <planeGeometry args={[120, 120]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>

        {drawings.map(d => (
          <TacticalTube 
            key={d.id}
            points={d.points}
            color={d.color}
          />
        ))}
        {currentDrawingPoints.length >= 2 && (
          <TacticalTube 
            points={currentDrawingPoints}
            color={drawColor}
          />
        )}

        {/* Aiming guideline */}
        {(() => {
          if (!selectedBall) return null;
          const activeBallCoords = balls[selectedBall];
          const isSelectedBallOffCourt = Math.abs(activeBallCoords.x) > 14 || Math.abs(activeBallCoords.z) > 17.5;

          const shouldShowAimingLine = 
            showAimingLines && 
            activeStriker === null && 
            !isSelectedBallOffCourt && 
            hoverPoint !== null;

          if (!shouldShowAimingLine || !hoverPoint) return null;

          return (
            <Line 
              points={[
                [balls[selectedBall].x, 0.045, balls[selectedBall].z],
                [hoverPoint.x, 0.045, hoverPoint.z]
              ]} 
              color={
                selectedBall === 'blue' ? (ballSet === 'primary' ? '#3399ff' : '#4ade80') :  // Bright neon blue vs Green
                selectedBall === 'red' ? (ballSet === 'primary' ? '#ff3333' : '#fbcfe8') :   // Bright neon red vs Pink
                selectedBall === 'black' ? (ballSet === 'primary' ? '#ffffff' : '#d7ccc8') : // Pure bright white vs Tan
                (ballSet === 'primary' ? '#ffff00' : '#ffffff')                             // Bright neon yellow vs Pure white
              }
              lineWidth={4.0} // Thicker and brighter line guide
              dashed 
              dashScale={1.5} 
              frustumCulled={false} // Disable frustum culling to prevent it from disappearing at certain compass angles
            />
          );
        })()}

        {/* Dynamic Croquet Balls */}
        <CroquetBall
          ref={blueMeshRef}
          color={ballSet === 'primary' ? "#2196f3" : "#4caf50"}
          x={balls.blue.x}
          z={balls.blue.z}
          onPositionChange={(x, z) => handleBallChange('blue', x, z)}
          isSelected={selectedBall === 'blue'}
          onPointerDown={() => {
            if (activeStriker === null) {
              setHasClickedStart(true); // Dismiss initial start arrow
              saveToHistory();
              setSelectedBall('blue');
              const activeBallCoords = physicsBalls.current.blue;
              const isOffCourt = Math.abs(activeBallCoords.x) > 14 || Math.abs(activeBallCoords.z) > 17.5;
              if (isOffCourt) {
                showToast("Drag ball onto court");
              }
            }
          }}
        />
        <CroquetBall
          ref={redMeshRef}
          color={ballSet === 'primary' ? "#ff1744" : "#ff4081"}
          x={balls.red.x}
          z={balls.red.z}
          onPositionChange={(x, z) => handleBallChange('red', x, z)}
          isSelected={selectedBall === 'red'}
          onPointerDown={() => {
            if (activeStriker === null) {
              setHasClickedStart(true); // Dismiss initial start arrow
              saveToHistory();
              setSelectedBall('red');
              const activeBallCoords = physicsBalls.current.red;
              const isOffCourt = Math.abs(activeBallCoords.x) > 14 || Math.abs(activeBallCoords.z) > 17.5;
              if (isOffCourt) {
                showToast("Drag ball onto court");
              }
            }
          }}
        />
        <CroquetBall
          ref={blackMeshRef}
          color={ballSet === 'primary' ? "#424242" : "#8d6e63"}
          x={balls.black.x}
          z={balls.black.z}
          onPositionChange={(x, z) => handleBallChange('black', x, z)}
          isSelected={selectedBall === 'black'}
          onPointerDown={() => {
            if (activeStriker === null) {
              setHasClickedStart(true); // Dismiss initial start arrow
              saveToHistory();
              setSelectedBall('black');
              const activeBallCoords = physicsBalls.current.black;
              const isOffCourt = Math.abs(activeBallCoords.x) > 14 || Math.abs(activeBallCoords.z) > 17.5;
              if (isOffCourt) {
                showToast("Drag ball onto court");
              }
            }
          }}
        />
        <CroquetBall
          ref={yellowMeshRef}
          color={ballSet === 'primary' ? "#ffea00" : "#ffffff"}
          x={balls.yellow.x}
          z={balls.yellow.z}
          onPositionChange={(x, z) => handleBallChange('yellow', x, z)}
          isSelected={selectedBall === 'yellow'}
          onPointerDown={() => {
            if (activeStriker === null) {
              setHasClickedStart(true); // Dismiss initial start arrow
              saveToHistory();
              setSelectedBall('yellow');
              const activeBallCoords = physicsBalls.current.yellow;
              const isOffCourt = Math.abs(activeBallCoords.x) > 14 || Math.abs(activeBallCoords.z) > 17.5;
              if (isOffCourt) {
                showToast("Drag ball onto court");
              }
            }
          }}
        />

        <OrbitControls makeDefault enabled={!drawMode || !isDrawingActive} maxPolarAngle={Math.PI / 2 - 0.05} minDistance={5} maxDistance={250} target={[-3.19, 0.17, 0.28]} />
      </Canvas>

      {/* Floating Control Panel HUD (HTML Overlay) */}
      <div className="floating-control-panel">
        {/* Left Column: Color set selector and ball stack */}
        <div className="hud-left-column">
          <div className="panel-title">Active Ball</div>
          
          <div className="hud-selector-row">
            {/* PRI/SEC Selection Buttons Stack */}
            <div className="pri-sec-btn-stack">
              <button 
                className={`pri-sec-btn ${ballSet === 'primary' ? 'active' : ''}`}
                onClick={() => {
                  if (activeStriker === null) setBallSet('primary');
                }}
                disabled={activeStriker !== null}
                title="Use 1st Colors (Primary)"
              >
                Pri
              </button>
              <button 
                className={`pri-sec-btn ${ballSet === 'secondary' ? 'active' : ''}`}
                onClick={() => {
                  if (activeStriker === null) setBallSet('secondary');
                }}
                disabled={activeStriker !== null}
                title="Use 2nd Colors (Secondary)"
              >
                Sec
              </button>
            </div>

            {/* Vertical Ball Stack */}
            <div className="hud-ball-stack">
              <button 
                className={`strike-btn ${ballSet === 'primary' ? 'btn-blue' : 'btn-green'} ${selectedBall === 'blue' ? 'selected' : ''}`} 
                onClick={() => handleHUDSelect('blue')} 
                title={ballSet === 'primary' ? "Select Blue Ball" : "Select Green Ball"}
                disabled={activeStriker !== null}
              />
              <button 
                className={`strike-btn ${ballSet === 'primary' ? 'btn-red' : 'btn-pink'} ${selectedBall === 'red' ? 'selected' : ''}`} 
                onClick={() => handleHUDSelect('red')} 
                title={ballSet === 'primary' ? "Select Red Ball" : "Select Pink Ball"}
                disabled={activeStriker !== null}
              />
              <button 
                className={`strike-btn ${ballSet === 'primary' ? 'btn-black' : 'btn-brown'} ${selectedBall === 'black' ? 'selected' : ''}`} 
                onClick={() => handleHUDSelect('black')} 
                title={ballSet === 'primary' ? "Select Black Ball" : "Select Brown Ball"}
                disabled={activeStriker !== null}
              />
              <button 
                className={`strike-btn ${ballSet === 'primary' ? 'btn-yellow' : 'btn-white'} ${selectedBall === 'yellow' ? 'selected' : ''}`} 
                onClick={() => handleHUDSelect('yellow')} 
                title={ballSet === 'primary' ? "Select Yellow Ball" : "Select White Ball"}
                disabled={activeStriker !== null}
              />
            </div>
          </div>
        </div>

        {/* Fine vertical divider line */}
        <div className="hud-vertical-divider" />

        {/* Right Column: Vertically stacked action rows */}
        <div className="hud-right-column">
          <button 
            className="hud-action-row" 
            onClick={handleUndo} 
            disabled={activeStriker !== null || history.length === 0}
            title="Undo Last Action"
          >
            <div className="hud-action-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                <path d="M3 7v6h6"/>
                <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
              </svg>
            </div>
            <span>Undo</span>
          </button>
          
          <button 
            className="hud-action-row" 
            onClick={handleReset} 
            disabled={activeStriker !== null}
            title={isGameReset ? "Start Game" : "Restart Game"}
          >
            <div className="hud-action-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
              </svg>
            </div>
            <span>{isGameReset ? 'Start' : 'Restart'}</span>
          </button>

          <button
            className={`hud-action-row ${showAimingLines ? 'active-toggle' : ''}`}
            onClick={() => setShowAimingLines(!showAimingLines)}
            disabled={activeStriker !== null || isSelectedBallOffCourt}
            title="Toggle Aiming Guides"
          >
            <div className="hud-action-icon">
              {showAimingLines ? (
                <svg viewBox="0 0 24 24" fill="none" style={{ strokeWidth: '2.5', width: '16px', height: '16px' }}>
                  <circle cx="12" cy="12" r="8" stroke="#000000" />
                  <circle cx="12" cy="12" r="4" stroke="#000000" />
                  <line x1="12" y1="2" x2="12" y2="22" stroke="#ffe680" strokeLinecap="round" />
                  <line x1="2" y1="12" x2="22" y2="12" stroke="#ffe680" strokeLinecap="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" style={{ strokeWidth: '2.5', width: '16px', height: '16px' }}>
                  <circle cx="12" cy="12" r="8" stroke="currentColor" />
                  <circle cx="12" cy="12" r="4" stroke="currentColor" />
                </svg>
              )}
            </div>
            <span>Aim</span>
          </button>

          <button
            className={`hud-action-row ${showHelp ? 'active-toggle' : ''}`}
            onClick={() => setShowHelp(!showHelp)}
            title="Toggle Help Manual"
          >
            <div className="hud-action-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <span>Help</span>
          </button>

          <button
            className={`hud-action-row ${isFullscreen ? 'active-toggle' : ''}`}
            onClick={toggleFullscreen}
            title="Toggle Fullscreen Mode"
          >
            <div className="hud-action-icon">
              {isFullscreen ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                  <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                  <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3M10 21v-6H4M14 3v6h6" />
                </svg>
              )}
            </div>
            <span>Fullscreen</span>
          </button>
        </div>

        {/* Fine vertical divider line */}
        <div className="hud-vertical-divider" />

        {/* Third Column: Telestrator Annotation Controls */}
        <div className="hud-left-column" style={{ minWidth: '110px', gap: '8px' }}>
          <div className="panel-title" style={{ textAlign: 'center', width: '100%' }}>Telestrator</div>
          
          <button
            className={`hud-action-row ${drawMode ? 'active-toggle' : ''}`}
            onClick={() => {
              setDrawMode(!drawMode);
              if (drawMode) {
                setIsDrawingActive(false);
                setCurrentDrawingPoints([]);
              }
            }}
            title="Toggle Drawing Mode"
            style={{ width: '100%' }}
          >
            <div className="hud-action-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </div>
            <span>{drawMode ? 'Active' : 'Draw'}</span>
          </button>

          {drawMode && (
            <>
              {/* Tool Selection Buttons */}
              <div className="hud-selector-row" style={{ display: 'flex', gap: '3px', width: '100%', margin: '2px 0' }}>
                <button
                  className={`pri-sec-btn ${drawTool === 'freehand' ? 'active' : ''}`}
                  onClick={() => setDrawTool('freehand')}
                  title="Freehand Draw"
                  style={{ flex: 1, padding: '3px 0', fontSize: '8px', minWidth: '0' }}
                >
                  Draw
                </button>
                <button
                  className={`pri-sec-btn ${drawTool === 'line' ? 'active' : ''}`}
                  onClick={() => setDrawTool('line')}
                  title="Straight Line"
                  style={{ flex: 1, padding: '3px 0', fontSize: '8px', minWidth: '0' }}
                >
                  Line
                </button>
                <button
                  className={`pri-sec-btn ${drawTool === 'circle' ? 'active' : ''}`}
                  onClick={() => setDrawTool('circle')}
                  title="Circle Annotation"
                  style={{ flex: 1, padding: '3px 0', fontSize: '8px', minWidth: '0' }}
                >
                  Circle
                </button>
              </div>

              {/* Color Selectors */}
              <div className="hud-draw-colors" style={{ display: 'flex', justifyContent: 'center', gap: '8px', width: '100%', margin: '4px 0' }}>
                {(ballSet === 'primary' ? primaryDrawColors : secondaryDrawColors).map((color, idx) => {
                  const colorNames = ballSet === 'primary' 
                    ? ['Blue', 'Red', 'Black', 'Yellow'] 
                    : ['Green', 'Pink', 'Brown', 'White'];
                  const isSelected = drawColorIndex === idx;
                  return (
                    <button 
                      key={color}
                      className={`color-dot ${colorNames[idx].toLowerCase()} ${isSelected ? 'selected' : ''}`} 
                      onClick={() => setDrawColorIndex(idx)}
                      title={`${colorNames[idx]} Ball`}
                      style={{ 
                        width: '14px', 
                        height: '14px', 
                        borderRadius: '50%', 
                        border: '1px solid rgba(255,255,255,0.4)', 
                        backgroundColor: color, 
                        cursor: 'pointer', 
                        padding: 0, 
                        boxShadow: isSelected 
                           ? (color === '#000000' ? '0 0 10px #ffffff' : `0 0 10px ${color}`) 
                           : 'none',
                        transform: isSelected ? 'scale(1.2)' : 'none',
                        transition: 'all 0.15s cubic-bezier(0.2, 0.8, 0.2, 1.2)'
                      }}
                    />
                  );
                })}
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: '6px', width: '100%', marginTop: 'auto' }}>
            <button 
              className="hud-action-row" 
              onClick={() => {
                setDrawings(prev => prev.slice(0, -1));
              }}
              disabled={drawings.length === 0}
              title="Undo Last Drawing (Z)"
              style={{ flex: 1, padding: '6px 0', fontSize: '11px', minWidth: '0', justifyContent: 'center', gap: '4px' }}
            >
              <div className="hud-action-icon" style={{ margin: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '13px', height: '13px' }}>
                  <path d="M3 7v6h6"/>
                  <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
                </svg>
              </div>
              <span style={{ fontSize: '10.5px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em' }}>Undo</span>
            </button>

            <button 
              className="hud-action-row" 
              onClick={() => {
                setDrawings([]);
                setCurrentDrawingPoints([]);
              }}
              disabled={drawings.length === 0}
              title="Clear All Drawings (X)"
              style={{ flex: 1, padding: '6px 0', fontSize: '11px', minWidth: '0', justifyContent: 'center', gap: '4px' }}
            >
              <div className="hud-action-icon" style={{ margin: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '13px', height: '13px' }}>
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </div>
              <span style={{ fontSize: '10.5px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em' }}>Clear</span>
            </button>
          </div>
        </div>
      </div>

      {/* Cartoon "Press Start!" Animated Arrow Overlay */}
      {!hasClickedStart && (
        <div className="cartoon-start-overlay">
          <div className="cartoon-start-badge">
            <span>Click Help to learn, or press Start to play!</span>
          </div>
          <div className="cartoon-start-arrow">
            <svg viewBox="0 0 100 100" style={{ width: '60px', height: '60px' }}>
              {/* Thick Black Outline */}
              <path 
                d="M70,15 Q40,15 25,45" 
                fill="none" 
                stroke="#000000" 
                strokeWidth="10" 
                strokeLinecap="round" 
              />
              <path 
                d="M15,45 L33,43 M15,45 L23,27" 
                fill="none" 
                stroke="#000000" 
                strokeWidth="10" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
              />
              {/* Bright Gold Inner Fill */}
              <path 
                d="M70,15 Q40,15 25,45" 
                fill="none" 
                stroke="#ffe680" 
                strokeWidth="5" 
                strokeLinecap="round" 
              />
              <path 
                d="M15,45 L33,43 M15,45 L23,27" 
                fill="none" 
                stroke="#ffe680" 
                strokeWidth="5" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
              />
            </svg>
          </div>
        </div>
      )}

      {/* Onboarding Title Banner */}
      {!hasClickedStart && !showHelp && (
        <div className="onboarding-title-banner">
          <div className="onboarding-title-text">3D Golf Croquet Visualiser</div>
        </div>
      )}

      {/* Signature Watermark Overlay */}
      <div className="signature-watermark">
        <div className="signature-name">Murray Tinker's</div>
        <div className="signature-title">GC Croquet 3D Visualiser (0.62 Beta)</div>
        <div className="signature-copyright">© 2026</div>
      </div>

      {/* Premium Glassmorphic Toast Notification */}
      {toastMessage && (
        <div className="toast-notification">
          <div className="toast-content">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="toast-icon">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* ⚡ Drive Mode / Power Strike Active Symbol HUD Overlay */}
      {isSpacePressed && activeStriker === null && !isSelectedBallOffCourt && (
        <div className="drive-mode-badge">
          <svg className="drive-mode-icon" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          <span className="drive-mode-text">Drive Mode Active</span>
        </div>
      )}

      {/* Premium Glassmorphic Help Modal Overlay */}
      {showHelp && (
        <div className="help-modal-overlay" onClick={() => setShowHelp(false)}>
          <div className="help-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="help-modal-header">
              <h3 className="help-modal-title">GC Croquet 3D Visualiser Guide</h3>
              <button className="help-modal-close-btn" onClick={() => setShowHelp(false)} title="Close Guide">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="help-modal-body">
              {/* Getting Started */}
              <div className="help-section">
                <h4 className="help-section-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="control-icon" style={{ width: '16px', height: '16px', fill: 'none' }}>
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Getting Started & Playing Shots
                </h4>
                <ol className="help-step-list">
                  <li className="help-step-item">
                    <span className="help-step-num">1</span>
                    <div className="help-gesture-desc">
                      <span className="help-gesture-title">Start the Game</span>
                      The game loads automatically. You can click the <strong style={{ color: '#ffe680' }}>Start / Restart</strong> button in the control panel to set the 4 balls at their starting positions near Corner 4 (South-East). Drag your ball(s) onto the lawn to activate play.
                    </div>
                  </li>
                  <li className="help-step-item">
                    <span className="help-step-num">2</span>
                    <div className="help-gesture-desc">
                      <span className="help-gesture-title">Select a ball and hit</span>
                      Click directly on any ball on the court and then click a location on the court. The ball if selected will go there. (you may also select a ball from the control panel). If a ball is knocked "off-court", simply drag it back onto the court where it went out.
                    </div>
                  </li>
                  <li className="help-step-item">
                    <span className="help-step-num">3</span>
                    <div className="help-gesture-desc" style={{ flexGrow: 1 }}>
                      <span className="help-gesture-title" style={{ color: '#ffe680' }}>
                        Extra Shot Options
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
                        {/* Aim Mode */}
                        <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '8px', padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ffffff', fontWeight: 700, marginBottom: '4px' }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '14px', height: '14px', color: '#ffe680' }}>
                              <circle cx="12" cy="12" r="10" />
                              <circle cx="12" cy="12" r="6" />
                              <circle cx="12" cy="12" r="2" fill="currentColor" />
                            </svg>
                            Aim Mode & Ghost Ball
                          </div>
                          <div style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: '0.85rem', lineHeight: '1.4' }}>
                            Click the <strong style={{ color: '#ffe680' }}>Aim</strong> Button in the Control Panel or press the <kbd className="help-key-badge">A</kbd> key to toggle **Aim Mode**.
                            <br/><br/>
                            When aiming your selected striker ball towards another ball, the center peg, or any hoop leg, a semi-transparent **Ghost Ball** will appear at the exact contact boundary. Dynamic dashed lines will project the mathematically precise post-impact **scattering trajectories** of both balls.
                          </div>
                        </div>

                        {/* Drive Mode */}
                        <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '8px', padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ffffff', fontWeight: 700, marginBottom: '4px' }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '14px', height: '14px', color: '#ffb300' }}>
                              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor" />
                            </svg>
                            Drive Mode
                          </div>
                          <div style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: '0.85rem', lineHeight: '1.4' }}>
                            Hold down the <kbd className="help-key-badge">Spacebar</kbd> when clicking or tapping the court to activate **Drive Mode**. The ball will be struck at a high driving speed (54 yd/s) that will easily blast it off the court, unless it strikes another ball, a hoop leg, or the center peg!
                          </div>
                        </div>

                        {/* Telestrator Annotation */}
                        <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '8px', padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ffe680', fontWeight: 700, marginBottom: '4px' }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '14px', height: '14px', color: '#ffe680' }}>
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                            Explain Tools
                          </div>
                          <div style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: '0.85rem', lineHeight: '1.4' }}>
                            Click the <strong style={{ color: '#00e5ff' }}>Draw</strong> Button in the Control Panel or press the <kbd className="help-key-badge">D</kbd> key to toggle **Telestrator Mode**.
                            <br/><br/>
                            • <strong>Coaching Tools:</strong> Choose between <strong>Draw</strong> (freehand curves), <strong>Line</strong> (straight vectors), or <strong>Circle</strong> tools to annotate plays.
                            <br/>
                            • <strong>Matching Colors:</strong> Color buttons in the control panel automatically match the **active ball colors**. Toggling between <strong>Pri / Sec</strong> dynamically updates the active sketch colors to match!
                            <br/>
                            • <strong>Hotkeys & Clean:</strong> Press <kbd className="help-key-badge">Z</kbd> to Undo the last stroke, or <kbd className="help-key-badge">X</kbd> to Clear the entire board. 3D camera pan/orbit is automatically locked while drawing so you can draw smoothly!
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                </ol>
              </div>

              {/* Mouse & Touch Gestures */}
              <div className="help-section">
                <h4 className="help-section-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="control-icon" style={{ width: '16px', height: '16px', fill: 'none' }}>
                    <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5" />
                    <path d="M14 10V5a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5" />
                    <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8.5" />
                    <path d="M6 14v0a4 4 0 0 0 4 4h4a6 6 0 0 0 6-6V11a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2" />
                  </svg>
                  3D Navigation & Gestures
                </h4>
                <div className="help-grid">
                  <div className="help-grid-item">
                    <div className="help-gesture-icon">
                      <svg viewBox="0 0 24 24" fill="none" style={{ width: '20px', height: '20px' }}>
                        <path d="M 12 2 A 6 6 0 0 0 6 8 L 6 10 L 12 10 Z" fill="#ffe680" opacity="0.9" />
                        <rect x="6" y="2" width="12" height="20" rx="6" stroke="currentColor" strokeWidth="1.5" fill="none" />
                        <line x1="12" y1="2" x2="12" y2="10" stroke="currentColor" strokeWidth="1.5" />
                        <line x1="6" y1="10" x2="18" y2="10" stroke="currentColor" strokeWidth="1.5" />
                        <rect x="11" y="4" width="2" height="4" rx="1" fill="currentColor" opacity="0.3" />
                      </svg>
                    </div>
                    <div className="help-gesture-desc">
                      <span className="help-gesture-title">Rotate (Orbit) View</span>
                      <strong style={{ color: '#ffe680' }}>Mouse:</strong> Click and drag Left Mouse Button (LMB).<br />
                      <strong style={{ color: '#ffe680' }}>Touchscreen:</strong> Drag with a single finger.
                    </div>
                  </div>
                  <div className="help-grid-item">
                    <div className="help-gesture-icon">
                      <svg viewBox="0 0 24 24" fill="none" style={{ width: '20px', height: '20px' }}>
                        <path d="M 12 2 A 6 6 0 0 1 18 8 L 18 10 L 12 10 Z" fill="#ffe680" opacity="0.9" />
                        <rect x="6" y="2" width="12" height="20" rx="6" stroke="currentColor" strokeWidth="1.5" fill="none" />
                        <line x1="12" y1="2" x2="12" y2="10" stroke="currentColor" strokeWidth="1.5" />
                        <line x1="6" y1="10" x2="18" y2="10" stroke="currentColor" strokeWidth="1.5" />
                        <rect x="11" y="4" width="2" height="4" rx="1" fill="currentColor" opacity="0.3" />
                      </svg>
                    </div>
                    <div className="help-gesture-desc">
                      <span className="help-gesture-title">Pan (Move Focus)</span>
                      <strong style={{ color: '#ffe680' }}>Mouse:</strong> Click and drag Right Mouse Button (RMB) or hold <kbd style={{ fontFamily: 'monospace', background: 'rgba(255,255,255,0.1)', padding: '2px 4px', borderRadius: '4px' }}>Shift</kbd> + LMB drag.<br />
                      <strong style={{ color: '#ffe680' }}>Touchscreen:</strong> Drag with two fingers.
                    </div>
                  </div>
                  <div className="help-grid-item" style={{ gridColumn: 'span 2' }}>
                    <div className="help-gesture-icon">
                      <svg viewBox="0 0 24 24" fill="none" style={{ width: '20px', height: '20px' }}>
                        <rect x="6" y="2" width="12" height="20" rx="6" stroke="currentColor" strokeWidth="1.5" fill="none" />
                        <line x1="12" y1="2" x2="12" y2="10" stroke="currentColor" strokeWidth="1.5" />
                        <line x1="6" y1="10" x2="18" y2="10" stroke="currentColor" strokeWidth="1.5" />
                        <rect x="11" y="4" width="2" height="4" rx="1" fill="#ffe680" stroke="#ffe680" strokeWidth="0.5" />
                      </svg>
                    </div>
                    <div className="help-gesture-desc">
                      <span className="help-gesture-title">Zoom In & Out</span>
                      <strong style={{ color: '#ffe680' }}>Mouse Scroll:</strong> Scroll wheel up to Zoom In, down to Zoom Out.<br />
                      <strong style={{ color: '#ffe680' }}>Touchscreen Gesture:</strong> Pinch two fingers together to Zoom Out, spread apart to Zoom In.<br />
                      <strong style={{ color: '#ffe680' }}>Keyboard Option:</strong> Press <kbd className="help-key-badge">+</kbd> or <kbd className="help-key-badge">-</kbd> to zoom in or out 20% dynamically.
                    </div>
                  </div>
                </div>
              </div>

              {/* Keyboard Camera Controls */}
              <div className="help-section">
                <h4 className="help-section-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="control-icon" style={{ width: '16px', height: '16px', fill: 'none' }}>
                    <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
                    <line x1="6" y1="8" x2="6.01" y2="8" /><line x1="10" y1="8" x2="10.01" y2="8" /><line x1="14" y1="8" x2="14.01" y2="8" /><line x1="18" y1="8" x2="18.01" y2="8" />
                    <line x1="6" y1="12" x2="6.01" y2="12" /><line x1="10" y1="12" x2="10.01" y2="12" /><line x1="14" y1="12" x2="14.01" y2="12" /><line x1="18" y1="12" x2="18.01" y2="12" />
                    <line x1="7" y1="16" x2="17" y2="16" />
                  </svg>
                  Keyboard Shortcuts
                </h4>
                <div className="help-controls-table">
                  <div className="help-controls-row">
                    <div className="help-controls-key-col">
                      <kbd className="help-key-badge">A</kbd>
                    </div>
                    <div className="help-controls-desc">Toggle Aim Mode (displays 3D Ghost Ball & elastic collision lines)</div>
                  </div>
                  <div className="help-controls-row">
                    <div className="help-controls-key-col">
                      <kbd className="help-key-badge">D</kbd>
                    </div>
                    <div className="help-controls-desc">Toggle Draw / Telestrator Mode to sketch tactical lines directly on the grass</div>
                  </div>
                  <div className="help-controls-row">
                    <div className="help-controls-key-col">
                      <kbd className="help-key-badge">X</kbd>
                    </div>
                    <div className="help-controls-desc">Clear all active telestrator drawings from the lawn</div>
                  </div>
                  <div className="help-controls-row">
                    <div className="help-controls-key-col">
                      <kbd className="help-key-badge">Z</kbd>
                    </div>
                    <div className="help-controls-desc">Undo the last drawn tactical sketch, line, or circle</div>
                  </div>
                  <div className="help-controls-row">
                    <div className="help-controls-key-col">
                      <kbd className="help-key-badge">H</kbd>
                    </div>
                    <div className="help-controls-desc">Hold down to display floating 3D hoop markers (1-6) </div>
                  </div>
                  <div className="help-controls-row">
                    <div className="help-controls-key-col">
                      <kbd className="help-key-badge">Space</kbd>
                    </div>
                    <div className="help-controls-desc">Hold down for Drive Mode (Power Strike at 54 yd/s)</div>
                  </div>
                  <div className="help-controls-row">
                    <div className="help-controls-key-col">
                      <kbd className="help-key-badge">O</kbd>
                    </div>
                    <div className="help-controls-desc">Overhead View (landscape-rotated 90° anti-clockwise on PC/Mac)</div>
                  </div>
                  <div className="help-controls-row">
                    <div className="help-controls-key-col">
                      <kbd className="help-key-badge">N</kbd>
                      <kbd className="help-key-badge">S</kbd>
                    </div>
                    <div className="help-controls-desc">North View (looking South) / South View (looking North)</div>
                  </div>
                  <div className="help-controls-row">
                    <div className="help-controls-key-col">
                      <kbd className="help-key-badge">E</kbd>
                      <kbd className="help-key-badge">W</kbd>
                    </div>
                    <div className="help-controls-desc">East View (looking West) / West View (looking East)</div>
                  </div>
                  <div className="help-controls-row">
                    <div className="help-controls-key-col">
                      <kbd className="help-key-badge">1</kbd>
                      <kbd className="help-key-badge">2</kbd>
                      <kbd className="help-key-badge">3</kbd>
                      <kbd className="help-key-badge">4</kbd>
                      <kbd className="help-key-badge">5</kbd>
                      <kbd className="help-key-badge">6</kbd>
                    </div>
                    <div className="help-controls-desc">Camera View of Hoop Area</div>
                  </div>
                  <div className="help-controls-row">
                    <div className="help-controls-key-col">
                      <kbd className="help-key-badge">0</kbd>
                    </div>
                    <div className="help-controls-desc">GC Game Start View</div>
                  </div>
                  <div className="help-controls-row">
                    <div className="help-controls-key-col">
                      <kbd className="help-key-badge">+</kbd>
                      <kbd className="help-key-badge">-</kbd>
                    </div>
                    <div className="help-controls-desc">Zoom In (+20%) / Zoom Out (-20%) per tap</div>
                  </div>
                  <div className="help-controls-row">
                    <div className="help-controls-key-col">
                      <kbd className="help-key-badge">C</kbd>
                    </div>
                    <div className="help-controls-desc">Log exact camera position & target details to developer console</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
