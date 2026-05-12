import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface SphericalControllerProps {
  angle: number;
  setAngle: (val: number | ((prev: number) => number)) => void;
  speed: number;
  setSpeed: (val: number | ((prev: number) => number)) => void;
  isPlaying: boolean;
  isCroquetShot: boolean;
  contactAngle: number;
  setContactAngle: (val: number) => void;
}

export const SphericalController = ({
  angle, setAngle, speed, setSpeed, isPlaying,
  isCroquetShot, contactAngle, setContactAngle
}: SphericalControllerProps) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const isDraggingDial = useRef(false);
  const isDraggingAim = useRef(false);
  const previousMousePosition = useRef({ x: 0, y: 0 });
  const sphereRef = useRef<THREE.Mesh | null>(null);
  const angleRef = useRef(angle);
  const speedRef = useRef(speed);

  useEffect(() => {
    angleRef.current = angle;
  }, [angle]);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  // --- 1. Interaction Logic ---
  const handleAimPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isPlaying) return;
    e.preventDefault();
    isDraggingAim.current = true;
    previousMousePosition.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleAimPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingAim.current || isPlaying) return;
    const deltaX = e.clientX - previousMousePosition.current.x;
    const deltaY = e.clientY - previousMousePosition.current.y;
    setAngle(prev => (prev + deltaX * 0.5 + 360) % 360);
    setSpeed(prev => Math.max(0, Math.min(200, prev - deltaY * 0.5)));
    previousMousePosition.current = { x: e.clientX, y: e.clientY };
  };

  const handleAimPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingAim.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (err) {}
  };

  const handleDialPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isPlaying) return;
    e.stopPropagation();
    e.preventDefault();
    isDraggingDial.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleDialPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingDial.current || isPlaying) return;
    const rect = mountRef.current?.getBoundingClientRect();
    if (!rect) return;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;
    let newAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (newAngle < 0) newAngle += 360;
    setContactAngle(newAngle);
  };

  const handleDialPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingDial.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (err) {}
  };

  // --- 2. 3D Scene Setup (Matte Milled Texture) ---
  useEffect(() => {
    if (!mountRef.current) return;
    mountRef.current.innerHTML = '';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 4.5;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(160, 160);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);

    // Create color map (Vibrant Red with darker grooves)
    const cCanvas = document.createElement('canvas');
    cCanvas.width = 64; cCanvas.height = 64;
    const cCtx = cCanvas.getContext('2d')!;
    cCtx.fillStyle = '#dc2626'; 
    cCtx.fillRect(0, 0, 64, 64);
    cCtx.strokeStyle = '#991b1b'; 
    cCtx.lineWidth = 8;
    cCtx.strokeRect(0, 0, 64, 64);

    const colorTexture = new THREE.CanvasTexture(cCanvas);
    colorTexture.colorSpace = THREE.SRGBColorSpace;
    colorTexture.wrapS = THREE.RepeatWrapping;
    colorTexture.wrapT = THREE.RepeatWrapping;
    colorTexture.repeat.set(120, 60);
    colorTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    // Create bump map (White high, Black low)
    const bCanvas = document.createElement('canvas');
    bCanvas.width = 64; bCanvas.height = 64;
    const bCtx = bCanvas.getContext('2d')!;
    bCtx.fillStyle = '#ffffff'; 
    bCtx.fillRect(0, 0, 64, 64);
    bCtx.strokeStyle = '#000000'; 
    bCtx.lineWidth = 8;
    bCtx.strokeRect(0, 0, 64, 64);

    const bumpTexture = new THREE.CanvasTexture(bCanvas);
    bumpTexture.wrapS = THREE.RepeatWrapping;
    bumpTexture.wrapT = THREE.RepeatWrapping;
    bumpTexture.repeat.set(120, 60);
    bumpTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const geometry = new THREE.SphereGeometry(1.5, 64, 64);
    const material = new THREE.MeshStandardMaterial({ 
      map: colorTexture,
      bumpMap: bumpTexture,
      bumpScale: 0.25,
      roughness: 0.3, // Glossy finish
      metalness: 0.1 
    });
    
    const sphere = new THREE.Mesh(geometry, material);
    sphereRef.current = sphere;
    scene.add(sphere);

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const l1 = new THREE.DirectionalLight(0xffffff, 0.8);
    l1.position.set(5, 5, 5);
    scene.add(l1);
    const l2 = new THREE.DirectionalLight(0xffffff, 0.3);
    l2.position.set(-5, 5, -5);
    scene.add(l2);

    let animId: number;
    const animate = () => {
      if (sphereRef.current) {
        sphereRef.current.rotation.y = (angleRef.current * Math.PI) / 180;
        sphereRef.current.rotation.x = -(speedRef.current * Math.PI) / 180;
      }
      renderer.render(scene, camera);
      animId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      renderer.dispose();
      colorTexture.dispose();
      bumpTexture.dispose();
      geometry.dispose();
      material.dispose();
    };
  }, []);

  return (
    <div className="flex flex-col items-center w-full relative">
      
      {/* Readout Display with Controls */}
      <div className={`flex w-full ${isCroquetShot ? 'justify-between' : 'justify-around'} px-1 mb-2`}>
        <div className="flex flex-col items-center gap-1">
          <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400">Velocity</span>
          <div className="flex items-center gap-0.5">
            <button onMouseDown={(e) => { e.stopPropagation(); setSpeed(prev => Math.max(0, prev - 1)); }} className="rounded cursor-pointer p-0.5 border shadow-sm transition-colors text-zinc-500 hover:text-emerald-400 bg-zinc-900 border-zinc-800"><ChevronLeft size={10} /></button>
            <span className="font-mono text-[10px] font-bold px-1 py-0.5 rounded border shadow-sm w-[46px] text-center text-white bg-zinc-950/80 border-zinc-700">{speed.toFixed(0)}%</span>
            <button onMouseDown={(e) => { e.stopPropagation(); setSpeed(prev => Math.min(200, prev + 1)); }} className="rounded cursor-pointer p-0.5 border shadow-sm transition-colors text-zinc-500 hover:text-emerald-400 bg-zinc-900 border-zinc-800"><ChevronRight size={10} /></button>
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400">Bearing</span>
          <div className="flex items-center gap-0.5">
            <button onMouseDown={(e) => { e.stopPropagation(); setAngle(prev => (prev - 1 + 360) % 360); }} className="rounded cursor-pointer p-0.5 border shadow-sm transition-colors text-zinc-500 hover:text-emerald-400 bg-zinc-900 border-zinc-800"><ChevronLeft size={10} /></button>
            <span className="font-mono text-[10px] font-bold px-1 py-0.5 rounded border shadow-sm w-[46px] text-center text-white bg-zinc-950/80 border-zinc-700">{angle.toFixed(1)}°</span>
            <button onMouseDown={(e) => { e.stopPropagation(); setAngle(prev => (prev + 1) % 360); }} className="rounded cursor-pointer p-0.5 border shadow-sm transition-colors text-zinc-500 hover:text-emerald-400 bg-zinc-900 border-zinc-800"><ChevronRight size={10} /></button>
          </div>
        </div>
        {isCroquetShot && (
          <div className="flex flex-col items-center gap-1">
            <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400">Contact</span>
            <div className="flex items-center gap-0.5">
              <button onMouseDown={(e) => { e.stopPropagation(); setContactAngle((contactAngle - 1 + 360) % 360); }} className="rounded cursor-pointer p-0.5 border shadow-sm transition-colors text-zinc-500 hover:text-emerald-400 bg-zinc-900 border-zinc-800"><ChevronLeft size={10} /></button>
              <span className="font-mono text-[10px] font-bold px-1 py-0.5 rounded border shadow-sm w-[46px] text-center text-white bg-zinc-950/80 border-zinc-700">{Math.round(contactAngle)}°</span>
              <button onMouseDown={(e) => { e.stopPropagation(); setContactAngle((contactAngle + 1) % 360); }} className="rounded cursor-pointer p-0.5 border shadow-sm transition-colors text-zinc-500 hover:text-emerald-400 bg-zinc-900 border-zinc-800"><ChevronRight size={10} /></button>
            </div>
          </div>
        )}
      </div>

      <div className="relative w-[220px] h-[220px] flex items-center justify-center">
        
        {/* 3D Ball: Bottom Layer (Always reachable for Aiming/Velocity) */}
        <div
          ref={mountRef}
          onPointerDown={handleAimPointerDown}
          onPointerMove={handleAimPointerMove}
          onPointerUp={handleAimPointerUp}
          onPointerCancel={handleAimPointerUp}
          className={`rounded-full overflow-hidden shadow-2xl transition-opacity z-10 ${isPlaying ? 'opacity-50' : 'cursor-grab active:cursor-grabbing'}`}
          style={{ width: 160, height: 160, touchAction: 'none' }}
        />

        {/* Satellite Layer: Top Layer (Does not block the ball) */}
        {/* pointer-events-none ensures clicks pass through to the 3D ball */}
        <div className="absolute inset-0 pointer-events-none z-20">
          {isCroquetShot && (
            <div
              onPointerDown={handleDialPointerDown}
              onPointerMove={handleDialPointerMove}
              onPointerUp={handleDialPointerUp}
              onPointerCancel={handleDialPointerUp}
              className="absolute w-7 h-7 bg-emerald-400 rounded-full shadow-[0_0_15px_#10b981] border-2 border-white/40 cursor-pointer pointer-events-auto"
              style={{
                touchAction: 'none',
                left: `calc(50% + ${Math.cos(contactAngle * Math.PI / 180) * 94}px - 14px)`,
                top: `calc(50% + ${Math.sin(contactAngle * Math.PI / 180) * 94}px - 14px)`
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};