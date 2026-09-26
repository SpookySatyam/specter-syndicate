/**
 * hunterState.js — Shared mutable singleton for Hunter detection results.
 *
 * Each Hunter writes its detection boolean to `detections[id]` every frame.
 * The damage system (Prompt 5) can call `isPlayerDetected()` to check if
 * ANY hunter currently has the player inside its spotlight cone.
 *
 * Same pattern as playerState.js — plain mutable object, zero re-renders.
 */

const hunterState = {
  /** Map of hunterId → boolean (is that hunter currently illuminating the player?) */
  detections: {},

  /** Map of hunterId → boolean (is that hunter currently physically touching the player?) */
  contacts: {},

  /** Map of hunterId → {x: number, z: number} */
  positions: {},

  /** Map of hunterId → string ('patrol' | 'searching' | 'alert' | 'defeated') */
  states: {},

  /** Map of hunterId → boolean (should cast shadow) */
  shadowCasters: {},

  /** Update hunter position and state live */
  updateHunterState(id, pos, state) {
    if (!this.positions[id]) {
      this.positions[id] = { x: pos.x, z: pos.z };
    } else {
      this.positions[id].x = pos.x;
      this.positions[id].z = pos.z;
    }
    this.states[id] = state;
  },

  /** Remove hunter from registry on unmount */
  removeHunter(id) {
    delete this.detections[id];
    delete this.contacts[id];
    delete this.positions[id];
    delete this.states[id];
    delete this.shadowCasters[id];
  },

  /** Returns number of active non-defeated hunters within radius of player */
  getNearbyHunterCount(playerPos, radius) {
    let count = 0;
    const rSq = radius * radius;
    for (const id in this.positions) {
      if (this.states[id] === 'defeated') continue;
      const p = this.positions[id];
      const dx = p.x - playerPos.x;
      const dz = p.z - playerPos.z;
      if (dx * dx + dz * dz <= rSq) {
        count++;
      }
    }
    return count;
  },

  /** Convenience: returns true if ANY hunter currently sees the player */
  isPlayerDetected() {
    for (const id in this.detections) {
      if (this.detections[id]) return true;
    }
    return false;
  },

  /** Convenience: returns true if ANY hunter is touching the player */
  isPlayerInContact() {
    for (const id in this.contacts) {
      if (this.contacts[id]) return true;
    }
    return false;
  },
};

export default hunterState;

