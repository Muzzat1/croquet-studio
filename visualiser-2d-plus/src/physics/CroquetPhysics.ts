/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Point {
  x: number;
  y: number;
}

export interface BallState {
  id: 'blue' | 'red' | 'yellow' | 'black';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
}

// 2D Dimensions & Proportions Basis
export const BALL_RADIUS = 1.5;
export const DISPLAY_RADIUS = 6;
export const SCALE = 22;
export const EDGING = 1.5 * SCALE;

export const FIELD_WIDTH = 35 * SCALE + 2 * EDGING;   // 836 pixels
export const FIELD_HEIGHT = 28 * SCALE + 2 * EDGING;  // 682 pixels

// Mathematically constrained hoop dimensions based on 3 3/4" gap
export const HOOP_WIDTH = 16.41;
export const PEG_RADIUS = 3;

export const BALL_SETS = {
  primary: {
    blue: { hex: '#1e3a8a', label: 'BLU', name: 'Blue', ui: '#3b82f6' },
    black: { hex: '#18181b', label: 'BLK', name: 'Black', ui: '#e4e4e7' },
    red: { hex: '#991b1b', label: 'RED', name: 'Red', ui: '#ef4444' },
    yellow: { hex: '#fbbf24', label: 'YEL', name: 'Yellow', ui: '#fde047' },
  },
  secondary: {
    blue: { hex: '#22c55e', label: 'GRN', name: 'Green', ui: '#4ade80' },
    black: { hex: '#5c4033', label: 'BRN', name: 'Brown', ui: '#f59e0b' },
    red: { hex: '#f472b6', label: 'PNK', name: 'Pink', ui: '#fbcfe8' },
    yellow: { hex: '#f8fafc', label: 'WHT', name: 'White', ui: '#ffffff' },
  },
};

export const getActiveColor = (id: string | null, currentSet: 'primary' | 'secondary') => {
  if (!id) return '#fbbf24';
  return BALL_SETS[currentSet][id as keyof typeof BALL_SETS['primary']].ui;
};

export const HOOPS = [
  { id: 1, x: EDGING + 7 * SCALE, y: EDGING + 7 * SCALE, label: '1', topColor: '#2563eb' },
  { id: 2, x: EDGING + 28 * SCALE, y: EDGING + 7 * SCALE, label: '2' },
  { id: 3, x: EDGING + 28 * SCALE, y: EDGING + 21 * SCALE, label: '3', topColor: '#dc2626' },
  { id: 4, x: EDGING + 7 * SCALE, y: EDGING + 21 * SCALE, label: '4' },
  { id: 5, x: EDGING + 10.5 * SCALE, y: EDGING + 14 * SCALE, label: '5' },
  { id: 6, x: EDGING + 24.5 * SCALE, y: EDGING + 14 * SCALE, label: '6' },
];

export const PEG_POS = { x: EDGING + 17.5 * SCALE, y: EDGING + 14 * SCALE };

// Helper Checks
export const isBallDocked = (ball: { x: number }) => ball.x < EDGING * 0.8;

export const isBallOnLawn = (ball: { x: number; y: number }) => {
  return ball.x >= EDGING && ball.x <= FIELD_WIDTH - EDGING && ball.y >= EDGING && ball.y <= FIELD_HEIGHT - EDGING;
};

export const checkHoopPass = (x1: number, y1: number, x2: number, y2: number): boolean => {
  for (const hoop of HOOPS) {
    const hy1 = hoop.y - HOOP_WIDTH / 2;
    const hy2 = hoop.y + HOOP_WIDTH / 2;
    const hx = hoop.x;
    if ((x1 > hx && x2 <= hx) || (x1 < hx && x2 >= hx)) {
      const intersectY = y1 + ((hx - x1) / (x2 - x1)) * (y2 - y1);
      if (intersectY >= hy1 && intersectY <= hy2) return true;
    }
  }
  return false;
};

// 3D Coordinate Mapping Formulas
export const to3DX = (y2d: number) => (y2d - PEG_POS.y) / SCALE;
export const to3DZ = (x2d: number) => (x2d - PEG_POS.x) / SCALE;

export const to2DX = (z3d: number) => z3d * SCALE + PEG_POS.x;
export const to2DY = (x3d: number) => x3d * SCALE + PEG_POS.y;

export interface StepCollisionEvents {
  onHoopPass?: () => void;
  onCollision?: (type: 'ball' | 'peg' | 'hoop') => void;
}

/**
 * Executes a single sub-stepped physics frame, modifying ball positions and velocities in place.
 * Returns true if any ball is still moving, false if all balls have come to a stop.
 */
