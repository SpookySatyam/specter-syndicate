/**
 * playerState.js — Shared mutable singleton for cross-system reads.
 *
 * WHY THIS PATTERN:
 * React refs are component-scoped and awkward to share across unrelated
 * systems (AI, damage, HUD). A plain mutable object living outside React
 * gives any importer zero-cost, zero-rerender access to the player's
 * live position and mode. This is the standard R3F pattern for ECS-style
 * shared state (see Pmndrs "tunnel" / zustand patterns).
 *
 * Usage:
 *   import playerState from './playerState';
 *   const { x, y, z } = playerState.position;  // always current
 *   const mode = playerState.mode;               // 'red' | 'blue' | 'purple'
 */

const playerState = {
  position: { x: 0, y: 0.5, z: 0 },
  mode: 'purple',
  speedMult: 1.0,
  damageResist: 0.15,
  isJumping: false,
  spectralVeilActive: false,

  /**
   * Called by Hunter.jsx on successful jump-attack: give the player a
   * small upward bounce so consecutive stomps feel responsive.
   * Player.jsx reads this each frame and zeroes it after applying.
   */
  bounceVelocity: 0,
};

if (typeof window !== 'undefined') {
  window.playerState = playerState;
}

export default playerState;
