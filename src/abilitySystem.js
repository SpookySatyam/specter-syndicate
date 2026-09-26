/**
 * abilitySystem.js — Extensible Ability System Architecture for Specter Syndicate.
 *
 * Supports:
 * - Loadout mapping (Slot 1, Slot 2)
 * - Reusable Ability Registry (Spectral Veil, Shuriken, Elemental Burst, Phase Dash, Echo Decoy)
 * - State tracking (charges, cooldowns, active duration, break conditions)
 * - Integration with gameState & playerState
 */

import gameState from './gameState';
import playerState from './playerState';

// Ability Definitions Registry
export const ABILITY_REGISTRY = {
  spectral_veil: {
    id: 'spectral_veil',
    name: 'SPECTRAL VEIL',
    hotkey: 'Q',
    key: 'q',
    maxCharges: 2,
    cooldown: 0,
    duration: 5.0,
    breaksOnAttack: true,
    description: 'Temporary spectral stealth. Disables enemy detection cone & Guardian target lock.',
    onActivate() {
      playerState.spectralVeilActive = true;
      gameState.spectralVeilActive = true;
      gameState.addScore(100, 'SPECTRAL VEIL');
    },
    onDeactivate() {
      playerState.spectralVeilActive = false;
      gameState.spectralVeilActive = false;
    },
  },
  // Future Expansion Ability Schemas (architecture foundation)
  shuriken: {
    id: 'shuriken',
    name: 'SHURIKEN',
    hotkey: 'E',
    key: 'e',
    maxCharges: 3,
    cooldown: 2.0,
    duration: 0,
    breaksOnAttack: false,
    description: 'Precision ranged projectile attack.',
  },
  elemental_burst: {
    id: 'elemental_burst',
    name: 'ELEMENTAL BURST',
    hotkey: 'R',
    key: 'r',
    maxCharges: 2,
    cooldown: 10.0,
    duration: 3.0,
    breaksOnAttack: false,
    description: 'Area environmental effect causing enemy confusion.',
  },
  phase_dash: {
    id: 'phase_dash',
    name: 'PHASE DASH',
    hotkey: 'SHIFT',
    key: 'shift',
    maxCharges: 2,
    cooldown: 4.0,
    duration: 0.5,
    breaksOnAttack: false,
    description: 'Rapid movement blink dodging enemy attacks.',
  },
  echo_decoy: {
    id: 'echo_decoy',
    name: 'ECHO DECOY',
    hotkey: 'C',
    key: 'c',
    maxCharges: 1,
    cooldown: 15.0,
    duration: 6.0,
    breaksOnAttack: false,
    description: 'Deploy holographic decoy that attracts enemy focus.',
  }
};

class AbilitySystem {
  constructor() {
    // 2 Equipped slots foundation
    this.slots = {
      slot1: 'spectral_veil',
      slot2: null,
    };

    // Active runtime state
    this.state = {};
    this.init();
  }

  init() {
    this.state = {
      slot1: this.createSlotState(this.slots.slot1),
      slot2: this.createSlotState(this.slots.slot2),
    };
  }

  createSlotState(abilityId) {
    if (!abilityId || !ABILITY_REGISTRY[abilityId]) return null;
    const def = ABILITY_REGISTRY[abilityId];
    return {
      def,
      charges: def.maxCharges,
      cooldownTimer: 0,
      activeTimer: 0,
      isActive: false,
    };
  }

  activateSlot(slotKey) {
    const slot = this.state[slotKey];
    if (!slot || !slot.def) return false;
    if (gameState.gameOver || gameState.victory || gameState.mapOpen) return false;

    // Check availability
    if (slot.isActive) return false;
    if (slot.charges <= 0) return false;
    if (slot.cooldownTimer > 0) return false;

    // Consume charge & activate
    slot.charges--;
    slot.isActive = true;
    slot.activeTimer = slot.def.duration;
    if (slot.def.cooldown > 0) {
      slot.cooldownTimer = slot.def.cooldown;
    }

    if (slot.def.onActivate) {
      slot.def.onActivate();
    }

    gameState.notify();
    return true;
  }

  breakActiveAbilitiesOnAttack() {
    let brokenAny = false;
    for (const slotKey in this.state) {
      const slot = this.state[slotKey];
      if (slot && slot.isActive && slot.def.breaksOnAttack) {
        slot.isActive = false;
        slot.activeTimer = 0;
        if (slot.def.onDeactivate) {
          slot.def.onDeactivate();
        }
        brokenAny = true;
      }
    }
    if (brokenAny) {
      gameState.addScore(0, 'VEIL BROKEN BY ATTACK');
      gameState.notify();
    }
  }

  update(delta) {
    let stateChanged = false;
    for (const slotKey in this.state) {
      const slot = this.state[slotKey];
      if (!slot || !slot.def) continue;

      if (slot.cooldownTimer > 0) {
        slot.cooldownTimer = Math.max(0, slot.cooldownTimer - delta);
        stateChanged = true;
      }

      if (slot.isActive) {
        if (slot.def.duration > 0) {
          slot.activeTimer -= delta;
          if (slot.activeTimer <= 0) {
            slot.isActive = false;
            slot.activeTimer = 0;
            if (slot.def.onDeactivate) {
              slot.def.onDeactivate();
            }
          }
          stateChanged = true;
        }
      }
    }

    if (stateChanged) {
      gameState.notify();
    }
  }

  reset() {
    this.init();
    playerState.spectralVeilActive = false;
    gameState.spectralVeilActive = false;
  }
}

const abilitySystem = new AbilitySystem();
if (typeof window !== 'undefined') {
  window.abilitySystem = abilitySystem;
}

export default abilitySystem;
