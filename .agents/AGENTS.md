# Croquet Studio Project Rules

This document outlines the architectural constraints, animation timing rules, and physical collision standards for the croquet mallet and ball visualizer.

## 1. Mallet Swing Animation & Timing Guardrails
To maintain realistic movement and prevent visual bugs or missed collisions, all mallet swing animations must follow these constraints:

- **Delta Capping**: React state changes (such as starting a swing) can cause frame rate stutters, resulting in a very large `delta` in the first frame of the animation loop. Always cap the time step (`delta`) to a maximum of `0.03` seconds (30ms) before advancing the animation clock to prevent the animation from skipping phases.
  ```typescript
  const dt = Math.min(delta, 0.03);
  swingTimeRef.current += dt;
  ```
- **Animation Phase Durations**: The swing animation consists of five distinct, sequential phases:
  - **Backswing**: `0.4` seconds. Rotates backward to a positive angle (up to `+30°` or `Math.PI / 6`).
  - **Downswing**: `0.08` seconds. Rapidly accelerates forward back to `0°`.
  - **Impact Moment**: Exactly at `t = 0.48` seconds.
  - **Follow-through**: `0.17` seconds. Continues forward to a negative angle (up to `-15°` or `-Math.PI / 12`).
  - **Return**: `0.15` seconds. Returns smoothly to the vertical stance.
  - **Total Swing Duration**: `0.8` seconds.
- **Consistent Impact Detection**: When checking if the swing has reached or passed the impact moment, always use the capped delta step (`dt`) in the condition to ensure consistency:
  ```typescript
  if (swingTimeRef.current - dt < impactTime) {
    onImpact();
  }
  ```

## 2. Interactive Controls & Auto-Snapping
To make mallet alignment intuitive and prevent alignment errors:
- **Auto-Orientation on Release**: When the user finishes dragging the mallet and releases it within `1.5` yards of any ball, the mallet's Y-rotation must automatically snap to point directly at that ball's center.
- **Auto-Inversion for Symmetrical Hitting**: Croquet mallet heads are physically symmetrical. If the mallet is aligned such that the target ball is positioned behind the mallet (`z_local < 0` in the mallet's local coordinate space), the physics engine must automatically invert the reference frame by `180°` (`+ Math.PI`) to allow a correct strike with the opposite face.

## 3. Collision and Hitting Zone Physics
- **Hitting Zone Tolerances**: To ensure reliable strikes when the mallet is visually aligned, use the following local hitting zone dimensions:
  - **Depth (Z-axis)**: From `headW / 2 - 0.2` yards (allowing 0.2 yards of overlap due to collision boundaries) to `headW / 2 + ballRadius + 0.45` yards (a generous forward hitting zone).
  - **Lateral (X-axis)**: Within `headD / 2 + 0.3` yards on either side of the mallet head.
- **Solid Object Restrictions**: The mallet head must behave as a solid object and be prevented from overlapping hoops, the center peg, or balls. Use a multi-circle bounding representation (e.g., 3 circles distributed along the mallet head's long axis) to resolve overlaps dynamically in a relaxation loop during dragging and rotation.

## 4. Mallet Aim Integration & Guide Lines
- **Aim-to-Spot Snapping**: If the mallet is selected and in striking range of a ball (within 2.0 yards), clicking any point on the court represents aiming. The system must automatically rotate the mallet to point from the ball's center to the target spot, and position the mallet exactly `0.53` yards behind the ball (perfect stance offset with a realistic visual gap) along that line of aim.
- **Projected Hitting Guide Line**: When the mallet is selected and in striking range of a ball, render a dashed aiming line in the 3D Canvas extending `12` yards from the ball's center in the direction of the mallet's heading (adjusted for symmetrical hitting). The line color must match the target ball's high-fidelity color to provide clear, immediate visual feedback of the shot path.
