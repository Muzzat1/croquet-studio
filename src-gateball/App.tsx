import * as THREE from 'three';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, RotateCcw, Search, MousePointer2, Maximize2, Minimize2, HelpCircle, X, Eye, Clapperboard, ChevronLeft, ChevronRight, Save, FolderUp, Trash2, MonitorPlay, Camera, ZoomIn, ZoomOut, Pencil, Eraser, Settings, Undo2, Hand, Sun, Minus, Gamepad2, Target, Navigation, MapPin, CornerDownLeft, CircleDashed, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Path, BallId, Ball, RecordedShot, BALL_RADIUS, SCALE, EDGING, FIELD_WIDTH, FIELD_HEIGHT, ZOOM_LEVELS, SPACING, BALL_IDS, getInitialPositions, GATE_WIDTH, GOAL_POLE_RADIUS, GATES, GOAL_POLE_POS, SOUNDS, playSound, BALL_SETS, getActiveColor } from './constants';

interface SphericalControllerProps {
  angle: number;
  setAngle: (val: number | ((prev: number) => number)) => void;
  speed: number;
  setSpeed: (val: number | ((prev: number) => number)) => void;
  isPlaying: boolean;
  satelliteColor?: string | null;
}

export const SphericalController = ({ angle, setAngle, speed, setSpeed, isPlaying }: Omit<SphericalControllerProps, 'satelliteColor'>) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const previousMousePosition = useRef({ x: 0, y: 0 });
  const sphereRef = useRef<THREE.Mesh | null>(null);

  const valuesRef = useRef({ angle, speed });
  useEffect(() => { valuesRef.current = { angle, speed }; }, [angle, speed]);

  useEffect(() => {
    const mountNode = mountRef.current;
    if (!mountNode) return;
    mountNode.innerHTML = '';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 4.5;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(160, 160);
    mountRef.current.appendChild(renderer.domElement);

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const geometry = new THREE.SphereGeometry(1.1, 64, 64);

    const canvas = document.createElement('canvas');
    canvas.width = 1008;
    canvas.height = 1008;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#991b1b';
    ctx.fillRect(0, 0, 1008, 1008);

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = -1008; i <= 2016; i += 36) {
      ctx.moveTo(i, 0); ctx.lineTo(i, 1008);
      ctx.moveTo(0, i); ctx.lineTo(1008, i);
    }
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = maxAnisotropy;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(8, 4);
    texture.needsUpdate = true;

    const material = new THREE.MeshStandardMaterial({
      map: texture, bumpMap: texture, bumpScale: 4.40, roughness: 0.35, metalness: 0.1
    });

    const sphere = new THREE.Mesh(geometry, material);
    sphereRef.current = sphere;
    scene.add(sphere);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
    mainLight.position.set(-5, 5, 5);
    scene.add(mainLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(5, -2, 5);
    scene.add(fillLight);

    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      if (mountNode) mountNode.innerHTML = '';
      geometry.dispose(); material.dispose(); renderer.dispose();
    };
  }, []);

  useEffect(() => {
    const domElement = mountRef.current;
    if (!domElement) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (isPlaying) return;
      isDragging.current = true;
      previousMousePosition.current = { x: e.clientX, y: e.clientY };
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging.current || isPlaying) return;
      const deltaMove = { x: e.clientX - previousMousePosition.current.x, y: e.clientY - previousMousePosition.current.y };
      if (sphereRef.current) {
        const deltaRotationQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(deltaMove.y * 0.01, deltaMove.x * 0.01, 0, 'XYZ'));
        sphereRef.current.quaternion.multiplyQuaternions(deltaRotationQuaternion, sphereRef.current.quaternion);
      }
      let newAngle = valuesRef.current.angle + deltaMove.x * 0.5;
      newAngle = ((newAngle % 360) + 360) % 360;
      let newSpeed = valuesRef.current.speed - deltaMove.y * 0.5;
      newSpeed = Math.max(0, Math.min(200, newSpeed));
      setAngle(newAngle); setSpeed(newSpeed);
      previousMousePosition.current = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = () => { isDragging.current = false; };
    domElement.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      domElement.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isPlaying, setAngle, setSpeed]);

  return (
    <div className="flex flex-col items-center w-full gap-2 relative p-2">
      <div className="flex justify-between w-full text-[10px] font-bold uppercase tracking-widest text-zinc-400 px-1">
        <span className="flex flex-col items-start text-emerald-400">
          Velocity
          <span className="text-white text-xs flex items-center mt-0.5 select-none relative -left-1">
            <button onClick={() => setSpeed((s: number) => Math.max(1, s - 1))} className="hover:text-emerald-400 disabled:opacity-50 transition-colors p-1" disabled={isPlaying}><ChevronLeft size={12} strokeWidth={3} /></button>
            <span className="w-8 text-center">{speed.toFixed(0)}%</span>
            <button onClick={() => setSpeed((s: number) => Math.min(200, s + 1))} className="hover:text-emerald-400 disabled:opacity-50 transition-colors p-1" disabled={isPlaying}><ChevronRight size={12} strokeWidth={3} /></button>
          </span>
        </span>
        <span className="flex flex-col items-end text-emerald-400">
          Bearing
          <span className="text-white text-xs flex items-center mt-0.5 select-none relative -right-1">
            <button onClick={() => setAngle((a: number) => (a - 0.5 + 360) % 360)} className="hover:text-emerald-400 disabled:opacity-50 transition-colors p-1" disabled={isPlaying}><ChevronLeft size={12} strokeWidth={3} /></button>
            <span className="w-10 text-center">{angle.toFixed(1)}°</span>
            <button onClick={() => setAngle((a: number) => (a + 0.5) % 360)} className="hover:text-emerald-400 disabled:opacity-50 transition-colors p-1" disabled={isPlaying}><ChevronRight size={12} strokeWidth={3} /></button>
          </span>
        </span>
      </div>
      <div
        ref={mountRef}
        className={`w-[160px] h-[160px] cursor-grab active:cursor-grabbing rounded-full ${isPlaying ? 'opacity-50 pointer-events-none' : ''}`}
        style={{ touchAction: 'none' }}
      />
    </div>
  );
};

export const HelpScreen = ({ onClose }: { onClose: () => void }) => {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[150] backdrop-blur-md flex items-center justify-center p-4 bg-zinc-950/90">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-2xl w-full max-w-5xl shadow-2xl border backdrop-blur-xl bg-zinc-900 border-zinc-800 flex flex-col max-h-[90vh]">
        <div className="p-6 border-b flex items-start justify-between rounded-t-2xl bg-zinc-900 border-zinc-800 shrink-0">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-3 text-emerald-400"><HelpCircle size={28} /> Gateball Visualiser Help</h2>
            <div className="text-xs font-bold tracking-wide text-zinc-400 mt-1 ml-[40px]">
              A program by Murray Tinker (2tinkers@gmail.com) • Version 0.63 (BETA)
            </div>
          </div>
          <button onClick={onClose} className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-xl font-bold uppercase tracking-widest text-[11px] transition-colors shadow-lg">Close Guide</button>
        </div>

        <div className="p-8 overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10 text-sm leading-relaxed text-zinc-200">
            <div className="space-y-10">
              <div>
                <h3 className="font-bold mb-4 flex items-center gap-2 uppercase tracking-widest text-[13px] text-emerald-400"><Gamepad2 size={20} /> BASIC CONTROLS</h3>
                <p className="mb-4 flex items-start gap-3"><Hand size={20} className="shrink-0 mt-0.5 text-zinc-400" /> <span><strong>Bring Balls Onto Court:</strong> Simply click and drag any ball onto the starters box or court.</span></p>
                <p className="mb-4 flex items-start gap-3"><Target size={20} className="shrink-0 mt-0.5 text-zinc-400" /> <span><strong>Active Ball:</strong> Click on the ball you want to hit. A bright ring will appear around it so you know it is selected.</span></p>
                <p className="mb-4 flex items-start gap-3"><Navigation size={20} className="shrink-0 mt-0.5 text-zinc-400" /> <span><strong>Aim Mode:</strong> With AIM mode selected use the Controller ball left and right to move aiming line. Use the same Controller up and down do change velocity of stroke. Hit the PLAY STROKE button. A 75% stroke will hit the width of the court and 100% the length</span></p>
                <p className="mb-4 flex items-start gap-3"><MapPin size={20} className="shrink-0 mt-0.5 text-zinc-400" /> <span><strong>Place Mode:</strong> With Place Mode selected you can select a ball and then click on a place on the court. Hitting the PLAY STROKE Button will send the ball to that point unless it hits another ball or court furniture</span></p>
                <p className="mb-4 flex items-start gap-3"><CornerDownLeft size={20} className="shrink-0 mt-0.5 text-zinc-400" /> <span><strong>Out Ball:</strong> Any ball hit out will be placed back in the correct relationship to the Inside line</span></p>
              </div>

              <div>
                <h3 className="font-bold mb-4 flex items-center gap-2 uppercase tracking-widest text-[13px] text-emerald-400"><Zap size={20} /> Spark Mode</h3>
                <p className="flex items-start gap-3"><Zap size={20} className="shrink-0 mt-0.5 text-zinc-400" /> <span>To play a spark select the touched ball and drag it along side the Strokers Ball. The Strokers ball will be the selected ball and a spark symbol will appear. Now click on the court or over the sideline where you want the sparked ball to go. Then press PLAY SPARK.</span></p>
              </div>

              <div>
                <h3 className="font-bold mb-4 flex items-center gap-2 uppercase tracking-widest text-[13px] text-emerald-400"><Undo2 size={20} /> Fixing Mistakes</h3>
                <p className="mb-4 flex items-start gap-3"><Undo2 size={20} className="shrink-0 mt-0.5 text-zinc-400" /> <span><strong>Undo Button:</strong> Made a mistake? Don't worry! Click 'Undo' to put the balls back exactly where they were before your last shot.</span></p>
                <p className="flex items-start gap-3"><RotateCcw size={20} className="shrink-0 mt-0.5 text-zinc-400" /> <span><strong>Reset Everything:</strong> Click 'Reset' to clear the grass and start completely fresh.</span></p>
              </div>
            </div>

            <div className="space-y-10">
              <div>
                <h3 className="font-bold mb-4 flex items-center gap-2 uppercase tracking-widest text-[13px] text-emerald-400"><Pencil size={20} /> Drawing Overlay</h3>
                <p className="mb-4 flex items-start gap-3"><Pencil size={20} className="shrink-0 mt-0.5 text-zinc-400" /> <span><strong>Draw Lines:</strong> Click the 'Draw' pen, then click and drag your mouse over the grass to sketch out your ideas.</span></p>
                <p className="flex items-start gap-3"><Eraser size={20} className="shrink-0 mt-0.5 text-zinc-400" /> <span><strong>Clear Drawing:</strong> Use the Eraser to completely wipe clean and instantly remove all the marks you just drew.</span></p>
              </div>

              <div>
                <h3 className="font-bold mb-4 flex items-center gap-2 uppercase tracking-widest text-[13px] text-emerald-400"><Clapperboard size={20} /> Record & Play Sequences</h3>
                <p className="mb-4 flex items-start gap-3"><Settings size={20} className="shrink-0 mt-0.5 text-zinc-400" /> <span><strong>Enable Recording:</strong> Open Prefs and turn on 'Recording' to reveal the camera controls.</span></p>
                <p className="mb-4 flex items-start gap-3"><Camera size={20} className="shrink-0 mt-0.5 text-zinc-400" /> <span><strong>Start & Stop:</strong> Click the Camera button to start saving shots. Click the same button again when you want to stop recording.</span></p>
                <p className="flex items-start gap-3"><Play size={20} className="shrink-0 mt-0.5 text-zinc-400" /> <span><strong>Replay Sequence:</strong> Use the sequence controls to step back and forth, or press play to automatically watch your sequence from the start.</span></p>
              </div>

              <div>
                <h3 className="font-bold mb-4 flex items-center gap-2 uppercase tracking-widest text-[13px] text-emerald-400"><Save size={20} /> Saved Data & Display</h3>
                <p className="mb-4 flex items-start gap-3"><Save size={20} className="shrink-0 mt-0.5 text-zinc-400" /> <span><strong>Save Sequence:</strong> Click the Save icon to permanently store your sequence on your computer.</span></p>
                <p className="mb-4 flex items-start gap-3"><FolderUp size={20} className="shrink-0 mt-0.5 text-zinc-400" /> <span><strong>Recall Sequence:</strong> Click the Upload Folder icon to instantly load a previously saved sequence.</span></p>
                <p className="flex items-start gap-3"><Sun size={20} className="shrink-0 mt-0.5 text-zinc-400" /> <span><strong>Brighten for Sunshine:</strong> Are you outside? Use Bright Mode in the Prefs menu to make the screen much brighter.</span></p>
              </div>
            </div>
          </div>
        </div>

      </motion.div>
    </motion.div>
  );
};

