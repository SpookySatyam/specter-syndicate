import React, { useRef, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Sphere, Cone, Torus } from '@react-three/drei';
import * as THREE from 'three';
import playerState from './playerState';
import hunterState from './hunterState';
import gameState from './gameState';
import { PILLAR_RADIUS, getEscapeDirection, getPillarsForLevel, getTerrainHeight } from './levelGeometry';

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------
const PATROL_SPEED = 2;
const WAYPOINT_THRESHOLD = 0.3;
const ROTATION_SPEED = 4;             // lerp speed for facing (rad/s factor)
const SPOTLIGHT_DISTANCE = 10;
const SPOTLIGHT_HALF_ANGLE = 0.4;     // radians — must match <spotLight angle>
const TARGET_OFFSET = 5;             // how far ahead the spotlight target sits
const CHASE_SPEED = 4.5;
const SEARCH_DURATION = 2;
const STUCK_THRESHOLD = 0.15;
const HARD_STUCK_THRESHOLD = 1.5;
const REBOUND_SPEED = 1.5;
const REBOUND_DURATION = 0.4;
const GHOST_MODE_DURATION = 0.3;

// --- Jump-attack tuning ---
const HUNTER_MAX_HEALTH = 50;
const JUMP_ATTACK_DAMAGE = 50;       // 1-hit kill for precise stomps
const ATTACK_RADIUS = 0.4;           // Reduced for precision
const STOMP_Y_MIN = 1.0;             // Must hit on head
const STOMP_Y_MAX = 2.5;             // …and below this to count as "landing on top"
const BOUNCE_VELOCITY = 6;           // Slightly higher bounce reward
const KNOCKBACK_FORCE = 4;           // initial knockback speed
const KNOCKBACK_DECAY = 0.3;         // seconds for knockback to decay
const HIT_FLASH_DURATION = 0.15;     // seconds of white emissive flash
const DEFEAT_SCALE_SPEED = 2;        // scale-down speed when defeated

// ---------------------------------------------------------------------------
// Hunter — enemy patrol entity with flashlight + detection + health
// ---------------------------------------------------------------------------

const HUNTER_RADIUS = 0.5; // approximate footprint of the 0.8-wide box

// Pre-computed collision sum for hunter–pillar checks
const HUNTER_COLLISION_DIST = PILLAR_RADIUS + HUNTER_RADIUS;
const HUNTER_COLLISION_DIST_SQ = HUNTER_COLLISION_DIST * HUNTER_COLLISION_DIST;

/**
 * Returns true if (x, z) overlaps any pillar for a hunter-sized entity.
 * Pure math — no allocations, safe for useFrame hot path.
 */
function hunterCollidesWithPillar(x, z, level) {
  const pillars = getPillarsForLevel(level);
  for (let i = 0; i < pillars.length; i++) {
    const px = pillars[i][0];
    const pz = pillars[i][1];
    const dx = x - px;
    const dz = z - pz;
    if (dx * dx + dz * dz < HUNTER_COLLISION_DIST_SQ) return true;
  }
  return false;
}
// ---------------------------------------------------------------------------

/**
 * Props:
 *   id           — unique string, used as key in hunterState.detections
 *   patrolPoints — array of [x, z] waypoints, e.g. [[-5,-5],[5,-5],[5,5],[-5,5]]
 */
