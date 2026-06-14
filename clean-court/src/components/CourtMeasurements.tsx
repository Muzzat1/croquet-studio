import { useState, useEffect, useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Line, Html } from '@react-three/drei';
import * as THREE from 'three';

// Unit Converter: 1 Yard = 0.9144 Metres
function formatDist(yards: number, unit: 'yards' | 'metres' | 'dual') {
  const m = yards * 0.9144;
  const mStr = yards === 1 ? `${m.toFixed(2)} m` : `${m.toFixed(1)} m`;
  const yStr = `${yards} yd`;
  if (unit === 'yards') return yStr;
  if (unit === 'metres') return mStr;
  return `${yStr} / ${mStr}`;
}

// -------------------------------------------------------------
// STEP-BY-STEP CAMERA COORDINATES (Position & LookAt Targets)
// -------------------------------------------------------------
interface CameraTarget {
  pos: [number, number, number];
  lookAt: [number, number, number];
}

const STEP_CAMERAS: Record<number, CameraTarget> = {
  0: { pos: [-0.01, 42, 0], lookAt: [0, 0, 0] },       // Overhead 2D View at Step 0 (Landscape, West at bottom)
  1: { pos: [-24, 15, 0], lookAt: [-14, 0, 0] },     // Step 1 West/East Lines (Length)
  2: { pos: [0, 15, 26], lookAt: [0, 0, 17.5] },     // Step 2 North/South Lines (Width)
  3: { pos: [-16, 7, 19.5], lookAt: [-7, 0, 10.5] },  // Step 3 Hoop 1 SW: close-up
  4: { pos: [-16, 7, -19.5], lookAt: [-7, 0, -10.5] },// Step 4 Hoop 2 NW: close-up
  5: { pos: [16, 7, -19.5], lookAt: [7, 0, -10.5] },  // Step 5 Hoop 3 NE: close-up
  6: { pos: [16, 7, 19.5], lookAt: [7, 0, 10.5] },   // Step 6 Hoop 4 SE: close-up
  7: { pos: [-0.01, 42, 0], lookAt: [0, 0, 0] },       // Step 7 Center Peg: Top-Down 2D View (Landscape, West at bottom)
  8: { pos: [-6, 6, 12], lookAt: [0, 0, 7] },        // Step 8 Hoop 5 S Center: close-up
  9: { pos: [-6, 6, -12], lookAt: [0, 0, -7] },      // Step 9 Hoop 6 N Center: close-up
  10: { pos: [17, 4, 20.5], lookAt: [14, 0, 17.5] },  // Step 10 Start Corner SE: close-up
  11: { pos: [19, 5, 0], lookAt: [14, 0, 0] },        // Step 11 Penalty Areas (East close-up)
  12: { pos: [26, 20, 26], lookAt: [0, 0, 0] },      // Step 12 Flags: wide view
  13: { pos: [0, 30, 26], lookAt: [0, 0, 0] },       // Step 13 Complete: high top-down angle
};

const MANUAL_PRESETS: Record<string, CameraTarget> = {
  topdown: { pos: [-0.01, 42, 0], lookAt: [0, 0, 0] },
  isometric: { pos: [26, 20, 26], lookAt: [0, 0, 0] },
  north: { pos: [0, 6, -30], lookAt: [0, 0, -8] },
  south: { pos: [0, 6, 30], lookAt: [0, 0, 8] },
  east: { pos: [28, 6, 0], lookAt: [8, 0, 0] },
  west: { pos: [-28, 6, 0], lookAt: [-8, 0, 0] },
};

// -------------------------------------------------------------
// SUB-COMPONENTS (3D ELEMENTS)
// -------------------------------------------------------------

interface Arrow3DProps {
  start: [number, number, number];
  end: [number, number, number];
  label: string;
  color?: string;
  lineWidth?: number;
  offsetY?: number;
  labelOffset?: [number, number, number];
  fontSize?: string;
}