export function stepPhysics(
  balls: BallState[],
  touchingPairs: string[],
  deltaTime: number,
  events?: StepCollisionEvents
): boolean {
  let remainingTime = deltaTime;
  const decel = 0.06;
  const subStepDt = 0.1;

  while (remainingTime > 0) {
    const dt = Math.min(remainingTime, subStepDt);
    remainingTime -= dt;

    // 1. Process individual movement & hoop passes
    balls.forEach((ball) => {
      if (isBallDocked(ball)) return;
      const prevX = ball.x;
      const prevY = ball.y;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      if (checkHoopPass(prevX, prevY, ball.x, ball.y)) {
        events?.onHoopPass?.();
      }
    });

    // 2. Apply grass friction (deceleration)
    balls.forEach((ball) => {
      if (isBallDocked(ball)) return;
      const s = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
      if (s > 0) {
        const ns = Math.max(0, s - decel * dt);
        ball.vx = (ball.vx / s) * ns;
        ball.vy = (ball.vy / s) * ns;
      }
    });

    // 3. Constrain to boundary edges
    balls.forEach((ball) => {
      if (isBallDocked(ball)) {
        ball.vx = 0;
        ball.vy = 0;
        return;
      }
      if (ball.x < ball.radius) {
        ball.x = ball.radius;
        ball.vx = 0;
        ball.vy = 0;
      }
      if (ball.x > FIELD_WIDTH - ball.radius) {
        ball.x = FIELD_WIDTH - ball.radius;
        ball.vx = 0;
        ball.vy = 0;
      }
      if (ball.y < ball.radius) {
        ball.y = ball.radius;
        ball.vx = 0;
        ball.vy = 0;
      }
      if (ball.y > FIELD_HEIGHT - ball.radius) {
        ball.y = FIELD_HEIGHT - ball.radius;
        ball.vx = 0;
        ball.vy = 0;
      }
    });

    // 4. Peg & Hoop Post Collisions
    balls.forEach((ball) => {
      if (isBallDocked(ball)) return;

      // Peg collision
      const dxPeg = ball.x - PEG_POS.x;
      const dyPeg = ball.y - PEG_POS.y;
      const distPeg = Math.sqrt(dxPeg * dxPeg + dyPeg * dyPeg);
      const minPegDist = ball.radius + PEG_RADIUS;
      if (distPeg < minPegDist) {
        const nx = dxPeg / distPeg;
        const ny = dyPeg / distPeg;
        const velAlongNormal = ball.vx * nx + ball.vy * ny;
        if (velAlongNormal < 0) {
          const j = -(1 + 0.5) * velAlongNormal;
          ball.vx += j * nx;
          ball.vy += j * ny;
          events?.onCollision?.('peg');
        }
        ball.x = PEG_POS.x + nx * minPegDist;
        ball.y = PEG_POS.y + ny * minPegDist;
      }

      // Hoops post collisions
      HOOPS.forEach((hoop) => {
        const posts = [
          { x: hoop.x, y: hoop.y - HOOP_WIDTH / 2 },
          { x: hoop.x, y: hoop.y + HOOP_WIDTH / 2 },
        ];
        posts.forEach((post) => {
          const dx = ball.x - post.x;
          const dy = ball.y - post.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = ball.radius + 2; // hoop post diameter relative spacing
          if (dist < minDist) {
            const nx = dx / dist;
            const ny = dy / dist;
            const velAlongNormal = ball.vx * nx + ball.vy * ny;
            if (velAlongNormal < 0) {
              const j = -(1 + 0.4) * velAlongNormal;
              ball.vx += j * nx;
              ball.vy += j * ny;
              events?.onCollision?.('hoop');
            }
            ball.x = post.x + nx * minDist;
            ball.y = post.y + ny * minDist;
          }
        });
      });
    });

    // 5. Ball-to-Ball elastic collisions
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const b1 = balls[i];
        const b2 = balls[j];
        if (isBallDocked(b1) || isBallDocked(b2)) continue;

        const relX = b1.x - b2.x;
        const relY = b1.y - b2.y;
        const distSq = relX * relX + relY * relY;
        const minContactDistSq = (2 * BALL_RADIUS) ** 2;

        if (distSq < minContactDistSq) {
          const dist = Math.sqrt(distSq);
          if (dist > 0) {
            const relVX = b1.vx - b2.vx;
            const relVY = b1.vy - b2.vy;
            const dotProduct = relX * relVX + relY * relVY;

            if (dotProduct < 0) {
              const nx = relX / dist;
              const ny = relY / dist;
              const v_dot_n = relVX * nx + relVY * ny;

              const pairStr1 = `${b1.id}-${b2.id}`;
              const pairStr2 = `${b2.id}-${b1.id}`;
              let restitution = 0.92;

              // Check if they were already touching before the shot was played (croquet shot)
              const index1 = touchingPairs.indexOf(pairStr1);
              const index2 = touchingPairs.indexOf(pairStr2);
              if (index1 !== -1 || index2 !== -1) {
                restitution = 0.3333;
                if (index1 !== -1) touchingPairs.splice(index1, 1);
                else if (index2 !== -1) touchingPairs.splice(index2, 1);
              }

              const j_impulse = (-(1 + restitution) * v_dot_n) / 2;
              b1.vx += j_impulse * nx;
              b1.vy += j_impulse * ny;
              b2.vx -= j_impulse * nx;
              b2.vy -= j_impulse * ny;

              events?.onCollision?.('ball');
            }

            // Position correction (push apart to avoid sticking/overlapping)
            const overlap = 2 * BALL_RADIUS - dist;
            const nx_pos = relX / dist;
            const ny_pos = relY / dist;
            b1.x += (nx_pos * overlap) / 2;
            b1.y += (ny_pos * overlap) / 2;
            b2.x -= (nx_pos * overlap) / 2;
            b2.y -= (ny_pos * overlap) / 2;
          }
        }
      }
    }
  }

  // 6. Stop balls below speed threshold
  const threshold = 0.05;
  balls.forEach((ball) => {
    if (Math.abs(ball.vx) < threshold && Math.abs(ball.vy) < threshold) {
      ball.vx = 0;
      ball.vy = 0;
    }
  });

  // Return true if any ball is still moving
  return balls.some((b) => b.vx !== 0 || b.vy !== 0);
}
