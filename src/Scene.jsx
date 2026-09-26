/**
 * Scene configuration for Specter Syndicate.
 *
 * CAMERA SETTINGS:
 * - Isometric angle is achieved by placing an OrthographicCamera at roughly [15, 15, 15].
 * - The camera looks down at the origin [0, 0, 0].
 * - Adjust the `zoom` prop (currently 50) to change the framing of the play area.
 * - Higher zoom = closer to the character, lower zoom = wider view.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import CameraRig from './CameraRig';
// import { OrbitControls } from '@react-three/drei';
import Environment from './Environment';
import Player from './Player';
import Hunter from './Hunter';
import Objective from './Objective';
import SupplyCore from './SupplyCore';
import HealthPack from './HealthPack';
import gameState from './gameState';
import hunterState from './hunterState';
import playerState from './playerState';

// Patrol routes — spread across the play area so the player must weave between them
import { HEALTH_PACK_POSITIONS } from './levelGeometry';

const PATROL_ROUTES = [
  [[-6, -6], [6, -6], [6, 6], [-6, 6]],          // center square (0)
  [[-12, -10], [-4, -10], [-4, -2], [-12, -2]],  // south-west block (1)
  [[3, 8], [12, 3], [10, 12]],                   // north-east triangle (2)
  [[-12, 10], [-4, 10], [-4, 2], [-12, 2]],      // North-West (3)
  [[4, -12], [12, -12], [12, -4], [4, -4]],      // South-East (4)
  [[0, -12], [14, 0], [0, 12], [-14, 0]],        // Diamond (5)
  [[-8, -8], [8, 8]],                            // Diagonal line (6)
  [[8, -8], [-8, 8]],                            // Diagonal line 2 (7)
  [[-10, 0], [-10, -8], [0, -8]],                // L-shape (8)
  [[10, 0], [10, 8], [0, 8]],                    // L-shape 2 (9)
];

const LEVEL_CONFIG = {
  1: {
    startCount: 3,
    speedMult: 1.0,
    schedule: [
      { time: 0, count: 3 },
      { time: 30, count: 4 },
      { time: 60, count: 5 },
      { time: 90, count: 6 },
      { time: 120, count: 7 }
    ]
  },
  2: {
    startCount: 4,
    speedMult: 1.15,
    schedule: [
      { time: 0, count: 4 },
      { time: 30, count: 5 },
      { time: 60, count: 6 },
      { time: 90, count: 7 },
      { time: 120, count: 8 },
      { time: 150, count: 9 }
    ]
  },
  3: {
    startCount: 5,
    speedMult: 1.3,
    schedule: [
      { time: 0, count: 5 },
      { time: 30, count: 6 },
      { time: 60, count: 7 },
      { time: 90, count: 8 },
      { time: 120, count: 9 },
      { time: 150, count: 10 }
    ]
  }
};

function HunterManager() {
  const [activeCount, setActiveCount] = useState(() => (LEVEL_CONFIG[gameState.level] || LEVEL_CONFIG[1]).startCount);
  const pendingCountRef = useRef(activeCount);

  // Sync active count outside hot useFrame loop
  useEffect(() => {
    const timer = setInterval(() => {
      if (pendingCountRef.current !== activeCount) {
        setActiveCount(pendingCountRef.current);
        gameState.hunterCount = pendingCountRef.current;
      }
    }, 250);
    return () => clearInterval(timer);
  }, [activeCount]);

  useFrame((_, delta) => {
    if (gameState.gameOver || gameState.victory || gameState.mapOpen) return;
    
    gameState.survivalTime += delta;
    
    const config = LEVEL_CONFIG[gameState.level] || LEVEL_CONFIG[1];
    let targetCount = config.startCount;
    for (let i = 0; i < config.schedule.length; i++) {
      if (gameState.survivalTime >= config.schedule[i].time) {
        targetCount = config.schedule[i].count;
      }
    }
    
    // Add 1 extra hunter every 45 seconds beyond the end of the schedule for endless scaling
    const lastSchedule = config.schedule[config.schedule.length - 1];
    if (gameState.survivalTime > lastSchedule.time) {
      const extraTime = gameState.survivalTime - lastSchedule.time;
      targetCount += Math.floor(extraTime / 45);
    }
    
    // Cap at a reasonable maximum to maintain performance
    targetCount = Math.min(targetCount, 20);
    pendingCountRef.current = targetCount;

    // ---- Global Shadow Ranking Pass ----
    // Hard-cap shadow casting spotlights to MAX 3 active hunters total
    const activeHunterIds = Array.from({ length: activeCount }).map((_, i) => `hunter-${i}`);
    const px = playerState.position.x;
    const pz = playerState.position.z;

    // Discover Fog of War grid cell around player
    gameState.discoverTile(px, pz);

    const candidateList = activeHunterIds.map((id) => {
      const pos = hunterState.positions[id] || { x: 0, z: 0 };
      const state = hunterState.states[id] || 'patrol';
      const dx = pos.x - px;
      const dz = pos.z - pz;
      const distSq = dx * dx + dz * dz;
      return { id, state, distSq };
    });

    candidateList.sort((a, b) => {
      if (a.state === 'defeated' || b.state === 'defeated') {
        if (a.state === 'defeated') return 1;
        if (b.state === 'defeated') return -1;
      }
      const aAlert = a.state === 'alert' ? 1 : 0;
      const bAlert = b.state === 'alert' ? 1 : 0;
      if (aAlert !== bAlert) return bAlert - aAlert;
      return a.distSq - b.distSq;
    });

    const MAX_SHADOW_CASTERS = 3;
    for (let i = 0; i < candidateList.length; i++) {
      const { id } = candidateList[i];
      hunterState.shadowCasters[id] = i < MAX_SHADOW_CASTERS;
    }

    // ---- Global Detection Meter Calculation ----
    let isAnyInWhiteLight = false;
    let isAnyAlert = false;
    let isAnySuspicious = false;

    for (const id in hunterState.detections) {
      if (hunterState.states[id] === 'defeated') continue;
      if (hunterState.detections[id]) {
        isAnyInWhiteLight = true;
        break;
      }
    }
    for (const id in hunterState.states) {
      if (hunterState.states[id] === 'defeated') continue;
      const st = hunterState.states[id];
      if (st === 'alert' || st === 'combat') {
        isAnyAlert = true;
      } else if (st === 'suspicious' || st === 'investigating') {
        isAnySuspicious = true;
      }
    }

    let targetRate = -25; // Default smooth decay
    if (isAnyInWhiteLight) {
      targetRate = 50;
    } else if (isAnyAlert) {
      targetRate = 30;
    } else if (isAnySuspicious) {
      targetRate = 10;
    }

    gameState.detectionLevel = Math.max(0, Math.min(100, gameState.detectionLevel + targetRate * delta));

    // One-time score penalty trigger when detection crosses 80% (DETECTED state)
    if (gameState.detectionLevel >= 80) {
      if (!gameState.detectedPenaltyApplied) {
        gameState.detectedPenaltyApplied = true;
        gameState.detectionCount++;
        gameState.addScore(-100, 'DETECTION PENALTY');
      }
    } else if (gameState.detectionLevel < 30) {
      gameState.detectedPenaltyApplied = false;
    }
  });

  const speedMult = (LEVEL_CONFIG[gameState.level] || LEVEL_CONFIG[1]).speedMult;

  return (
    <>
      {Array.from({ length: activeCount }).map((_, i) => (
        <Hunter key={`hunter-${i}`} id={`hunter-${i}`} patrolPoints={PATROL_ROUTES[i % PATROL_ROUTES.length]} speedMult={speedMult} />
      ))}
    </>
  );
}

export default function Scene() {
  return (
    <>
      {/* Background & Atmosphere */}
      <color attach="background" args={['#0d0d14']} />
      <fog attach="fog" args={['#0d0d14', 45, 110]} />

      {/* Camera */}
      <CameraRig />
      {/* <OrbitControls /> */} {/* Uncomment for debug purposes */}

      {/* Lighting */}
      <ambientLight intensity={1.2} />
      <hemisphereLight args={['#5a7aab', '#1a1a2f', 0.8]} />

      <directionalLight
        castShadow
        position={[10, 20, 5]}
        intensity={2.5}
        color="#c8d1e0"
        shadow-mapSize={[2048, 2048]}
      >
        <orthographicCamera
          attach="shadow-camera"
          args={[-20, 20, 20, -20, 0.5, 50]}
        />
      </directionalLight>

      {/* World */}
      <Environment />

      {/* Entities */}

      <Objective />
      <SupplyCore />
      {HEALTH_PACK_POSITIONS.map((pos, i) => (
        <HealthPack key={`hp-${i}`} index={i} position={pos} />
      ))}
      <Player />
      <HunterManager />
    </>
  );
}
