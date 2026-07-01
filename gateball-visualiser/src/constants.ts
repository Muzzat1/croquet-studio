// File: src/constants.ts

// --- Types & Interfaces ---
export interface Point { x: number; y: number; }
export type Path = { points: Point[], color: string, type: 'freehand' | 'straight' };

export type BallId = 'r1' | 'w2' | 'r3' | 'w4' | 'r5' | 'w6' | 'r7' | 'w8' | 'r9' | 'w10';

export interface Ball { 
  x: number; 
  y: number; 
  vx: number; 
  vy: number; 
  radius: number; 
  color: string; 
  id: BallId;
  number: number;
}

export interface RecordedShot { 
  id: number; 
  activeBallId: BallId; 
  angle: number; 
  speed: number; 
  positions: Record<BallId, Ball>; 
  trace?: Record<BallId, Point[]>;
  impacts?: (number | { step: number; x: number; y: number; text: string; color: string })[];
  isAutoEnd?: boolean;
  isSparkShot?: boolean;
  sparkTargetId?: BallId;
  isPowerShot?: boolean;
}

// --- Court Dimensions & Scaling ---
export const BALL_RADIUS = 6;
export const DISPLAY_RADIUS = 6;
export const SCALE = 35; // Adjusted scale for 20x15 field
export const EDGING = 1.5 * SCALE;
export const FIELD_WIDTH = 20 * SCALE + 2 * EDGING; // 20 meters
export const FIELD_HEIGHT = 15 * SCALE + 2 * EDGING; // 15 meters
export const ZOOM_LEVELS = [1, 1.5, 2.5];

// --- Reset Positions ---
export const RESET_Y = EDGING / 2;
export const SPACING = DISPLAY_RADIUS * 4.5;

export const BALL_IDS: BallId[] = ['r1', 'w2', 'r3', 'w4', 'r5', 'w6', 'r7', 'w8', 'r9', 'w10'];

// Provide initial coordinates for docking the balls on the bottom margin
export const getInitialPositions = (): Record<BallId, Point> => {
  const pos = {} as Record<BallId, Point>;
  // Place balls left of the Start Area (which starts at EDGING + 17 * SCALE)
  // Ball 1 (index 0) nearest to Start Area
  const startX = EDGING + 17 * SCALE - SPACING;
  BALL_IDS.forEach((id, index) => {
    pos[id] = { x: startX - index * SPACING, y: FIELD_HEIGHT - RESET_Y };
  });
  return pos;
};

// --- Obstacles ---
export const GATE_WIDTH = 21.12; // 80% of previous 26.4 width (which was 75% of 35.2)
export const GOAL_POLE_RADIUS = 2.6; // 1cm radius (2cm diameter) + 1px for visibility

// Gateball Gate Positions (20m x 15m horizontal court)
// Corner 1 is Bottom-Right
// Gate 1: 4m up from Bottom-Right along Right edge, 2m in from Right edge
// Gate 2: 12m left from Top-Right along Top edge, 2m in from Top edge
// Gate 3: Centered on Bottom edge, 2m in from Bottom edge
export const GATES = [
  { id: 1, x: EDGING + (20 - 2) * SCALE, y: EDGING + (15 - 4) * SCALE, label: '1', topColor: '#ffffff', labelOffset: { x: -50, y: 0 } },
  { id: 2, x: EDGING + (20 - 12) * SCALE, y: EDGING + 2 * SCALE, label: '2', labelOffset: { x: 0, y: 30 } },
  { id: 3, x: EDGING + 10 * SCALE, y: EDGING + (15 - 2) * SCALE, label: '3', topColor: '#ffffff', labelOffset: { x: 0, y: 30 } },
];
export const GOAL_POLE_POS = { x: EDGING + 10 * SCALE, y: EDGING + 7.5 * SCALE };

// --- Assets ---
export const SOUNDS = {
  mallet: 'https://cdn.freesound.org/previews/108/108615_1159841-lq.mp3',
  collision: 'https://cdn.freesound.org/previews/108/108615_1159841-lq.mp3',
  cheer: 'https://cdn.freesound.org/previews/337/337000_5121236-lq.mp3',
  miss: 'https://cdn.freesound.org/previews/175/175409_3235613-lq.mp3'
};

export const playSound = (url: string, volume = 0.5) => { 
  const audio = new Audio(url); 
  audio.volume = volume; 
  audio.play().catch(() => { }); 
};

// --- Colors & Styling ---
export const BALL_SETS = {
  primary: {
    red: { hex: '#991b1b', label: 'RED', name: 'Red', ui: '#ef4444' },
    white: { hex: '#f8fafc', label: 'WHT', name: 'White', ui: '#ffffff' }
  },
  secondary: {
    red: { hex: '#f472b6', label: 'PNK', name: 'Pink', ui: '#fbcfe8' },
    white: { hex: '#fde047', label: 'YEL', name: 'Yellow', ui: '#fef08a' }
  }
};

export const getActiveColor = (id: BallId | null, currentSet: 'primary' | 'secondary') => {
  if (!id) return '#fbbf24';
  const isRed = id.startsWith('r');
  return isRed ? BALL_SETS[currentSet].red.ui : BALL_SETS[currentSet].white.ui;
};