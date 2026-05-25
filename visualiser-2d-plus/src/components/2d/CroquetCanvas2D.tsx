import React, { useRef, useEffect } from 'react';
import {
  BALL_RADIUS,
  DISPLAY_RADIUS,
  SCALE,
  EDGING,
  FIELD_WIDTH,
  FIELD_HEIGHT,
  PEG_RADIUS,
  PEG_POS,
  HOOP_WIDTH,
  HOOPS,
  isBallDocked,
  getActiveColor,
} from '../../physics/CroquetPhysics';

// Define structures matching original 2D canvas codebase
interface Point {
  x: number;
  y: number;
}

export interface Path {
  points: Point[];
  color: string;
  type: 'freehand' | 'straight';
}

interface Ball {
  id: 'blue' | 'red' | 'yellow' | 'black';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
}

interface CroquetCanvas2DProps {
  balls: Record<'blue' | 'red' | 'yellow' | 'black', Ball>;
  activeBallId: 'blue' | 'red' | 'yellow' | 'black' | null;
  selectedBall: 'blue' | 'red' | 'yellow' | 'black';
  targetSpot: { x: number; y: number } | null;
  angle: number;
  speed: number;
  zoom: number;
  placementMode: boolean;
  drawMode: boolean;
  cleanFeed: boolean;
  ghostBallEnabled: boolean;
  drawColor: string;
  drawStyle: 'freehand' | 'straight';
  drawings: Path[];
  currentPath: Path | null;
  hoverPos: Point | null;
  ballSet: 'primary' | 'secondary';

  // State Change Callbacks
  onBallsChange: (balls: Record<'blue' | 'red' | 'yellow' | 'black', Ball>) => void;
  onActiveBallIdChange: (id: 'blue' | 'red' | 'yellow' | 'black' | null) => void;
  onTargetSpotChange: (spot: { x: number; y: number } | null) => void;
  onAngleChange: (angle: number) => void;
  onSpeedChange: (speed: number) => void;
  onDrawingsChange: (drawings: Path[]) => void;
  onCurrentPathChange: (path: Path | null) => void;
  onHoverPosChange: (pos: Point | null) => void;
  onDrawWarningTrigger?: () => void;
  isPlaying: boolean;
}



