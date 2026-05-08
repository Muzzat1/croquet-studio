// File: src/components/UIComponents.tsx

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, ChevronRight, HelpCircle, X, Hand, Play, Eye, 
  MousePointer2, Undo2, RotateCcw, Pencil, Eraser, Clapperboard, 
  Sun, MonitorPlay, Settings 
} from 'lucide-react';

// ==========================================
// 1. PRECISION WHEEL COMPONENT
// ==========================================
interface PrecisionWheelProps {
  value: number;
  onChange: (val: number) => void;
  isPlaying?: boolean;
  min?: number;
  max?: number;
  sensitivity?: number;
  range?: number;
  wrap?: boolean;
  unit?: string;
  label?: string;
  showLabels?: boolean;
  tooltip?: React.ReactNode;
}

export const PrecisionWheel = ({ value, onChange, isPlaying, min = 0, max = 360, sensitivity = 0.2, range = 60, wrap = true, unit = "°", label = "Wheel", showLabels = false, tooltip = null }: PrecisionWheelProps) => {
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
  const getTickLabel = (val: number) => {
    return `${Math.round(val)}`;
  };

  return (
    <div
      className="flex flex-col gap-1 w-full shrink-0 relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <AnimatePresence>
        {tooltip && isHovered && !isDragging && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 2 }}
            className="absolute left-1/2 -translate-x-1/2 -top-8 px-3 py-1.5 bg-zinc-800 text-emerald-300 text-[10px] font-bold tracking-wider whitespace-nowrap rounded shadow-2xl border border-zinc-600 z-[100] pointer-events-none drop-shadow-xl"
          >
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

// ==========================================
// 2. TOOL BUTTON COMPONENT
// ==========================================
interface ToolButtonProps {
  icon: React.ReactNode;
  label: string;
  title?: string;
  active?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  danger?: boolean;
  disabled?: boolean;
}

export const ToolButton = ({ icon, label, title, active, onClick, danger, disabled }: ToolButtonProps) => {
  const baseClasses = "flex flex-col items-center justify-center gap-1.5 p-2 min-h-[50px] md:min-h-[64px] w-full rounded-xl border-2 transition-all duration-200 shadow-sm shrink-0";
  let stateClasses = "";

  if (disabled) {
    stateClasses = "bg-zinc-900/40 text-zinc-700 border-zinc-800/40 cursor-not-allowed";
  } else if (active) {
    stateClasses = "bg-emerald-500/10 text-emerald-400 border-emerald-500 shadow-[0_4px_15px_rgba(16,185,129,0.2)] hover:bg-emerald-500/20 active:scale-95 cursor-pointer";
  } else if (danger) {
    stateClasses = "bg-slate-800/80 text-rose-400 border-slate-700 hover:border-rose-500/50 hover:bg-rose-500/10 hover:-translate-y-0.5 active:scale-95 cursor-pointer";
  } else {
    stateClasses = "bg-slate-800/80 text-slate-400 border-slate-700 hover:border-emerald-500/50 hover:text-emerald-300 hover:shadow-lg hover:-translate-y-0.5 active:scale-95 cursor-pointer";
  }

  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} title={title || label} className={`${baseClasses} ${stateClasses}`}>
      {icon}
      <span className="text-[8px] md:text-[9px] font-bold uppercase tracking-widest">{label}</span>
    </button>
  );
};

