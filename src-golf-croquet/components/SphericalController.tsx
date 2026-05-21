// File: src/components/SphericalController.tsx

import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface SphericalControllerProps {
  angle: number;
  setAngle: (val: number | ((prev: number) => number)) => void;
  speed: number;
  setSpeed: (val: number | ((prev: number) => number)) => void;
  isPlaying: boolean;
}

export const SphericalController = ({ angle, setAngle, speed, setSpeed, isPlaying }: SphericalControllerProps) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const previousMousePosition = useRef({ x: 0, y: 0 });
  const sphereRef = useRef<THREE.Mesh | null>(null);

  const valuesRef = useRef({ angle, speed });
  useEffect(() => { valuesRef.current = { angle, speed }; }, [angle, speed]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;
    container.innerHTML = '';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 4.5;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(160, 160);
    container.appendChild(renderer.domElement);

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const geometry = new THREE.SphereGeometry(1.5, 64, 64);

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
      map: texture,
      bumpMap: texture,
      bumpScale: 4.40,
      roughness: 0.35,
      metalness: 0.1
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
      renderer.dispose();
      texture.dispose();
      geometry.dispose();
      material.dispose();
      if (container) {
        container.innerHTML = '';
      }
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isPlaying) return;
    e.preventDefault();
    isDragging.current = true;
    previousMousePosition.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current || isPlaying) return;
    const deltaMove = {
      x: e.clientX - previousMousePosition.current.x,
      y: e.clientY - previousMousePosition.current.y
    };

    if (sphereRef.current) {
      const deltaRotationQuaternion = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(deltaMove.y * 0.01, deltaMove.x * 0.01, 0, 'XYZ')
      );
      sphereRef.current.quaternion.multiplyQuaternions(deltaRotationQuaternion, sphereRef.current.quaternion);
    }

    let dynamicMultiplier = 1.0;
    const domRect = e.currentTarget.getBoundingClientRect();
    const centerX = domRect.left + domRect.width / 2;
    const centerY = domRect.top + domRect.height / 2;
    const startDist = Math.sqrt((previousMousePosition.current.x - centerX) ** 2 + (previousMousePosition.current.y - centerY) ** 2);
    const normalizedDist = Math.min(1, startDist / 80); // 80 is radius of 160x160 box
    dynamicMultiplier = 0.1 + 0.9 * normalizedDist;

    let newAngle = valuesRef.current.angle + deltaMove.x * dynamicMultiplier;
    newAngle = ((newAngle % 360) + 360) % 360;
    let newSpeed = valuesRef.current.speed - deltaMove.y * dynamicMultiplier;
    newSpeed = Math.max(0, Math.min(200, newSpeed));

    setAngle(newAngle);
    setSpeed(newSpeed);
    previousMousePosition.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture was already released
    }
  };

  return (
    <div className="flex flex-col items-center w-full gap-2 relative p-2">
      <div className="flex justify-between w-full text-[10px] font-bold uppercase tracking-widest text-zinc-400 px-1">
        <span className="flex flex-col items-start text-emerald-400">Velocity 
          <span className="text-white text-xs flex items-center mt-0.5 select-none relative -left-1">
            <button onClick={() => setSpeed((s: number) => Math.max(1, s - 1))} className="hover:text-emerald-400 disabled:opacity-50 transition-colors p-1" disabled={isPlaying}><ChevronLeft size={12} strokeWidth={3} /></button>
            <span className="w-8 text-center">{speed.toFixed(0)}%</span>
            <button onClick={() => setSpeed((s: number) => Math.min(200, s + 1))} className="hover:text-emerald-400 disabled:opacity-50 transition-colors p-1" disabled={isPlaying}><ChevronRight size={12} strokeWidth={3} /></button>
          </span>
        </span>
        <span className="flex flex-col items-end text-emerald-400">Bearing 
          <span className="text-white text-xs flex items-center mt-0.5 select-none relative -right-1">
            <button onClick={() => setAngle((a: number) => (a - 0.5 + 360) % 360)} className="hover:text-emerald-400 disabled:opacity-50 transition-colors p-1" disabled={isPlaying}><ChevronLeft size={12} strokeWidth={3} /></button>
            <span className="w-10 text-center">{angle.toFixed(1)}°</span>
            <button onClick={() => setAngle((a: number) => (a + 0.5) % 360)} className="hover:text-emerald-400 disabled:opacity-50 transition-colors p-1" disabled={isPlaying}><ChevronRight size={12} strokeWidth={3} /></button>
          </span>
        </span>
      </div>
      <div ref={mountRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} className={`w-[160px] h-[160px] cursor-grab active:cursor-grabbing rounded-full ${isPlaying ? 'opacity-50 pointer-events-none' : ''}`} style={{ touchAction: 'none' }} />
    </div>
  );
};