export default function CroquetCanvas2D({
  balls,
  activeBallId,
  selectedBall,
  targetSpot,
  angle,
  speed,
  zoom,
  placementMode,
  drawMode,
  cleanFeed,
  ghostBallEnabled,
  drawColor,
  drawStyle,
  drawings,
  currentPath,
  hoverPos,
  ballSet,
  onBallsChange,
  onActiveBallIdChange,
  onTargetSpotChange,
  onAngleChange,
  onSpeedChange,
  onDrawingsChange,
  onCurrentPathChange,
  onHoverPosChange,
  onDrawWarningTrigger,
  isPlaying,
}: CroquetCanvas2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const draggingItemRef = useRef<'blue' | 'red' | 'yellow' | 'black' | 'ghost' | 'pan' | 'draw' | null>(null);
  const lastPanRef = useRef({ x: 0, y: 0, scrollL: 0, scrollT: 0 });

  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    let clientX, clientY;
    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    const x = (clientX - rect.left) * (FIELD_WIDTH / rect.width);
    const y = (clientY - rect.top) * (FIELD_HEIGHT / rect.height);
    return { x, y };
  };

  // 2D Draw field & components frame rendering
  const drawField = (ctx: CanvasRenderingContext2D) => {
    // Background lawn color
    ctx.fillStyle = '#166534';
    ctx.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);

    // Boundary border stroke
    const boundaryWidth = (60 / 914.4) * SCALE;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = boundaryWidth;
    ctx.lineJoin = 'miter';
    ctx.strokeRect(EDGING, EDGING, 35 * SCALE, 28 * SCALE);

    // Draw longitudinal lawn stripes
    const stripeWidth = 40;
    for (let x = 0; x < FIELD_WIDTH; x += stripeWidth) {
      ctx.fillStyle = (x / stripeWidth) % 2 === 0 ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)';
      ctx.fillRect(x, 0, stripeWidth, FIELD_HEIGHT);
    }

    // Yard labels & annotations
    if (!cleanFeed) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '10px "Inter", sans-serif';
      ctx.textAlign = 'center';

      ctx.fillText('West Boundary', FIELD_WIDTH / 2, EDGING - 15);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = 'bold 10px "Inter", sans-serif';
      ctx.fillText('35 yards', FIELD_WIDTH / 2, EDGING - 5);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '10px "Inter", sans-serif';

      ctx.fillText('East Boundary', FIELD_WIDTH / 2, EDGING + 28 * SCALE + 15);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = 'bold 10px "Inter", sans-serif';
      ctx.fillText('35 yards', FIELD_WIDTH / 2, EDGING + 28 * SCALE + 25);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '10px "Inter", sans-serif';

      ctx.save();
      ctx.translate(EDGING - 12, FIELD_HEIGHT / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('South Boundary', 0, 0);
      ctx.restore();

      ctx.save();
      ctx.translate(EDGING - 22, FIELD_HEIGHT / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = 'bold 10px "Inter", sans-serif';
      ctx.fillText('28 yards', 0, 0);
      ctx.restore();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '10px "Inter", sans-serif';

      ctx.save();
      ctx.translate(EDGING + 35 * SCALE + 12, FIELD_HEIGHT / 2);
      ctx.rotate(Math.PI / 2);
      ctx.fillText('North Boundary', 0, 0);
      ctx.restore();

      ctx.save();
      ctx.translate(EDGING + 35 * SCALE + 22, FIELD_HEIGHT / 2);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = 'bold 10px "Inter", sans-serif';
      ctx.fillText('28 yards', 0, 0);
      ctx.restore();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '10px "Inter", sans-serif';
    }

    // Center Peg
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(PEG_POS.x, PEG_POS.y, PEG_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 6 Standard Hoops
    HOOPS.forEach((hoop) => {
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      const hy1 = hoop.y - HOOP_WIDTH / 2;
      const hy2 = hoop.y + HOOP_WIDTH / 2;

      // Draw hoop posts
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(hoop.x, hy1, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(hoop.x, hy2, 4, 0, Math.PI * 2);
      ctx.fill();

      // Draw top crossbar
      ctx.strokeStyle = hoop.topColor || '#e2e8f0';
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(hoop.x, hy1);
      ctx.lineTo(hoop.x, hy2);
      ctx.stroke();

      // Hoop labels
      if (!cleanFeed) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 8px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(hoop.label, hoop.x, hoop.y - 12);
      }
      ctx.restore();
    });

    // Association Croquet markings: Corner arcs, started quadrant & penalty circles
    if (!cleanFeed) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1.5;

      // Starting circles/arcs (1 yard scale)
      ctx.beginPath();
      ctx.arc(FIELD_WIDTH / 2, EDGING, SCALE, 0, Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(FIELD_WIDTH / 2, FIELD_HEIGHT - EDGING, SCALE, Math.PI, 2 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(EDGING, FIELD_HEIGHT - EDGING, SCALE, -Math.PI / 2, 0);
      ctx.stroke();

      // Boundary corner flags
      const flags = [
        { x: EDGING, y: EDGING, color: '#ef4444' }, // Blue
        { x: EDGING + 35 * SCALE, y: EDGING, color: '#ef4444' }, // Red
        { x: EDGING + 35 * SCALE, y: EDGING + 28 * SCALE, color: '#ef4444' }, // Yellow
        { x: EDGING, y: EDGING + 28 * SCALE, color: '#ef4444' }, // Black
      ];
      flags.forEach((peg) => {
        ctx.save();
        ctx.fillStyle = peg.color;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.arc(peg.x, peg.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      });
    }

    // Render active drawings
    const renderPath = (path: Path) => {
      if (path.points.length < 2) return;
      ctx.strokeStyle = path.color || '#ffffff';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(path.points[0].x, path.points[0].y);
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(path.points[i].x, path.points[i].y);
      }
      ctx.stroke();
    };

    ctx.save();
    drawings.forEach(renderPath);
    if (currentPath) renderPath(currentPath);
    ctx.restore();

    // Render 4 Balls
    const activeBall = activeBallId
      ? balls[activeBallId]
      : selectedBall
      ? balls[selectedBall]
      : null;

    Object.values(balls).forEach((ball) => {
      const isDocked = ball.x < EDGING * 0.8;
      const displayRadius = isDocked ? DISPLAY_RADIUS * 1.5 : DISPLAY_RADIUS;

      // Draw shadow
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.arc(ball.x + 1.2, ball.y + 1.2, displayRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Ball selection active border outline
      if (ball.id === selectedBall && !cleanFeed) {
        ctx.save();
        ctx.strokeStyle = getActiveColor(ball.id, ballSet);
        ctx.lineWidth = 2;
        ctx.shadowColor = getActiveColor(ball.id, ballSet);
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, displayRadius + (isDocked ? 6 : 5), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Ball body
      ctx.save();
      const grad = ctx.createRadialGradient(
        ball.x - displayRadius * 0.25,
        ball.y - displayRadius * 0.25,
        displayRadius * 0.1,
        ball.x,
        ball.y,
        displayRadius
      );
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.2, ballSet === 'primary' && ball.id === 'black' ? '#27272a' : ball.color);
      grad.addColorStop(1, '#000000');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, displayRadius, 0, Math.PI * 2);
      ctx.fill();

      // Ball glossy highlight
      ctx.beginPath();
      ctx.arc(
        ball.x - displayRadius * 0.3,
        ball.y - displayRadius * 0.3,
        displayRadius * 0.25,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.fill();
      ctx.restore();
    });

    // Render target shoot line, trajectory & ghost ball preview
    if (!cleanFeed && activeBall && !isPlaying) {
      const isStrikingBallDocked = isBallDocked(activeBall);
      if (!isStrikingBallDocked) {
        const rad = (angle * Math.PI) / 180;
        const dx = Math.sin(rad);
        const dy = -Math.cos(rad);

        // Calculate maximum distance matching power speed Cap (0 to 200%)
        const distance = (speed / 100) * 35 * SCALE;

        // Draw aiming trajectory dashed guideline
        ctx.save();
        ctx.strokeStyle = getActiveColor(activeBall.id, ballSet);
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(activeBall.x, activeBall.y);
        ctx.lineTo(activeBall.x + dx * distance, activeBall.y + dy * distance);
        ctx.stroke();
        ctx.restore();

        // Aiming target end cross
        if (targetSpot && placementMode) {
          ctx.save();
          ctx.strokeStyle = getActiveColor(activeBall.id, ballSet);
          ctx.lineWidth = 2;
          ctx.setLineDash([3, 2]);
          ctx.beginPath();
          ctx.arc(targetSpot.x, targetSpot.y, 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // Draw Ghost Ball Preview
        if (ghostBallEnabled) {
          let firstImpact: { ball: Ball; t: number } | null = null;
          const otherBalls = Object.values(balls).filter(
            (b) => b.id !== activeBall.id && !isBallDocked(b)
          );

          for (const b of otherBalls) {
            const R2 = (2 * BALL_RADIUS) ** 2;
            const a_q = dx * dx + dy * dy;
            const b_q = 2 * (dx * (activeBall.x - b.x) + dy * (activeBall.y - b.y));
            const c_q = (activeBall.x - b.x) ** 2 + (activeBall.y - b.y) ** 2 - R2;
            const discriminant = b_q * b_q - 4 * a_q * c_q;
            if (discriminant >= 0) {
              const t = (-b_q - Math.sqrt(discriminant)) / (2 * a_q);
              if (t > 0 && (!firstImpact || t < firstImpact.t)) {
                firstImpact = { ball: b, t };
              }
            }
          }

          if (firstImpact && firstImpact.t < distance) {
            const ghostX = activeBall.x + firstImpact.t * dx;
            const ghostY = activeBall.y + firstImpact.t * dy;

            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.arc(ghostX, ghostY, DISPLAY_RADIUS, 0, Math.PI * 2);
            ctx.stroke();

            // Direct line from ghost to hit ball center
            ctx.beginPath();
            ctx.moveTo(ghostX, ghostY);
            ctx.lineTo(firstImpact.ball.x, firstImpact.ball.y);
            ctx.stroke();
            ctx.restore();
          }
        }
      }
    }

    // Hover position marker
    if (hoverPos && !cleanFeed && !isPlaying) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(hoverPos.x, hoverPos.y, 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  };

  // Re-run draw canvas field on properties update
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw the scene on every change
    drawField(ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    balls,
    activeBallId,
    selectedBall,
    targetSpot,
    angle,
    speed,
    placementMode,
    drawMode,
    cleanFeed,
    ghostBallEnabled,
    drawColor,
    drawStyle,
    drawings,
    currentPath,
    hoverPos,
    ballSet,
    isPlaying,
  ]);

  const handleStart = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (isPlaying) return;
    const coords = getCanvasCoords(e);
    if (!coords) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const { x, y } = coords;

    const getHitDistance = (ball: Ball) => {
      const isDocked = isBallDocked(ball);
      const displayRadius = isDocked ? ball.radius * 1.5 : ball.radius;
      // In place mode, reduce the selection radius for balls on court by 50%
      const hitTolerance = isDocked ? 2.0 : placementMode ? 2.5 : 5.0;
      const dist = Math.sqrt((x - ball.x) ** 2 + (y - ball.y) ** 2);
      return dist < displayRadius * hitTolerance ? dist : Infinity;
    };

    // Whiteboard drawing mode
    if (drawMode && !cleanFeed) {
      if (Object.values(balls).some((b) => getHitDistance(b) !== Infinity)) {
        onDrawWarningTrigger?.();
      }
      onCurrentPathChange({ points: [{ x, y }], color: drawColor, type: drawStyle });
      draggingItemRef.current = 'draw';
      return;
    }

    const activeBall = balls[selectedBall];
    let hitSomething = false;

    if (!cleanFeed) {
      const hits = Object.values(balls)
        .map((b) => ({ id: b.id, dist: getHitDistance(b) }))
        .filter((h) => h.dist !== Infinity)
        .sort((a, b) => a.dist - b.dist);

      if (hits.length > 0) {
        const hitId = hits[0].id;
        onActiveBallIdChange(hitId);
        draggingItemRef.current = hitId;
        hitSomething = true;
      }
    }

    // Ghost ball drag selection
    if (!hitSomething && ghostBallEnabled && !cleanFeed && activeBall) {
      const rad = (angle * Math.PI) / 180;
      const dx = Math.sin(rad);
      const dy = -Math.cos(rad);
      let firstImpact: { ball: Ball; t: number } | null = null;
      const otherBalls = Object.values(balls).filter(
        (b) => b.id !== selectedBall && !isBallDocked(b)
      );

      for (const b of otherBalls) {
        const R2 = (2 * BALL_RADIUS) ** 2;
        const a_q = dx * dx + dy * dy;
        const b_q = 2 * (dx * (activeBall.x - b.x) + dy * (activeBall.y - b.y));
        const c_q = (activeBall.x - b.x) ** 2 + (activeBall.y - b.y) ** 2 - R2;
        const discriminant = b_q * b_q - 4 * a_q * c_q;
        if (discriminant >= 0) {
          const t = (-b_q - Math.sqrt(discriminant)) / (2 * a_q);
          if (t > 0 && (!firstImpact || t < firstImpact.t)) {
            firstImpact = { ball: b, t };
          }
        }
      }

      if (firstImpact) {
        const ghostX = activeBall.x + firstImpact.t * dx;
        const ghostY = activeBall.y + firstImpact.t * dy;
        const distGhost = Math.sqrt((x - ghostX) ** 2 + (y - ghostY) ** 2);
        if (distGhost < DISPLAY_RADIUS * 4) {
          draggingItemRef.current = 'ghost';
          hitSomething = true;
        }
      }
    }

    // General placement mode click aim OR panning viewport
    if (!hitSomething && !cleanFeed) {
      if (placementMode) {
        onTargetSpotChange({ x, y });
        const dx = x - activeBall.x;
        const dy = y - activeBall.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        onAngleChange((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360 % 360);
        onSpeedChange(Math.min(200, Math.max(1, (dist / (35 * SCALE)) * 100)));
      } else {
        onActiveBallIdChange(null);
        draggingItemRef.current = 'pan';
        lastPanRef.current = {
          x: clientX,
          y: clientY,
          scrollL: viewportRef.current?.scrollLeft || 0,
          scrollT: viewportRef.current?.scrollTop || 0,
        };
      }
    }
  };

  const handleMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);
    if (coords) onHoverPosChange(coords);

    const draggingItem = draggingItemRef.current;
    if (!draggingItem || isPlaying) return;

    if (draggingItem === 'pan') {
      if (viewportRef.current) {
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        viewportRef.current.scrollLeft =
          lastPanRef.current.scrollL - (clientX - lastPanRef.current.x);
        viewportRef.current.scrollTop =
          lastPanRef.current.scrollT - (clientY - lastPanRef.current.y);
      }
      return;
    }

    if (!coords) return;
    const { x, y } = coords;

    if (draggingItem === 'draw' && currentPath) {
      onCurrentPathChange({
        ...currentPath,
        points:
          currentPath.type === 'straight' && currentPath.points.length > 0
            ? [currentPath.points[0], { x, y }]
            : [...currentPath.points, { x, y }],
      });
      return;
    }

    let cx = Math.max(BALL_RADIUS, Math.min(FIELD_WIDTH - BALL_RADIUS, x));
    let cy = Math.max(BALL_RADIUS, Math.min(FIELD_HEIGHT - BALL_RADIUS, y));

    if (['blue', 'red', 'yellow', 'black'].includes(draggingItem)) {
      const activeColor = draggingItem as 'blue' | 'red' | 'yellow' | 'black';
      const otherBalls = Object.values(balls).filter((b) => b.id !== activeColor);

      // Relax ball coordinates to prevent overlaps
      for (let iter = 0; iter < 3; iter++) {
        for (const b of otherBalls) {
          const dx = cx - b.x;
          const dy = cy - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = 2.0 * BALL_RADIUS;
          if (dist < minDist && dist > 0.0001) {
            const overlap = minDist - dist;
            cx += (dx / dist) * overlap;
            cy += (dy / dist) * overlap;
          }
        }
      }

      cx = Math.max(BALL_RADIUS, Math.min(FIELD_WIDTH - BALL_RADIUS, cx));
      cy = Math.max(BALL_RADIUS, Math.min(FIELD_HEIGHT - BALL_RADIUS, cy));

      // Trigger standard ball update
      const updatedBalls = {
        ...balls,
        [activeColor]: { ...balls[activeColor], x: cx, y: cy },
      };
      onBallsChange(updatedBalls);
    } else if (draggingItem === 'ghost' && !cleanFeed) {
      const activeBall = balls[selectedBall];
      let closestBall: Ball | null = null;
      let minDist = Infinity;
      const otherBalls = Object.values(balls).filter(
        (b) => b.id !== selectedBall && !isBallDocked(b)
      );

      for (const b of otherBalls) {
        const dist = Math.sqrt((x - b.x) ** 2 + (y - b.y) ** 2);
        if (dist < minDist) {
          minDist = dist;
          closestBall = b;
        }
      }

      if (closestBall && minDist < DISPLAY_RADIUS * 8) {
        const bdx = x - closestBall.x;
        const bdy = y - closestBall.y;
        const bdist = Math.sqrt(bdx * bdx + bdy * bdy);
        if (bdist > 0) {
          const ghostX = closestBall.x + (bdx / bdist) * 2 * BALL_RADIUS;
          const ghostY = closestBall.y + (bdy / bdist) * 2 * BALL_RADIUS;
          const adx = ghostX - activeBall.x;
          const ady = ghostY - activeBall.y;
          onAngleChange((Math.atan2(ady, adx) * 180) / Math.PI + 90 + 360 % 360);
        }
      } else {
        const dx = x - activeBall.x;
        const dy = y - activeBall.y;
        onAngleChange((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360 % 360);
      }
    }
  };

  const handleMouseUp = () => {
    const draggingItem = draggingItemRef.current;
    if (draggingItem === 'draw' && currentPath) {
      onDrawingsChange([...drawings, currentPath]);
      onCurrentPathChange(null);
    }
    draggingItemRef.current = null;
  };

  const handleMouseLeave = () => {
    onHoverPosChange(null);
    handleMouseUp();
  };

  return (
    <div
      ref={viewportRef}
      className="relative w-full h-full overflow-auto flex items-center justify-center select-none"
    >
      <canvas
        ref={canvasRef}
        width={FIELD_WIDTH}
        height={FIELD_HEIGHT}
        style={{
          width: zoom === 1 ? '100%' : `${FIELD_WIDTH * zoom}px`,
          height: zoom === 1 ? 'auto' : `${FIELD_HEIGHT * zoom}px`,
          maxWidth: zoom === 1 ? `${FIELD_WIDTH}px` : 'none',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          borderRadius: '1.5rem',
          cursor: drawMode ? 'crosshair' : 'default',
        }}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleMouseUp}
      />
    </div>
  );
}