export const PrecisionWheel = ({ value, onChange, isPlaying, min = 0, max = 360, sensitivity = 0.2, range = 60, wrap = true, unit = "°", label = "Wheel", showLabels = false, tooltip = null }: { value: number; onChange: (val: number) => void; isPlaying?: boolean; min?: number; max?: number; sensitivity?: number; range?: number; wrap?: boolean; unit?: string; label?: string; showLabels?: boolean; tooltip?: React.ReactNode }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const startPosRef = useRef<number | null>(null);
  const startValRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (isPlaying) return;
    setIsDragging(true);
    startPosRef.current = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    startValRef.current = value;
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging || isPlaying || startPosRef.current === null) return;
      const currentPos = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const totalDelta = startPosRef.current - currentPos;
      const linearPart = totalDelta * sensitivity * 0.4;
      const cubicPart = Math.pow(totalDelta, 3) * 0.00005 * sensitivity;
      let newValue = startValRef.current + linearPart + cubicPart;

      if (wrap) {
        const span = max - min;
        newValue = ((newValue - min) % span + span) % span + min;
      } else {
        newValue = Math.max(min, Math.min(max, newValue));
      }
      onChange(newValue);
    };
    const handleEnd = () => { setIsDragging(false); startPosRef.current = null; };
    if (isDragging) {
      window.addEventListener('mousemove', handleMove); window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchmove', handleMove); window.addEventListener('touchend', handleEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove); window.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, onChange, isPlaying, min, max, sensitivity, wrap]);

  const ticks = []; const startVal = value - range / 2; const endVal = value + range / 2;
  for (let i = Math.floor(startVal); i <= Math.ceil(endVal); i++) {
    const span = max - min; const displayVal = wrap ? ((i - min) % span + span) % span + min : i; const pos = ((i - startVal) / range) * 100;
    if (pos >= -5 && pos <= 105 && (!wrap ? (i >= min && i <= max) : true)) { ticks.push({ val: displayVal, pos }); }
  }
  const getTickLabel = (val: number) => { return `${Math.round(val)}`; };

  return (
    <div className="flex flex-col gap-1 w-full shrink-0 relative" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <AnimatePresence>
        {tooltip && isHovered && !isDragging && (
          <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 2 }} className="absolute left-1/2 -translate-x-1/2 -top-8 px-3 py-1.5 bg-zinc-800 text-emerald-300 text-[10px] font-bold tracking-wider whitespace-nowrap rounded shadow-2xl border border-zinc-600 z-[100] pointer-events-none drop-shadow-xl">
            {tooltip}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-zinc-600" />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex justify-between items-end">
        <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">{label}</span>
        <div className="flex items-center gap-0.5">
          <button onMouseDown={(e) => { e.stopPropagation(); let n = value - (wrap ? 1 : 5); if (wrap) n = (n + 360) % 360; else n = Math.max(min, n); onChange(n); }} className="rounded cursor-pointer p-0.5 border shadow-sm transition-colors text-zinc-500 hover:text-emerald-400 bg-zinc-900 border-zinc-800"><ChevronLeft size={10} /></button>
          <span className="font-mono text-[10px] font-bold px-1 py-0.5 rounded border shadow-sm w-[46px] text-center text-emerald-400 bg-zinc-950/80 border-zinc-700">{value.toFixed(wrap ? 1 : 0)}{unit}</span>
          <button onMouseDown={(e) => { e.stopPropagation(); let n = value + (wrap ? 1 : 5); if (wrap) n = (n) % 360; else n = Math.min(max, n); onChange(n); }} className="rounded cursor-pointer p-0.5 border shadow-sm transition-colors text-zinc-500 hover:text-emerald-400 bg-zinc-900 border-zinc-800"><ChevronRight size={10} /></button>
        </div>
      </div>
      <div ref={containerRef} onMouseDown={handleStart} onTouchStart={handleStart} className={`relative rounded-lg overflow-hidden select-none touch-none transition-all shadow-inner h-11 w-full border ${isPlaying ? 'opacity-50' : 'cursor-pointer hover:border-emerald-500/50'} bg-zinc-950/80 border-zinc-700`}>
        <div className="absolute inset-0 flex items-center">
          {ticks.map((tick, idx) => (
            <div key={idx} className="absolute flex flex-col items-center h-full pt-1.5" style={{ left: `${tick.pos}%`, transform: 'translateX(-50%)' }}>
              <div className={`w-px ${tick.val % 10 === 0 ? 'h-3.5 bg-white' : tick.val % 5 === 0 ? 'h-2.5 bg-zinc-400' : 'h-1.5 bg-zinc-600'}`} />
              {tick.val % 10 === 0 && showLabels && (<span className="text-[11px] md:text-[12px] font-black font-mono mt-1 whitespace-nowrap text-white drop-shadow-md">{getTickLabel(tick.val)}</span>)}
            </div>
          ))}
        </div>
        <div className="absolute inset-0 flex justify-center items-center pointer-events-none">
          <div className="w-0.5 h-full bg-emerald-500 relative z-10 shadow-[0_0_8px_rgba(16,185,129,0.8)]"><div className="absolute bg-emerald-500 top-0 left-1/2 -translate-x-1/2 w-1.5 h-1 rounded-b-sm" /><div className="absolute bg-emerald-500 bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-1 rounded-t-sm" /></div>
        </div>
        <div className="absolute inset-0 pointer-events-none z-0 bg-gradient-to-r from-zinc-950 via-transparent to-zinc-950" />
      </div>
    </div>
  );
};

