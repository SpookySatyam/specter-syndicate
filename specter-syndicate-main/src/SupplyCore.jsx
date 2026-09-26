import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Cylinder, Sphere, Ring, Box } from '@react-three/drei';
import * as THREE from 'three';
import playerState from './playerState';
import gameState from './gameState';
import useKeyboardControls from './useKeyboardControls';
import { getObjectiveForLevel, getTerrainHeight } from './levelGeometry';

export default function SupplyCore() {
  const groupRef = useRef();
  const orbRef = useRef();
  const ringRef = useRef();
  const keys = useKeyboardControls();
  const progressRef = useRef(0);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    const currentObj = getObjectiveForLevel(gameState.level);
    const targetPos = currentObj.core;
    const groundY = getTerrainHeight(targetPos[0], targetPos[1]);
    groupRef.current.position.set(targetPos[0], groundY, targetPos[1]);

    // Animate core orb & ring rotation
    if (orbRef.current) {
      orbRef.current.rotation.y += delta * 1.5;
      orbRef.current.position.y = 1.2 + Math.sin(Date.now() * 0.003) * 0.1;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 2.0;
    }

    // Distance check to player
    const px = playerState.position.x - targetPos[0];
    const pz = playerState.position.z - targetPos[1];
    const distSq = px * px + pz * pz;

    const isNearby = distSq < 6.25; // 2.5 unit interaction radius
    const isCollected = gameState.ammoCollected;

    if (isCollected) {
      // If already collected for this mission, ensure prompts and interaction are cleared
      if (progressRef.current > 0 || gameState.isInteracting || gameState.interactionText !== '') {
        progressRef.current = 0;
        gameState.isInteracting = false;
        gameState.interactionProgress = 0;
        gameState.interactionText = '';
        gameState.notify();
      }
      return;
    }

    if (isNearby && !gameState.gameOver && !gameState.victory && !gameState.mapOpen) {
      const isHoldingE = keys.current.held.has('e');

      if (isHoldingE) {
        progressRef.current = Math.min(1.0, progressRef.current + delta / 2.0); // 2 seconds hold duration
        gameState.isInteracting = true;
        gameState.interactionProgress = progressRef.current;
        gameState.interactionText = 'ACQUIRING AMMUNITION...';

        if (progressRef.current >= 1.0) {
          gameState.pickupAmmo(12); // sets ammoCollected = true, clears interactionText & isInteracting, updates objective
          progressRef.current = 0;
        } else {
          gameState.notify();
        }
      } else {
        if (progressRef.current > 0) {
          progressRef.current = 0;
          gameState.isInteracting = false;
          gameState.interactionProgress = 0;
        }
        if (gameState.interactionText !== 'HOLD E — ACQUIRE AMMUNITION') {
          gameState.interactionText = 'HOLD E — ACQUIRE AMMUNITION';
          gameState.notify();
        }
      }
    } else {
      // Outside interaction radius or game over
      if (progressRef.current > 0 || gameState.isInteracting || gameState.interactionText !== '') {
        progressRef.current = 0;
        gameState.isInteracting = false;
        gameState.interactionProgress = 0;
        gameState.interactionText = '';
        gameState.notify();
      }
    }
  });

  return (
    <group ref={groupRef} position={[16, 0, 16]}>
      {/* Base Pedestal */}
      <Cylinder args={[1.2, 1.5, 0.4, 6]} position={[0, 0.2, 0]}>
        <meshStandardMaterial color="#1a233a" metalness={0.8} roughness={0.2} />
      </Cylinder>

      {/* Inner Terminal Pillar */}
      <Cylinder args={[0.5, 0.6, 0.8, 16]} position={[0, 0.6, 0]}>
        <meshStandardMaterial color="#0e1726" metalness={0.9} roughness={0.1} />
      </Cylinder>

      {/* Floating Holographic Energy Core */}
      <Sphere ref={orbRef} args={[0.35, 32, 32]} position={[0, 1.2, 0]}>
        <meshStandardMaterial
          color="#3be2ff"
          emissive="#3be2ff"
          emissiveIntensity={gameState.coreCollected ? 0.3 : 2.5}
          transparent
          opacity={0.85}
        />
      </Sphere>

      {/* Rotating Energy Ring */}
      <Ring ref={ringRef} args={[0.5, 0.6, 32]} position={[0, 1.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <meshBasicMaterial color="#3be2ff" transparent opacity={gameState.coreCollected ? 0.2 : 0.6} side={THREE.DoubleSide} />
      </Ring>

      {/* Beacon Light */}
      <pointLight
        position={[0, 1.5, 0]}
        color="#3be2ff"
        intensity={gameState.coreCollected ? 1.5 : 6}
        distance={8}
      />
    </group>
  );
}
