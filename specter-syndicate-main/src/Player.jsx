import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Ring } from '@react-three/drei';
import * as THREE from 'three';
import { initAudio, playAlert, playGameOver, playVictory, playHeartbeat } from './audio';
import useKeyboardControls from './useKeyboardControls';
import playerState from './playerState';
import hunterState from './hunterState';
import gameState from './gameState';
import abilitySystem from './abilitySystem';
import { PILLAR_RADIUS, HEALTH_PACK_POSITIONS, BOUNDS, PLAYABLE_BOUNDS, getObjectiveForLevel, checkObstacleCollision, getEscapeDirection, getPillarsForLevel, getTerrainHeight } from './levelGeometry';

// ---------------------------------------------------------------------------
// Mode definitions
// ---------------------------------------------------------------------------
const MODES = {
  '1': { key: 'red',    name: 'Aggro',   color: '#ff3b3b', speedMult: 1.2, damageResist: 0 },
  '2': { key: 'blue',   name: 'Tank',    color: '#3b9dff', speedMult: 0.9, damageResist: 0.3 },
  '3': { key: 'purple', name: 'Stealth', color: '#a63bff', speedMult: 1.0, damageResist: 0.15, special: 'shadowBlend' },
};

const MOVE_SPEED = 5;
const PLAYER_RADIUS = 0.5; // matches Sphere args
const DAMAGE_RATE = 15;    // HP per second while illuminated
const CONTACT_DAMAGE_RATE = 25; // HP per second while touched
const GROUND_Y = 0.5;     // resting height of the sphere center
const JUMP_FORCE = 7;
const GRAVITY = 18;

// Rebound constants
const STUCK_THRESHOLD = 0.1;
const HARD_STUCK_THRESHOLD = 1.5;
const REBOUND_SPEED = 1.0;
const REBOUND_DURATION = 0.15;
const GHOST_MODE_DURATION = 0.3;

const ISO_ANGLE = -Math.PI / 4;
const ISO_COS = Math.cos(ISO_ANGLE);
const ISO_SIN = Math.sin(ISO_ANGLE);

// Pre-computed collision sum — avoids per-frame addition
const COLLISION_DIST = PILLAR_RADIUS + PLAYER_RADIUS;
const COLLISION_DIST_SQ = COLLISION_DIST * COLLISION_DIST;

/**
 * Returns true if (x, z) overlaps any pillar.
 * Pure math — no allocations, no objects, safe for useFrame hot path.
 */
