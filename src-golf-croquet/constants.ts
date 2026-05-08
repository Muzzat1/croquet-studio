// File: src/constants.ts

// --- Types & Interfaces ---
export interface Point { x: number; y: number; }
export type Path = { points: Point[], color: string, type: 'freehand' | 'straight' };
export interface Ball { 
  x: number; 
  y: number; 
  vx: number; 
  vy: number; 
  radius: number; 
  color: string; 
  id: 'blue' | 'red' | 'yellow' | 'black'; 
}
export interface RecordedShot { 
  id: number; 
  activeBallId: 'blue' | 'red' | 'yellow' | 'black'; 
  angle: number; 
  speed: number; 
  positions: { blue: Ball; red: Ball; yellow: Ball; black: Ball; }; 
  trace?: { blue: Point, red: Point, yellow: Point, black: Point }[];
}

// --- Court Dimensions & Scaling ---
export const BALL_RADIUS = 6;
export const SCALE = 22;
export const EDGING = 1.5 * SCALE;
export const FIELD_WIDTH = 35 * SCALE + 2 * EDGING;
export const FIELD_HEIGHT = 28 * SCALE + 2 * EDGING;
export const ZOOM_LEVELS = [1, 1.5, 2.5];

// --- Reset Positions ---
export const RESET_X = EDGING / 2;
export const BOTTOM_CORNER_Y = FIELD_HEIGHT - EDGING;
export const SPACING = BALL_RADIUS * 4.5;

export const INITIAL_YELLOW_POS = { x: RESET_X, y: BOTTOM_CORNER_Y - SPACING * 4 };
export const INITIAL_BLACK_POS = { x: RESET_X, y: BOTTOM_CORNER_Y - SPACING * 3 };
export const INITIAL_RED_POS = { x: RESET_X, y: BOTTOM_CORNER_Y - SPACING * 2 };
export const INITIAL_BLUE_POS = { x: RESET_X, y: BOTTOM_CORNER_Y - SPACING * 1 };

// --- Obstacles ---
export const HOOP_WIDTH = 16.41;
export const PEG_RADIUS = 3;

export const HOOPS = [
  { id: 1, x: EDGING + 7 * SCALE, y: EDGING + 7 * SCALE, label: '1', topColor: '#2563eb' },
  { id: 2, x: EDGING + 28 * SCALE, y: EDGING + 7 * SCALE, label: '2' },
  { id: 3, x: EDGING + 28 * SCALE, y: EDGING + 21 * SCALE, label: '3', topColor: '#dc2626' },
  { id: 4, x: EDGING + 7 * SCALE, y: EDGING + 21 * SCALE, label: '4' },
  { id: 5, x: EDGING + 10.5 * SCALE, y: EDGING + 14 * SCALE, label: '5' },
  { id: 6, x: EDGING + 24.5 * SCALE, y: EDGING + 14 * SCALE, label: '6' },
];
export const PEG_POS = { x: EDGING + 17.5 * SCALE, y: EDGING + 14 * SCALE };

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
    blue: { hex: '#1e3a8a', label: 'BLU', name: 'Blue', ui: '#3b82f6' },
    black: { hex: '#18181b', label: 'BLK', name: 'Black', ui: '#e4e4e7' },
    red: { hex: '#991b1b', label: 'RED', name: 'Red', ui: '#ef4444' },
    yellow: { hex: '#fbbf24', label: 'YEL', name: 'Yellow', ui: '#fde047' }
  },
  secondary: {
    blue: { hex: '#22c55e', label: 'GRN', name: 'Green', ui: '#4ade80' },
    black: { hex: '#5c4033', label: 'BRN', name: 'Brown', ui: '#f59e0b' },
    red: { hex: '#f472b6', label: 'PNK', name: 'Pink', ui: '#fbcfe8' },
    yellow: { hex: '#f8fafc', label: 'WHT', name: 'White', ui: '#ffffff' }
  }
};

export const getActiveColor = (id: string | null, currentSet: 'primary' | 'secondary') => {
  if (!id) return '#fbbf24';
  return BALL_SETS[currentSet][id as keyof typeof BALL_SETS['primary']].ui;
};