export const ToolButton = ({ icon, label, title, active, onClick, danger, disabled }: { icon: React.ReactNode; label: string; title?: string; active?: boolean; onClick?: (e: React.MouseEvent) => void; danger?: boolean; disabled?: boolean }) => {
  const baseClasses = "flex flex-col items-center justify-center gap-1.5 p-2 min-h-[50px] md:min-h-[64px] w-full rounded-xl border-2 transition-all duration-200 shadow-sm shrink-0";
  let stateClasses = "";
  if (disabled) { stateClasses = "bg-zinc-900/40 text-zinc-700 border-zinc-800/40 cursor-not-allowed"; }
  else if (active) { stateClasses = "bg-emerald-500/10 text-emerald-400 border-emerald-500 shadow-[0_4px_15px_rgba(16,185,129,0.2)] hover:bg-emerald-500/20 active:scale-95 cursor-pointer"; }
  else if (danger) { stateClasses = "bg-slate-800/80 text-rose-400 border-slate-700 hover:border-rose-500/50 hover:bg-rose-500/10 hover:-translate-y-0.5 active:scale-95 cursor-pointer"; }
  else { stateClasses = "bg-slate-800/80 text-slate-400 border-slate-700 hover:border-emerald-500/50 hover:text-emerald-300 hover:shadow-lg hover:-translate-y-0.5 active:scale-95 cursor-pointer"; }

  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} title={title || label} className={`${baseClasses} ${stateClasses}`}>
      {icon}
      <span className="text-[8px] md:text-[9px] font-bold uppercase tracking-widest">{label}</span>
    </button>
  );
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportDims, setViewportDims] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!viewportRef.current) return;
    const obs = new ResizeObserver(entries => {
      setViewportDims({ w: entries[0].contentRect.width, h: entries[0].contentRect.height });
    });
    obs.observe(viewportRef.current);
    return () => obs.disconnect();
  }, []);

  const getCanvasStyle = () => {
    if (zoom !== 1 || viewportDims.w === 0) return { position: 'relative' as const, width: `${FIELD_WIDTH * zoom}px`, height: `${FIELD_HEIGHT * zoom}px` };

    // Minimal padding: 8px on mobile, 16px on desktop
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const safeW = viewportDims.w - (isMobile ? 8 : 16);

    // Vertical padding: 40px (just enough for the slim pill)
    const safeH = viewportDims.h - (isMobile ? 40 : 60);

    const ratio = FIELD_WIDTH / FIELD_HEIGHT;
    let targetW = safeW; let targetH = targetW / ratio;

    if (targetH > safeH) {
      targetH = safeH;
      targetW = targetH * ratio;
    }

    return { position: 'relative' as const, width: `${targetW}px`, height: `${targetH}px` };
  };

  const [showMobilePrompt, setShowMobilePrompt] = useState(false);
  const [brightMode, setBrightMode] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [ballSet] = useState<'primary' | 'secondary'>('primary');
  const [features, setFeatures] = useState({ recording: false, draw: false, zoom: false });
  const [filenamePrefix, setFilenamePrefix] = useState("sequence");
  const [zoom, setZoom] = useState(1);
  const lastPanRef = useRef({ x: 0, y: 0, scrollL: 0, scrollT: 0 });
  const [angle, setAngle] = useState(315);
  const [speed, setSpeed] = useState(100);
  const [placementMode, setPlacementMode] = useState(false);
  const [drawMode, setDrawMode] = useState(false);



  const [targetSpot, setTargetSpot] = useState<{ x: number; y: number } | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeBallId, setActiveBallId] = useState<BallId | null>(null);
  const [showInstruction, setShowInstruction] = useState(true);
  const [ghostBallEnabled, setGhostBallEnabled] = useState(true);
  const [draggingItem, setDraggingItem] = useState<BallId | 'ghost' | 'pan' | 'draw' | 'spark-target' | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [cleanFeed, setCleanFeed] = useState(false);
  const [drawings, setDrawings] = useState<Path[]>([]);
  const [currentPath, setCurrentPath] = useState<Path | null>(null);
  const [drawStyle, setDrawStyle] = useState<'freehand' | 'straight'>('freehand');
  const [drawColor, setDrawColor] = useState<string>('#ffffff');

  const [isRecording, setIsRecording] = useState(false);
  const [sequence, setSequence] = useState<RecordedShot[]>([]);
  const [currentShotIndex, setCurrentShotIndex] = useState(0);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayDelay, setReplayDelay] = useState(1);

  const sequenceRef = useRef(sequence);
  useEffect(() => { sequenceRef.current = sequence; }, [sequence]);

  const replayRef = useRef<{ active: boolean, timeoutId: ReturnType<typeof setTimeout> | null, animId: number | null, isAutoReplaying: boolean }>({ active: false, timeoutId: null, animId: null, isAutoReplaying: false });

  const [history, setHistory] = useState<{state: Record<BallId, Ball>, isShot: boolean}[]>([]);
  const saveStateRef = useRef<Record<BallId, Ball> | null>(null);
  const touchingPairsRef = useRef<string[]>([]);

  // Initialize 10 balls
  const initBalls = useCallback((set: 'primary' | 'secondary') => {
    const pos = getInitialPositions();
    const newBalls = {} as Record<BallId, Ball>;
    BALL_IDS.forEach((id) => {
      const isRed = id.startsWith('r');
      newBalls[id] = {
        x: pos[id].x, y: pos[id].y, vx: 0, vy: 0, radius: BALL_RADIUS,
        color: isRed ? BALL_SETS[set].red.hex : BALL_SETS[set].white.hex,
        id, number: parseInt(id.replace(/[^\d]/g, ''), 10)
      };
    });
    return newBalls as Record<BallId, Ball>;
  }, []);

  const [balls, setBalls] = useState<Record<BallId, Ball>>(() => initBalls('primary'));
  const ballsRef = useRef<Record<BallId, Ball>>(balls);

  const isBallDocked = (ball: Ball) => ball.y > FIELD_HEIGHT - EDGING + 15 && ball.x < EDGING + 16.5 * SCALE;
  const allBallsDocked = Object.values(balls).every(b => isBallDocked(b));


  useEffect(() => {
    if (!isPlaying) {
      ballsRef.current = balls;
    }
  }, [balls, isPlaying]);

  const activeBallIdRef = useRef<BallId | null>(activeBallId);
  useEffect(() => { activeBallIdRef.current = activeBallId; }, [activeBallId]);

  const touchingSparkTargetId = React.useMemo(() => {
    if (!activeBallId || isPlaying || isReplaying) return null;
    const activeBall = balls[activeBallId];
    if (isBallDocked(activeBall)) return null;
    const others = Object.values(balls).filter(b => b.id !== activeBallId && !isBallDocked(b));
    for (const b of others) {
      const dx = activeBall.x - b.x;
      const dy = activeBall.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= 2 * BALL_RADIUS + 0.5) {
        return b.id as BallId;
      }
    }
    return null;
  }, [activeBallId, balls, isPlaying, isReplaying]);

  const sparkMode = !!touchingSparkTargetId;
  const sparkTargetId = touchingSparkTargetId;

  useEffect(() => {
    setBalls(prev => {
      const next = { ...prev };
      BALL_IDS.forEach(id => {
        const isRed = id.startsWith('r');
        next[id] = { ...next[id], color: isRed ? BALL_SETS[ballSet].red.hex : BALL_SETS[ballSet].white.hex };
      });
      return next;
    });
  }, [ballSet]);

  useEffect(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) { setShowMobilePrompt(true); }
  }, []);

  const handleZoomChange = (newZoom: number) => {
    if (!viewportRef.current || newZoom === zoom) return; const viewport = viewportRef.current;
    const centerX = viewport.scrollLeft + viewport.clientWidth / 2; const centerY = viewport.scrollTop + viewport.clientHeight / 2; const zoomRatio = newZoom / zoom;
    setZoom(newZoom); setTimeout(() => { if (viewportRef.current) { viewportRef.current.scrollLeft = centerX * zoomRatio - viewportRef.current.clientWidth / 2; viewportRef.current.scrollTop = centerY * zoomRatio - viewportRef.current.clientHeight / 2; } }, 0);
  };

  const stateRefs = useRef({ activeBallId, angle, speed, isRecording });
  useEffect(() => { stateRefs.current = { activeBallId, angle, speed, isRecording }; }, [activeBallId, angle, speed, isRecording]);

  const handleCaptureFrame = () => {
    setSequence(prev => {
      const positionsCopy = {} as Record<BallId, Ball>;
      BALL_IDS.forEach(id => { positionsCopy[id] = { ...ballsRef.current[id], vx: 0, vy: 0 }; });
      const newSeq = [...prev, { id: Date.now() + Math.random(), activeBallId: stateRefs.current.activeBallId || 'r1', angle: stateRefs.current.angle, speed: stateRefs.current.speed, positions: positionsCopy }];
      setCurrentShotIndex(newSeq.length - 1); return newSeq;
    });
  };

  const wasPlayingRef = useRef(isPlaying);
  useEffect(() => { if (wasPlayingRef.current && !isPlaying && stateRefs.current.isRecording) handleCaptureFrame(); wasPlayingRef.current = isPlaying; }, [isPlaying]);

  useEffect(() => {
    if (placementMode && targetSpot && activeBallId && !isPlaying) {
      const activeBall = balls[activeBallId];
      const dx = targetSpot.x - activeBall.x; const dy = targetSpot.y - activeBall.y; const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) { setAngle((Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360); setSpeed((dist / (20 * SCALE)) * 100); }
    }
  }, [placementMode, targetSpot, balls, activeBallId, isPlaying]);

  useEffect(() => {
    if (sparkMode && activeBallId && sparkTargetId && !isPlaying) {
      setBalls(prev => {
        const activeBall = prev[activeBallId];
        if (!activeBall) return prev;
        const rad = (angle * Math.PI) / 180;
        const targetX = activeBall.x + Math.sin(rad) * (2 * BALL_RADIUS);
        const targetY = activeBall.y - Math.cos(rad) * (2 * BALL_RADIUS);
        return {
          ...prev,
          [sparkTargetId]: { ...prev[sparkTargetId], x: targetX, y: targetY }
        };
      });
    }
  }, [sparkMode, activeBallId, sparkTargetId, angle, isPlaying]);
  const animationRef = useRef<number>(null);

  const handleUndo = () => {
    if (history.length === 0 || isPlaying || isReplaying) return;
    const lastItem = history[history.length - 1];
    setBalls(lastItem.state);
    
    if (lastItem.isShot && isRecording) {
      setSequence(prev => {
        const newSeq = prev.length >= 2 ? prev.slice(0, -2) : [];
        setCurrentShotIndex(Math.max(0, newSeq.length - 1));
        return newSeq;
      });
    }
    
    setHistory(prev => prev.slice(0, -1)); setTargetSpot(null); setPlacementMode(false);
    setDrawMode(false);
  };

  const resetPositions = useCallback(() => {
    if (isReplaying) return;
    setIsPlaying(false); setShowInstruction(true); setActiveBallId(null); setTargetSpot(null); setDrawings([]); setZoom(1); setPlacementMode(false); setHistory([]);
    setDrawMode(false);
    setSequence([]); setCurrentShotIndex(0);
    setGhostBallEnabled(true); // FIX: Restore line on full reset
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    setBalls(initBalls(ballSet));
  }, [ballSet, isReplaying, initBalls]);

  const animateToFrame = (targetIndex: number) => {
    return new Promise<void>((resolve) => {
      const startState = { ...ballsRef.current };
      const endState = sequenceRef.current[targetIndex].positions;

      let maxDist = 1;
      BALL_IDS.forEach(id => {
        const dist = Math.sqrt((endState[id].x - startState[id].x) ** 2 + (endState[id].y - startState[id].y) ** 2);
        if (dist > maxDist) maxDist = dist;
      });

      const duration = Math.max(400, (maxDist / (35 * SCALE)) * 2500);
      const startTime = performance.now();

      const step = (time: number) => {
        if (!replayRef.current.active && replayRef.current.isAutoReplaying) { resolve(); return; }
        const elapsed = time - startTime;
        let progress = elapsed / duration;
        if (progress > 1) progress = 1;

        const ease = 1 - Math.pow(1 - progress, 3);
        const lerp = (start: number, end: number) => start + (end - start) * ease;

        const nextBalls = {} as Record<BallId, Ball>;
        BALL_IDS.forEach(id => {
          nextBalls[id] = { ...startState[id], x: lerp(startState[id].x, endState[id].x), y: lerp(startState[id].y, endState[id].y) };
        });

        ballsRef.current = nextBalls;
        renderScene(nextBalls);

        if (progress < 1) {
          replayRef.current.animId = requestAnimationFrame(step);
        } else {
          setBalls(nextBalls);
          setCurrentShotIndex(targetIndex);
          setActiveBallId(sequenceRef.current[targetIndex].activeBallId);
          setAngle(sequenceRef.current[targetIndex].angle);
          setSpeed(sequenceRef.current[targetIndex].speed);
          resolve();
        }
      };
      replayRef.current.animId = requestAnimationFrame(step);
    });
  };

  const goToFrame = async (index: number) => {
    if (index < 0 || index >= sequence.length || isPlaying || isReplaying) return;
    replayRef.current.active = true; replayRef.current.isAutoReplaying = false;
    setTargetSpot(null); setDrawings([]); setHistory([]);
    await animateToFrame(index);
    replayRef.current.active = false;
  };

  const startSequenceReplay = async () => {
    if (sequence.length < 2) return;
    setIsReplaying(true); replayRef.current.active = true; replayRef.current.isAutoReplaying = true;
    setTargetSpot(null); setDrawings([]); setHistory([]);

    const frame0 = sequenceRef.current[0];
    setBalls(frame0.positions);
    ballsRef.current = frame0.positions;
    setCurrentShotIndex(0); setActiveBallId(frame0.activeBallId); setAngle(frame0.angle); setSpeed(frame0.speed);

    for (let i = 1; i < sequenceRef.current.length; i++) {
      if (!replayRef.current.active) break;
      await new Promise(res => { replayRef.current.timeoutId = setTimeout(res, replayDelay * 1000) });
      if (!replayRef.current.active) break;
      await animateToFrame(i);
    }
    setIsReplaying(false); replayRef.current.active = false; replayRef.current.isAutoReplaying = false;
  };

  const stopSequenceReplay = () => {
    setIsReplaying(false); replayRef.current.active = false;
    clearTimeout(replayRef.current.timeoutId); cancelAnimationFrame(replayRef.current.animId);
  };

  const clearSequence = () => { if (isReplaying) return; setSequence([]); setCurrentShotIndex(0); setDrawings([]); };

  const exportSequence = () => {
    const d = new Date();
    const timestamp = `${d.getFullYear()}${(d.getMonth() + 1).toString().padStart(2, '0')}${d.getDate().toString().padStart(2, '0')}_${d.getHours().toString().padStart(2, '0')}${d.getMinutes().toString().padStart(2, '0')}`;
    const safePrefix = filenamePrefix.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'sequence';
    const filename = `${safePrefix}_${timestamp}.json`;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(sequence));
    const downloadAnchorNode = document.createElement('a'); downloadAnchorNode.setAttribute("href", dataStr); downloadAnchorNode.setAttribute("download", filename); document.body.appendChild(downloadAnchorNode); downloadAnchorNode.click(); downloadAnchorNode.remove();
  };

  const importSequence = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const loaded = JSON.parse(event.target?.result as string);
        if (Array.isArray(loaded)) {
          setSequence(loaded); setCurrentShotIndex(0); setIsRecording(false); setDrawings([]); setHistory([]);
        }
      } catch { console.error("Failed to load sequence"); }
    };
    reader.readAsText(file);
  };

  const playShot = () => {
    if (isPlaying || isReplaying || !activeBallId) return;
    const activeBall = balls[activeBallId];
    if (isBallDocked(activeBall)) return;

    setHistory(prev => [...prev, { state: { ...balls }, isShot: true }]);

    const pairs: string[] = [];
    const bs = Object.values(balls);
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const dx = bs[i].x - bs[j].x; const dy = bs[i].y - bs[j].y;
        if (Math.sqrt(dx * dx + dy * dy) <= 2 * BALL_RADIUS + 0.5 && !isBallDocked(bs[i]) && !isBallDocked(bs[j])) {
          pairs.push(`${bs[i].id}-${bs[j].id}`);
        }
      }
    }
    touchingPairsRef.current = pairs;

    if (isRecording) handleCaptureFrame();
    playSound(SOUNDS.mallet, 0.6);
    const rad = (angle * Math.PI) / 180; const decel = 0.06; const distance = (speed / 100) * 20 * SCALE; const initialSpeed = Math.sqrt(2 * decel * distance);
    const vx = Math.sin(rad) * initialSpeed; const vy = -Math.cos(rad) * initialSpeed;

    if (sparkMode && sparkTargetId) {
      ballsRef.current = { ...ballsRef.current, [sparkTargetId]: { ...ballsRef.current[sparkTargetId], vx, vy } };
    } else {
      ballsRef.current = { ...ballsRef.current, [activeBallId]: { ...ballsRef.current[activeBallId], vx, vy } };
    }

    setTargetSpot(null);
    setIsPlaying(true);
  };

  const toggleFullscreen = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = document.documentElement as any;
    const requestFS = doc.requestFullscreen || doc.webkitRequestFullscreen || doc.msRequestFullscreen;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exitFS = document.exitFullscreen || (document as any).webkitExitFullscreen || (document as any).msExitFullscreen;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
      if (requestFS) {
        requestFS.call(doc).then(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (window.screen && window.screen.orientation && (window.screen.orientation as any).lock) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window.screen.orientation as any).lock('landscape').catch(() => { });
          }
        }).catch(() => { });
      }
    } else {
      if (exitFS) { exitFS.call(document); }
      if (window.screen && window.screen.orientation && window.screen.orientation.unlock) { window.screen.orientation.unlock(); }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFS = !!(document.fullscreenElement || (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement);
      setIsFullscreen(isFS);
      if (!isFS) {
        setTimeout(() => { try { const targetHeight = Math.floor(window.screen.availHeight * 0.95); const targetWidth = Math.floor(targetHeight * (5 / 4)); window.resizeTo(targetWidth, targetHeight); } catch { /* ignore */ } }, 100);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => { document.removeEventListener('fullscreenchange', handleFullscreenChange); document.removeEventListener('webkitfullscreenchange', handleFullscreenChange); }
  }, []);

  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return null;
    let clientX, clientY; if ('touches' in e) { clientX = e.touches[0].clientX; clientY = e.touches[0].clientY; } else { clientX = (e as React.MouseEvent).clientX; clientY = (e as React.MouseEvent).clientY; }
    const x = (clientX - rect.left) * (FIELD_WIDTH / rect.width); const y = (clientY - rect.top) * (FIELD_HEIGHT / rect.height);
    return { x, y };
  };

  const handleStart = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (isPlaying || isReplaying) return; const coords = getCanvasCoords(e); if (!coords) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX; const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const { x, y } = coords;

    saveStateRef.current = { ...balls };

    const getHitDistance = (ball: Ball) => {
      const isDocked = isBallDocked(ball);
      const displayRadius = isDocked ? ball.radius * 1.5 : ball.radius;
      const hitTolerance = isDocked ? 2.0 : (placementMode ? 2.5 : 5.0);
      const dist = Math.sqrt((x - ball.x) ** 2 + (y - ball.y) ** 2);
      return dist < displayRadius * hitTolerance ? dist : Infinity;
    };

    if (drawMode && !cleanFeed) {
      if (Object.values(balls).some(b => getHitDistance(b) !== Infinity)) {
        // Nothing here anymore
      }
      setCurrentPath({ points: [{ x, y }], color: drawColor, type: drawStyle }); setDraggingItem('draw'); return;
    }

    const activeBall = activeBallId ? balls[activeBallId] : null;
    let hitSomething = false;

    if (!cleanFeed) {
      const hits = Object.values(balls).map(b => ({ id: b.id, dist: getHitDistance(b) })).filter(h => h.dist !== Infinity).sort((a, b) => a.dist - b.dist);
      if (hits.length > 0) {
        const hitId = hits[0].id as BallId;
        if (sparkMode && hitId === sparkTargetId) {
          setDraggingItem(hitId);
          setTargetSpot(null);
          hitSomething = true;
        } else {
          setActiveBallId(hitId);
          activeBallIdRef.current = hitId; // SYNCHRONOUS FIX: Instantly updates the ref to kill closure lag
          setDraggingItem(hitId);
          setTargetSpot(null); // Clears old targets so the line doesn't snap to 0
          hitSomething = true;
        }
      }
    }

    if (!hitSomething && ghostBallEnabled && !cleanFeed && activeBall) {
      const rad = (angle * Math.PI) / 180; const dx = Math.sin(rad); const dy = -Math.cos(rad);
      let firstImpact: { ball: Ball, t: number } | null = null;
      const otherBalls = Object.values(balls).filter(b => b.id !== activeBallId && !isBallDocked(b));

      for (const b of otherBalls) {
        const R2 = (2 * BALL_RADIUS) ** 2; const a_q = dx * dx + dy * dy;
        const b_q = 2 * (dx * (activeBall.x - b.x) + dy * (activeBall.y - b.y));
        const c_q = (activeBall.x - b.x) ** 2 + (activeBall.y - b.y) ** 2 - R2;
        const discriminant = b_q * b_q - 4 * a_q * c_q;
        if (discriminant >= 0) { const t = (-b_q - Math.sqrt(discriminant)) / (2 * a_q); if (t > 0 && (!firstImpact || t < firstImpact.t)) firstImpact = { ball: b, t }; }
      }

      if (firstImpact) {
        const ghostX = activeBall.x + firstImpact.t * dx; const ghostY = activeBall.y + firstImpact.t * dy;
        const distGhost = Math.sqrt((x - ghostX) ** 2 + (y - ghostY) ** 2);
        if (distGhost < BALL_RADIUS * 4) { setDraggingItem('ghost'); hitSomething = true; }
      }
    }

    if (!hitSomething && !cleanFeed) {
      if (placementMode || sparkMode) {
        if (!activeBall) return;
        setTargetSpot({ x, y });
        const dx = x - activeBall.x;
        const dy = y - activeBall.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
          setAngle((Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360);
        }

        let targetSpeed = (dist / (20 * SCALE)) * 100;

        if (sparkMode) {
          const isOutside = x <= EDGING || x >= FIELD_WIDTH - EDGING || y <= EDGING || y >= FIELD_HEIGHT - EDGING;
          if (isOutside) {
            targetSpeed *= 1.10;
          }
        }

        setSpeed(Math.min(200, Math.max(1, targetSpeed)));
      } else {
        setActiveBallId(null); setDraggingItem('pan'); lastPanRef.current = { x: clientX, y: clientY, scrollL: viewportRef.current?.scrollLeft || 0, scrollT: viewportRef.current?.scrollTop || 0 };
      }
    }
  };
  const handleMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);
    if (coords) setHoverPos(coords);

    if (!draggingItem || isPlaying || isReplaying) return;
    if (draggingItem === 'pan') {
      if (viewportRef.current) { const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX; const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY; viewportRef.current.scrollLeft = lastPanRef.current.scrollL - (clientX - lastPanRef.current.x); viewportRef.current.scrollTop = lastPanRef.current.scrollT - (clientY - lastPanRef.current.y); }
      return;
    }

    if (!coords) return; const { x, y } = coords;

    if (draggingItem === 'draw' && currentPath) {
      setCurrentPath(prev => prev ? { ...prev, points: prev.type === 'straight' && prev.points.length > 0 ? [prev.points[0], { x, y }] : [...prev.points, { x, y }] } : null);
      return;
    }

    let cx = Math.max(BALL_RADIUS, Math.min(FIELD_WIDTH - BALL_RADIUS, x));
    let cy = Math.max(BALL_RADIUS, Math.min(FIELD_HEIGHT - BALL_RADIUS, y));

    if (BALL_IDS.includes(draggingItem as BallId)) {
      if (sparkMode && draggingItem === activeBallIdRef.current) return;

      const otherBalls = Object.values(balls).filter(b => b.id !== draggingItem && (!sparkMode || b.id !== sparkTargetId));
      for (let iter = 0; iter < 3; iter++) {
        for (const b of otherBalls) {
          const dx = cx - b.x; const dy = cy - b.y; const dist = Math.sqrt(dx * dx + dy * dy); const minDist = 2.0 * BALL_RADIUS;
          if (dist < minDist && dist > 0.0001) { const overlap = minDist - dist; cx += (dx / dist) * overlap; cy += (dy / dist) * overlap; }
        }
      }
      cx = Math.max(BALL_RADIUS, Math.min(FIELD_WIDTH - BALL_RADIUS, cx));
      cy = Math.max(BALL_RADIUS, Math.min(FIELD_HEIGHT - BALL_RADIUS, cy));

      setBalls(prev => {
        const next = { ...prev, [draggingItem as BallId]: { ...prev[draggingItem as BallId], x: cx, y: cy } };

        const currentOthers = Object.values(next).filter(b => b.id !== draggingItem && !isBallDocked(b));
        for (const b of currentOthers) {
          const dist = Math.sqrt((cx - b.x) ** 2 + (cy - b.y) ** 2);
          if (dist <= 2 * BALL_RADIUS + 0.5) {
            if (activeBallIdRef.current !== b.id) {
              setActiveBallId(b.id as BallId);
              activeBallIdRef.current = b.id as BallId;
            }
            break;
          }
        }

        if (sparkMode && sparkTargetId && draggingItem === activeBallIdRef.current) {
          const rad = (angle * Math.PI) / 180;
          next[sparkTargetId] = {
            ...next[sparkTargetId],
            x: cx + Math.sin(rad) * 2 * BALL_RADIUS,
            y: cy - Math.cos(rad) * 2 * BALL_RADIUS
          };
        }

        // FIXED SPARK AUTO-AIM LOGIC
        if (draggingItem !== activeBallIdRef.current && activeBallIdRef.current) {
          const activeBall = next[activeBallIdRef.current];
          if (!isBallDocked(activeBall)) {
            const dist = Math.sqrt((cx - activeBall.x) ** 2 + (cy - activeBall.y) ** 2);
            // Must be strictly greater than 0 to prevent atan2(0,0) reverting angle
            if (dist > 0 && dist <= 2 * BALL_RADIUS + 0.5) {
              setAngle((Math.atan2(cy - activeBall.y, cx - activeBall.x) * 180 / Math.PI + 90 + 360) % 360);
            }
          }
        }

        return next;
      });
    }
    else if (draggingItem === 'ghost' && !cleanFeed) {
      const activeBall = balls[activeBallIdRef.current!];
      let closestBall: Ball | null = null; let minDist = Infinity;
      const otherBalls = Object.values(balls).filter(b => b.id !== activeBallIdRef.current && !isBallDocked(b));
      for (const b of otherBalls) { const dist = Math.sqrt((x - b.x) ** 2 + (y - b.y) ** 2); if (dist < minDist) { minDist = dist; closestBall = b; } }

      if (closestBall && minDist < BALL_RADIUS * 8) {
        const bdx = x - closestBall.x; const bdy = y - closestBall.y; const bdist = Math.sqrt(bdx * bdx + bdy * bdy);
        if (bdist > 0) {
          const ghostX = closestBall.x + (bdx / bdist) * 2 * BALL_RADIUS; const ghostY = closestBall.y + (bdy / bdist) * 2 * BALL_RADIUS;
          const adx = ghostX - activeBall.x; const ady = ghostY - activeBall.y;
          setAngle((Math.atan2(ady, adx) * 180 / Math.PI + 90 + 360) % 360);
        }
      } else {
        const dx = x - activeBall.x; const dy = y - activeBall.y;
        if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
          setAngle((Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360);
        }
      }
    }
  };

  const snapOutBall = (ballId: BallId) => {
    setBalls(prev => {
      const ball = prev[ballId];
      if (isBallDocked(ball)) return prev;

      // Gateball start area check
      const inStartArea = ball.x >= EDGING + 17 * SCALE && ball.x <= EDGING + 19 * SCALE &&
        ball.y >= FIELD_HEIGHT - EDGING && ball.y <= FIELD_HEIGHT - EDGING + 2 * SCALE;
      if (inStartArea) return prev;

      const innerLeft = EDGING;
      const innerRight = FIELD_WIDTH - EDGING;
      const innerTop = EDGING;
      const innerBottom = FIELD_HEIGHT - EDGING;

      // Gateball Rule: 10cm (0.1m) offset from inside line to ball's outer edge
      const outOffset = (0.1 * SCALE) + BALL_RADIUS;

      const isOutLeft = ball.x < innerLeft;
      const isOutRight = ball.x > innerRight;
      const isOutTop = ball.y < innerTop;
      const isOutBottom = ball.y > innerBottom;

      if (!isOutLeft && !isOutRight && !isOutTop && !isOutBottom) return prev;

      const next = { ...prev, [ballId]: { ...ball } };

      // Corrected Perpendicular Placement Logic
      if (isOutLeft) next[ballId].x = innerLeft - outOffset;
      else if (isOutRight) next[ballId].x = innerRight + outOffset;

      if (isOutTop) next[ballId].y = innerTop - outOffset;
      else if (isOutBottom) next[ballId].y = innerBottom + outOffset;

      return next;
    });
  };

  const handleMouseUp = () => {
    if (draggingItem && BALL_IDS.includes(draggingItem as BallId)) snapOutBall(draggingItem as BallId);
    if (draggingItem && draggingItem !== 'pan' && draggingItem !== 'draw' && saveStateRef.current) {
      const moved = BALL_IDS.some(id => balls[id].x !== saveStateRef.current![id].x || balls[id].y !== saveStateRef.current![id].y);
      if (moved) setHistory(prev => [...prev, { state: saveStateRef.current!, isShot: false }]);
    }
    if (draggingItem === 'draw' && currentPath) { setDrawings(prev => [...prev, currentPath]); setCurrentPath(null); }
    setDraggingItem(null);
  };
  const handleMouseLeave = () => { setHoverPos(null); handleMouseUp(); };

  const checkGatePass = (x1: number, y1: number, x2: number, y2: number) => {
    for (const gate of GATES) {
      // Gates are vertical if placed parallel to left/right bounds. 
      // Our gates: Gate 1 and Gate 2 are on left and right, so they might be parallel to horizontal lines?
      // Wait, let's assume they are vertical (U-shape opens left/right) so width is in Y axis.
      const hy1 = gate.y - GATE_WIDTH / 2; const hy2 = gate.y + GATE_WIDTH / 2; const hx = gate.x;
      if ((x1 > hx && x2 <= hx) || (x1 < hx && x2 >= hx)) {
        const intersectY = y1 + ((hx - x1) / (x2 - x1)) * (y2 - y1);
        if (intersectY >= hy1 && intersectY <= hy2) return true;
      }
    } return false;
  };

  const drawField = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#166534'; ctx.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);

    const boundaryWidth = (60 / 914.4) * SCALE; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = boundaryWidth; ctx.lineJoin = 'miter';
    ctx.strokeRect(EDGING, EDGING, 20 * SCALE, 15 * SCALE);

    // Outer Field line (dashed, 1m from inner field)
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(EDGING - 1 * SCALE, EDGING - 1 * SCALE, 20 * SCALE + 2 * SCALE, 15 * SCALE + 2 * SCALE);
    ctx.setLineDash([]);

    const stripeWidth = 40; for (let x = 0; x < FIELD_WIDTH; x += stripeWidth) { ctx.fillStyle = (x / stripeWidth) % 2 === 0 ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)'; ctx.fillRect(x, 0, stripeWidth, FIELD_HEIGHT); }

    if (!cleanFeed) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'; ctx.font = '10px "Inter", sans-serif'; ctx.textAlign = 'center';

      ctx.save(); ctx.translate(EDGING - 15, FIELD_HEIGHT / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('Line 3 (15m)', 0, 0); ctx.restore();

      ctx.save(); ctx.translate(FIELD_WIDTH / 2, EDGING - 15); ctx.fillText('Line 2 (20m)', 0, 0); ctx.restore();

      ctx.save(); ctx.translate(FIELD_WIDTH - EDGING + 15, FIELD_HEIGHT / 2); ctx.rotate(Math.PI / 2); ctx.fillText('Line 1 (15m)', 0, 0); ctx.restore();

      ctx.save(); ctx.translate(FIELD_WIDTH / 2, FIELD_HEIGHT - EDGING + 15); ctx.fillText('Line 4 (20m)', 0, 0); ctx.restore();
    }


    if (!cleanFeed) {
      const corners = [
        { x: EDGING + 20 * SCALE + 10, y: EDGING + 15 * SCALE + 15, label: 'Corner 1', align: 'left' },
        { x: EDGING + 20 * SCALE + 10, y: EDGING - 10, label: 'Corner 2', align: 'left' },
        { x: EDGING - 10, y: EDGING - 10, label: 'Corner 3', align: 'right' },
        { x: EDGING - 10, y: EDGING + 15 * SCALE + 15, label: 'Corner 4', align: 'right' }
      ];
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '10px "Inter", sans-serif';
      corners.forEach(c => {
        ctx.textAlign = c.align as CanvasTextAlign;
        ctx.fillText(c.label, c.x, c.y);
      });
    }

    // Draw Start Area: 1m to 3m from Corner 1 along Line 4 (bottom edge). Corner 1 is bottom right.
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(EDGING + 17 * SCALE, FIELD_HEIGHT - EDGING, 2 * SCALE, 1 * SCALE);
    if (!cleanFeed) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = 'bold 10px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('START', EDGING + 18 * SCALE, FIELD_HEIGHT - EDGING + 20);
    }
  };

  const drawAnnotations = (ctx: CanvasRenderingContext2D) => {
    ctx.save(); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'; ctx.shadowBlur = 4;
    const renderPath = (path: Path) => { if (path.points.length < 2) return; ctx.strokeStyle = path.color || '#ffffff'; ctx.beginPath(); ctx.moveTo(path.points[0].x, path.points[0].y); for (let i = 1; i < path.points.length; i++) { ctx.lineTo(path.points[i].x, path.points[i].y); } ctx.stroke(); };
    drawings.forEach(renderPath); if (currentPath) renderPath(currentPath); ctx.restore();
  };

  const drawBall = (ctx: CanvasRenderingContext2D, ball: Ball, shadow = false, isActive = false) => {
    ctx.save();
    const isDocked = isBallDocked(ball);
    const displayRadius = isDocked ? ball.radius * 1.5 : ball.radius;

    if (isActive && !shadow && !cleanFeed) {
      ctx.beginPath(); ctx.arc(ball.x, ball.y, displayRadius + (isDocked ? 6 : 5), 0, Math.PI * 2);
      ctx.strokeStyle = getActiveColor(ball.id, ballSet); ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
    }
    if (!shadow) { ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3; }
    ctx.beginPath(); ctx.arc(ball.x, ball.y, displayRadius, 0, Math.PI * 2);
    ctx.fillStyle = shadow ? 'rgba(220, 220, 220, 0.6)' : ball.color; ctx.fill(); ctx.shadowColor = 'transparent';

    ctx.beginPath(); ctx.arc(ball.x - displayRadius * 0.3, ball.y - displayRadius * 0.3, displayRadius * 0.25, 0, Math.PI * 2); ctx.fillStyle = shadow ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.4)'; ctx.fill();

    if (!shadow) {
      ctx.fillStyle = ball.id.startsWith('r') ? '#ffffff' : '#991b1b';
      ctx.font = `900 ${displayRadius * 1.5}px "Arial Black", "Inter", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ball.number.toString(), ball.x, ball.y + displayRadius * 0.1);
    }

    ctx.restore();
  };

  const drawCourtObjects = (ctx: CanvasRenderingContext2D) => {
    ctx.save(); ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'; ctx.shadowBlur = 4; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(GOAL_POLE_POS.x, GOAL_POLE_POS.y, GOAL_POLE_RADIUS, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();

    GATES.forEach(gate => {
      ctx.save(); ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'; ctx.shadowBlur = 3; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;

      const isVertical = gate.id === 2 || gate.id === 3;

      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath();
      if (isVertical) {
        ctx.moveTo(gate.x, gate.y - GATE_WIDTH / 2);
        ctx.lineTo(gate.x, gate.y + GATE_WIDTH / 2);
      } else {
        ctx.moveTo(gate.x - GATE_WIDTH / 2, gate.y);
        ctx.lineTo(gate.x + GATE_WIDTH / 2, gate.y);
      }
      ctx.stroke();
      ctx.restore();

      if (!cleanFeed) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = 'bold 12px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const offset = ('labelOffset' in gate && gate.labelOffset) ? (gate.labelOffset as { x: number; y: number }) : { x: 0, y: 15 };
        ctx.fillText(`Gate ${gate.label}`, gate.x + offset.x, gate.y + offset.y);
        ctx.textBaseline = 'alphabetic';
      }
    });
  };


  const drawArrow = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, color: string) => {
    const headLength = 10; const angle = Math.atan2(toY - fromY, toX - fromX); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fromX, fromY); ctx.lineTo(toX, toY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(toX, toY); ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6)); ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6)); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  };

  const drawPrediction = (ctx: CanvasRenderingContext2D) => {
    if (isPlaying || draggingItem || !activeBallId || cleanFeed || !ghostBallEnabled) return;
    const rad = (angle * Math.PI) / 180; const dx = Math.sin(rad); const dy = -Math.cos(rad);

    let activeBall = balls[activeBallId];
    if (sparkMode && sparkTargetId) {
      activeBall = balls[sparkTargetId];
    }

    if (!activeBall || isBallDocked(activeBall)) return;
    const x0 = activeBall.x; const y0 = activeBall.y; let lineEndT = 1000;
    if (dx > 0) lineEndT = Math.min(lineEndT, (FIELD_WIDTH - BALL_RADIUS - x0) / dx); if (dx < 0) lineEndT = Math.min(lineEndT, (BALL_RADIUS - x0) / dx);
    if (dy > 0) lineEndT = Math.min(lineEndT, (FIELD_HEIGHT - BALL_RADIUS - y0) / dy); if (dy < 0) lineEndT = Math.min(lineEndT, (BALL_RADIUS - y0) / dy);

    ctx.save(); ctx.beginPath(); ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; ctx.lineWidth = 2; ctx.moveTo(x0, y0); ctx.lineTo(x0 + dx * lineEndT, y0 + dy * lineEndT); ctx.stroke(); ctx.restore();

    let firstImpact: { ball: Ball, t: number } | null = null;
    const otherBalls = Object.values(balls).filter(b => b.id !== activeBall.id && (!sparkMode || b.id !== activeBallId) && !isBallDocked(b));
    for (const b of otherBalls) {
      const R2 = (2 * BALL_RADIUS) ** 2; const a_q = dx * dx + dy * dy; const b_q = 2 * (dx * (x0 - b.x) + dy * (y0 - b.y)); const c_q = (x0 - b.x) ** 2 + (y0 - b.y) ** 2 - R2; const discriminant = b_q * b_q - 4 * a_q * c_q;
      if (discriminant >= 0) { const t = (-b_q - Math.sqrt(discriminant)) / (2 * a_q); if (t > 0 && (!firstImpact || t < firstImpact.t)) firstImpact = { ball: b, t }; }
    }

    const obstacles: { x: number, y: number, radius: number, color: string }[] = [{ x: GOAL_POLE_POS.x, y: GOAL_POLE_POS.y, radius: GOAL_POLE_RADIUS, color: '#fff' }];
    GATES.forEach(h => {
      const isVertical = h.id === 2 || h.id === 3;
      if (isVertical) {
        obstacles.push({ x: h.x, y: h.y - GATE_WIDTH / 2, radius: 2, color: '#fff' }); obstacles.push({ x: h.x, y: h.y + GATE_WIDTH / 2, radius: 2, color: '#fff' });
      } else {
        obstacles.push({ x: h.x - GATE_WIDTH / 2, y: h.y, radius: 2, color: '#fff' }); obstacles.push({ x: h.x + GATE_WIDTH / 2, y: h.y, radius: 2, color: '#fff' });
      }
    });
    for (const obs of obstacles) {
      const R2 = (BALL_RADIUS + obs.radius) ** 2; const a_q = dx * dx + dy * dy; const b_q = 2 * (dx * (x0 - obs.x) + dy * (y0 - obs.y)); const c_q = (x0 - obs.x) ** 2 + (y0 - obs.y) ** 2 - R2; const discriminant = b_q * b_q - 4 * a_q * c_q;
      if (discriminant >= 0) { const t = (-b_q - Math.sqrt(discriminant)) / (2 * a_q); if (t > 0 && (!firstImpact || t < firstImpact.t)) firstImpact = { ball: { ...activeBall!, x: obs.x, y: obs.y, radius: obs.radius, color: obs.color, vx: 0, vy: 0, id: 'r1' }, t }; }
    }

    if (firstImpact) {
      const { ball: hitBall, t } = firstImpact; const impactX = x0 + t * dx; const impactY = y0 + t * dy;
      ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(impactX, impactY); ctx.stroke(); ctx.restore();
      drawBall(ctx, { ...activeBall, x: impactX, y: impactY }, true);

      const e_coeff = 0.92; const nx = (hitBall.x - impactX) / (2 * BALL_RADIUS); const ny = (hitBall.y - impactY) / (2 * BALL_RADIUS); const initialShotSpeed = speed * 10; const decel_val = 0.06;
      const vImpactSq = Math.max(0, initialShotSpeed * initialShotSpeed - 2 * decel_val * t); const vImpact = Math.sqrt(vImpactSq);

      if (vImpact > 0) {
        const vx = dx * vImpact; const vy = dy * vImpact; const v_dot_n = vx * nx + vy * ny;
        const target_vx_init = ((1 + e_coeff) / 2) * v_dot_n * nx; const target_vy_init = ((1 + e_coeff) / 2) * v_dot_n * ny;
        const striker_vx_init = vx - ((1 + e_coeff) / 2) * v_dot_n * nx; const striker_vy_init = vy - ((1 + e_coeff) / 2) * v_dot_n * ny;
        const arrowLen = 25; const sMag = Math.sqrt(striker_vx_init ** 2 + striker_vy_init ** 2); const tMag = Math.sqrt(target_vx_init ** 2 + target_vy_init ** 2);
        if (sMag > 0.1) drawArrow(ctx, impactX, impactY, impactX + (striker_vx_init / sMag) * arrowLen, impactY + (striker_vy_init / sMag) * arrowLen, activeBall.color + 'CC');
        if (tMag > 0.1) drawArrow(ctx, hitBall.x, hitBall.y, hitBall.x + (target_vx_init / tMag) * arrowLen, hitBall.y + (target_vy_init / tMag) * arrowLen, hitBall.color + 'CC');
      }
    }
  };

  const renderScene = (ballsToRender: Record<BallId, Ball>) => {
    const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT); drawField(ctx);

    if (placementMode && !cleanFeed && activeBallId && hoverPos && !targetSpot) {
      const activeBall = ballsToRender[activeBallId];
      if (!isBallDocked(activeBall)) {
        ctx.save();
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)'; ctx.lineWidth = 2; ctx.setLineDash([4, 2]);
        ctx.beginPath(); ctx.arc(hoverPos.x, hoverPos.y, 4, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(hoverPos.x - 6, hoverPos.y); ctx.lineTo(hoverPos.x + 6, hoverPos.y);
        ctx.moveTo(hoverPos.x, hoverPos.y - 6); ctx.lineTo(hoverPos.x, hoverPos.y + 6); ctx.stroke();
        ctx.restore();
      }
    }

    if (placementMode && targetSpot && !cleanFeed && activeBallId) {
      ctx.save(); ctx.strokeStyle = getActiveColor(activeBallId, ballSet); ctx.lineWidth = 2; ctx.setLineDash([4, 2]); ctx.beginPath(); ctx.arc(targetSpot.x, targetSpot.y, 4, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(targetSpot.x - 6, targetSpot.y); ctx.lineTo(targetSpot.x + 6, targetSpot.y); ctx.moveTo(targetSpot.x, targetSpot.y - 6); ctx.lineTo(targetSpot.x, targetSpot.y + 6); ctx.stroke(); ctx.restore();
    }

    if (sparkMode && activeBallId) {
      const activeBall = ballsToRender[activeBallId];
      if (activeBall && !isBallDocked(activeBall)) {
        ctx.save();
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#fde047';
        ctx.fillText('⚡', activeBall.x + BALL_RADIUS * 2.5, activeBall.y - BALL_RADIUS * 2.5);
        ctx.restore();
      }
    }

    drawPrediction(ctx); drawAnnotations(ctx);

    BALL_IDS.forEach(id => {
      drawBall(ctx, ballsToRender[id], false, activeBallId === id);
    });

    drawCourtObjects(ctx);
  };

  useEffect(() => {
    if (!isPlaying) return;
    let lastTime: number | null = null; let frameCount = 0;

    const loop = (time: number) => {
      if (lastTime === null) { lastTime = time; animationRef.current = requestAnimationFrame(loop); return; }
      const deltaTime = Math.min((time - lastTime) / 16.67, 5); lastTime = time; frameCount++;

      const nextBalls = {} as Record<BallId, Ball>;
      BALL_IDS.forEach(id => { nextBalls[id] = { ...ballsRef.current[id] }; });

      let remainingTime = deltaTime; const decel = 0.06; const subStepDt = 0.1;

      while (remainingTime > 0) {
        const dt = Math.min(remainingTime, subStepDt); remainingTime -= dt;
        const currentBalls = Object.values(nextBalls) as Ball[];

        const innerLeft = EDGING;
        const innerRight = FIELD_WIDTH - EDGING;
        const innerTop = EDGING;
        const innerBottom = FIELD_HEIGHT - EDGING;
        const outOffset = (0.1 * SCALE) + BALL_RADIUS;

        currentBalls.forEach((ball) => {
          if (isBallDocked(ball) || (ball.vx === 0 && ball.vy === 0)) return;

          const prevX = ball.x; const prevY = ball.y;
          ball.x += ball.vx * dt; ball.y += ball.vy * dt;

          if (checkGatePass(prevX, prevY, ball.x, ball.y)) { playSound(SOUNDS.cheer, 0.4); }

          // --- EXACT INTERSECTION OUT-OF-BOUNDS FIX ---
          // Check if it crossed the threshold in this exact micro-step
          const completelyOutLeft = ball.x + BALL_RADIUS < innerLeft;
          const completelyOutRight = ball.x - BALL_RADIUS > innerRight;
          const completelyOutTop = ball.y + BALL_RADIUS < innerTop;
          const completelyOutBottom = ball.y - BALL_RADIUS > innerBottom;

          const wasOutLeft = prevX + BALL_RADIUS < innerLeft;
          const wasOutRight = prevX - BALL_RADIUS > innerRight;
          const wasOutTop = prevY + BALL_RADIUS < innerTop;
          const wasOutBottom = prevY - BALL_RADIUS > innerBottom;

          // If it just crossed, calculate the exact crossing point and freeze it there
          if (completelyOutLeft && !wasOutLeft) {
            const t = ball.vx ? (innerLeft - BALL_RADIUS - prevX) / ball.vx : 0;
            ball.y = prevY + ball.vy * t; // exact Y intersection
            ball.x = innerLeft - outOffset;
            ball.vx = 0; ball.vy = 0;
            playSound(SOUNDS.miss, 0.3);
          } else if (completelyOutRight && !wasOutRight) {
            const t = ball.vx ? (innerRight + BALL_RADIUS - prevX) / ball.vx : 0;
            ball.y = prevY + ball.vy * t;
            ball.x = innerRight + outOffset;
            ball.vx = 0; ball.vy = 0;
            playSound(SOUNDS.miss, 0.3);
          } else if (completelyOutTop && !wasOutTop) {
            const t = ball.vy ? (innerTop - BALL_RADIUS - prevY) / ball.vy : 0;
            ball.x = prevX + ball.vx * t; // exact X intersection
            ball.y = innerTop - outOffset;
            ball.vx = 0; ball.vy = 0;
            playSound(SOUNDS.miss, 0.3);
          } else if (completelyOutBottom && !wasOutBottom) {
            const t = ball.vy ? (innerBottom + BALL_RADIUS - prevY) / ball.vy : 0;
            ball.x = prevX + ball.vx * t;
            ball.y = innerBottom + outOffset;
            ball.vx = 0; ball.vy = 0;
            playSound(SOUNDS.miss, 0.3);
          }
        });

        currentBalls.forEach(ball => {
          if (isBallDocked(ball)) return;
          const s = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
          if (s > 0) { const ns = Math.max(0, s - decel * dt); ball.vx = (ball.vx / s) * ns; ball.vy = (ball.vy / s) * ns; }
        });

        currentBalls.forEach(ball => {
          if (isBallDocked(ball)) { ball.vx = 0; ball.vy = 0; return; }
          // Outer Canvas Clamps (safety net)
          if (ball.x < ball.radius) { ball.x = ball.radius; ball.vx = 0; ball.vy = 0; }
          if (ball.x > FIELD_WIDTH - ball.radius) { ball.x = FIELD_WIDTH - ball.radius; ball.vx = 0; ball.vy = 0; }
          if (ball.y < ball.radius) { ball.y = ball.radius; ball.vx = 0; ball.vy = 0; }
          if (ball.y > FIELD_HEIGHT - ball.radius) { ball.y = FIELD_HEIGHT - ball.radius; ball.vx = 0; ball.vy = 0; }
        });

        currentBalls.forEach(ball => {
          if (isBallDocked(ball)) return;
          const dxPeg = ball.x - GOAL_POLE_POS.x; const dyPeg = ball.y - GOAL_POLE_POS.y; const distPeg = Math.sqrt(dxPeg * dxPeg + dyPeg * dyPeg); const minPegDist = ball.radius + GOAL_POLE_RADIUS;
          if (distPeg < minPegDist) {
            const nx = dxPeg / distPeg; const ny = dyPeg / distPeg; const velAlongNormal = ball.vx * nx + ball.vy * ny;
            if (velAlongNormal < 0) { const j = -(1 + 0.5) * velAlongNormal; ball.vx += j * nx; ball.vy += j * ny; playSound(SOUNDS.collision, 0.2); }
            ball.x = GOAL_POLE_POS.x + nx * minPegDist; ball.y = GOAL_POLE_POS.y + ny * minPegDist;
          }
          GATES.forEach(gate => {
            const isVertical = gate.id === 2 || gate.id === 3;
            let posts = [];
            if (isVertical) {
              posts = [{ x: gate.x, y: gate.y - GATE_WIDTH / 2 }, { x: gate.x, y: gate.y + GATE_WIDTH / 2 }];
            } else {
              posts = [{ x: gate.x - GATE_WIDTH / 2, y: gate.y }, { x: gate.x + GATE_WIDTH / 2, y: gate.y }];
            }
            posts.forEach(post => {
              const dx = ball.x - post.x; const dy = ball.y - post.y; const dist = Math.sqrt(dx * dx + dy * dy); const minDist = ball.radius + 2;
              if (dist < minDist) {
                const nx = dx / dist; const ny = dy / dist; const velAlongNormal = ball.vx * nx + ball.vy * ny;
                if (velAlongNormal < 0) { const j = -(1 + 0.4) * velAlongNormal; ball.vx += j * nx; ball.vy += j * ny; playSound(SOUNDS.collision, 0.2); }
                ball.x = post.x + nx * minDist; ball.y = post.y + ny * minDist;
              }
            });
          });
        });

        for (let i = 0; i < currentBalls.length; i++) {
          for (let j = i + 1; j < currentBalls.length; j++) {
            const b1 = currentBalls[i]; const b2 = currentBalls[j]; if (isBallDocked(b1) || isBallDocked(b2)) continue;
            const relX = b1.x - b2.x; const relY = b1.y - b2.y; const distSq = relX * relX + relY * relY; const minContactDistSq = (2 * BALL_RADIUS) ** 2;
            if (distSq < minContactDistSq) {
              const dist = Math.sqrt(distSq);
              if (dist > 0) {
                const relVX = b1.vx - b2.vx; const relVY = b1.vy - b2.vy; const dotProduct = relX * relVX + relY * relVY;
                if (dotProduct < 0) {
                  const nx = relX / dist; const ny = relY / dist;
                  const v_dot_n = (b1.vx - b2.vx) * nx + (b1.vy - b2.vy) * ny;

                  const pairStr1 = `${b1.id}-${b2.id}`;
                  const pairStr2 = `${b2.id}-${b1.id}`;
                  let restitution = 0.92;
                  if (touchingPairsRef.current.includes(pairStr1) || touchingPairsRef.current.includes(pairStr2)) {
                    restitution = 0.3333;
                    touchingPairsRef.current = touchingPairsRef.current.filter(p => p !== pairStr1 && p !== pairStr2);
                  }

                  const j_impulse = (-(1 + restitution) * v_dot_n) / 2;
                  b1.vx += j_impulse * nx; b1.vy += j_impulse * ny;
                  b2.vx -= j_impulse * nx; b2.vy -= j_impulse * ny;
                  playSound(SOUNDS.collision, 0.3);
                }
                const overlap = (2 * BALL_RADIUS) - dist;
                const nx_pos = relX / dist; const ny_pos = relY / dist;
                b1.x += nx_pos * overlap / 2; b1.y += ny_pos * overlap / 2;
                b2.x -= nx_pos * overlap / 2; b2.y -= ny_pos * overlap / 2;
              }
            }
          }
        }
      }

      const currentBalls = Object.values(nextBalls) as Ball[];
      currentBalls.forEach(ball => { if (Math.abs(ball.vx) < 0.05 && Math.abs(ball.vy) < 0.05) { ball.vx = 0; ball.vy = 0; } });

      ballsRef.current = nextBalls;

      renderScene(nextBalls);

      // Cleaned up End-of-Shot block (snapping is now handled perfectly above)
      if (frameCount > 5 && currentBalls.every(b => b.vx === 0 && b.vy === 0)) {
        setIsPlaying(false);
        setBalls({ ...nextBalls });
        return;
      }

      animationRef.current = requestAnimationFrame(loop);
    };

    animationRef.current = requestAnimationFrame(loop);
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [isPlaying, ballSet]);;

  useEffect(() => {
    renderScene(balls);
  }, [balls, angle, isPlaying, draggingItem, ghostBallEnabled, cleanFeed, activeBallId, placementMode, targetSpot, hoverPos, zoom, drawings, currentPath, ballSet, brightMode]);

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
        * { font-family: 'Inter', sans-serif !important; }
        
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(16, 185, 129, 0.2); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(16, 185, 129, 0.5); }
      `}} />
      <div className="h-screen w-screen bg-zinc-900 flex flex-row-reverse overflow-hidden relative selection:bg-emerald-500/30 text-zinc-100 select-none" style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}>

        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat z-0 transition-all duration-500"
          style={{
            backgroundImage: 'url("https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=2560&auto=format&fit=crop")',
            filter: brightMode ? 'brightness(1.5)' : 'brightness(0.7)'
          }}
        />

        <AnimatePresence>
          {showMobilePrompt && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[500] bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
              <h2 className="text-2xl font-bold text-emerald-400 mb-4">Mobile Device Detected</h2>
              <p className="text-sm text-zinc-300 mb-8 max-w-xs">For the best experience, this app runs in Fullscreen Landscape mode.</p>
              <button
                onClick={() => { toggleFullscreen(); setShowMobilePrompt(false); }}
                className="px-8 py-4 bg-emerald-500 text-zinc-950 font-bold rounded-full uppercase tracking-widest shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-transform active:scale-95"
              >
                Enter Studio
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {!cleanFeed && (
          <aside className={`relative z-10 w-[240px] md:w-[320px] lg:w-[360px] h-full flex flex-col shrink-0 backdrop-blur-xl border-l p-3 md:p-5 overflow-y-auto custom-scrollbar shadow-[-8px_0_30px_rgba(0,0,0,0.5)] transition-colors duration-300 ${brightMode ? 'bg-[#666666]/95 border-[#888888]' : 'bg-zinc-900/90 border-zinc-700/50'}`}>
            <div className="shrink-0 flex items-center gap-2 md:gap-3 mb-4">
              <div className="relative flex items-center justify-center w-6 h-6 md:w-8 md:h-8"><div className="absolute top-[4px] left-[4px] md:top-[6px] md:left-[6px] w-3 h-3 md:w-4 md:h-4 rounded-full bg-[radial-gradient(circle_at_30%_30%,#60a5fa,#1e3a8a)] shadow-inner z-0" /><Search className="text-emerald-500 relative z-10 drop-shadow-md w-5 h-5 md:w-8 md:h-8" /></div>
              <div>
                <p className="text-[10px] md:text-xs text-emerald-500 -mb-1 ml-0.5" style={{ fontFamily: '"Brush Script MT", cursive' }}>Murray Tinker's</p>
                <h1 className="text-lg md:text-xl font-bold tracking-tight text-zinc-100 leading-tight">Gateball<br className="md:hidden" /> Visualiser</h1>
                <p className="hidden md:block text-[9px] uppercase tracking-widest mt-0.5 font-bold text-zinc-400">Version 0.63 (BETA)</p>
              </div>
            </div>

            <div className="shrink-0 grid grid-cols-4 gap-1.5 md:gap-2 mb-3 md:mb-4 pb-3 md:pb-4 border-b border-zinc-800/50">
              <ToolButton
                icon={<Eye size={14} className="md:w-[18px] md:h-[18px]" />}
                active={!placementMode && !drawMode && !sparkMode}
                label="AIM"
                title="Use the Velocity and Aim wheels to direct your shot"
                onClick={() => { setPlacementMode(false); setGhostBallEnabled(true); setTargetSpot(null); setDrawMode(false); }}
              />
              <ToolButton
                icon={<MousePointer2 size={14} className="md:w-[18px] md:h-[18px]" />}
                active={placementMode && !drawMode && !sparkMode}
                label="PLACE"
                title="Click on a ball to highlight and click the crosshair on red spot"
                onClick={() => { setPlacementMode(true); setGhostBallEnabled(false); setTargetSpot(null); setDrawMode(false); }}
              />
              <ToolButton
                icon={<Pencil size={14} className="md:w-[18px] md:h-[18px]" />}
                active={drawMode}
                label="DRAW"
                title="Draw tactical lines on the court"
                onClick={() => {
                  const newMode = !drawMode;
                  setDrawMode(newMode);
                  setGhostBallEnabled(true); // FIX: Ensures the aiming line is restored
                  if (newMode) {
                    setPlacementMode(false);
                    setTargetSpot(null);
                  }
                }}
              />
              <ToolButton
                icon={isFullscreen ? <Minimize2 size={14} className="md:w-[18px] md:h-[18px]" /> : <Maximize2 size={14} className="md:w-[18px] md:h-[18px]" />}
                label={isFullscreen ? "REDUCE" : "EXPAND"}
                title="Toggle Fullscreen"
                onClick={toggleFullscreen}
              />
            </div>

            <div className={`shrink-0 relative flex flex-col gap-3 md:gap-4 mb-3 md:mb-4 pb-3 md:pb-4 border-b border-zinc-800/50 transition-opacity min-h-[80px] ${!activeBallId ? 'opacity-30 pointer-events-none' : ''}`}>
              {!placementMode ? (
                <SphericalController angle={angle} setAngle={setAngle} speed={speed} setSpeed={setSpeed} isPlaying={isPlaying} />
              ) : placementMode ? (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl border p-4 text-center bg-zinc-950/80 border-emerald-500/30 shadow-[inset_0_0_20px_rgba(16,185,129,0.1)] z-10">
                  <p className="text-[10px] md:text-xs font-bold uppercase tracking-widest leading-relaxed text-emerald-400">
                    Select the Striker's Ball<br />
                    <span className="text-[8px] md:text-[9px] mt-1.5 block font-bold text-zinc-400">Then click your location on the court</span>
                  </p>
                </div>
              ) : null}
            </div>

            <div className="shrink-0 flex flex-row items-center justify-between px-1 mb-3 md:mb-4 pb-3 md:pb-4 border-b border-zinc-800/50">
              <button onClick={handleUndo} disabled={history.length === 0 || isPlaying || isReplaying} className="p-2 md:p-2.5 rounded-full transition-all border shadow-sm disabled:opacity-30 disabled:cursor-not-allowed bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 border-zinc-800" title="Undo your last ball action"><Undo2 size={16} className="md:w-[18px] md:h-[18px]" /></button>

              {(() => {
                const activeBallIdSafe = activeBallId || null;
                const activeBall = activeBallIdSafe ? balls[activeBallIdSafe] : null;
                let outerRing = ""; let innerRing = "";
                const isDocked = activeBall ? isBallDocked(activeBall) : true;
                if (isPlaying || isReplaying || !activeBallId || isDocked) {
                  outerRing = 'bg-gradient-to-b from-zinc-800/80 to-zinc-950/80 cursor-not-allowed shadow-[0_8px_20px_rgba(0,0,0,0.6)]';
                  innerRing = 'bg-gradient-to-b from-zinc-800/80 to-zinc-900/80 shadow-[inset_0_2px_4px_rgba(255,255,255,0.05),inset_0_-4px_8px_rgba(0,0,0,0.4)] text-zinc-500';
                } else {
                  outerRing = 'bg-gradient-to-b from-zinc-400 to-zinc-600 active:translate-y-1 cursor-pointer shadow-[0_8px_20px_rgba(0,0,0,0.6),inset_0_2px_2px_rgba(255,255,255,0.1)]';
                  innerRing = 'bg-gradient-to-b from-zinc-100 to-zinc-300 shadow-[inset_0_2px_6px_rgba(255,255,255,0.8),inset_0_-6px_12px_rgba(0,0,0,0.2),0_0_10px_rgba(255,255,255,0.1)] hover:from-white hover:to-zinc-200 text-zinc-950';
                }

                return (
                  <button onClick={playShot} disabled={isPlaying || isReplaying || !activeBallId || isDocked || (sparkMode && !sparkTargetId)} className={`relative group w-[110px] md:w-[136px] h-10 md:h-14 rounded-full p-1 transition-all select-none ${outerRing}`} title="Click to play shot">
                    <div className={`w-full h-full rounded-full flex items-center justify-center transition-all ${innerRing}`}>
                      <span
                        // Reduced from 14px/19px to 12px/16px
                        className="text-[12px] md:text-[16px] font-black leading-none drop-shadow-sm whitespace-nowrap"
                        style={{
                          fontFamily: '"Arial Narrow", "Arial", sans-serif',
                          fontStretch: 'condensed',
                          letterSpacing: '-0.01em'
                        }}
                      >
                        {sparkMode ? 'PLAY SPARK' : 'PLAY STROKE'}
                      </span>
                    </div>
                  </button>
                );
              })()}

              <button onClick={resetPositions} disabled={isPlaying || isReplaying} className="p-2 md:p-2.5 rounded-full transition-all border shadow-sm disabled:opacity-30 disabled:cursor-not-allowed bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 border-zinc-800" title="Reset Everything"><RotateCcw size={16} className="md:w-[18px] md:h-[18px]" /></button>
            </div>

            <div className="shrink-0 flex justify-center gap-2 md:gap-4 mb-4 pb-4 border-b border-zinc-800/50">
              <button onClick={() => setShowOptions(true)} className="flex items-center gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-full transition-all border shadow-sm bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 border-zinc-800" title="Studio Preferences">
                <Settings size={14} />
                <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-widest">Prefs</span>
              </button>

              <button onClick={() => setShowHelp(true)} className="flex items-center gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-full transition-all border shadow-sm bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 border-zinc-800" title="Open Help Guide">
                <HelpCircle size={14} />
                <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-widest">HELP</span>
              </button>
            </div>

            {features.zoom && (
              <div className="shrink-0 flex items-center justify-between p-2 rounded-xl border mb-4 shadow-sm bg-zinc-950/60 border-zinc-800/50">
                <span className="text-[10px] font-bold uppercase tracking-widest px-2 text-zinc-400">Zoom</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => { const idx = ZOOM_LEVELS.indexOf(zoom); if (idx > 0) handleZoomChange(ZOOM_LEVELS[idx - 1]); }} className="p-1.5 rounded border transition-colors shadow-sm text-zinc-300 hover:text-emerald-400 bg-zinc-900 border-zinc-800"><ZoomOut size={14} /></button>
                  <span className="text-[10px] font-mono font-bold w-12 text-center px-2 py-1 rounded border shadow-sm text-emerald-400 bg-zinc-950 border-zinc-800">{Math.round(zoom * 100)}%</span>
                  <button onClick={() => { const idx = ZOOM_LEVELS.indexOf(zoom); if (idx < ZOOM_LEVELS.length - 1) handleZoomChange(ZOOM_LEVELS[idx + 1]); }} className="p-1.5 rounded border transition-colors shadow-sm text-zinc-300 hover:text-emerald-400 bg-zinc-900 border-zinc-800"><ZoomIn size={14} /></button>
                </div>
              </div>
            )}

            {features.recording && (
              <div className="shrink-0 flex flex-col gap-2 mb-4 pb-4 border-b border-zinc-800/50">
                <div className="flex items-center justify-between">
                  <h3 className="text-[9px] font-bold uppercase tracking-[0.1em] flex items-center gap-1.5 text-zinc-300"><Clapperboard size={12} className="text-emerald-500" /> Seq Record</h3>
                  <div className="flex gap-1">
                    <button onClick={handleCaptureFrame} disabled={isReplaying} className="px-1.5 py-1 rounded text-[8px] font-bold uppercase transition-all border flex items-center gap-1 shadow-sm bg-zinc-900/60 border-zinc-700/50 text-zinc-200 hover:bg-zinc-800/80 disabled:opacity-50"><Camera size={10} className="text-zinc-400" /> Frame</button>
                    <button onClick={() => setIsRecording(!isRecording)} disabled={isReplaying} className={`px-1.5 py-1 rounded text-[8px] font-bold uppercase transition-all border flex items-center gap-1 shadow-sm disabled:opacity-50 ${isRecording ? 'bg-red-900/50 text-red-400 border-red-500/50 animate-pulse' : 'bg-zinc-900/60 border-zinc-700/50 text-zinc-200 hover:bg-zinc-800/80'}`}><div className={`w-1.5 h-1.5 rounded-full shadow-inner border border-black/10 ${isRecording ? 'bg-red-500' : 'bg-zinc-500'}`} /> {isRecording ? 'Rec' : 'Rec'}</button>
                  </div>
                </div>
                {sequence.length === 0 ? (<div className="text-[9px] italic text-center py-2 rounded border border-dashed text-zinc-500 bg-zinc-900/40 border-zinc-800">No frames captured</div>) : (
                  <div className="flex flex-col gap-1.5 p-2 rounded-lg border shadow-sm bg-zinc-900/40 border-zinc-700/50">
                    <div className="flex items-center gap-1">
                      <div className="flex items-center justify-between rounded border shadow-sm flex-1 px-1 bg-zinc-950/60 border-zinc-800">
                        <button onClick={() => goToFrame(currentShotIndex - 1)} disabled={currentShotIndex <= 0 || isPlaying || isReplaying} className="p-1 disabled:opacity-30 text-zinc-300 hover:text-emerald-400"><ChevronLeft size={12} /></button>
                        <span className="text-[9px] font-bold uppercase tracking-wider font-mono text-emerald-400">Fr {currentShotIndex + 1}/{sequence.length}</span>
                        <button onClick={() => goToFrame(currentShotIndex + 1)} disabled={currentShotIndex >= sequence.length - 1 || isPlaying || isReplaying} className="p-1 disabled:opacity-30 text-zinc-300 hover:text-emerald-400"><ChevronRight size={12} /></button>
                      </div>
                      <button onClick={clearSequence} disabled={isPlaying || isReplaying} className="p-1.5 disabled:opacity-50 rounded border shadow-sm transition-colors bg-zinc-900/60 hover:bg-red-900/40 text-red-400 border-zinc-700/50"><Trash2 size={12} /></button>
                    </div>
                    <div className="flex gap-1 mt-1">
                      <button onClick={isReplaying ? stopSequenceReplay : startSequenceReplay} disabled={sequence.length < 2 || isPlaying} className={`flex-1 flex items-center justify-center gap-1 text-[8px] py-1.5 rounded font-bold uppercase tracking-wider border shadow-sm transition-colors ${isReplaying ? 'bg-amber-900/40 text-amber-400 border-amber-500/50' : 'bg-emerald-900/40 text-emerald-400 border-emerald-500/50 hover:bg-emerald-800/60'} disabled:opacity-50`}>{isReplaying ? <><MonitorPlay size={10} /> Stop</> : <><Play size={10} /> Auto Play</>}</button>
                      <select value={replayDelay} onChange={(e) => setReplayDelay(Number(e.target.value))} disabled={isReplaying} className="w-[45px] text-[9px] font-bold text-center rounded border shadow-sm bg-zinc-950/60 text-emerald-400 border-zinc-800 outline-none cursor-pointer disabled:opacity-50"><option value={1}>1s</option><option value={2}>2s</option><option value={3}>3s</option></select>
                    </div>
                    <div className="flex gap-1 pt-1 border-t border-zinc-800/50">
                      <button onClick={exportSequence} disabled={isPlaying || isReplaying} className="flex-1 flex items-center justify-center gap-1 disabled:opacity-50 text-[8px] py-1 rounded font-bold uppercase tracking-wider border shadow-sm transition-colors bg-zinc-900/60 hover:bg-zinc-800/80 text-zinc-200 border-zinc-700/50"><Save size={10} className="text-emerald-600" /> Export</button>
                      <label className={`flex-1 flex items-center justify-center gap-1 text-[8px] py-1 rounded font-bold uppercase tracking-wider border shadow-sm transition-colors ${isPlaying || isReplaying ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} bg-zinc-900/60 hover:bg-zinc-800/80 text-zinc-200 border-zinc-700/50`}>
                        <FolderUp size={10} className="text-emerald-600" /> Import
                        <input type="file" accept=".json" onChange={importSequence} disabled={isPlaying || isReplaying} className="hidden" />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}

          </aside>
        )}

        <main className="relative z-10 flex-1 h-full overflow-hidden bg-black/20" ref={viewportRef}>

          <AnimatePresence>
            {drawMode && !cleanFeed && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                // Slim design: absolute positioning, lower height, and zinc-900/80 background
                className="absolute top-1 md:top-2 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 p-1 px-3 rounded-lg border border-emerald-500/50 backdrop-blur-md bg-zinc-900/80 shadow-lg"
              >
                {/* Visual Indicator */}
                <div className="flex items-center gap-2 text-emerald-400 border-r border-zinc-700/50 pr-2">
                  <Pencil size={14} className="animate-pulse" />
                </div>

                {/* Tool Selection */}
                <div className="flex bg-zinc-950/50 rounded-md p-0.5 border border-zinc-800">
                  <button onClick={() => setDrawStyle('freehand')} className={`p-1 rounded ${drawStyle === 'freehand' ? 'bg-emerald-500 text-zinc-950' : 'text-zinc-500'}`}><Pencil size={13} /></button>
                  <button onClick={() => setDrawStyle('straight')} className={`p-1 rounded ${drawStyle === 'straight' ? 'bg-emerald-500 text-zinc-950' : 'text-zinc-500'}`}><Minus size={13} /></button>
                </div>

                {/* Color Swatches (Compact) */}
                <div className="flex gap-1.5 px-1">
                  {['#ef4444', '#ffffff', '#eab308'].map((c) => (
                    <button key={c} onClick={() => setDrawColor(c)} className={`w-3.5 h-3.5 rounded-full border ${drawColor === c ? 'border-white scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                  ))}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-1 border-l border-zinc-700/50 pl-2">
                  <button onClick={() => setDrawings(p => p.slice(0, -1))} className="p-1 text-zinc-400 hover:text-white"><Undo2 size={13} /></button>
                  <button onClick={() => setDrawings([])} className="p-1 text-rose-400 hover:text-rose-300"><Eraser size={13} /></button>
                  <button onClick={() => setDrawMode(false)} className="p-1 text-zinc-500 hover:text-zinc-300"><X size={14} /></button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className={zoom === 1 ? "absolute inset-0 flex items-center justify-center min-w-0 min-h-0" : "min-w-max min-h-max p-12 flex items-center justify-center overflow-auto"}>
            <div style={getCanvasStyle()} className={`shadow-[0_0_40px_rgba(0,0,0,0.5)] bg-transparent pointer-events-auto border ${cleanFeed ? 'border-transparent' : 'border-zinc-800/80'} rounded-lg ${draggingItem === 'pan' ? 'cursor-grabbing' : (!isPlaying && !cleanFeed ? (drawMode ? 'cursor-crosshair' : (placementMode ? 'cursor-crosshair' : 'cursor-grab')) : 'cursor-default')} touch-none`}>
              <div className={zoom === 1 ? "absolute inset-0" : "w-full h-full relative"}>
                <canvas ref={canvasRef} width={FIELD_WIDTH} height={FIELD_HEIGHT} style={{ display: 'block', width: '100%', height: '100%' }} className="rounded-lg" onMouseDown={handleStart} onMouseMove={handleMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseLeave} onTouchStart={handleStart} onTouchMove={handleMove} onTouchEnd={handleMouseUp} />
                {showInstruction && !cleanFeed && allBallsDocked && zoom === 1 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute z-[100] pointer-events-none" style={{ left: `${((EDGING + 17 * SCALE - SPACING) / FIELD_WIDTH) * 100}%`, bottom: '12%', transform: 'translate(-50%, 0)' }}>
                    <div className="relative w-max px-3 py-2 rounded-xl border shadow-2xl uppercase tracking-widest text-[8px] font-bold text-center leading-snug whitespace-nowrap bg-zinc-950 text-emerald-400 border-zinc-800">
                      Drag Ball(s)<br />onto Court to Begin
                      <div className="absolute -bottom-[6px] left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 border-b border-r bg-zinc-950 border-zinc-800"></div>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </main>

        {cleanFeed && (
          <div className="absolute bottom-4 right-4 z-[200] flex gap-2 pointer-events-auto">
            <button onClick={() => { const url = canvasRef.current?.toDataURL('image/png'); if (url) { const a = document.createElement('a'); a.href = url; const d = new Date(); a.download = `gateball_capture_${d.getFullYear()}${(d.getMonth() + 1).toString().padStart(2, '0')}${d.getDate().toString().padStart(2, '0')}_${d.getHours().toString().padStart(2, '0')}${d.getMinutes().toString().padStart(2, '0')}.png`; a.click(); } }} className="bg-emerald-600/90 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-emerald-500 transition-all shadow-lg flex items-center gap-2"><Camera size={14} /> Capture Screen</button>
            <button onClick={() => setCleanFeed(false)} className="px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all shadow-lg backdrop-blur-md bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border-zinc-700">Exit Freeze Frame</button>
          </div>
        )}

        <AnimatePresence>
          {showHelp && !cleanFeed && <HelpScreen onClose={() => setShowHelp(false)} />}
        </AnimatePresence>

        <AnimatePresence>
          {showOptions && !cleanFeed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[150] backdrop-blur-md flex items-center justify-center p-4 bg-zinc-950/90">
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-2xl w-full max-w-md shadow-2xl border backdrop-blur-xl bg-zinc-900 border-zinc-800">
                <div className="p-6 border-b flex items-center justify-between sticky top-0 z-10 rounded-t-2xl bg-zinc-900 border-zinc-800">
                  <h2 className="text-xl font-bold flex items-center gap-2 text-emerald-400"><Settings size={24} />Studio Options</h2>
                  <button onClick={() => setShowOptions(false)} className="p-2 rounded-full transition-colors hover:bg-zinc-800 text-zinc-400 hover:text-white"><X size={20} /></button>
                </div>
                <div className="p-6 space-y-3">
                  <div className="flex items-center justify-between p-4 rounded-xl border shadow-sm bg-zinc-950 border-zinc-800">
                    <div className="flex items-center gap-3 font-bold text-sm uppercase tracking-wider text-zinc-300"><Sun size={16} /> {brightMode ? 'Normal Mode' : 'Bright Mode'}</div>
                    <button onClick={() => setBrightMode(!brightMode)} className={`w-12 h-6 rounded-full relative transition-colors shadow-inner border ${brightMode ? 'bg-emerald-500 border-emerald-600' : 'bg-zinc-700 border-zinc-900'}`}><div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-md ${brightMode ? 'left-7' : 'left-1'}`} /></button>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-xl border shadow-sm bg-zinc-950 border-zinc-800">
                    <div className="flex items-center gap-3 font-bold text-sm uppercase tracking-wider text-zinc-300"><Save size={16} /> File Prefix</div>
                    <input type="text" value={filenamePrefix} onChange={(e) => setFilenamePrefix(e.target.value)} className="text-xs font-bold px-3 py-1.5 rounded outline-none focus:ring-1 focus:ring-emerald-500 w-32 text-right select-auto border shadow-inner bg-zinc-900 border-zinc-700 text-zinc-300" style={{ WebkitTouchCallout: 'default', WebkitUserSelect: 'auto', userSelect: 'auto' }} placeholder="sequence" />
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-xl border shadow-sm bg-zinc-950 border-zinc-800">
                    <div className="flex items-center gap-3 font-bold text-sm uppercase tracking-wider text-zinc-300"><MonitorPlay size={16} /> Freeze Frame Mode</div>
                    <button onClick={() => { setCleanFeed(true); setShowOptions(false); }} className="px-4 py-1.5 rounded text-[11px] font-bold uppercase tracking-widest border transition-colors shadow-sm bg-emerald-900/40 text-emerald-400 border-emerald-500/50 hover:bg-emerald-800/60">Activate</button>
                  </div>
                  {[{ key: 'recording', label: 'Sequence Record', icon: <Clapperboard size={16} /> }, { key: 'zoom', label: 'Pan & Zoom Controls', icon: <ZoomIn size={16} /> }].map(f => (
                    <div key={f.key} className="flex items-center justify-between p-4 rounded-xl border shadow-sm bg-zinc-950 border-zinc-800">
                      <div className="flex items-center gap-3 font-bold text-sm uppercase tracking-wider text-zinc-300">{f.icon} {f.label}</div>
                      <button onClick={() => { setFeatures(prev => { const newState = !prev[f.key as keyof typeof features]; if (f.key === 'zoom' && !newState) { setZoom(1); setTimeout(() => { if (viewportRef.current) { viewportRef.current.scrollLeft = (viewportRef.current.scrollWidth - viewportRef.current.clientWidth) / 2; viewportRef.current.scrollTop = viewportRef.current.scrollHeight; } }, 10); } return { ...prev, [f.key]: newState }; }); }} className={`w-12 h-6 rounded-full relative transition-colors shadow-inner border ${features[f.key as keyof typeof features] ? 'bg-emerald-500 border-emerald-700' : 'bg-zinc-700 border-zinc-900'}`}><div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-md ${features[f.key as keyof typeof features] ? 'left-7' : 'left-1'}`} /></button>
                    </div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