function collidesWithPillar(x, z, level) {
  const pillars = getPillarsForLevel(level);
  for (let i = 0; i < pillars.length; i++) {
    const px = pillars[i][0];
    const pz = pillars[i][1];
    const dx = x - px;
    const dz = z - pz;
    if (dx * dx + dz * dz < COLLISION_DIST_SQ) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Player — "Ghost"
// ---------------------------------------------------------------------------
export default function Player() {
  const groupRef = useRef();
  const meshRef = useRef();
  const ringRef = useRef();
  
  const skirtRefs = useRef([]);
  const skirtMats = useRef([]);
  const eyeMats = useRef([]);
  const armMats = useRef([]);
  const trailRefs = useRef([]);
  const trailMats = useRef([]);
  const trailPositions = useRef([...Array(4)].map(() => new THREE.Vector3(0, 0.5, 0)));
  const trailTimer = useRef(0);
  const trailIndex = useRef(0);

  const currentMode = useRef(MODES['3']); // start purple (stealth)
  const prevModeKey = useRef(MODES['3'].key);
  const pulseScale = useRef(0);
  const pulseColor = useRef(MODES['3'].color);
  const walkPhase = useRef(0);
  const keys = useKeyboardControls();

  // ---- Jump tracking (ref-only, no state) ----
  const jumpVelocity = useRef(0);
  const jumpYOffset = useRef(0);
  const isJumping = useRef(false);

  // ---- Health Packs ----
  const healthPackTimers = useRef(HEALTH_PACK_POSITIONS.map(() => 0));

  // ---- Stuck/Rebound ----
  const stuckTimer = useRef(0);
  const hardStuckTimer = useRef(0);
  const reboundDir = useRef({ x: 0, z: 0 });
  const reboundTimer = useRef(0);
  const ghostModeTimer = useRef(0);

  // ---- Health tracking (ref for per-frame precision) ----
  const health = useRef(100);

  /**
   * Throttle bookkeeping: we only push updates to gameState (triggering HUD
   * re-renders) when health changes by > 1 HP or detection status flips.
   * This keeps the useFrame hot-path free of React overhead while the HUD
   * refreshes at roughly ~10-15 fps perceptually — more than enough for a
   * health bar and "DETECTED!" label.
   */
  const lastSyncedHealth = useRef(100);
  const lastSyncedDetected = useRef(false);
  const heartbeatTimer = useRef(0);
  const levelTransitionTimer = useRef(0);
  const levelIncrementedRef = useRef(false);

  // ---- Mode-switch listener (1 / 2 / 3 keys) ----
  useEffect(() => {
    const onKeyDown = (e) => {
      initAudio(); // Unlock audio on first interaction
      const mode = MODES[e.key];
      if (!mode || gameState.gameOver) return;

      currentMode.current = mode;

      // Mutate material color directly — zero re-render cost
      if (meshRef.current) {
        meshRef.current.material.color.set(mode.color);
        meshRef.current.material.emissive.set(mode.color);
        meshRef.current.material.emissiveIntensity = 0.15;
        skirtMats.current.forEach(m => {
          if (m) {
            m.color.set(mode.color);
            m.emissive.set(mode.color);
          }
        });
        eyeMats.current.forEach(m => {
          if (m) {
            m.color.set(mode.color);
            m.emissive.set(mode.color);
          }
        });
        armMats.current.forEach(m => {
          if (m) {
            m.color.set(mode.color);
            m.emissive.set(mode.color);
          }
        });
        trailMats.current.forEach(m => {
          if (m) {
            m.color.set(mode.color);
            m.emissive.set(mode.color);
          }
        });
      }

      // Sync to shared singletons
      playerState.mode = mode.key;
      playerState.speedMult = mode.speedMult;
      playerState.damageResist = mode.damageResist;

      gameState.mode = mode.key;
      gameState.modeColor = mode.color;
      gameState.modeName = mode.name;
      gameState.notify();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // ---- Per-frame: movement + damage + visual feedback ----
  useFrame((state, delta) => {
    if (!meshRef.current || !groupRef.current) return;

    // Grab position ref early so it's available everywhere in this frame
    const pos = groupRef.current.position;

    // ---- Damage & detection ----
    const detected = hunterState.isPlayerDetected();
    const inContact = hunterState.isPlayerInContact();

    if (detected && health.current > 0) {
      const resist = currentMode.current.damageResist;
      health.current -= DAMAGE_RATE * (1 - resist) * delta;
      health.current = Math.max(0, health.current);
    }
    
    if (inContact && health.current > 0) {
      const resist = currentMode.current.damageResist;
      health.current -= CONTACT_DAMAGE_RATE * (1 - resist) * delta;
      health.current = Math.max(0, health.current);
    }
    
    // ---- Health Pack Pickup & Respawn ----
    for (let i = 0; i < HEALTH_PACK_POSITIONS.length; i++) {
      if (!gameState.healthPacks[i]) {
        // Cooldown check (20 seconds)
        if (state.clock.elapsedTime - healthPackTimers.current[i] > 20) {
          gameState.healthPacks[i] = true;
        }
      } else if (health.current > 0 && health.current < 100) {
        // Distance check
        const hx = HEALTH_PACK_POSITIONS[i][0];
        const hz = HEALTH_PACK_POSITIONS[i][1];
        const dhx = pos.x - hx;
        const dhz = pos.z - hz;
        if (dhx * dhx + dhz * dhz < 1.0) { // roughly 1.0 units distance squared
          gameState.healthPacks[i] = false;
          healthPackTimers.current[i] = state.clock.elapsedTime;
          
          health.current = Math.min(100, health.current + 25);
          gameState.healPulse = Date.now(); // flag for HUD flash
          
          // Re-use ring pulse for pickup feedback
          pulseScale.current = 0.1;
          pulseColor.current = '#00ff44';
          
          // Force an immediate HUD update
          gameState.health = health.current;
          lastSyncedHealth.current = health.current;
          gameState.notify();
        }
      }
    }

    // ---- Visual damage & Spectral Veil feedback ----
    let emColor = currentMode.current.color;
    let emInt = 0.15;
    if (playerState.spectralVeilActive) {
      emColor = '#3be2ff';
      emInt = 2.0;
      if (meshRef.current) {
        meshRef.current.material.transparent = true;
        meshRef.current.material.opacity = 0.45;
      }
    } else {
      if (meshRef.current) {
        meshRef.current.material.transparent = false;
        meshRef.current.material.opacity = 1.0;
      }
      if (inContact && health.current > 0) {
        const pulse = Math.sin(state.clock.elapsedTime * 20) * 0.5 + 0.5;
        emColor = '#ffffff';
        emInt = pulse * 2.0;
      } else if (detected && health.current > 0) {
        const pulse = Math.sin(state.clock.elapsedTime * 10) * 0.35 + 0.4;
        emColor = '#ff2200';
        emInt = pulse;
      }
    }
    
    meshRef.current.material.emissive.set(emColor);
    meshRef.current.material.emissiveIntensity = emInt;
    skirtMats.current.forEach(m => {
      if (m) {
        m.emissive.set(emColor);
        m.emissiveIntensity = emInt;
      }
    });
    eyeMats.current.forEach(m => {
      if (m) {
        m.emissive.set(emColor);
        m.emissiveIntensity = emInt * 10; // keep eyes brighter
      }
    });
    armMats.current.forEach(m => {
      if (m) {
        m.emissive.set(emColor);
        m.emissiveIntensity = emInt;
      }
    });
    trailMats.current.forEach(m => {
      if (m) {
        m.emissive.set(emColor);
        m.emissiveIntensity = emInt;
      }
    });

    // ---- Trail Logic ----
    trailTimer.current += delta;
    if (trailTimer.current > 0.05) {
      trailTimer.current = 0;
      trailPositions.current[trailIndex.current].set(pos.x, meshRef.current.position.y, pos.z);
      trailIndex.current = (trailIndex.current + 1) % 4;
    }
    for (let i = 0; i < 4; i++) {
      if (trailRefs.current[i]) {
        const age = (4 + trailIndex.current - 1 - i) % 4; // 0 = newest
        trailRefs.current[i].position.copy(trailPositions.current[i]);
        trailMats.current[i].opacity = 0.25 * (1 - age / 4);
        trailRefs.current[i].scale.setScalar(1 - age / 4);
      }
    }

    // ---- Low-health heartbeat ----
    if (health.current > 0 && health.current < 25) {
      if (state.clock.elapsedTime - heartbeatTimer.current > 1.0) {
        heartbeatTimer.current = state.clock.elapsedTime;
        playHeartbeat();
      }
    }

    // ---- Update Ability System Timers ----
    abilitySystem.update(delta);

    // ---- Throttled sync to gameState → HUD ----
    const currentSec = Math.floor(gameState.survivalTime);
    const timeChanged = currentSec !== gameState.syncedSurvivalTime;
    const healthDiff = Math.abs(lastSyncedHealth.current - health.current);
    
    const isCurrentlyDetected = detected || inContact;
    const detectedChanged = lastSyncedDetected.current !== isCurrentlyDetected;

    if (healthDiff > 1 || detectedChanged || timeChanged || health.current <= 0) {
      gameState.health = health.current;
      gameState.detected = isCurrentlyDetected;
      gameState.syncedSurvivalTime = currentSec;
      lastSyncedHealth.current = health.current;
      lastSyncedDetected.current = isCurrentlyDetected;

      if (health.current <= 0 && !gameState.gameOver) {
        gameState.gameOver = true;
        playGameOver();
      }

      if (detectedChanged && isCurrentlyDetected) {
        playAlert();
      }

      gameState.notify();
    }

    // ---- Mode switch feedback ----
    if (gameState.mode !== prevModeKey.current) {
      prevModeKey.current = gameState.mode;
      pulseScale.current = 0.1;
      pulseColor.current = gameState.modeColor;
    }

    if (pulseScale.current > 0) {
      pulseScale.current += delta * 12;
      if (pulseScale.current > 3.0) pulseScale.current = 0;
      if (ringRef.current) {
        ringRef.current.scale.set(pulseScale.current, pulseScale.current, pulseScale.current);
        ringRef.current.material.opacity = Math.max(0, 1 - (pulseScale.current / 3.0));
        ringRef.current.material.color.set(pulseColor.current);
        ringRef.current.visible = pulseScale.current > 0;
      }
    }

    // ---- Freeze movement on game over, victory, or active tactical map ----
    if (gameState.gameOver || gameState.victory || gameState.mapOpen) return;

    const input = keys.current;

    // ---- Q Key Ability 1 Trigger (Spectral Veil) ----
    if (input.justPressed.has('q')) {
      input.justPressed.delete('q');
      abilitySystem.activateSlot('slot1');
    }

    // ---- F Key Ranged / Airborne Combat Attack ----
    if (input.justPressed.has('f')) {
      input.justPressed.delete('f');
      abilitySystem.breakActiveAbilitiesOnAttack(); // Break Spectral Veil immediately on attack
      const isAirborne = isJumping.current || jumpYOffset.current > 0.3;

      // Find nearest active hunter
      let nearestHunterId = null;
      let nearestDistSq = Infinity;
      for (const hid in hunterState.positions) {
        if (hunterState.states[hid] === 'defeated') continue;
        const hp = hunterState.positions[hid];
        const hdx = hp.x - pos.x;
        const hdz = hp.z - pos.z;
        const dSq = hdx * hdx + hdz * hdz;
        if (dSq < nearestDistSq) {
          nearestDistSq = dSq;
          nearestHunterId = hid;
        }
      }

      if (nearestHunterId && nearestDistSq <= (isAirborne ? 16 : 100)) {
        if (isAirborne) {
          // Air Assassination / Air Strike
          hunterState.states[nearestHunterId] = 'defeated';
          hunterState.detections[nearestHunterId] = false;
          hunterState.contacts[nearestHunterId] = false;
          playerState.bounceVelocity = 6;
          gameState.guardsEliminated++;
          gameState.airAssassinations++;

          const wasUndetected = gameState.detectionLevel < 40;
          if (wasUndetected) {
            gameState.stealthKills++;
            gameState.addScore(300, 'AIR ASSASSINATION');
          } else {
            gameState.addScore(200, 'AIR STRIKE');
          }
        } else if (gameState.hasAmmo) {
          const fired = gameState.useAmmo();
          if (fired) {
            hunterState.states[nearestHunterId] = 'defeated';
            hunterState.detections[nearestHunterId] = false;
            hunterState.contacts[nearestHunterId] = false;
            gameState.guardsEliminated++;

            const wasUndetected = gameState.detectionLevel < 40;
            if (wasUndetected) {
              gameState.stealthKills++;
              gameState.addScore(200, 'STEALTH ELIMINATION');
            } else {
              gameState.addScore(100, 'GUARD ELIMINATED');
            }
          }
        } else {
          gameState.addScore(0, 'NO AMMUNITION — COLLECT CORE AMMO');
        }
      }
    }

    // ---- Jump initiation (spacebar, single-fire — exactly one place) ----
    if (input.justPressed.has(' ') && !isJumping.current) {
      jumpVelocity.current = JUMP_FORCE;
      isJumping.current = true;
      playerState.isJumping = true;
      gameState.hasJumped = true;
      input.justPressed.delete(' '); // consume so we don't re-trigger
    }

    // ---- Pick up bounce velocity from a successful Hunter stomp ----
    if (playerState.bounceVelocity > 0) {
      jumpVelocity.current = playerState.bounceVelocity;
      isJumping.current = true;
      playerState.isJumping = true;
      playerState.bounceVelocity = 0;
    }

    if (ghostModeTimer.current > 0) {
      ghostModeTimer.current -= delta;
    }

    const MAX_SLOPE = 2.0;
    const canMoveTo = (nx, nz) => {
      if (ghostModeTimer.current <= 0 && collidesWithPillar(nx, nz, gameState.level)) return false;
      
      const moveDist = Math.sqrt((nx - pos.x)**2 + (nz - pos.z)**2);
      if (moveDist > 0) {
        const currentH = getTerrainHeight(pos.x, pos.z);
        const nextH = getTerrainHeight(nx, nz);
        const slope = (Math.abs(nextH - currentH)) / moveDist;
        if (slope > MAX_SLOPE) return false;
      }
      return true;
    };

    // ---- Compute intended movement ----
    let rawX = 0;
    let rawZ = 0;
    if (keys.current.held.has('w') || keys.current.held.has('arrowup')) rawZ -= 1;
    if (keys.current.held.has('s') || keys.current.held.has('arrowdown')) rawZ += 1;
    if (keys.current.held.has('a') || keys.current.held.has('arrowleft')) rawX -= 1;
    if (keys.current.held.has('d') || keys.current.held.has('arrowright')) rawX += 1;

    let moveX = 0;
    let moveZ = 0;
    const len = Math.sqrt(rawX * rawX + rawZ * rawZ);
    if (len > 0) {
      gameState.hasMoved = true;
      const normX = rawX / len;
      const normZ = rawZ / len;
      // Camera-Relative Isometric Movement Vector (Camera at 15,15,15 looking at origin):
      // W / Up    = (-0.707, -0.707) screen up
      // S / Down  = (+0.707, +0.707) screen down
      // A / Left  = (-0.707, +0.707) screen left
      // D / Right = (+0.707, -0.707) screen right
      moveX = (normX + normZ) * 0.7071;
      moveZ = (-normX + normZ) * 0.7071;
    }

    // ---- Stealth Mode Special Ability: shadowBlend ----
    // Explicit on/off boolean assignment every frame (never stuck on)
    const isStealthMode = currentMode.current.key === 'purple';
    const shadowBlendActive = isStealthMode && len === 0;
    playerState.shadowBlend = shadowBlendActive;

    if (shadowBlendActive && health.current > 0 && !detected && !inContact) {
      const shimmer = Math.sin(state.clock.elapsedTime * 6) * 0.15 + 0.25;
      meshRef.current.material.emissive.set('#c864ff');
      meshRef.current.material.emissiveIntensity = shimmer;
    }

    const currentSpeed = MOVE_SPEED * currentMode.current.speedMult;
    const targetX = pos.x + moveX * currentSpeed * delta;
    const targetZ = pos.z + moveZ * currentSpeed * delta;

    const isBlocked = (nx, nz) => {
      if (ghostModeTimer.current > 0) return false;
      return checkObstacleCollision(nx, nz, gameState.level, PLAYER_RADIUS);
    };

    if (reboundTimer.current > 0) {
      // Rebounding - overrides normal input momentarily
      reboundTimer.current -= delta;
      
      let moved = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        const propX = pos.x + reboundDir.current.x * REBOUND_SPEED * delta;
        const propZ = pos.z + reboundDir.current.z * REBOUND_SPEED * delta;
        
        if (!isBlocked(propX, propZ)) {
          pos.x = propX;
          pos.z = propZ;
          moved = true;
          break;
        } else if (!isBlocked(propX, pos.z)) {
          pos.x = propX;
          moved = true;
          break;
        } else if (!isBlocked(pos.x, propZ)) {
          pos.z = propZ;
          moved = true;
          break;
        }
        
        reboundDir.current = getEscapeDirection(pos.x, pos.z, gameState.level);
      }
      
      if (moved) {
        hardStuckTimer.current = 0;
      }
    } else {
      // Axis-separated obstacle collision: full → X-only → Z-only → stay
      if (!isBlocked(targetX, targetZ)) {
        pos.x = targetX;
        pos.z = targetZ;
        stuckTimer.current = 0;
        hardStuckTimer.current = 0;
      } else if (!isBlocked(targetX, pos.z)) {
        pos.x = targetX;           // slide along X
        stuckTimer.current = 0;
        hardStuckTimer.current = 0;
      } else if (!isBlocked(pos.x, targetZ)) {
        pos.z = targetZ;           // slide along Z
        stuckTimer.current = 0;
        hardStuckTimer.current = 0;
      } else {
        // fully blocked, stay put, accumulate stuck time
        stuckTimer.current += delta;
        hardStuckTimer.current += delta;
        
        if (hardStuckTimer.current > HARD_STUCK_THRESHOLD) {
          ghostModeTimer.current = GHOST_MODE_DURATION;
          hardStuckTimer.current = 0;
          stuckTimer.current = 0;
        } else if (stuckTimer.current > STUCK_THRESHOLD) {
          reboundDir.current = getEscapeDirection(pos.x, pos.z, gameState.level);
          reboundTimer.current = REBOUND_DURATION;
          stuckTimer.current = 0;
        }
      }
    }

    // Update Ground Height based on new position
    const currentGroundY = getTerrainHeight(pos.x, pos.z) + 0.5;
    
    // ---- Jump physics (smooth parabolic arc relative to terrain) ----
    if (isJumping.current) {
      jumpVelocity.current -= GRAVITY * delta;
      jumpYOffset.current += jumpVelocity.current * delta;

      // Landed?
      if (jumpYOffset.current <= 0) {
        jumpYOffset.current = 0;
        jumpVelocity.current = 0;
        isJumping.current = false;
      }
      meshRef.current.position.y = currentGroundY + jumpYOffset.current;
    } else {
      jumpYOffset.current = 0;
      meshRef.current.position.y = currentGroundY;
    }

    // Footstep squash/stretch and skirt animation
    const speedBonus = len > 0 ? 0.05 : 0;
    skirtRefs.current.forEach((ref, i) => {
      if (ref) {
        const baseY = -0.45 + (i % 2 === 0 ? 0.05 : 0);
        ref.position.y = baseY + Math.sin(state.clock.elapsedTime * 2 + i) * (0.05 + speedBonus);
      }
    });

    if (!isJumping.current) {
      if (len > 0) {
        walkPhase.current += currentSpeed * delta * 2;
        meshRef.current.scale.y = 1.15 + Math.sin(walkPhase.current) * 0.15;
      } else {
        meshRef.current.scale.y = 1.15;
        walkPhase.current = 0;
      }
    }

    // Sync live position to shared singleton
    if (typeof window !== 'undefined') {
      window.__teleportPlayer = (x, z) => { pos.x = x; pos.z = z; };
    }
    playerState.position.x = pos.x;
    playerState.position.y = meshRef.current.position.y; // actual visual Y (includes jump)
    playerState.position.z = pos.z;
    playerState.isJumping = isJumping.current;

    // ---- Objectives & Win state ----
    const currentObjective = getObjectiveForLevel(gameState.level);
    if (gameState.levelComplete && !gameState.victory && !levelIncrementedRef.current) {
      if (state.clock.elapsedTime - levelTransitionTimer.current > 2.0) {
        levelIncrementedRef.current = true;
        gameState.level++;
        // State updates for new level are handled by App.jsx subscription (reset partial)
        gameState.notify();
      }
    } else if (!gameState.coreReached) {
      const objDx = pos.x - currentObjective.core[0];
      const objDz = pos.z - currentObjective.core[1];
      if (Math.sqrt(objDx * objDx + objDz * objDz) < 2.5) {
        gameState.coreReached = true;
        gameState.completeObjective(1);
      }
    } else if (gameState.guardianDefeated && !gameState.victory && !gameState.levelComplete) {
      const objDx = pos.x - currentObjective.extraction[0];
      const objDz = pos.z - currentObjective.extraction[1];
      if (Math.sqrt(objDx * objDx + objDz * objDz) < 1.2) {
        if (gameState.level < 3) {
          gameState.levelComplete = true;
          levelTransitionTimer.current = state.clock.elapsedTime;
          gameState.notify();
          playVictory(); // Reusing victory sound for level complete
        } else {
          gameState.victory = true;
          gameState.notify();
          playVictory();
        }
      }
    }
  });

  return (
    <>
      <group ref={groupRef} position={[0, 0, 0]}>
        <Sphere
          ref={meshRef}
          args={[0.55, 32, 32]}
          position={[0, 0.5, 0]}
          scale={[1, 1.15, 0.9]}
          castShadow
        >
          <meshStandardMaterial color={currentMode.current.color} emissive={currentMode.current.color} emissiveIntensity={0.15} roughness={0.35} />
          
          {/* Eyes */}
          <Sphere args={[0.1, 16, 16]} position={[-0.2, 0.2, 0.48]}>
            <meshStandardMaterial ref={(el) => (eyeMats.current[0] = el)} color={currentMode.current.color} emissive={currentMode.current.color} emissiveIntensity={1.5} roughness={0.35} />
          </Sphere>
          <Sphere args={[0.1, 16, 16]} position={[0.2, 0.2, 0.48]}>
            <meshStandardMaterial ref={(el) => (eyeMats.current[1] = el)} color={currentMode.current.color} emissive={currentMode.current.color} emissiveIntensity={1.5} roughness={0.35} />
          </Sphere>

          {/* Mouth */}
          <Sphere args={[0.04, 16, 16]} position={[0, 0.05, 0.53]} scale={[1, 0.5, 1]}>
            <meshStandardMaterial color="#222222" roughness={0.8} />
          </Sphere>

          {/* Arms */}
          <Sphere args={[0.12, 16, 16]} position={[-0.55, 0, 0]} rotation={[0, 0, -Math.PI / 4]}>
            <meshStandardMaterial ref={(el) => (armMats.current[0] = el)} color={currentMode.current.color} emissive={currentMode.current.color} emissiveIntensity={0.15} roughness={0.35} />
          </Sphere>
          <Sphere args={[0.12, 16, 16]} position={[0.55, 0, 0]} rotation={[0, 0, Math.PI / 4]}>
            <meshStandardMaterial ref={(el) => (armMats.current[1] = el)} color={currentMode.current.color} emissive={currentMode.current.color} emissiveIntensity={0.15} roughness={0.35} />
          </Sphere>

          {/* Wavy Skirt */}
          {[0, 1, 2, 3, 4].map((i) => {
            const angle = (i / 5) * Math.PI * 2;
            const r = 0.35;
            const x = Math.cos(angle) * r;
            const z = Math.sin(angle) * r;
            const baseY = -0.45 + (i % 2 === 0 ? 0.05 : 0);
            return (
              <Sphere 
                key={i} 
                ref={(el) => (skirtRefs.current[i] = el)} 
                args={[0.2, 16, 16]} 
                position={[x, baseY, z]}
              >
                <meshStandardMaterial 
                  ref={(el) => (skirtMats.current[i] = el)} 
                  color={currentMode.current.color} 
                  emissive={currentMode.current.color} 
                  emissiveIntensity={0.15} 
                  roughness={0.35} 
                />
              </Sphere>
            );
          })}
        </Sphere>

        <Ring
          ref={ringRef}
          args={[0.4, 0.5, 32]}
          position={[0, 0.05, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          visible={false}
        >
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </Ring>
      </group>

      {[0, 1, 2, 3].map((i) => (
        <Sphere
          key={i}
          ref={(el) => (trailRefs.current[i] = el)}
          args={[0.3, 16, 16]}
        >
          <meshStandardMaterial 
            ref={(el) => (trailMats.current[i] = el)}
            transparent 
            opacity={0}
            depthWrite={false}
            color={currentMode.current.color} 
            emissive={currentMode.current.color} 
            emissiveIntensity={0.15} 
          />
        </Sphere>
      ))}
    </>
  );
}