// ==========================================
// 3. HELP SCREEN COMPONENT
// ==========================================
export const HelpScreen = ({ onClose }: { onClose: () => void }) => {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[150] backdrop-blur-md flex items-center justify-center p-4 bg-zinc-950/90">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-2xl w-full max-w-5xl shadow-2xl border backdrop-blur-xl bg-zinc-900 border-zinc-800 flex flex-col max-h-[90vh]">
        <div className="p-6 border-b flex items-start justify-between rounded-t-2xl bg-zinc-900 border-zinc-800 shrink-0">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-3 text-emerald-400"><HelpCircle size={28} /> Golf Croquet Visualiser</h2>
            <div className="text-xs font-bold tracking-wide text-zinc-400 mt-1 ml-[40px]">
              A program by Murray Tinker (2tinkers@gmail.com)
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full transition-colors hover:bg-zinc-800 text-zinc-400 hover:text-white"><X size={20} /></button>
        </div>

        <div className="p-8 overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10 text-base leading-relaxed text-zinc-200">
            <div className="space-y-10">
              <div>
                <h3 className="font-bold mb-4 flex items-center gap-2 uppercase tracking-widest text-[13px] text-emerald-400"><Hand size={20} /> Getting Started & Viewing</h3>
                <p className="mb-4"><strong>Bring Balls Onto Grass:</strong> Simply click and drag any ball (Blue, Red, Black, or Yellow) onto the green. You can drag them out one by one.</p>
                <p className="mb-4"><strong>Choosing a Ball:</strong> Click on the ball you want to hit. A bright ring will appear around it so you know it is selected.</p>
                <p className="mb-4"><strong>Zooming In and Out:</strong> Use your mouse wheel (or pinch on a touchscreen) to zoom in for a closer look, or zoom out to see the whole court.</p>
                <p><strong>Moving Around:</strong> Click and drag anywhere on the empty grass to move the court side to side, or up and down.</p>
              </div>

              <div>
                <h3 className="font-bold mb-4 flex items-center gap-2 uppercase tracking-widest text-[13px] text-emerald-400"><Play size={20} /> How to Shoot</h3>
                <p className="mb-4 flex items-start gap-3"><MousePointer2 size={20} className="shrink-0 mt-0.5 text-zinc-400" /> <span><strong>PLACE Mode (Easiest Method):</strong> Make sure the button says "PLACE". Select your ball, then just click anywhere on the grass where you want it to stop. The app calculates everything for you!</span></p>
                <p className="mb-4 flex items-start gap-3"><Eye size={20} className="shrink-0 mt-0.5 text-zinc-400" /> <span><strong>AIM Mode (Manual Method):</strong> Press the PLACE button so it changes to "AIM". You can now use the wheels at the bottom to adjust your power and direction.</span></p>
                <p className="mb-4 flex items-start gap-3"><HelpCircle size={20} className="shrink-0 mt-0.5 text-zinc-400" /> <span><strong>The Target (Ghost Ball):</strong> You will see a faint trail and "ghost ball". This shows you exactly where your ball will travel and come to a rest!</span></p>
                <p className="flex items-start gap-3"><Play size={20} className="shrink-0 mt-0.5 text-zinc-400" /> <span><strong>Take the Shot:</strong> In both Place and Aim modes, you must click the big <strong>PLAY BALL</strong> button to actually hit the ball!</span></p>
              </div>
            </div>

            <div className="space-y-10">
              <div>
                <h3 className="font-bold mb-4 flex items-center gap-2 uppercase tracking-widest text-[13px] text-emerald-400"><Undo2 size={20} /> Fixing Mistakes</h3>
                <p className="mb-4 flex items-start gap-3"><Undo2 size={20} className="shrink-0 mt-0.5 text-zinc-400" /> <span><strong>Undo Button:</strong> Made a mistake? Don't worry! Click 'Undo' to put the balls back exactly where they were before your last shot.</span></p>
                <p className="flex items-start gap-3"><RotateCcw size={20} className="shrink-0 mt-0.5 text-zinc-400" /> <span><strong>Reset Everything:</strong> Click 'Reset' to clear the grass and start completely fresh.</span></p>
              </div>

              <div>
                <h3 className="font-bold mb-4 flex items-center gap-2 uppercase tracking-widest text-[13px] text-emerald-400"><Pencil size={20} /> Drawing Overlay</h3>
                <p className="mb-4 flex items-start gap-3"><Pencil size={20} className="shrink-0 mt-0.5 text-zinc-400" /> <span><strong>Drawing:</strong> Click the 'Draw' pen or the 'Line' pen, then click and drag your mouse over the grass to sketch out your ideas.</span></p>
                <p className="flex items-start gap-3"><Eraser size={20} className="shrink-0 mt-0.5 text-zinc-400" /> <span><strong>Clear Drawing:</strong> Use the Eraser to completely wipe clean and instantly remove all the marks you just drew.</span></p>
              </div>

              <div>
                <h3 className="font-bold mb-4 flex items-center gap-2 uppercase tracking-widest text-[13px] text-emerald-400"><Clapperboard size={20} /> Extra Settings</h3>
                <p className="mb-4 flex items-start gap-3"><Sun size={20} className="shrink-0 mt-0.5 text-zinc-400" /> <span><strong>Brighten for Sunshine:</strong> Are you outside? Use Bright Mode in <Settings size={18} className="inline mx-1 text-zinc-300" /> Prefs to make the screen much brighter.</span></p>
                <p className="mb-4 flex items-start gap-3"><MonitorPlay size={20} className="shrink-0 mt-0.5 text-zinc-400" /> <span><strong>Hide Menus:</strong> Freeze Frame hides all buttons so you can take a clear picture of the screen.</span></p>
                <p className="flex items-start gap-3"><Clapperboard size={20} className="shrink-0 mt-0.5 text-zinc-400" /> <span><strong>Sequence Recorder:</strong> Use the camera icon to save your moves step-by-step. You can record a series of shots, and then play them back later to show others!</span></p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t rounded-b-2xl text-center bg-zinc-950/50 border-zinc-800 shrink-0">
          <button onClick={onClose} className="px-10 py-3 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-xl font-bold uppercase tracking-widest text-[11px] transition-colors shadow-lg">Close Guide</button>
        </div>
      </motion.div>
    </motion.div>
  );
};