/**
 * Environment.jsx — Full level layout for Specter Syndicate.
 *
 * PERFORMANCE NOTE:
 * If frame rate drops during the hackathon demo, reduce in this order:
 *   0. Particle Ambience (Environment.jsx) — disable <ParticleAmbience> first!
 *   0.5 Mode switch ring / Footstep juice (Player.jsx)
 *   1. shadow-mapSize on Hunter spotlights (Hunter.jsx) — try 512×512
 *   2. Number of simultaneous shadow-casting lights (disable castShadow on
 *      some Hunters, or reduce to 1-2 Hunters)
 *   3. Pillar count — remove pillars from the PILLAR_POSITIONS array below
 *   4. Perimeter wall castShadow — walls rarely cast gameplay-relevant shadows
 */

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Cylinder, Box, Cone } from '@react-three/drei';
import * as THREE from 'three';
import { PILLAR_RADIUS, BOUNDS, PROP_CRATES, PROP_BARRELS, getPillarsForLevel, getTerrainHeight } from './levelGeometry';
import gameState from './gameState';

const WALL_HEIGHT = 1.5;
const WALL_THICKNESS = 0.3;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Architectural column — core shadow-occluder for stealth gameplay. */
function Pillar({ position, shape = 'cylinder', rotY = 0 }) {
  const yBase = getTerrainHeight(position[0], position[1]);
  const yCenter = yBase + 2.25;

  if (shape === 'hex') {
    return (
      <Cylinder
        args={[PILLAR_RADIUS, PILLAR_RADIUS, 4.5, 6]}
        position={[position[0], yCenter, position[1]]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#42475e" roughness={0.7} metalness={0.15} />
      </Cylinder>
    );
  } else if (shape === 'box') {
    return (
      <Box
        args={[PILLAR_RADIUS * 2, 4.5, PILLAR_RADIUS * 2]}
        position={[position[0], yCenter, position[1]]}
        rotation={[0, rotY, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#42475e" roughness={0.7} metalness={0.15} />
      </Box>
    );
  }
  
  // Default cylinder
  return (
    <Cylinder
      args={[PILLAR_RADIUS, PILLAR_RADIUS, 4.5, 16]}
      position={[position[0], yCenter, position[1]]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color="#42475e" roughness={0.7} metalness={0.15} />
    </Cylinder>
  );
}

/** Thin perimeter wall segment. */
function Wall({ position, size }) {
  return (
    <Box args={size} position={position} castShadow receiveShadow>
      <meshStandardMaterial color="#2d3145" roughness={0.8} metalness={0.1} />
    </Box>
  );
}

/** Small decorative crate. */
function Crate({ pos, size, rotY }) {
  const yBase = getTerrainHeight(pos[0], pos[1]);
  return (
    <Box
      args={size}
      position={[pos[0], yBase + size[1] / 2, pos[1]]}
      rotation={[0, rotY, 0]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color="#4d4436" roughness={0.8} metalness={0.05} />
    </Box>
  );
}

/** Small decorative barrel / pipe. */
function Barrel({ pos, radius, height }) {
  const yBase = getTerrainHeight(pos[0], pos[1]);
  return (
    <Cylinder
      args={[radius, radius, height, 12]}
      position={[pos[0], yBase + height / 2, pos[1]]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color="#594d40" roughness={0.75} metalness={0.15} />
    </Cylinder>
  );
}

// ---------------------------------------------------------------------------
// Terrain Component
// ---------------------------------------------------------------------------
function Terrain() {
  const geomRef = useRef();

  React.useEffect(() => {
    if (!geomRef.current) return;
    const pos = geomRef.current.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      
      const worldX = x;
      const worldZ = -y;
      
      const height = getTerrainHeight(worldX, worldZ);
      pos.setZ(i, height);
    }
    geomRef.current.computeVertexNormals();
    pos.needsUpdate = true;
  }, []);

  return (
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry ref={geomRef} args={[100, 100, 64, 64]} />
      <meshStandardMaterial color="#1a1c27" roughness={0.9} metalness={0.05} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Particle Ambience
// ---------------------------------------------------------------------------
function ParticleAmbience() {
  const PARTICLE_COUNT = 100;
  const positions = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 1] = Math.random() * 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 40;
    }
    return pos;
  }, []);

  const particlesRef = useRef();

  useFrame((state, delta) => {
    if (!particlesRef.current) return;
    const posArray = particlesRef.current.geometry.attributes.position.array;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      posArray[i * 3 + 1] += delta * 0.3;
      if (posArray[i * 3 + 1] > 10) {
        posArray[i * 3 + 1] = 0;
        posArray[i * 3] = (Math.random() - 0.5) * 40;
        posArray[i * 3 + 2] = (Math.random() - 0.5) * 40;
      }
    }
    particlesRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={PARTICLE_COUNT}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial size={0.06} color="#cde8ff" transparent opacity={0.3} sizeAttenuation depthWrite={false} />
    </points>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function Environment() {
  return (
    <group>
      {/* ── Ground plane ── */}
      <Terrain />

      {/* ── Far-ground plane (subtle fade into fog) ── */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#14141e" roughness={0.9} metalness={0.05} />
      </mesh>

      {/* ── Pillars ── */}
      {getPillarsForLevel(gameState.level).map(([x, z], i) => {
        let shape = 'cylinder';
        let rotY = 0;
        if (gameState.level === 2) {
          shape = i % 2 === 0 ? 'hex' : 'cylinder';
        } else if (gameState.level === 3) {
          shape = i % 3 === 0 ? 'box' : 'cylinder';
          rotY = (i * 0.45) % Math.PI;
        }
        return <Pillar key={`pillar-${i}`} position={[x, z]} shape={shape} rotY={rotY} />;
      })}

      {/* ── Perimeter walls ── */}
      {/* North wall (+Z edge) */}
      <Wall
        position={[0, WALL_HEIGHT / 2, BOUNDS]}
        size={[BOUNDS * 2 + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS]}
      />
      {/* South wall (-Z edge) */}
      <Wall
        position={[0, WALL_HEIGHT / 2, -BOUNDS]}
        size={[BOUNDS * 2 + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS]}
      />
      {/* East wall (+X edge) */}
      <Wall
        position={[BOUNDS, WALL_HEIGHT / 2, 0]}
        size={[WALL_THICKNESS, WALL_HEIGHT, BOUNDS * 2 + WALL_THICKNESS]}
      />
      {/* West wall (-X edge) */}
      <Wall
        position={[-BOUNDS, WALL_HEIGHT / 2, 0]}
        size={[WALL_THICKNESS, WALL_HEIGHT, BOUNDS * 2 + WALL_THICKNESS]}
      />

      {/* ── Set dressing — crates ── */}
      {PROP_CRATES.map((c, i) => (
        <Crate key={`crate-${i}`} {...c} />
      ))}

      {/* ── Set dressing — barrels ── */}
      {PROP_BARRELS.map((b, i) => (
        <Barrel key={`barrel-${i}`} {...b} />
      ))}

      {/* ── Atmosphere ── */}
      <ParticleAmbience />
      <AtmosphericBackdrop />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Atmospheric Backdrop
// ---------------------------------------------------------------------------
function AtmosphericBackdrop() {
  const godRaysRef = useRef();

  useFrame((state) => {
    if (godRaysRef.current) {
      const t = state.clock.getElapsedTime();
      godRaysRef.current.children.forEach((ray, i) => {
        if (ray.material) {
          // Subtle shifting opacity based on time and index
          ray.material.opacity = 0.08 + Math.sin(t * 0.5 + i * 2) * 0.03;
        }
      });
    }
  });

  const mountainCount = 24;
  const mountains = useMemo(() => {
    const arr = [];
    let seed = 12345;
    // Simple deterministic PRNG so mountains look identical every mount
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    for (let i = 0; i < mountainCount; i++) {
      const angle = (i / mountainCount) * Math.PI * 2 + rand() * 0.2;
      const radius = 70 + rand() * 15;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      
      const height = 15 + rand() * 25;
      const width = 10 + rand() * 10;
      
      arr.push({ x, z, height, width, rotY: rand() * Math.PI });
    }
    return arr;
  }, []);

  return (
    <group>
      {/* Distant Mountains */}
      {mountains.map((m, i) => (
        <Cone 
          key={`mountain-${i}`}
          args={[m.width, m.height, 4]} 
          position={[m.x, m.height / 2 - 2, m.z]}
          rotation={[0, m.rotY, 0]}
        >
          <meshStandardMaterial color="#11131c" roughness={1.0} metalness={0.0} />
        </Cone>
      ))}

      {/* Distant Citadel Structure (center-back) */}
      <group position={[0, 0, -85]}>
        {/* Main Spire */}
        <Cylinder args={[3, 6, 45, 6]} position={[0, 22.5, 0]}>
          <meshStandardMaterial color="#0b0d14" roughness={1.0} metalness={0.0} />
        </Cylinder>
        {/* Side Towers */}
        <Box args={[6, 25, 6]} position={[-8, 12.5, 2]}>
          <meshStandardMaterial color="#0b0d14" roughness={1.0} metalness={0.0} />
        </Box>
        <Box args={[5, 30, 5]} position={[9, 15, -3]}>
          <meshStandardMaterial color="#0b0d14" roughness={1.0} metalness={0.0} />
        </Box>
      </group>

      {/* Volumetric God Rays */}
      <group ref={godRaysRef} position={[0, 40, -80]}>
        {/* Ray 1 */}
        <Cone args={[12, 120, 8]} position={[-15, -30, 15]} rotation={[-Math.PI / 4, 0, -Math.PI / 8]}>
          <meshBasicMaterial color="#cde8ff" transparent opacity={0.1} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </Cone>
        {/* Ray 2 */}
        <Cone args={[8, 120, 8]} position={[5, -30, 10]} rotation={[-Math.PI / 4, 0, Math.PI / 12]}>
          <meshBasicMaterial color="#cde8ff" transparent opacity={0.08} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </Cone>
        {/* Ray 3 */}
        <Cone args={[15, 120, 8]} position={[20, -20, 5]} rotation={[-Math.PI / 5, 0, Math.PI / 6]}>
          <meshBasicMaterial color="#cde8ff" transparent opacity={0.06} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </Cone>
      </group>
    </group>
  );
}
