import React from 'react';
import { Play, Activity, CircleDot, MoveDiagonal } from 'lucide-react';

// 1. We define the shapes of our props for TypeScript.
// The '?' next to workInProgressText tells TypeScript "this is optional, don't panic if it's missing."
interface GameCardProps {
  href: string;
  title: string;
  description: string;
  icon: React.ElementType;
  colorClass: string;
  hoverShadow: string;
  workInProgressText?: string; 
}

// 2. We apply that interface to our component
const GameCard = ({ href, title, description, icon: Icon, colorClass, hoverShadow, workInProgressText }: GameCardProps) => (
  <a 
    href={href} 
    className={`group relative flex flex-col p-8 bg-slate-900/50 hover:bg-slate-800/80 rounded-3xl border border-slate-800 transition-all duration-300 hover:-translate-y-2 backdrop-blur-md overflow-hidden ${hoverShadow}`}
  >
    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
      <Icon className={`w-24 h-24 ${colorClass}`} />
    </div>
    <div className="relative z-10 flex-1">
      <h2 className={`text-2xl font-bold text-white mb-2 group-hover:text-opacity-80 transition-colors`}>
        {title}
      </h2>
      <p className="text-slate-400 text-sm leading-relaxed mb-8 whitespace-pre-line">
        {description}
      </p>
    </div>
    <div className={`relative z-10 flex items-center font-semibold group-hover:translate-x-2 transition-transform ${colorClass}`}>
      Launch Simulation <Play className="ml-2 w-4 h-4 fill-current" />
    </div>
    
    {workInProgressText && (
      <div className="relative z-10 mt-1.5 text-xs font-medium text-orange-400">
        {workInProgressText}
      </div>
    )}
  </a>
);

function App() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center font-sans text-slate-100 p-6 selection:bg-indigo-500/30">
      {/* Background Decor */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute -top-[40%] -left-[10%] w-[70%] h-[70%] rounded-full bg-indigo-900/20 blur-[120px]" />
        <div className="absolute top-[60%] -right-[10%] w-[60%] h-[60%] rounded-full bg-emerald-900/20 blur-[120px]" />
      </div>

      <main className="relative z-10 max-w-5xl w-full flex flex-col items-center space-y-12">
        
        {/* Header Section */}
        <header className="text-center space-y-4">
          <div className="inline-flex items-center justify-center p-3 bg-white/5 rounded-2xl border border-white/10 shadow-2xl mb-4 backdrop-blur-sm">
            <Activity className="w-8 h-8 text-indigo-400" />
          </div>
          <p className="text-lg text-slate-400 italic">Murray Tinker's</p> 
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-200 via-indigo-200 to-slate-200">
            Croquet Studio
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Tool to visualise play in the common forms of Croquet
          </p>
        </header>

        {/* Grid Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
          <GameCard 
            href="/gateball-visualiser/"
            title="Gateball"
            description="The 10 ball team strategy game from Japan. Played internationally on a smaller court with 3 gates and a central goal pole."
            icon={CircleDot}
            colorClass="text-indigo-400"
            hoverShadow="hover:border-indigo-500/50 hover:shadow-[0_20px_40px_-15px_rgba(99,102,241,0.2)]"
            workInProgressText="Work in Progress"
          />

          <GameCard 
            href="/golf-croquet-visualiser/"
            title="Golf Croquet"
            description={`Fast-paced 4 ball sequence game for singles or pairs. Standard croquet court with 6 hoops.\nRicochet can be visualised on this tool`}
            icon={MoveDiagonal}
            colorClass="text-emerald-400"
            hoverShadow="hover:border-emerald-500/50 hover:shadow-[0_20px_40px_-15px_rgba(16,185,129,0.2)]"
          />

          <GameCard 
            href="/association-croquet-visualiser/"
            title="Association Croquet"
            description="Classic break-building tactical game. Features croquet shots and advanced physics."
            icon={CircleDot}
            colorClass="text-amber-400"
            hoverShadow="hover:border-amber-500/50 hover:shadow-[0_20px_40px_-15px_rgba(245,158,11,0.2)]"
          />
        </div>

        {/* Footer Section */}
        <footer className="text-slate-500 text-sm mt-12 flex flex-col items-center space-y-2">
          <span>&copy; 2026 Murray Tinker</span>
          <a href="mailto:2tinkers@gmail.com" className="hover:text-indigo-400 transition-colors underline-offset-4 hover:underline">
            2tinkers@gmail.com
          </a>
        </footer>

      </main>
    </div>
  );
}

export default App;