function Arrow3D({ 
  start, 
  end, 
  label, 
  color = '#ffeb3b', 
  lineWidth = 0.015, // Thinner lines like draftsman drawings
  offsetY = 0.04,
  labelOffset = [0, 0.2, 0],
  fontSize = '10px'
}: Arrow3DProps) {
  const p1 = useMemo(() => new THREE.Vector3(start[0], start[1] + offsetY, start[2]), [start, offsetY]);
  const p2 = useMemo(() => new THREE.Vector3(end[0], end[1] + offsetY, end[2]), [end, offsetY]);
  
  const { len, quaternion } = useMemo(() => {
    const d = new THREE.Vector3().subVectors(p2, p1);
    const l = d.length();
    d.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    return { len: l, quaternion: q };
  }, [p1, p2]);

  const coneHeight = 0.12; // Thinner and sharper arrowheads
  const coneRadius = 0.04;

  return (
    <group position={p1} quaternion={quaternion}>
      {/* Dimension Line Shaft */}
      <mesh position={[0, len / 2, 0]} castShadow>
        <cylinderGeometry args={[lineWidth, lineWidth, len, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      
      {/* Arrowhead at Start (Pointing downwards to p1) */}
      <mesh position={[0, coneHeight / 2, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[coneRadius, coneHeight, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      
      {/* Arrowhead at End (Pointing upwards to p2) */}
      <mesh position={[0, len - coneHeight / 2, 0]}>
        <coneGeometry args={[coneRadius, coneHeight, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      
      {/* HTML text label floating above arrow center - Styled like a landscape draftsman's blueprint label */}
      <Html position={[labelOffset[0], len / 2 + labelOffset[1], labelOffset[2]]} center distanceFactor={14}>
        <div style={{
          background: 'rgba(244, 244, 246, 0.46)', // Tracing paper light grey (50% more transparent)
          color: '#143d22', // Dark green text
          border: `1px solid ${color}`, // Thin border matching the dimension line color
          borderRadius: '0px', // Sharp square corners
          padding: '1px 4px', // Minimised padding to shrink background box
          fontSize: fontSize, // Crisp, small text (or customized)
          fontWeight: 700,
          fontFamily: "Consolas, Monaco, 'Andale Mono', 'Courier New', monospace", // Technical draftsman font
          letterSpacing: '0.04em', // Tight letter spacing
          whiteSpace: 'nowrap',
          boxShadow: 'none', // Flat draftsman style
          textShadow: 'none',
          lineHeight: '1.1' // Tight line height to minimise vertical spacing
        }}>
          {label}
        </div>
      </Html>
    </group>
  );
}

// Compass Directions Boundary Labels (Added 1-by-1 but left visible)
// Styled to be written directly onto the court in white italic, offset from the measure labels (placed inside boundary lines)
function CompassLabels({ visibleCount }: { visibleCount: number }) {
  const labelStyle: React.CSSProperties = {
    background: 'transparent',
    color: '#ffffff',
    border: 'none',
    borderRadius: '0',
    padding: '0',
    fontSize: '15px',
    fontWeight: 900,
    fontStyle: 'italic', // White italic
    fontFamily: "'Outfit', sans-serif",
    letterSpacing: '0.2em',
    whiteSpace: 'nowrap',
    textShadow: '0 2px 4px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,0.9)', // Highly visible on grass
    textTransform: 'uppercase'
  };

  return (
    <group>
      {/* WEST (Negative X) - Added 1st, placed inside West boundary line on the court */}
      {visibleCount >= 1 && (
        <Html position={[-12.0, 0.05, 0]} center distanceFactor={22}>
          <div style={labelStyle}>West</div>
        </Html>
      )}

      {/* EAST (Positive X) - Added 2nd, placed inside East boundary line on the court */}
      {visibleCount >= 2 && (
        <Html position={[12.0, 0.05, 0]} center distanceFactor={22}>
          <div style={labelStyle}>East</div>
        </Html>
      )}

      {/* NORTH (Negative Z) - Added 3rd, placed inside North boundary line on the court */}
      {visibleCount >= 3 && (
        <Html position={[0, 0.05, -15.5]} center distanceFactor={22}>
          <div style={labelStyle}>North</div>
        </Html>
      )}

      {/* SOUTH (Positive Z) - Added 4th, placed inside South boundary line on the court */}
      {visibleCount >= 4 && (
        <Html position={[0, 0.05, 15.5]} center distanceFactor={22}>
          <div style={labelStyle}>South</div>
        </Html>
      )}
    </group>
  );
}

// Corner Flag (3x scale)
function CornerFlag({ color, position }: { color: string; position: [number, number, number] }) {
  const poleHeight = 1.0; // 36 inches (3x scale)
  const poleRadius = 0.045;
  const flagWidth = 0.6;
  const flagHeight = 0.6;

  const flagShape = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0, flagHeight);
    shape.lineTo(flagWidth, flagHeight);
    shape.lineTo(flagWidth, 0);
    shape.closePath();
    return shape;
  }, [flagWidth, flagHeight]);

  return (
    <group position={position}>
      <mesh position={[0, poleHeight / 2, 0]} castShadow>
        <cylinderGeometry args={[poleRadius, poleRadius, poleHeight, 8]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} />
      </mesh>
      <mesh position={[poleRadius, poleHeight - flagHeight, 0]} castShadow>
        <extrudeGeometry args={[flagShape, { depth: 0.005, bevelEnabled: false }]} />
        <meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={0.6} />
      </mesh>
    </group>
  );
}

// Animated Center Peg Component (3-stage mallet hit simulation)
function AnimatedPeg({ step }: { step: number }) {
  const pegGroupRef = useRef<THREE.Group>(null);
  const animTime = useRef(0);

  useEffect(() => {
    animTime.current = 0;
  }, [step]);

  useFrame((_, delta) => {
    if (!pegGroupRef.current) return;

    if (step === 7) {
      animTime.current = Math.min(animTime.current + delta, 1.8);
      const t = animTime.current / 1.8; // Normalized time (0 to 1) over 1.8s

      let animatedY = 0;
      if (t < 0.3) {
        // Strike 1
        const nt = t / 0.3;
        if (nt < 0.33) {
          const strikeT = nt / 0.33;
          animatedY = 5.0 - 2.0 * strikeT * strikeT;
        } else {
          const settleT = (nt - 0.33) / 0.67;
          animatedY = 3.0 + 0.15 * Math.sin(settleT * Math.PI);
        }
      } else if (t < 0.6) {
        // Strike 2
        const nt = (t - 0.3) / 0.3;
        if (nt < 0.33) {
          const strikeT = nt / 0.33;
          animatedY = 3.1 - 1.7 * strikeT * strikeT;
        } else {
          const settleT = (nt - 0.33) / 0.67;
          animatedY = 1.4 + 0.12 * Math.sin(settleT * Math.PI);
        }
      } else {
        // Strike 3 (Drive Home)
        const nt = (t - 0.6) / 0.4;
        if (nt < 0.25) {
          const strikeT = nt / 0.25;
          animatedY = 1.45 - 1.45 * strikeT * strikeT;
        } else {
          const settleT = (nt - 0.25) / 0.75;
          animatedY = 0.0 + 0.08 * Math.sin(settleT * Math.PI * 2) * Math.exp(-settleT * 4);
        }
      }
      pegGroupRef.current.position.y = animatedY;
    } else {
      pegGroupRef.current.position.y = 0;
    }
  });

  return (
    <group ref={pegGroupRef}>
      <mesh position={[0, 0.65625, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.075, 0.075, 1.3125, 16]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} />
      </mesh>
      {['#1565c0', '#d32f2f', '#222222', '#ffeb3b'].map((col, idx) => (
        <mesh key={`peg-band-${idx}`} position={[0, 1.3125 - 0.08 - idx * 0.16, 0]}>
          <cylinderGeometry args={[0.076, 0.076, 0.16, 16]} />
          <meshStandardMaterial color={col} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

// Halfway Peg (Offside Marker)
function HalfwayPeg({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.125, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.018, 0.018, 0.25, 8]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.245, 0]}>
        <cylinderGeometry args={[0.019, 0.019, 0.015, 8]} />
        <meshStandardMaterial color="#222222" roughness={0.4} />
      </mesh>
    </group>
  );
}

// Quadway Hoop
function QuadwayHoop({ position, crownColor = '#ffffff' }: { position: [number, number, number]; crownColor?: string }) {
  const crownWidth = 0.375;
  const height = 0.875;
  const staveRadius = 0.035;
  const crownSize = 0.07;

  return (
    <group position={position}>
      {/* Left Leg */}
      <mesh position={[-crownWidth / 2, height / 2, 0]} castShadow>
        <cylinderGeometry args={[staveRadius, staveRadius, height, 16]} />
        <meshStandardMaterial color="#b0bec5" metalness={0.8} roughness={0.2} />
      </mesh>
      
      {/* Right Leg */}
      <mesh position={[crownWidth / 2, height / 2, 0]} castShadow>
        <cylinderGeometry args={[staveRadius, staveRadius, height, 16]} />
        <meshStandardMaterial color="#b0bec5" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Hoop Crown */}
      <mesh position={[0, height, 0]} castShadow>
        <boxGeometry args={[crownWidth + crownSize, crownSize, crownSize]} />
        <meshStandardMaterial 
          color={crownColor} 
          metalness={0.1} 
          roughness={0.3}
          emissive={crownColor}
          emissiveIntensity={0.2}
        />
      </mesh>
    </group>
  );
}

// -------------------------------------------------------------
// PARAMETRIC ARC GENERATION (FOR START CORNER & PENALTIES)
// -------------------------------------------------------------
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
      0.012, // slightly raised
      centerZ + Math.sin(angle) * radius
    ]);
  }
  return points;
}

// -------------------------------------------------------------
// COURT BASE SURFACE (GRASS)
// -------------------------------------------------------------
function CourtBase({ step }: { step: number }) {
  const stripeWidth = 28 / 12;
  const stripes = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const x = -14 + (i + 0.5) * stripeWidth;
      const color = i % 2 === 0 ? '#2b6639' : '#317843';
      return { x, color };
    });
  }, [stripeWidth]);

  return (
    <group>
      {/* Massive lawn backdrop */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[1000, 1000]} />
        <meshStandardMaterial color="#24512c" roughness={0.95} />
      </mesh>

      {/* Mowing stripes */}
      {stripes.map((s, idx) => (
        <mesh key={`stripe-${idx}`} position={[s.x, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[stripeWidth, 35]} />
          <meshStandardMaterial color={s.color} roughness={0.88} />
        </mesh>
      ))}

      {/* Boundary Lines drawn in Steps 1 and 2 */}
      {step >= 1 && (
        <>
          {/* West boundary line */}
          <Line 
            points={[[-14, 0.015, -17.5], [-14, 0.015, 17.5]]} 
            color="white" 
            lineWidth={3.5} 
            polygonOffset 
            polygonOffsetFactor={-4}
          />
          {/* East boundary line */}
          <Line 
            points={[[14, 0.015, -17.5], [14, 0.015, 17.5]]} 
            color="white" 
            lineWidth={3.5} 
            polygonOffset 
            polygonOffsetFactor={-4}
          />
        </>
      )}
      
      {step >= 2 && (
        <>
          {/* North boundary line */}
          <Line 
            points={[[-14, 0.015, -17.5], [14, 0.015, -17.5]]} 
            color="white" 
            lineWidth={3.5} 
            polygonOffset 
            polygonOffsetFactor={-4}
          />
          {/* South boundary line */}
          <Line 
            points={[[-14, 0.015, 17.5], [14, 0.015, 17.5]]} 
            color="white" 
            lineWidth={3.5} 
            polygonOffset 
            polygonOffsetFactor={-4}
          />
        </>
      )}
    </group>
  );
}

