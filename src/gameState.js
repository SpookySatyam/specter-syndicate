/**
 * gameState.js — Reactive bridge between the R3F game loop and the React DOM HUD.
 *
 * The game loop (Player.jsx useFrame) writes to this singleton at a throttled
 * rate. The HUD subscribes via gameState.subscribe() and re-renders only when
 * notified — keeping the hot path (useFrame) allocation-free while letting
 * React DOM update at a sane ~10-15fps cadence.
 */

import abilitySystem from './abilitySystem';

const listeners = new Set();

const gameState = {
  health: 100,
  maxHealth: 100,
  healthPacks: [true, true, true, true],
  healPulse: 0,
  survivalTime: 0,
  detected: false,
  gameOver: false,
  victory: false,
  coreCollected: false,
  spectralVeilActive: false,
  mode: 'purple',
  modeColor: '#a63bff',
  modeName: 'Stealth',
  syncedSurvivalTime: 0,
  hunterCount: 3,
  level: 1,
  levelComplete: false,
  hasMoved: false,
  hasJumped: false,

  // UI & Overlay Panels (Single Source of Truth)
  briefingOpen: true,
  mapOpen: false,
  missionResultsOpen: false,

  // Fog of War / Exploration
  discoveredGrid: new Set(),

  discoverTile(x, z) {
    const gx = Math.floor((x + 20) / 2);
    const gz = Math.floor((z + 20) / 2);
    const key = `${gx},${gz}`;
    if (!this.discoveredGrid.has(key)) {
      this.discoveredGrid.add(key);
      this.notify();
    }
  },

  toggleBriefing() {
    this.briefingOpen = !this.briefingOpen;
    this.notify();
  },

  toggleMap() {
    this.mapOpen = !this.mapOpen;
    this.notify();
  },

  closeOverlays() {
    if (this.mapOpen) {
      this.mapOpen = false;
      this.notify();
      return true;
    }
    if (this.briefingOpen) {
      this.briefingOpen = false;
      this.notify();
      return true;
    }
    return false;
  },

  // Detection System
  detectionLevel: 0, // 0 to 100%
  detectedPenaltyApplied: false,
  alarmPenaltyApplied: false,

  // Supply Core & Ammunition System
  coreReached: false,
  ammoCollected: false,
  coreCollected: false,
  ammo: 0,
  maxAmmo: 12,
  hasAmmo: false,
  isInteracting: false,
  interactionProgress: 0, // 0.0 to 1.0
  interactionText: '',

  // Guardian Boss State (Upgraded to 300 HP)
  guardianHealth: 300,
  guardianMaxHealth: 300,
  guardianDefeated: false,
  guardianVulnerable: false,
  guardianPhase: 1,

  pickupAmmo(amount = 12) {
    this.ammo = amount;
    this.maxAmmo = amount;
    this.hasAmmo = true;
    this.coreReached = true;
    this.ammoCollected = true;
    this.coreCollected = true;
    this.guardianVulnerable = true;
    this.isInteracting = false;
    this.interactionProgress = 0;
    this.interactionText = '';
    this.addScore(150, 'AMMUNITION ACQUIRED');
    this.completeObjective(2); // Objective 2: Collect Ammunition
    this.notify();
  },

  useAmmo() {
    if (this.ammo > 0) {
      this.ammo--;
      this.ammoFired = (this.ammoFired || 0) + 1;
      this.notify();
      return true;
    }
    return false;
  },

  // Score & Combat Tracking
  score: 0,
  guardsEliminated: 0,
  stealthKills: 0,
  airAssassinations: 0,
  detectionCount: 0,
  alarmCount: 0,
  ammoFired: 0,
  scorePopups: [],

  addScore(points, text) {
    if (points < 0) {
      this.score = Math.max(0, this.score + points);
    } else {
      this.score += points;
    }
    const popup = { id: Date.now() + Math.random(), text, points, time: Date.now() };
    this.scorePopups.push(popup);
    if (this.scorePopups.length > 5) this.scorePopups.shift();
    this.notify();
  },

  getDetectionStatus() {
    if (this.detectionLevel >= 80) return 'DETECTED';
    if (this.detectionLevel >= 50) return 'ALERT';
    if (this.detectionLevel >= 20) return 'SUSPICIOUS';
    return 'UNDETECTED';
  },

  // Mission Objective System
  currentObjectiveStep: 1, // 1: Reach Supply Core, 2: Collect Ammunition, 3: Eliminate Guardian, 4: Reach Extraction
  objectivesCompleted: { 1: false, 2: false, 3: false, 4: false },

  setObjectiveStep(step) {
    this.currentObjectiveStep = step;
    for (let i = 1; i < step; i++) {
      this.objectivesCompleted[i] = true;
    }
    this.notify();
  },

  completeObjective(step) {
    this.objectivesCompleted[step] = true;
    if (this.currentObjectiveStep <= step) {
      this.currentObjectiveStep = step + 1;
    }
    this.notify();
  },

  /** Subscribe a callback; returns an unsubscribe function. */
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Notify all subscribers (called by Player.jsx on throttled updates). */
  notify() {
    listeners.forEach((fn) => fn());
  },

  /** Full reset — called on restart before Scene remounts. */
  reset(full = true) {
    this.health = 100;
    this.healthPacks = [true, true, true, true];
    this.healPulse = 0;
    this.survivalTime = 0;
    this.detected = false;
    this.gameOver = false;
    this.victory = false;
    this.coreReached = false;
    this.ammoCollected = false;
    this.coreCollected = false;
    this.spectralVeilActive = false;
    abilitySystem.reset();
    this.levelComplete = false;
    this.hasMoved = false;
    this.hasJumped = false;
    this.detectionLevel = 0;
    this.detectedPenaltyApplied = false;
    this.alarmPenaltyApplied = false;
    this.briefingOpen = true;
    this.mapOpen = false;
    this.missionResultsOpen = false;
    this.discoveredGrid.clear();
    this.ammo = 0;
    this.maxAmmo = 12;
    this.hasAmmo = false;
    this.isInteracting = false;
    this.interactionProgress = 0;
    this.interactionText = '';
    this.guardianHealth = 300;
    this.guardianMaxHealth = 300;
    this.guardianDefeated = false;
    this.guardianVulnerable = false;
    this.guardianPhase = 1;
    this.score = 0;
    this.guardsEliminated = 0;
    this.stealthKills = 0;
    this.airAssassinations = 0;
    this.detectionCount = 0;
    this.alarmCount = 0;
    this.ammoFired = 0;
    this.scorePopups = [];
    this.currentObjectiveStep = 1;
    this.objectivesCompleted = { 1: false, 2: false, 3: false, 4: false };
    if (full) {
      this.mode = 'purple';
      this.modeColor = '#a63bff';
      this.modeName = 'Stealth';
      this.level = 1;
    }
    this.syncedSurvivalTime = 0;
    this.hunterCount = 3;
    this.notify();
  },
};

// Global, reliable window keyboard listener for UI overlay hotkeys
if (typeof window !== 'undefined') {
  window.gameState = gameState;
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return; // Prevent rapid toggling on held keys

    if (e.code === 'KeyM') {
      e.preventDefault();
      gameState.toggleMap();
    } else if (e.code === 'KeyJ') {
      e.preventDefault();
      gameState.toggleBriefing();
    } else if (e.code === 'Escape') {
      e.preventDefault();
      gameState.closeOverlays();
    }
  });
}

export default gameState;