export default function Hunter({ id, patrolPoints, speedMult = 1.0 }) {
  const groupRef = useRef();
  const bodyRef = useRef();
  const spotRef = useRef();
  const eyeMat = useRef();
  const armLMat = useRef();
  const armRMat = useRef();
  const haloMat = useRef();
  const wingLMat = useRef();
  const wingRMat = useRef();
  const waypointIndex = useRef(0);
  const stateRef = useRef('patrol');
  const searchTimer = useRef(0);
  const lastKnownPos = useRef(new THREE.Vector3());

  // --- Health, defeat, and spawn scale ---
  const healthRef = useRef(HUNTER_MAX_HEALTH);
  const defeatedRef = useRef(false);
  const scaleRef = useRef(0);

  // --- Knockback ---
  const knockbackDir = useRef({ x: 0, z: 0 });
  const knockbackTimer = useRef(0);

  // --- Hit flash ---
  const flashTimer = useRef(0);

  // --- Stuck/Rebound/Respawn ---
  const stuckTimer = useRef(0);
  const hardStuckTimer = useRef(0);
  const reboundDir = useRef({ x: 0, z: 0 });
  const reboundTimer = useRef(0);
  const ghostModeTimer = useRef(0);
  const respawnTimer = useRef(0);

  // Spotlight target — imperative Object3D added directly to the scene
  const targetObj = useMemo(() => new THREE.Object3D(), []);
  const { scene } = useThree();

  useEffect(() => {
    scene.add(targetObj);
    return () => {
      scene.remove(targetObj);
      hunterState.removeHunter(id);
    };
  }, [scene, targetObj, id]);

  // Link the spotlight to the target once both refs are ready
  useEffect(() => {
    if (spotRef.current) {
      spotRef.current.target = targetObj;
    }
  }, [targetObj]);

  // Compute initial facing toward second waypoint
  const start = patrolPoints[0];
  const next = patrolPoints.length > 1 ? patrolPoints[1] : start;
  const initDx = next[0] - start[0];
  const initDz = next[1] - start[1];
  const initialAngle = Math.atan2(-initDx, -initDz);

  // ------------------------------------------------------------------
  // Per-frame: state machine, movement, rotation, spotlight, detection,
  //            jump-attack check, knockback, defeat
  // ------------------------------------------------------------------
  useFrame((_, delta) => {
    if (!groupRef.current || !spotRef.current || gameState.mapOpen) return;

    const pos = groupRef.current.position;

    // ------ Defeat animation: scale down and disable, then respawn ------
    if (defeatedRef.current || hunterState.states[id] === 'defeated') {
      defeatedRef.current = true;
      hunterState.states[id] = 'defeated';
      hunterState.detections[id] = false;
      hunterState.contacts[id] = false;
      if (spotRef.current) spotRef.current.intensity = 0;

      if (scaleRef.current > 0.01) {
        scaleRef.current = Math.max(0, scaleRef.current - DEFEAT_SCALE_SPEED * delta);
        groupRef.current.scale.setScalar(scaleRef.current);
      } else {
        respawnTimer.current += delta;
        if (respawnTimer.current > 15) { // Respawn after 15 seconds
          healthRef.current = HUNTER_MAX_HEALTH;
          defeatedRef.current = false;
          stateRef.current = 'patrol';
          hunterState.states[id] = 'patrol';
          if (spotRef.current) spotRef.current.intensity = 2.5;
          respawnTimer.current = 0;
          waypointIndex.current = 0;
          
          const startPos = patrolPoints[0];
          pos.x = startPos[0];
          pos.z = startPos[1];
          pos.y = getTerrainHeight(pos.x, pos.z) + 0.5;
          
          const nextPos = patrolPoints.length > 1 ? patrolPoints[1] : startPos;
          const initDx = nextPos[0] - startPos[0];
          const initDz = nextPos[1] - startPos[1];
          groupRef.current.rotation.y = Math.atan2(-initDx, -initDz);
        }
      }
      return; // skip all behavior
    }
    
    // ------ Spawn animation ------
    if (scaleRef.current < 1) {
      scaleRef.current = Math.min(1, scaleRef.current + delta * 2);
      groupRef.current.scale.setScalar(scaleRef.current);
    }

    // ------ Jump-attack check ------
    if (playerState.isJumping) {
      const apx = playerState.position.x - pos.x;
      const apz = playerState.position.z - pos.z;
      const xzDistSq = apx * apx + apz * apz;
      const playerY = playerState.position.y;
      const yDiff = playerY - pos.y;

      if (xzDistSq < ATTACK_RADIUS * ATTACK_RADIUS &&
          yDiff >= STOMP_Y_MIN && yDiff <= STOMP_Y_MAX) {
        // --- Hit registered ---
        const wasUndetected = gameState.detectionLevel < 40;
        healthRef.current -= JUMP_ATTACK_DAMAGE;

        // Knockback: push hunter away from player
        const xzDist = Math.sqrt(xzDistSq);
        if (xzDist > 0.01) {
          knockbackDir.current.x = -apx / xzDist; // away from player
          knockbackDir.current.z = -apz / xzDist;
        } else {
          // Player directly on top — push in a random direction
          const angle = Math.random() * Math.PI * 2;
          knockbackDir.current.x = Math.cos(angle);
          knockbackDir.current.z = Math.sin(angle);
        }
        knockbackTimer.current = KNOCKBACK_DECAY;

        // Hit flash
        flashTimer.current = HIT_FLASH_DURATION;

        // Give player a bounce
        playerState.bounceVelocity = BOUNCE_VELOCITY;

        // Check for defeat
        if (healthRef.current <= 0) {
          healthRef.current = 0;
          defeatedRef.current = true;
          stateRef.current = 'defeated';
          hunterState.detections[id] = false;
          hunterState.contacts[id] = false;
          spotRef.current.intensity = 0;
          gameState.guardsEliminated++;

          if (wasUndetected) {
            gameState.addScore(300, 'ASSASSINATION');
          } else {
            gameState.addScore(100, 'GUARD ELIMINATED');
          }
          return;
        }
      }
    }

    // ------ Knockback application ------
    if (knockbackTimer.current > 0) {
      const t = knockbackTimer.current / KNOCKBACK_DECAY; // 1 → 0 ease
      const kbSpeed = KNOCKBACK_FORCE * t;
      pos.x += knockbackDir.current.x * kbSpeed * delta;
      pos.z += knockbackDir.current.z * kbSpeed * delta;
      knockbackTimer.current -= delta;
    }

    // ------ Hit flash decay ------
    if (flashTimer.current > 0) {
      flashTimer.current -= delta;
      if (bodyRef.current) {
        const flashIntensity = flashTimer.current / HIT_FLASH_DURATION;
        const int = 1.0 + flashIntensity * 2;
        const c = '#ffffff';
        bodyRef.current.material.emissive.set(c);
        bodyRef.current.material.emissiveIntensity = int;
        if (eyeMat.current) { eyeMat.current.emissive.set(c); eyeMat.current.emissiveIntensity = int * 1.5; }
        if (armLMat.current) { armLMat.current.emissive.set(c); armLMat.current.emissiveIntensity = int; }
        if (armRMat.current) { armRMat.current.emissive.set(c); armRMat.current.emissiveIntensity = int; }
        if (haloMat.current) { haloMat.current.emissive.set(c); haloMat.current.emissiveIntensity = int; }
        if (wingLMat.current) { wingLMat.current.emissive.set(c); wingLMat.current.emissiveIntensity = int; }
        if (wingRMat.current) { wingRMat.current.emissive.set(c); wingRMat.current.emissiveIntensity = int; }
      }
    } else if (bodyRef.current) {
      const isAlert = stateRef.current === 'alert';
      const eyeColor = isAlert ? '#ffdede' : '#aef2ff';
      const eyeInt = 1.5;
      bodyRef.current.material.emissive.set('#000000');
      bodyRef.current.material.emissiveIntensity = 0;
      if (eyeMat.current) { eyeMat.current.emissive.set(eyeColor); eyeMat.current.emissiveIntensity = eyeInt; }
      if (armLMat.current) { armLMat.current.emissive.set('#000000'); armLMat.current.emissiveIntensity = 0; }
      if (armRMat.current) { armRMat.current.emissive.set('#000000'); armRMat.current.emissiveIntensity = 0; }
      if (haloMat.current) { haloMat.current.emissive.set(eyeColor); haloMat.current.emissiveIntensity = eyeInt; }
      if (wingLMat.current) { wingLMat.current.emissive.set('#000000'); wingLMat.current.emissiveIntensity = 0; }
      if (wingRMat.current) { wingRMat.current.emissive.set('#000000'); wingRMat.current.emissiveIntensity = 0; }
    }

    // --- State Machine & Movement ---
    if (ghostModeTimer.current > 0) {
      ghostModeTimer.current -= delta;
    }

    const MAX_SLOPE = 2.0; // Increased to prevent hunters from getting stuck
    const canMoveTo = (nx, nz) => {
      if (ghostModeTimer.current <= 0 && hunterCollidesWithPillar(nx, nz, gameState.level)) return false;
      
      const moveDist = Math.sqrt((nx - pos.x)**2 + (nz - pos.z)**2);
      if (moveDist > 0) {
        const currentH = getTerrainHeight(pos.x, pos.z);
        const nextH = getTerrainHeight(nx, nz);
        const slope = (Math.abs(nextH - currentH)) / moveDist;
        if (slope > MAX_SLOPE) return false;
      }
      return true;
    };

    if (reboundTimer.current > 0) {
      reboundTimer.current -= delta;
      
      let moved = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        const proposedX = pos.x + reboundDir.current.x * REBOUND_SPEED * delta;
        const proposedZ = pos.z + reboundDir.current.z * REBOUND_SPEED * delta;
        
        if (canMoveTo(proposedX, proposedZ)) {
          pos.x = proposedX;
          pos.z = proposedZ;
          moved = true;
          break;
        } else if (canMoveTo(proposedX, pos.z)) {
          pos.x = proposedX;
          moved = true;
          break;
        } else if (canMoveTo(pos.x, proposedZ)) {
          pos.z = proposedZ;
          moved = true;
          break;
        }
        
        // Still blocked on rebound, recompute immediately using new slight offset
        reboundDir.current = getEscapeDirection(pos.x, pos.z, gameState.level);
      }
      
      if (moved) {
        hardStuckTimer.current = 0;
      }

      // Smooth rotation toward rebound direction
      const desiredAngle = Math.atan2(-reboundDir.current.x, -reboundDir.current.z);
      let angleDiff = desiredAngle - groupRef.current.rotation.y;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      groupRef.current.rotation.y += angleDiff * Math.min(1, ROTATION_SPEED * delta);
    } else {
      let targetX, targetZ;
      let currentSpeed = PATROL_SPEED;

      if (stateRef.current === 'alert' || stateRef.current === 'combat') {
        targetX = playerState.position.x;
        targetZ = playerState.position.z;
        currentSpeed = CHASE_SPEED * speedMult;
      } else if (stateRef.current === 'investigating' || stateRef.current === 'searching') {
        targetX = lastKnownPos.current.x;
        targetZ = lastKnownPos.current.z;
        currentSpeed = PATROL_SPEED * 1.2 * speedMult;
      } else if (stateRef.current === 'suspicious') {
        // Paused investigation orientation
        targetX = pos.x;
        targetZ = pos.z;
        currentSpeed = 0;
      } else {
        const wp = patrolPoints[waypointIndex.current];
        targetX = wp[0];
        targetZ = wp[1];
        currentSpeed = PATROL_SPEED * speedMult;
      }

      const dx = targetX - pos.x;
      const dz = targetZ - pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      let reachedTarget = false;
      if (stateRef.current === 'patrol') {
        reachedTarget = dist < WAYPOINT_THRESHOLD;
      } else {
        reachedTarget = dist < 0.1;
      }

      if (reachedTarget && stateRef.current === 'patrol') {
        waypointIndex.current = (waypointIndex.current + 1) % patrolPoints.length;
      } else if (!reachedTarget && currentSpeed > 0) {
        const nx = dx / dist;
        const nz = dz / dist;
        const proposedX = pos.x + nx * currentSpeed * delta;
        const proposedZ = pos.z + nz * currentSpeed * delta;

        // Pillar collision — axis-separated resolution
        if (canMoveTo(proposedX, proposedZ)) {
          pos.x = proposedX;
          pos.z = proposedZ;
          stuckTimer.current = 0;
          hardStuckTimer.current = 0;
        } else if (canMoveTo(proposedX, pos.z)) {
          pos.x = proposedX; // slide along X
          stuckTimer.current = 0;
          hardStuckTimer.current = 0;
        } else if (canMoveTo(pos.x, proposedZ)) {
          pos.z = proposedZ; // slide along Z
          stuckTimer.current = 0;
          hardStuckTimer.current = 0;
        } else {
          // blocked on both axes, accumulate stuck time
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

      if (stateRef.current === 'suspicious') {
        // Turn toward last known location or player position
        const ldx = lastKnownPos.current.x - pos.x;
        const ldz = lastKnownPos.current.z - pos.z;
        if (Math.abs(ldx) > 0.01 || Math.abs(ldz) > 0.01) {
          const desiredAngle = Math.atan2(-ldx, -ldz);
          let angleDiff = desiredAngle - groupRef.current.rotation.y;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          groupRef.current.rotation.y += angleDiff * Math.min(1, ROTATION_SPEED * delta);
        }
      } else if (stateRef.current !== 'searching') {
        if (dist > 0.01) {
          const desiredAngle = Math.atan2(-dx, -dz);
          let angleDiff = desiredAngle - groupRef.current.rotation.y;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          groupRef.current.rotation.y += angleDiff * Math.min(1, ROTATION_SPEED * delta);
        }
      } else {
        // Spin slowly while searching
        groupRef.current.rotation.y += 1.5 * delta;
      }
    }

    // Assign height
    pos.y = getTerrainHeight(pos.x, pos.z) + 0.5;

    // Publish position and state to shared singleton registry
    hunterState.updateHunterState(id, pos, stateRef.current);

    // --- Update spotlight target position (world space) ---
    const rot = groupRef.current.rotation.y;
    const fx = -Math.sin(rot); // world-space facing X
    const fz = -Math.cos(rot); // world-space facing Z

    targetObj.position.set(
      pos.x + fx * TARGET_OFFSET,
      0.5,
      pos.z + fz * TARGET_OFFSET,
    );
    targetObj.updateMatrixWorld();

    // --- Detection: is the Player inside the spotlight cone? ---
    const px = playerState.position.x - pos.x;
    const pz = playerState.position.z - pos.z;
    const playerDist = Math.sqrt(px * px + pz * pz);

    // --- Contact check (direct touch) ---
    const CONTACT_RADIUS = 1.0;
    if (playerDist < CONTACT_RADIUS && !playerState.isJumping) {
      hunterState.contacts[id] = true;
    } else {
      hunterState.contacts[id] = false;
    }

    let inWhiteLight = false;
    let inLineOfSight = false;

    // Stealth mode shadowBlend reduces effective spotlight detection radius & cone angle
    const effectiveSpotlightDist = playerState.shadowBlend ? SPOTLIGHT_DISTANCE * 0.65 : SPOTLIGHT_DISTANCE;
    const effectiveHalfAngle = playerState.shadowBlend ? SPOTLIGHT_HALF_ANGLE * 0.65 : SPOTLIGHT_HALF_ANGLE;

    if (playerDist <= 0.01) {
      inLineOfSight = true;
      inWhiteLight = true;
    } else if (playerDist < effectiveSpotlightDist) {
      // -- Line-of-sight check against pillars --
      inLineOfSight = true;
      const pillars = getPillarsForLevel(gameState.level);
      for (let i = 0; i < pillars.length; i++) {
        const [cx, cz] = pillars[i];
        const acx = cx - pos.x;
        const acz = cz - pos.z;
        const ab2 = playerDist * playerDist;
        let t = (acx * px + acz * pz) / ab2;
        t = Math.max(0, Math.min(1, t));
        const closestX = pos.x + t * px;
        const closestZ = pos.z + t * pz;
        const dxC = cx - closestX;
        const dzC = cz - closestZ;
        const distSq = dxC * dxC + dzC * dzC;
        
        if (distSq <= PILLAR_RADIUS * PILLAR_RADIUS) {
           inLineOfSight = false;
           break;
        }
      }

      const pnx = px / playerDist;
      const pnz = pz / playerDist;
      const dot = pnx * fx + pnz * fz;
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      
      if (inLineOfSight && angle < effectiveHalfAngle) {
        inWhiteLight = true;
      }
    }

    // Player takes damage only if fully in the spotlight cone
    hunterState.detections[id] = inWhiteLight;

    // --- AI State Machine Transitions ---
    if (inWhiteLight) {
      stateRef.current = 'combat';
      lastKnownPos.current.set(playerState.position.x, 0, playerState.position.z);
    } else if (inLineOfSight && playerDist < effectiveSpotlightDist * 1.2) {
      if (stateRef.current === 'patrol') {
        stateRef.current = 'suspicious';
        searchTimer.current = 1.5; // 1.5s suspicious hold
        lastKnownPos.current.set(playerState.position.x, 0, playerState.position.z);
      } else if (stateRef.current === 'suspicious') {
        searchTimer.current -= delta;
        if (searchTimer.current <= 0) {
          stateRef.current = 'investigating';
        }
      } else if (stateRef.current === 'searching') {
        stateRef.current = 'investigating';
      }
    } else if (stateRef.current === 'combat' || stateRef.current === 'alert') {
      stateRef.current = 'searching';
      searchTimer.current = SEARCH_DURATION;
    } else if (stateRef.current === 'investigating') {
      const idx = lastKnownPos.current.x - pos.x;
      const idz = lastKnownPos.current.z - pos.z;
      if (Math.sqrt(idx * idx + idz * idz) < 0.5) {
        stateRef.current = 'searching';
        searchTimer.current = SEARCH_DURATION;
      }
    } else if (stateRef.current === 'searching') {
      searchTimer.current -= delta;
      if (searchTimer.current <= 0) {
        stateRef.current = 'patrol';
      }
    } else if (stateRef.current === 'suspicious') {
      searchTimer.current -= delta;
      if (searchTimer.current <= 0) {
        stateRef.current = 'patrol';
      }
    }

    // --- Visual Spotlight Color Cues ---
    if (stateRef.current === 'combat' || stateRef.current === 'alert') {
      spotRef.current.color.set('#ff3b3b');
      spotRef.current.intensity = 4.0;
    } else if (stateRef.current === 'investigating') {
      spotRef.current.color.set('#ff8800');
      spotRef.current.intensity = 3.2;
    } else if (stateRef.current === 'suspicious') {
      spotRef.current.color.set('#ffd93b');
      spotRef.current.intensity = 3.0;
    } else {
      spotRef.current.color.set('#cde8ff');
      spotRef.current.intensity = 2.5;
    }
  });

  return (
    <group
      ref={groupRef}
      position={[start[0], 0, start[1]]}
      rotation={[0, initialAngle, 0]}
    >
      {/* Body */}
      <Sphere ref={bodyRef} args={[0.5, 32, 32]} position={[0, 0.8, 0]} castShadow>
        <meshStandardMaterial color="#dfe9f2" roughness={0.3} emissive="#000000" emissiveIntensity={0} />
      </Sphere>

      {/* Single Glowing Eye */}
      <Sphere args={[0.08, 16, 16]} position={[0, 1.0, -0.45]}>
        <meshStandardMaterial ref={eyeMat} color="#ffffff" emissive="#aef2ff" emissiveIntensity={1.5} />
      </Sphere>

      {/* Halo */}
      <Torus args={[0.2, 0.03, 16, 32]} position={[0, 1.45, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial ref={haloMat} color="#ffffff" emissive="#aef2ff" emissiveIntensity={1.5} />
      </Torus>

      {/* Wings */}
      <group position={[0, 0.9, 0.35]}>
        {/* Left Wing */}
        <Cone args={[0.15, 0.8, 4]} position={[-0.3, 0.2, 0.1]} rotation={[-Math.PI / 4, 0, Math.PI / 6]}>
          <meshStandardMaterial ref={wingLMat} color="#dfe9f2" roughness={0.3} transparent opacity={0.85} depthWrite={false} emissive="#000000" emissiveIntensity={0} />
        </Cone>
        {/* Right Wing */}
        <Cone args={[0.15, 0.8, 4]} position={[0.3, 0.2, 0.1]} rotation={[-Math.PI / 4, 0, -Math.PI / 6]}>
          <meshStandardMaterial ref={wingRMat} color="#dfe9f2" roughness={0.3} transparent opacity={0.85} depthWrite={false} emissive="#000000" emissiveIntensity={0} />
        </Cone>
      </group>

      {/* Left Arm (stub) */}
      <Sphere args={[0.12, 16, 16]} position={[-0.45, 0.75, 0]}>
        <meshStandardMaterial ref={armLMat} color="#dfe9f2" roughness={0.3} emissive="#000000" emissiveIntensity={0} />
      </Sphere>

      {/* Right Arm (stub) */}
      <Sphere args={[0.12, 16, 16]} position={[0.45, 0.75, 0]}>
        <meshStandardMaterial ref={armRMat} color="#dfe9f2" roughness={0.3} emissive="#000000" emissiveIntensity={0} />
      </Sphere>

      {/* Beam Mesh */}
      <group position={[0, 1.5, -0.3]} rotation={[-0.186, 0, 0]}>
        <mesh position={[0, 0, -SPOTLIGHT_DISTANCE / 2]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[SPOTLIGHT_DISTANCE * Math.tan(SPOTLIGHT_HALF_ANGLE), SPOTLIGHT_DISTANCE, 32]} />
          <meshBasicMaterial color="#ffffaa" transparent opacity={0.15} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* Flashlight — cold white/pale-blue spot */}
      <spotLight
        ref={spotRef}
        position={[0, 1.5, -0.3]}
        angle={0.4}
        penumbra={0.4}
        intensity={2.5}
        distance={SPOTLIGHT_DISTANCE}
        color="#cde8ff"
        castShadow={hunterState.shadowCasters[id] ?? false}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={0.5}
        shadow-camera-far={15}
      />
    </group>
  );
}