// -------------------------------------------------------------
// CAMERA GLIDE COORDINATOR
// -------------------------------------------------------------
interface CameraControllerProps {
  targetPos: THREE.Vector3;
  targetLookAt: THREE.Vector3;
  isGliding: React.MutableRefObject<boolean>;
  controlsRef: React.RefObject<any>;
}

function CameraController({ targetPos, targetLookAt, isGliding, controlsRef }: CameraControllerProps) {
  useFrame((state) => {
    if (isGliding.current && controlsRef.current) {
      const cam = state.camera;
      cam.position.lerp(targetPos, 0.025); // Slowed down panning 2x (from 0.05 to 0.025)
      controlsRef.current.target.lerp(targetLookAt, 0.025);
      controlsRef.current.update();

      const posDist = cam.position.distanceTo(targetPos);
      const targetDist = controlsRef.current.target.distanceTo(targetLookAt);
      if (posDist < 0.05 && targetDist < 0.05) {
        isGliding.current = false;
      }
    }
  });
  return null;
}

// -------------------------------------------------------------
// MAIN COMPONENT
// -------------------------------------------------------------
export default function CourtMeasurements() {
  const [step, setStep] = useState(0);
  const [unit, setUnit] = useState<'yards' | 'metres' | 'dual'>('dual');
  const [camPreset, setCamPreset] = useState<string>('topdown');
  const [isPlaying, setIsPlaying] = useState(false);
  const playTimer = useRef<number | null>(null);
  const autoStartTimerRef = useRef<number | null>(null);

  const [visibleLabelsCount, setVisibleLabelsCount] = useState(0);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);

  // References for audio playback, camera controls, and smooth transitions
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechTimeoutRef = useRef<number | null>(null);
  const controlsRef = useRef<any>(null);
  const isGliding = useRef<boolean>(true);
  const [targetPos] = useState<THREE.Vector3>(() => new THREE.Vector3(...STEP_CAMERAS[0].pos));
  const [targetLookAt] = useState<THREE.Vector3>(() => new THREE.Vector3(...STEP_CAMERAS[0].lookAt));

  // Effect to manage 1-by-1 boundary label animation at Step 0, keeping them all visible for step > 0
  useEffect(() => {
    if (step > 0) {
      setVisibleLabelsCount(4);
      return;
    }

    setVisibleLabelsCount(0);
    const timers: number[] = [];

    // Add West label at 1s
    timers.push(window.setTimeout(() => {
      setVisibleLabelsCount(1);
    }, 1000));

    // Add East label at 2s
    timers.push(window.setTimeout(() => {
      setVisibleLabelsCount(2);
    }, 2000));

    // Add North label at 3s
    timers.push(window.setTimeout(() => {
      setVisibleLabelsCount(3);
    }, 3000));

    // Add South label at 4s
    timers.push(window.setTimeout(() => {
      setVisibleLabelsCount(4);
    }, 4000));

    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, [step]);

  // Trigger camera glide to a step target
  const triggerGlide = (pos: [number, number, number], lookAt: [number, number, number]) => {
    targetPos.set(...pos);
    targetLookAt.set(...lookAt);
    isGliding.current = true;
  };

  // Helper to clear the initial auto-start timer if user interacts with controls
  const clearAutoStart = () => {
    if (autoStartTimerRef.current) {
      clearTimeout(autoStartTimerRef.current);
      autoStartTimerRef.current = null;
    }
  };

  // Initial load hook: start in Top-down landscape view, pause 5s, then automatically start sequence
  useEffect(() => {
    triggerGlide(STEP_CAMERAS[0].pos, STEP_CAMERAS[0].lookAt);

    autoStartTimerRef.current = window.setTimeout(() => {
      setIsPlaying(true);
      setStep(1);
      const camTarget = STEP_CAMERAS[1];
      triggerGlide(camTarget.pos, camTarget.lookAt);
    }, 5000); // 5-second pause on load before autoplay starts

    return () => {
      if (autoStartTimerRef.current) clearTimeout(autoStartTimerRef.current);
    };
  }, []);

  const advanceSequence = () => {
    setStep((prev) => {
      if (prev >= 13) {
        setIsPlaying(false);
        return 13;
      }
      const nextStep = prev + 1;
      const camTarget = STEP_CAMERAS[nextStep];
      triggerGlide(camTarget.pos, camTarget.lookAt);
      return nextStep;
    });
  };

  // Autoplay progression timer (active only when voice is muted)
  useEffect(() => {
    if (!isPlaying || isVoiceEnabled) {
      if (playTimer.current) {
        clearTimeout(playTimer.current);
        playTimer.current = null;
      }
      return;
    }

    const delay = step === 7 ? 10500 : 3500; // 10.5s for Peg, otherwise 3.5s

    playTimer.current = window.setTimeout(() => {
      advanceSequence();
    }, delay);

    return () => {
      if (playTimer.current) clearTimeout(playTimer.current);
    };
  }, [isPlaying, step, isVoiceEnabled]);

  // Steppers
  const handleNext = () => {
    clearAutoStart();
    setIsPlaying(false);
    if (step < 13) {
      const nextStep = step + 1;
      setStep(nextStep);
      const camTarget = STEP_CAMERAS[nextStep];
      triggerGlide(camTarget.pos, camTarget.lookAt);
    }
  };

  const handleBack = () => {
    clearAutoStart();
    setIsPlaying(false);
    if (step > 0) {
      const prevStep = step - 1;
      setStep(prevStep);
      const camTarget = STEP_CAMERAS[prevStep];
      triggerGlide(camTarget.pos, camTarget.lookAt);
    }
  };

  const handleReset = () => {
    clearAutoStart();
    setIsPlaying(false);
    setStep(0);
    const camTarget = STEP_CAMERAS[0];
    triggerGlide(camTarget.pos, camTarget.lookAt);
  };

  const handleManualCamera = (presetKey: string) => {
    clearAutoStart();
    setCamPreset(presetKey);
    const target = MANUAL_PRESETS[presetKey];
    if (target) {
      triggerGlide(target.pos, target.lookAt);
    }
  };

  const togglePlayPause = () => {
    clearAutoStart();
    setIsPlaying(!isPlaying);
  };

  // Phase Metadata (Adjusted step boundaries for 14-step sequence)
  const phase = useMemo(() => {
    if (step <= 9) return { id: 1, name: "Court Setup & Layout", color: "#64b5f6" };
    if (step <= 11) return { id: 2, name: "Court Markings", color: "#ffd54f" };
    return { id: 3, name: "Dress the Court", color: "#81c784" };
  }, [step]);

  // Step descriptions (14-step sequence)
  const stepExplanations = [
    {
      title: "Court Canvas",
      text: "We begin with a leveled empty lawn. Standard tournament croquet requires a flat, low-cut grass surface measuring 28 x 35 yards."
    },
    {
      title: "Step 1: Marking Length Boundaries",
      text: "The West and East boundary lines are marked. The length of 35 yards (32.0 m) is established, corresponding to the West boundary label near the bottom of the screen."
    },
    {
      title: "Step 2: Marking Width Boundaries",
      text: "The North and South boundary lines are marked, completing the rectangular boundary line perimeter. The width of 28 yards (25.6 m) is established, corresponding to the South boundary label near the right."
    },
    {
      title: "Step 3: Placing Hoop 1 (South-West)",
      text: "Hoop 1 is placed at the South-West area. Spacing is exactly 7 yards (6.4 metres) from both the adjacent West and South inside boundary edges."
    },
    {
      title: "Step 4: Placing Hoop 2 (North-West)",
      text: "Hoop 2 is set at the North-West area, precisely 7 yards (6.4 metres) in from the North and West inside boundaries."
    },
    {
      title: "Step 5: Placing Hoop 3 (North-East)",
      text: "Hoop 3 is positioned at the North-East area, measured exactly 7 yards (6.4 metres) from the North and East inside boundaries."
    },
    {
      title: "Step 6: Placing Hoop 4 (South-East)",
      text: "Hoop 4 is placed at the South-East area, set 7 yards (6.4 metres) from both the East and South inside boundary edges."
    },
    {
      title: "Step 7: Placing the Central Peg",
      text: "The Central Peg is driven into the exact center of the lawn: exactly 14 yards (12.8 m) from West/East boundaries, and 17.5 yards (16.0 m) from North/South boundaries. This step is displayed in a top-down 2D camera view to verify its center alignment."
    },
    {
      title: "Step 8: Placing Hoop 5 (South Center)",
      text: "Hoop 5 (South Center) is placed on the longitudinal center line of the court, positioned exactly 7 yards (6.4 metres) South of the peg spot, leaving exactly 10 yards 1 foot 6 inches (10yd 1ft 6\") to the South boundary."
    },
    {
      title: "Step 9: Placing Hoop 6 (North Center)",
      text: "Hoop 6 (North Center) is placed on the center line, positioned exactly 7 yards (6.4 metres) North of the center peg, leaving exactly 10 yards 1 foot 6 inches (10yd 1ft 6\") to the North boundary. General hoop-to-hoop spacing intervals (14 and 21 yards) are now complete."
    },
    {
      title: "Step 10: Painting the Start Corner",
      text: "A 1-yard (0.91 metre) radius quarter-circle is painted in white at the South-East corner (Corner 4) to mark the Starting Area."
    },
    {
      title: "Step 11: Painting the Penalty Semi-Circles",
      text: "Two semi-circular penalty areas of 1-yard (0.91 metre) radius are painted, centered on the halfway points of the West and East boundary lines."
    },
    {
      title: "Step 12: Pitching Corner Flags",
      text: "Four corner flags are placed at the boundaries to guide play visibility. Corner 1 (South-West) is Blue, Corner 2 (North-West) is Red, Corner 3 (North-East) is Black, and Corner 4 (South-East) is Yellow."
    },
    {
      title: "Step 13: Dressing Halfway Offside Pegs",
      text: "Eight white boundary pegs with black tops (halfway offside pegs) are driven into the boundary lines to mark halfway points and offside limits."
    }
  ];

  // Effect to manage audio narration (MP3 file playback with TTS fallback and dynamic autoplay timing)
  useEffect(() => {
    // Clean up any pending speech transition timeouts from a previous step
    if (speechTimeoutRef.current) {
      clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = null;
    }

    if (!isVoiceEnabled) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      return;
    }

    // Stop any currently playing pre-recorded audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    // Stop any Web Speech synthesis
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    // Helper to transition to next step after a natural pause after speaking finishes
    const scheduleNextStep = () => {
      if (isPlaying) {
        speechTimeoutRef.current = window.setTimeout(() => {
          advanceSequence();
        }, 1500); // 1.5-second buffer to look at the completed step
      }
    };

    // Load and play the MP3 file corresponding to the current step
    const audioUrl = `/audio/step_${step}.mp3`;
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    // Listen for pre-recorded audio completion to advance
    audio.addEventListener('ended', scheduleNextStep);

    const playPromise = audio.play();

    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          // Playing pre-recorded high-quality audio successfully
        })
        .catch(() => {
          // File not found, autoplay blocked, or load error -> Fall back to browser TTS
          if (typeof window !== 'undefined' && window.speechSynthesis) {
            const textToSpeak = stepExplanations[step].text;
            const utterance = new SpeechSynthesisUtterance(textToSpeak);

            if (window.speechSynthesis.getVoices().length > 0) {
              const voices = window.speechSynthesis.getVoices();
              const englishVoice = voices.find(v => v.lang.startsWith('en-') && v.localService) || 
                                   voices.find(v => v.lang.startsWith('en-'));
              if (englishVoice) {
                utterance.voice = englishVoice;
              }
            }

            utterance.rate = 1.05;
            utterance.pitch = 1.0;

            // Listen for TTS completion to advance
            utterance.onend = () => {
              scheduleNextStep();
            };

            utterance.onerror = () => {
              // On speech error/interruption, proceed to advance
              scheduleNextStep();
            };

            window.speechSynthesis.speak(utterance);
          } else {
            // If SpeechSynthesis is not supported, advance directly
            scheduleNextStep();
          }
        });
    }

    return () => {
      audio.removeEventListener('ended', scheduleNextStep);
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (speechTimeoutRef.current) {
        clearTimeout(speechTimeoutRef.current);
        speechTimeoutRef.current = null;
      }
    };
  }, [step, isVoiceEnabled, isPlaying]);

  // Helper arcs
  const startingArcPoints = useMemo(() => getArcPoints(14, 17.5, 1.0, Math.PI, 1.5 * Math.PI), []);
  const westPenaltyPoints = useMemo(() => getArcPoints(-14, 0, 1.0, -0.5 * Math.PI, 0.5 * Math.PI), []);
  const eastPenaltyPoints = useMemo(() => getArcPoints(14, 0, 1.0, 0.5 * Math.PI, 1.5 * Math.PI), []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', userSelect: 'none', backgroundColor: '#070c08' }}>
      
      {/* INJECT HUD STYLES */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap');
        
        .canvas-container {
          position: absolute;
          top: 0;
          left: 0;
          width: calc(100% - 180px);
          height: calc(100% - 140px);
        }
        
        .bottom-ribbon {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 100;
          height: 140px;
          background: rgba(10, 16, 12, 0.9);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border-top: 1.5px solid rgba(255, 255, 255, 0.2);
          box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.5);
          font-family: 'Outfit', sans-serif;
          color: #ffffff;
          padding: 15px 30px;
          box-sizing: border-box;
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }

        .bottom-ribbon-left {
          flex: 1.4;
          display: flex;
          flex-direction: column;
          justify-content: center;
          min-width: 0;
        }

        .bottom-ribbon-center {
          width: 320px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          flex-shrink: 0;
        }

        .bottom-ribbon-right {
          width: 280px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          flex-shrink: 0;
        }

        .phase-badge {
          display: inline-block;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          padding: 4px 10px;
          border-radius: 20px;
        }

        .step-heading {
          font-size: 16px;
          font-weight: 800;
          color: #ffe680;
          letter-spacing: 0.02em;
        }

        .step-desc {
          font-size: 13px;
          color: #cfd8dc;
          line-height: 1.45;
          margin-top: 4px;
        }

        .hud-divider {
          height: 1px;
          background: rgba(255, 255, 255, 0.15);
          margin: 14px 0;
        }

        .control-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .hud-btn {
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.2);
          color: #ffffff;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .hud-btn:hover:not(:disabled) {
          background: rgba(255,255,255,0.2);
          border-color: rgba(255,255,255,0.4);
        }

        .hud-btn:disabled {
          opacity: 0.25;
          cursor: not-allowed;
        }

        .play-btn {
          background: linear-gradient(135deg, #ffe680 0%, #d4af37 100%);
          color: #000000;
          border: none;
          box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);
        }

        .play-btn:hover {
          background: linear-gradient(135deg, #fff2b2 0%, #e5c158 100%);
          transform: scale(1.03);
        }

        .progress-bar-container {
          width: 100%;
          height: 4px;
          background: rgba(255,255,255,0.1);
          border-radius: 2px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          transition: width 0.3s ease;
        }

        /* Config Ribbon down the right hand side */
        .right-ribbon {
          position: absolute;
          top: 0;
          right: 0;
          bottom: 140px;
          z-index: 100;
          width: 180px;
          background: rgba(10, 16, 12, 0.85);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border-left: 1.5px solid rgba(255, 255, 255, 0.2);
          box-shadow: -10px 0 30px rgba(0, 0, 0, 0.3);
          font-family: 'Outfit', sans-serif;
          color: #ffffff;
          padding: 24px 16px;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .config-title {
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: #ffe680;
          margin-bottom: 4px;
        }

        .unit-vertical-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          padding: 4px;
          border: 1px solid rgba(255,255,255,0.08);
        }

        .unit-toggle-btn {
          background: transparent;
          border: none;
          color: #cbd5e1;
          padding: 8px 10px;
          font-size: 11px;
          font-weight: 700;
          text-align: left;
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .unit-toggle-btn::after {
          content: '';
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: transparent;
          transition: background 0.2s;
        }

        .unit-toggle-btn.active {
          background: rgba(255, 255, 255, 0.15);
          color: #ffe680;
        }

        .unit-toggle-btn.active::after {
          background: #ffe680;
        }

        .camera-vertical-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .camera-btn {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #cbd5e1;
          padding: 8px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }

        .camera-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.15);
        }

        .camera-btn.active {
          background: rgba(255, 230, 128, 0.08);
          border-color: #ffe680;
          color: #ffe680;
          font-weight: 700;
        }

        .rule-card {
          padding: 10px 14px;
          background: rgba(212, 175, 55, 0.08);
          border: 1px solid rgba(212, 175, 55, 0.3);
          border-radius: 8px;
          font-size: 11px;
          color: #ffe680;
          line-height: 1.45;
        }
      `}</style>

      {/* 3D VIEWPORT CONTAINER */}
      <div className="canvas-container">
        <Canvas shadows camera={{ position: [-0.01, 42, 0], fov: 45 }}>
        <color attach="background" args={['#24512c']} />
        <fog attach="fog" args={['#24512c', 60, 180]} />
        
        {/* Lights */}
        <ambientLight intensity={1.5} />
        <directionalLight 
          position={[20, 45, 10]} 
          intensity={2.2} 
          castShadow 
          shadow-mapSize-width={2048} 
          shadow-mapSize-height={2048}
          shadow-camera-far={120}
          shadow-camera-left={-25}
          shadow-camera-right={25}
          shadow-camera-top={25}
          shadow-camera-bottom={-25}
        />

        {/* Grass Court Backdrop */}
        <CourtBase step={step} />

        {/* Dynamic HTML Compass Direction labels along boundaries (Added 1-by-1) */}
        <CompassLabels visibleCount={visibleLabelsCount} />

        {/* Dynamic camera glide coordinator */}
        <CameraController 
          targetPos={targetPos} 
          targetLookAt={targetLookAt} 
          isGliding={isGliding} 
          controlsRef={controlsRef} 
        />

        {/* ----------------------------------------------------------- */}
        {/* PHASE 1: COURT SETUP & LAYOUT (Steps 1 to 11) */}
        {/* ----------------------------------------------------------- */}
        
        {/* Step 1: West Boundary length line arrow */}
        {step >= 1 && (
          <Arrow3D 
            start={[-14.8, 0, 17.5]} 
            end={[-14.8, 0, -17.5]} 
            label={formatDist(35, unit)} 
            color="#ffcc00"
          />
        )}

        {/* Step 2: East Boundary length (measure arrow omitted as per request) */}

        {/* Step 3: North Boundary width (measure arrow omitted as per request) */}

        {/* Step 2: South Boundary width line arrow */}
        {step >= 2 && (
          <Arrow3D 
            start={[-14, 0, 18.2]} 
            end={[14, 0, 18.2]} 
            label={formatDist(28, unit)} 
            color="#ffcc00"
          />
        )}

        {/* Step 3: SW Hoop 1 fades in */}
        {step >= 3 && (
          <group>
            <QuadwayHoop position={[-7, 0, 10.5]} crownColor="#1565c0" />
            <Arrow3D 
              start={[-14, 0, 10.5]} 
              end={[-7, 0, 10.5]} 
              label={formatDist(7, unit)} 
              color="#00e676"
            />
            <Arrow3D 
              start={[-7, 0, 17.5]} 
              end={[-7, 0, 10.5]} 
              label={formatDist(7, unit)} 
              color="#00e676"
            />
          </group>
        )}

        {/* Step 4: NW Hoop 2 fades in */}
        {step >= 4 && (
          <group>
            <QuadwayHoop position={[-7, 0, -10.5]} crownColor="#ffffff" />
            <Arrow3D 
              start={[-14, 0, -10.5]} 
              end={[-7, 0, -10.5]} 
              label={formatDist(7, unit)} 
              color="#00e676"
            />
            <Arrow3D 
              start={[-7, 0, -17.5]} 
              end={[-7, 0, -10.5]} 
              label={formatDist(7, unit)} 
              color="#00e676"
            />
          </group>
        )}

        {/* Step 5: NE Hoop 3 fades in */}
        {step >= 5 && (
          <group>
            <QuadwayHoop position={[7, 0, -10.5]} crownColor="#d32f2f" />
            <Arrow3D 
              start={[14, 0, -10.5]} 
              end={[7, 0, -10.5]} 
              label={formatDist(7, unit)} 
              color="#00e676"
            />
            <Arrow3D 
              start={[7, 0, -17.5]} 
              end={[7, 0, -10.5]} 
              label={formatDist(7, unit)} 
              color="#00e676"
            />
          </group>
        )}

        {/* Step 6: SE Hoop 4 fades in */}
        {step >= 6 && (
          <group>
            <QuadwayHoop position={[7, 0, 10.5]} crownColor="#ffffff" />
            <Arrow3D 
              start={[14, 0, 10.5]} 
              end={[7, 0, 10.5]} 
              label={formatDist(7, unit)} 
              color="#00e676"
            />
            <Arrow3D 
              start={[7, 0, 17.5]} 
              end={[7, 0, 10.5]} 
              label={formatDist(7, unit)} 
              color="#00e676"
            />
          </group>
        )}

        {/* Step 7: Center Peg */}
        {step >= 7 && (
          <group>
            <AnimatedPeg step={step} />

            {/* Intersecting center guidelines */}
            {step === 7 && (
              <group>
                <Arrow3D 
                  start={[-14, 0, 0]} 
                  end={[0, 0, 0]} 
                  label={formatDist(14, unit)} 
                  color="#e0e0e0"
                  lineWidth={0.018}
                  fontSize="30px"
                />
                <Arrow3D 
                  start={[14, 0, 0]} 
                  end={[0, 0, 0]} 
                  label={formatDist(14, unit)} 
                  color="#e0e0e0"
                  lineWidth={0.018}
                  fontSize="30px"
                />
                <Arrow3D 
                  start={[0, 0, -17.5]} 
                  end={[0, 0, 0]} 
                  label={formatDist(17.5, unit)} 
                  color="#e0e0e0"
                  lineWidth={0.018}
                  fontSize="30px"
                />
                <Arrow3D 
                  start={[0, 0, 17.5]} 
                  end={[0, 0, 0]} 
                  label={formatDist(17.5, unit)} 
                  color="#e0e0e0"
                  lineWidth={0.018}
                  fontSize="30px"
                />
              </group>
            )}
          </group>
        )}

        {/* Step 8: Hoop 5 (South Center) fades in */}
        {step >= 8 && (
          <group>
            <QuadwayHoop position={[0, 0, 7]} crownColor="#ffffff" />
            <Arrow3D 
              start={[0, 0, 0]} 
              end={[0, 0, 7]} 
              label={formatDist(7, unit)} 
              color="#00e676"
            />
            <Arrow3D 
              start={[0, 0, 7]} 
              end={[0, 0, 17.5]} 
              label={unit === 'yards' ? '10yd 1ft 6"' : unit === 'metres' ? '9.6 m' : '10yd 1ft 6" / 9.6 m'} 
              color="#00e676"
            />
          </group>
        )}

        {/* Step 9: Hoop 6 (North Center) fades in */}
        {step >= 9 && (
          <group>
            <QuadwayHoop position={[0, 0, -7]} crownColor="#ffffff" />
            <Arrow3D 
              start={[0, 0, 0]} 
              end={[0, 0, -7]} 
              label={formatDist(7, unit)} 
              color="#00e676"
            />
            <Arrow3D 
              start={[0, 0, -7]} 
              end={[0, 0, -17.5]} 
              label={unit === 'yards' ? '10yd 1ft 6"' : unit === 'metres' ? '9.6 m' : '10yd 1ft 6" / 9.6 m'} 
              color="#00e676"
            />

            {/* General large cross-court spacings */}
            <Arrow3D 
              start={[-7, 0, 10.5]} 
              end={[7, 0, 10.5]} 
              label={formatDist(14, unit)} 
              color="#29b6f6"
              offsetY={0.08}
            />
            <Arrow3D 
              start={[-7, 0, 10.5]} 
              end={[-7, 0, -10.5]} 
              label={formatDist(21, unit)} 
              color="#29b6f6"
              offsetY={0.08}
            />
          </group>
        )}

        {/* ----------------------------------------------------------- */}
        {/* PHASE 2: COURT MARKINGS (Steps 10 to 11) */}
        {/* ----------------------------------------------------------- */}
        
        {/* Step 10: Paint starting area corner 4 (SE) */}
        {step >= 10 && (
          <group>
            <Line points={startingArcPoints} color="white" lineWidth={3.5} polygonOffset polygonOffsetFactor={-4} />
            <Arrow3D 
              start={[14, 0, 17.5]} 
              end={[13.29, 0, 16.79]} 
              label={`Start Corner: ${formatDist(1, unit)}`} 
              color="white"
            />
          </group>
        )}

        {/* Step 11: Paint Penalty semi-circles */}
        {step >= 11 && (
          <group>
            {/* West penalty semi-circle */}
            <Line points={westPenaltyPoints} color="white" lineWidth={3.5} polygonOffset polygonOffsetFactor={-4} />
            <Arrow3D 
              start={[-14, 0, 0]} 
              end={[-13, 0, 0]} 
              label={formatDist(1, unit)} 
              color="white"
            />
            {/* East penalty semi-circle */}
            <Line points={eastPenaltyPoints} color="white" lineWidth={3.5} polygonOffset polygonOffsetFactor={-4} />
            <Arrow3D 
              start={[14, 0, 0]} 
              end={[13, 0, 0]} 
              label={formatDist(1, unit)} 
              color="white"
            />
          </group>
        )}

        {/* ----------------------------------------------------------- */}
        {/* PHASE 3: DRESS THE COURT (Steps 12 to 13) */}
        {/* ----------------------------------------------------------- */}
        
        {/* Step 12: Corner flags placed */}
        {step >= 12 && (
          <group>
            <CornerFlag position={[-14, 0, 17.5]} color="#0055ff" />
            <CornerFlag position={[-14, 0, -17.5]} color="#ff0000" />
            <CornerFlag position={[14, 0, -17.5]} color="#222222" />
            <CornerFlag position={[14, 0, 17.5]} color="#ffcc00" />
          </group>
        )}

        {/* Step 13: Offside halfway pegs placed */}
        {step >= 13 && (
          <group>
            <HalfwayPeg position={[-3.5, 0, -17.5]} />
            <HalfwayPeg position={[0, 0, -17.5]} />
            <HalfwayPeg position={[3.5, 0, -17.5]} />
            
            <HalfwayPeg position={[-3.5, 0, 17.5]} />
            <HalfwayPeg position={[0, 0, 17.5]} />
            <HalfwayPeg position={[3.5, 0, 17.5]} />
            
            <HalfwayPeg position={[-14, 0, 0]} />
            <HalfwayPeg position={[14, 0, 0]} />
          </group>
        )}

        {/* OrbitControls */}
        <OrbitControls 
          ref={controlsRef} 
          onStart={() => {
            isGliding.current = false;
          }}
          enablePan={true} 
          maxPolarAngle={Math.PI / 2 - 0.05} 
          minDistance={5} 
          maxDistance={120} 
        />
      </Canvas>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* BOTTOM RIBBON CONTROL PANEL */}
      {/* ------------------------------------------------------------- */}
      <div className="bottom-ribbon">
        
        {/* Left Section: Explanations */}
        <div className="bottom-ribbon-left">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
            <div className="phase-badge" style={{ backgroundColor: `${phase.color}25`, color: phase.color, border: `1.5px solid ${phase.color}` }}>
              Phase {phase.id}: {phase.name}
            </div>
            <div className="step-heading">{stepExplanations[step].title}</div>
          </div>
          <div className="step-desc">{stepExplanations[step].text}</div>
        </div>

        {/* Center Section: Controls & Progress */}
        <div className="bottom-ribbon-center">
          {/* Step progress bar */}
          <div className="progress-bar-container" style={{ marginBottom: '4px' }}>
            <div className="progress-fill" style={{ width: `${((step) / 13) * 100}%`, backgroundColor: phase.color }} />
          </div>

          {/* Controls */}
          <div className="control-row" style={{ width: '100%' }}>
            <button className="hud-btn" disabled={step === 0} onClick={handleBack} style={{ padding: '6px 12px' }}>
              Back
            </button>
            
            <button className="hud-btn play-btn" onClick={togglePlayPause} style={{ padding: '6px 20px', minWidth: '100px' }}>
              {isPlaying ? "Pause" : "Autoplay"}
            </button>
            
            <button className="hud-btn" disabled={step === 13} onClick={handleNext} style={{ padding: '6px 12px' }}>
              Next
            </button>
          </div>

          <div className="control-row" style={{ width: '100%', fontSize: '11px', color: '#94a3b8' }}>
            <span>Step {step} of 13</span>
            <button style={{ background: 'none', border: 'none', color: '#ffe680', cursor: 'pointer', fontWeight: 'bold' }} onClick={handleReset}>
              Reset Layout
            </button>
          </div>
        </div>

        {/* Right Section: Rule Callout Card */}
        <div className="bottom-ribbon-right">
          <div className="rule-card">
            All Court dimensions are taken from the inside edge of the boundary lines
          </div>
        </div>

      </div>

      {/* ------------------------------------------------------------- */}
      {/* RIGHT RIBBON CONFIG PANEL */}
      {/* ------------------------------------------------------------- */}
      <div className="right-ribbon">
        <a 
          href="/" 
          className="camera-btn" 
          style={{ 
            textAlign: 'center', 
            textDecoration: 'none', 
            background: 'linear-gradient(135deg, #ffe680 0%, #d4af37 100%)', 
            color: '#000000', 
            fontWeight: 'bold',
            marginBottom: '10px',
            display: 'block'
          }}
        >
          ← Back to Sandbox
        </a>
        <div className="config-title">Unit Indicators</div>
        <div className="unit-vertical-group">
          <button className={`unit-toggle-btn ${unit === 'yards' ? 'active' : ''}`} onClick={() => setUnit('yards')}>Yards</button>
          <button className={`unit-toggle-btn ${unit === 'metres' ? 'active' : ''}`} onClick={() => setUnit('metres')}>Metres</button>
          <button className={`unit-toggle-btn ${unit === 'dual' ? 'active' : ''}`} onClick={() => setUnit('dual')}>Dual</button>
        </div>

        <div className="config-title" style={{ marginTop: '6px' }}>Voice Commentary</div>
        <div className="unit-vertical-group">
          <button 
            className={`unit-toggle-btn ${isVoiceEnabled ? 'active' : ''}`} 
            onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
          >
            Voice commentary
          </button>
        </div>

        <div className="config-title" style={{ marginTop: '6px' }}>Camera View</div>
        <div className="camera-vertical-group">
          <button className={`camera-btn ${camPreset === 'topdown' ? 'active' : ''}`} onClick={() => handleManualCamera('topdown')}>Top 2D</button>
          <button className={`camera-btn ${camPreset === 'isometric' ? 'active' : ''}`} onClick={() => handleManualCamera('isometric')}>3D Iso</button>
          <button className={`camera-btn ${camPreset === 'north' ? 'active' : ''}`} onClick={() => handleManualCamera('north')}>North Angle</button>
          <button className={`camera-btn ${camPreset === 'south' ? 'active' : ''}`} onClick={() => handleManualCamera('south')}>South Angle</button>
          <button className={`camera-btn ${camPreset === 'east' ? 'active' : ''}`} onClick={() => handleManualCamera('east')}>East Angle</button>
          <button className={`camera-btn ${camPreset === 'west' ? 'active' : ''}`} onClick={() => handleManualCamera('west')}>West Angle</button>
        </div>

        <div style={{ marginTop: 'auto', paddingTop: '10px', fontSize: '9px', color: 'rgba(255,255,255,0.35)', textAlign: 'center', letterSpacing: '0.05em' }}>
          3D COURT LAYOUT &bull; &copy; 2026
        </div>
      </div>

    </div>
  );
}
