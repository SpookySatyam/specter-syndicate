import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Box, Sphere, Ring, Cylinder } from '@react-three/drei';
import * as THREE from 'three';
import playerState from './playerState';
import gameState from './gameState';
import useKeyboardControls from './useKeyboardControls';
import { getTerrainHeight, checkObstacleCollision } from './levelGeometry';

export default function Guardian() {
  const groupRef = useRef();
  const bodyRef = useRef();
  const shieldRingRef = useRef();
  const scaleRef = useRef(1);
  const defeatedRef = useRef(false);
  const hitFlashTimer = useRef(0);
  const keys = useKeyboardControls();
  const attackCooldownRef = useRef(0);

  const GUARDIAN_RADIUS = 1.0;
  const GUARDIAN_POS = [0, -4]; // Center arena stronghold

  const telegraphTimer = useRef(0);
  const isTelegraphing = useRef(false);

  const GUARDIAN_RADIUS = 1.0;
  const GUARDIAN_POS = [0, -4]; // Center arena stronghold

  useFrame((_, delta) => {
    if (!groupRef.current || defeatedRef.current || gameState.guardianDefeated || gameState.mapOpen) {
      if (groupRef.current && scaleRef.current > 0.01) {
        scaleRef.current = Math.max(0, scaleRef.current - delta * 2);
        groupRef.current.scale.setScalar(scaleRef.current);
      }
      return;
    }

    const pos = groupRef.current.position;

    // Cooldown timers
    if (attackCooldownRef.current > 0) attackCooldownRef.current -= delta;
    if (hitFlashTimer.current > 0) hitFlashTimer.current -= delta;

    // Distance to player
    const px = playerState.position.x - pos.x;
    const pz = playerState.position.z - pos.z;
    const distSq = px * px + pz * pz;
    const dist = Math.sqrt(distSq);

    // Rotate shield ring
    if (shieldRingRef.current) {
      shieldRingRef.current.rotation.z += delta * (gameState.guardianVulnerable ? 1.0 : 3.0);
    }

    // Facing rotation toward player
    if (dist > 0.1) {
      const desiredAngle = Math.atan2(-px, -pz);
      let angleDiff = desiredAngle - groupRef.current.rotation.y;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      groupRef.current.rotation.y += angleDiff * Math.min(1, 3.0 * delta);
    }

    // Determine Phase
    const hpPct = gameState.guardianHealth / gameState.guardianMaxHealth;
    if (hpPct > 0.65) gameState.guardianPhase = 1;
    else if (hpPct > 0.3) gameState.guardianPhase = 2;
    else gameState.guardianPhase = 3;

    // Telegraph Warning Timer when player is close
    if (dist < 8.0 && attackCooldownRef.current <= 0) {
      telegraphTimer.current += delta;
      if (telegraphTimer.current > 1.8) {
        isTelegraphing.current = true;
        if (telegraphTimer.current > 2.6) {
          // Boss Attack Burst!
          isTelegraphing.current = false;
          telegraphTimer.current = 0;
          attackCooldownRef.current = 1.5;
          
          if (dist < 8.0) {
            gameState.health -= 30;
            gameState.health = Math.max(0, gameState.health);
            gameState.notify();
          }
        }
      }
    } else {
      isTelegraphing.current = false;
      telegraphTimer.current = 0;
    }

    // Phase movement speed
    let moveSpeed = 0;
    if (gameState.guardianPhase === 1) moveSpeed = 1.2;
    else if (gameState.guardianPhase === 2) moveSpeed = 2.0;
    else if (gameState.guardianPhase === 3) moveSpeed = 2.8;

    if (dist > 2.0 && dist < 16.0) {
      const nx = px / dist;
      const nz = pz / dist;
      const targetX = pos.x + nx * moveSpeed * delta;
      const targetZ = pos.z + nz * moveSpeed * delta;

      if (!checkObstacleCollision(targetX, targetZ, gameState.level, GUARDIAN_RADIUS)) {
        pos.x = targetX;
        pos.z = targetZ;
      }
    }

    pos.y = getTerrainHeight(pos.x, pos.z) + 0.8;

    // Player Combat Interaction vs Guardian (Melee or Ranged 'F' Key)
    const isPlayerInMeleeRange = dist < 2.5;
    const isPlayerInRangedRange = dist < 12.0;
    const isPlayerAirborne = playerState.isJumping || (playerState.position.y - pos.y) > 0.4;
    const isAttacking = keys.current.justPressed.has('f');

    if (isAttacking && attackCooldownRef.current <= 0) {
      if (isPlayerInAirborneStomp(px, pz, playerState.position.y, pos.y) || isPlayerInMeleeRange || isPlayerInRangedRange) {
        attackCooldownRef.current = 0.4; // 0.4s cooldown
        keys.current.justPressed.delete('f');

        if (!gameState.hasAmmo) {
          // IMMUNE STATE
          gameState.addScore(0, 'GUARDIAN IMMUNE — AMMO REQUIRED');
          playerState.bounceVelocity = 4; // bump player back
        } else {
          // VULNERABLE STATE — Deal damage!
          const hasAmmo = gameState.useAmmo();
          if (hasAmmo) {
            const isAirStrike = isPlayerAirborne && dist < 2.5;
            const damage = isAirStrike ? 50 : 25;
            gameState.guardianHealth = Math.max(0, gameState.guardianHealth - damage);
            hitFlashTimer.current = 0.2;

            if (isAirStrike) {
              playerState.bounceVelocity = 7;
              gameState.airAssassinations++;
              gameState.addScore(300, 'AIR STRIKE — GUARDIAN');
            } else {
              gameState.addScore(50, 'GUARDIAN HIT');
            }

            if (gameState.guardianHealth <= 0) {
              gameState.guardianDefeated = true;
              defeatedRef.current = true;
              gameState.addScore(500, 'GUARDIAN DEFEATED');
              gameState.completeObjective(3); // Objective 3: Eliminate Guardian
            }
            gameState.notify();
          } else {
            gameState.addScore(0, 'NO AMMUNITION');
          }
        }
      }
    }
  });

  function isPlayerInAirborneStomp(px, pz, py, gy) {
    const xzDistSq = px * px + pz * pz;
    const yDiff = py - gy;
    return xzDistSq < 2.0 && yDiff >= 0.4;
  }

  const isImmune = !gameState.hasAmmo;

  return (
    <group ref={groupRef} position={[GUARDIAN_POS[0], 0, GUARDIAN_POS[1]]} scale={[1.6, 1.6, 1.6]}>
      {/* Telegraph Warning Ring on Floor */}
      {isTelegraphing.current && (
        <Ring args={[1.5, 2.5, 32]} position={[0, -0.7, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <meshBasicMaterial color="#ff0000" transparent opacity={0.6} side={THREE.DoubleSide} />
        </Ring>
      )}

      {/* Heavy Boss Body Chassis */}
      <Box ref={bodyRef} args={[1.2, 1.4, 1.2]} position={[0, 0.7, 0]} castShadow>
        <meshStandardMaterial
          color={hitFlashTimer.current > 0 ? '#ffffff' : '#1c1d24'}
          metalness={0.9}
          roughness={0.2}
          emissive={isImmune ? '#ff2200' : isTelegraphing.current ? '#ff0000' : '#ff8800'}
          emissiveIntensity={hitFlashTimer.current > 0 ? 2.5 : isTelegraphing.current ? 2.0 : 0.4}
        />
      </Box>

      {/* Dual Cannon Arms */}
      <Cylinder args={[0.15, 0.15, 1.2, 16]} position={[-0.8, 0.8, -0.2]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color="#0e1017" metalness={0.9} roughness={0.1} />
      </Cylinder>
      <Cylinder args={[0.15, 0.15, 1.2, 16]} position={[0.8, 0.8, -0.2]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color="#0e1017" metalness={0.9} roughness={0.1} />
      </Cylinder>

      {/* Glowing Eye Visor */}
      <Sphere args={[0.2, 16, 16]} position={[0, 1.1, -0.62]}>
        <meshStandardMaterial
          color={isImmune ? '#ff0000' : '#ffaa00'}
          emissive={isImmune ? '#ff0000' : '#ffaa00'}
          emissiveIntensity={2.5}
        />
      </Sphere>

      {/* Rotating Energy Shield Ring */}
      <Ring
        ref={shieldRingRef}
        args={[1.1, 1.3, 32]}
        position={[0, 0.8, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <meshBasicMaterial
          color={isImmune ? '#ff2200' : '#3be2ff'}
          transparent
          opacity={isImmune ? 0.75 : 0.2}
          side={THREE.DoubleSide}
        />
      </Ring>

      {/* Red/Orange Warning Spotlight */}
      <pointLight
        position={[0, 1.5, 0]}
        color={isImmune ? '#ff2200' : '#ff8800'}
        intensity={isImmune ? 5 : 3}
        distance={10}
      />
    </group>
  );
}
