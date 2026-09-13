export type BallId = 'r1' | 'w2' | 'r3' | 'w4' | 'r5' | 'w6' | 'r7' | 'w8' | 'r9' | 'w10';

export interface TutorialBallScore {
  gate1: boolean;
  gate2: boolean;
  gate3: boolean;
  finished: boolean;
}

export interface DemoAction {
  label: string;
  ballId: BallId;
  angle: number;
  dist: number;
  isSpark?: boolean;
  sparkTarget?: BallId;
  preDelayMs?: number;
}

export interface TutorialStep {
  id: number;
  title: string;
  badge: string;
  text: string;
  narration: string;
  camera: {
    position: [number, number, number];
    target: [number, number, number];
  };
  balls: Record<BallId, { x: number; z: number }>;
  initialScores?: Partial<Record<BallId, Partial<TutorialBallScore>>>;
  activeBallId?: BallId;
  aimAngle?: number;
  demoActions?: DemoAction[];
  demonstration?: {
    ballId: BallId;
    angle: number;
    speed: number;
    dist: number;
    isSpark?: boolean;
    sparkTarget?: BallId;
  };
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 1,
    title: "1. Court Layout, Teams & Order of Play",
    badge: "Basics & Layout",
    text: "Gateball is a fast-paced tactical sport played on a 20m × 15m court. Two teams of five compete: Red Team plays odd balls (1, 3, 5, 7, 9) and White Team plays even balls (2, 4, 6, 8, 10). Turns alternate strictly from Ball 1 to Ball 10. The match lasts 30 minutes, and the team with the highest combined score wins.",
    narration: "Welcome to Gateball 3D! Gateball is played on a 20 by 15 meter court between Red and White teams. Red plays odd balls, White plays even balls, and turns alternate strictly from Ball 1 through Ball 10.",
    camera: {
      position: [-16, 14, 0],
      target: [0, 0, 0]
    },
    balls: {
      r1: { x: 7.5, z: -8.0 },
      w2: { x: 9.0, z: -5.5 },
      r3: { x: 9.0, z: -5.0 },
      w4: { x: 9.0, z: -4.5 },
      r5: { x: 9.0, z: -4.0 },
      w6: { x: 9.0, z: -3.5 },
      r7: { x: 9.0, z: -3.0 },
      w8: { x: 9.0, z: -2.5 },
      r9: { x: 9.0, z: -2.0 },
      w10: { x: 9.0, z: -1.5 }
    },
    activeBallId: 'r1',
    aimAngle: 270
  },
  {
    id: 2,
    title: "2. Passing Gate 1 & Continuous Stroke",
    badge: "Gate 1 + Extra Stroke",
    text: "Every ball begins in the Start Area and must clear Gate 1 (from East to West) to enter the inner court. Successfully passing Gate 1 scores 1 point and awards an immediate CONTINUOUS STROKE! The striker immediately takes this bonus stroke from where the ball settled to advance toward Gate 2.",
    narration: "Every ball begins in the Start Area and must pass through Gate 1. Successfully clearing Gate 1 scores one point and immediately earns a continuous bonus stroke! Watch Ball 1 clear Gate 1 and then take its continuation stroke toward Gate 2.",
    camera: {
      position: [7.5, 5.0, -12.0],
      target: [3.5, 0, -8.0]
    },
    balls: {
      r1: { x: 7.5, z: -8.0 },
      w2: { x: 9.0, z: -5.5 },
      r3: { x: 9.0, z: -5.0 },
      w4: { x: 9.0, z: -4.5 },
      r5: { x: 9.0, z: -4.0 },
      w6: { x: 9.0, z: -3.5 },
      r7: { x: 9.0, z: -3.0 },
      w8: { x: 9.0, z: -2.5 },
      r9: { x: 9.0, z: -2.0 },
      w10: { x: 9.0, z: -1.5 }
    },
    initialScores: {
      r1: { gate1: false, gate2: false, gate3: false, finished: false }
    },
    activeBallId: 'r1',
    aimAngle: 270,
    demoActions: [
      {
        label: "Start Stroke: Passing Gate 1",
        ballId: 'r1',
        angle: 270,
        dist: 5.8,
        preDelayMs: 2000
      },
      {
        label: "Continuation Stroke toward Gate 2",
        ballId: 'r1',
        angle: 220,
        dist: 4.8,
        preDelayMs: 1800
      }
    ]
  },
  {
    id: 3,
    title: "3. Gate Circuit: Gate 2 Pass & Continuous Stroke",
    badge: "Gate 2 Circuit",
    text: "After Gate 1, balls must follow the official circuit to Gate 2 near Corner 2. Gate 2 must be passed strictly from South to North. Clearing Gate 2 scores 1 point and awards a CONTINUOUS STROKE, allowing the ball to immediately advance across Line 3 toward Gate 3!",
    narration: "Next in the circuit is Gate 2 near Corner 2. It must be passed from South to North. Passing Gate 2 scores another point and earns a continuous stroke to advance toward Gate 3.",
    camera: {
      position: [-8.5, 6.0, -2.5],
      target: [-5.5, 0, 2.0]
    },
    balls: {
      r1: { x: -5.5, z: -1.5 },
      w2: { x: 2.5, z: -8.0 },
      r3: { x: 9.0, z: -5.0 },
      w4: { x: 9.0, z: -4.5 },
      r5: { x: 9.0, z: -4.0 },
      w6: { x: 9.0, z: -3.5 },
      r7: { x: 9.0, z: -3.0 },
      w8: { x: 9.0, z: -2.5 },
      r9: { x: 9.0, z: -2.0 },
      w10: { x: 9.0, z: -1.5 }
    },
    initialScores: {
      r1: { gate1: true, gate2: false, gate3: false, finished: false }
    },
    activeBallId: 'r1',
    aimAngle: 180,
    demoActions: [
      {
        label: "Passing Gate 2 (South to North)",
        ballId: 'r1',
        angle: 180,
        dist: 5.2,
        preDelayMs: 2000
      },
      {
        label: "Continuation Stroke across to Gate 3",
        ballId: 'r1',
        angle: 90,
        dist: 4.5,
        preDelayMs: 1800
      }
    ]
  },
  {
    id: 4,
    title: "4. Gate Circuit: Gate 3 Pass & Continuous Stroke",
    badge: "Gate 3 Circuit",
    text: "The third gate in the sequence is Gate 3 near Corner 3 and 4. Gate 3 must be passed from North to South. Passing Gate 3 scores 1 point and awards a CONTINUOUS STROKE, enabling the player to position the ball for a shot at the central Goal Pole!",
    narration: "The final gate in the circuit is Gate 3. It must be passed from North to South. Passing Gate 3 scores a point and awards a continuous stroke to aim for the central Goal Pole.",
    camera: {
      position: [8.5, 5.5, 5.0],
      target: [5.5, 0, 0.0]
    },
    balls: {
      r1: { x: 5.5, z: 2.5 },
      w2: { x: -5.5, z: 5.0 },
      r3: { x: 9.0, z: -5.0 },
      w4: { x: 9.0, z: -4.5 },
      r5: { x: 9.0, z: -4.0 },
      w6: { x: 9.0, z: -3.5 },
      r7: { x: 9.0, z: -3.0 },
      w8: { x: 9.0, z: -2.5 },
      r9: { x: 9.0, z: -2.0 },
      w10: { x: 9.0, z: -1.5 }
    },
    initialScores: {
      r1: { gate1: true, gate2: true, gate3: false, finished: false }
    },
    activeBallId: 'r1',
    aimAngle: 0,
    demoActions: [
      {
        label: "Passing Gate 3 (North to South)",
        ballId: 'r1',
        angle: 0,
        dist: 5.0,
        preDelayMs: 2000
      },
      {
        label: "Continuation Stroke toward Goal Pole",
        ballId: 'r1',
        angle: 250,
        dist: 4.2,
        preDelayMs: 1800
      }
    ]
  },
  {
    id: 5,
    title: "5. Touch Shot, Spark & Spark Continuation",
    badge: "Touch & Spark",
    text: "When an in-ball strikes another ball, a TOUCH occurs! The stroker gains the right to SPARK: the player steps on their striker ball, places the touched ball against it, and strikes to propel the target ball away. Completing the spark awards a CONTINUOUS STROKE to continue the turn!",
    narration: "When your ball hits another ball, a Touch occurs! You earn the right to Spark. You pin your ball under your foot, place the target ball against it, and strike to send the target ball across the court. Completing the spark awards a continuous stroke!",
    camera: {
      position: [-1.0, 5.5, 4.5],
      target: [-1.0, 0, 0.0]
    },
    balls: {
      r1: { x: -3.0, z: 0.0 },
      w2: { x: 0.5, z: 0.0 },
      r3: { x: 9.0, z: -5.0 },
      w4: { x: 9.0, z: -4.5 },
      r5: { x: 9.0, z: -4.0 },
      w6: { x: 9.0, z: -3.5 },
      r7: { x: 9.0, z: -3.0 },
      w8: { x: 9.0, z: -2.5 },
      r9: { x: 9.0, z: -2.0 },
      w10: { x: 9.0, z: -1.5 }
    },
    initialScores: {
      r1: { gate1: true, gate2: true, gate3: false, finished: false },
      w2: { gate1: true, gate2: false, gate3: false, finished: false }
    },
    activeBallId: 'r1',
    aimAngle: 90,
    demoActions: [
      {
        label: "Touch Shot: Striking Ball 2",
        ballId: 'r1',
        angle: 90,
        dist: 4.2,
        preDelayMs: 2000
      },
      {
        label: "The Spark: Propelling Ball 2",
        ballId: 'r1',
        angle: 45,
        dist: 6.5,
        isSpark: true,
        sparkTarget: 'w2',
        preDelayMs: 1800
      },
      {
        label: "Spark Continuation Stroke",
        ballId: 'r1',
        angle: 180,
        dist: 3.5,
        preDelayMs: 1800
      }
    ]
  },
  {
    id: 6,
    title: "6. Gate & Touch Combo (2 Continuous Strokes)",
    badge: "2 Extra Strokes",
    text: "Official WGU Rule (Article 12 Clause 3): If a striker clears a gate AND touches another ball with the same stroke, the player sparks the touched ball first. Once the spark is completed, the player is awarded TWO CONTINUOUS STROKES (1 for gate + 1 for spark)!",
    narration: "Under official Gateball rules, if you clear a gate and touch another ball with the same stroke, you spark the touched ball first, and then receive two continuous strokes! Watch Ball 1 execute this powerful combination.",
    camera: {
      position: [-8.0, 5.0, 0.5],
      target: [-5.5, 0, 2.0]
    },
    balls: {
      r1: { x: -5.5, z: 0.5 },
      w4: { x: -5.5, z: 2.8 }, // sitting just past Gate 2
      w2: { x: 2.5, z: -8.0 },
      r3: { x: 9.0, z: -5.0 },
      r5: { x: 9.0, z: -4.0 },
      w6: { x: 9.0, z: -3.5 },
      r7: { x: 9.0, z: -3.0 },
      w8: { x: 9.0, z: -2.5 },
      r9: { x: 9.0, z: -2.0 },
      w10: { x: 9.0, z: -1.5 }
    },
    initialScores: {
      r1: { gate1: true, gate2: false, gate3: false, finished: false },
      w4: { gate1: true, gate2: false, gate3: false, finished: false }
    },
    activeBallId: 'r1',
    aimAngle: 180,
    demoActions: [
      {
        label: "Combo Stroke: Gate 2 Pass & Touch on Ball 4",
        ballId: 'r1',
        angle: 180,
        dist: 3.8,
        preDelayMs: 2000
      },
      {
        label: "Spark Ball 4 away",
        ballId: 'r1',
        angle: 270,
        dist: 5.5,
        isSpark: true,
        sparkTarget: 'w4',
        preDelayMs: 1800
      },
      {
        label: "Continuation Stroke 1 (of 2)",
        ballId: 'r1',
        angle: 90,
        dist: 3.5,
        preDelayMs: 1800
      },
      {
        label: "Continuation Stroke 2 (of 2)",
        ballId: 'r1',
        angle: 45,
        dist: 3.0,
        preDelayMs: 1800
      }
    ]
  },
  {
    id: 7,
    title: "7. Finishing (Agari) at the Goal-Pole",
    badge: "Goal-Pole Finish",
    text: "After successfully passing Gate 1, Gate 2, and Gate 3 in sequence, a ball can strike the central Goal-Pole to score AGARI (Finish). Finishing awards 2 bonus points (totaling 5 points for that ball). The finished ball is retired from the court.",
    narration: "After clearing all three gates in order, hitting the central Goal Pole achieves Agari, or Finish! This awards two extra points and retires the ball from the court. Now you are ready to play Gateball!",
    camera: {
      position: [3.5, 4.2, 3.5],
      target: [0, 0.2, 0]
    },
    balls: {
      r1: { x: 0.0, z: -2.8 },
      w2: { x: -6.0, z: 4.0 },
      r3: { x: 9.0, z: -5.0 },
      w4: { x: 9.0, z: -4.5 },
      r5: { x: 9.0, z: -4.0 },
      w6: { x: 9.0, z: -3.5 },
      r7: { x: 9.0, z: -3.0 },
      w8: { x: 9.0, z: -2.5 },
      r9: { x: 9.0, z: -2.0 },
      w10: { x: 9.0, z: -1.5 }
    },
    initialScores: {
      r1: { gate1: true, gate2: true, gate3: true, finished: false }
    },
    activeBallId: 'r1',
    aimAngle: 180, // Facing South (+Z), straight at Goal Pole at (0, 0) from (0, -2.8)
    demoActions: [
      {
        label: "Agari Stroke: Striking the Goal-Pole",
        ballId: 'r1',
        angle: 180,
        dist: 3.2,
        preDelayMs: 2000
      }
    ]
  }
];
