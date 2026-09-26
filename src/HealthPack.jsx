import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Box } from '@react-three/drei';
import gameState from './gameState';

export default function HealthPack({ index, position }) {
  const groupRef = useRef();
  const phaseOffset = useRef(index * Math.PI / 2); // stagger bobbing

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    
    // Toggle visibility based on active state without React re-renders
    const isActive = gameState.healthPacks[index];
    groupRef.current.visible = isActive;

    if (isActive) {
      // Gentle bob and rotate
      groupRef.current.rotation.y += delta;
      groupRef.current.position.y = 0.5 + Math.sin(state.clock.elapsedTime * 2 + phaseOffset.current) * 0.15;
      
      const targetPos = gameState.healthPackPositions[index];
      groupRef.current.position.x = targetPos[0];
      groupRef.current.position.z = targetPos[1];
    }
  });

  return (
    <group ref={groupRef} position={[gameState.healthPackPositions[index][0], 0.5, gameState.healthPackPositions[index][1]]}>
      <Box args={[0.2, 0.6, 0.2]} castShadow>
        <meshStandardMaterial color="#3bff6e" emissive="#3bff6e" emissiveIntensity={0.8} />
      </Box>
      <Box args={[0.6, 0.2, 0.2]} castShadow>
        <meshStandardMaterial color="#3bff6e" emissive="#3bff6e" emissiveIntensity={0.8} />
      </Box>
    </group>
  );
}
