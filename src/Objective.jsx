import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Torus } from '@react-three/drei';
import gameState from './gameState';
import { getObjectiveForLevel } from './levelGeometry';

export default function Objective() {
  const coreRef = useRef();
  const extractRef = useRef();

  const obj = getObjectiveForLevel(gameState.level);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    
    // Toggle visibility without React state/re-renders
    if (coreRef.current) {
      coreRef.current.visible = !gameState.coreCollected;
      if (!gameState.coreCollected) {
        coreRef.current.position.y = 0.6 + Math.sin(time * 3) * 0.2;
        coreRef.current.rotation.y = time;
      }
    }
    
    if (extractRef.current) {
      extractRef.current.visible = gameState.coreCollected && !gameState.victory;
      if (extractRef.current.visible) {
        extractRef.current.rotation.z = time * 0.5;
        const scale = 1 + Math.sin(time * 4) * 0.05;
        extractRef.current.scale.set(scale, scale, scale);
      }
    }
  });

  return (
    <group>
      <Sphere ref={coreRef} args={[0.3, 16, 16]} position={[obj.core[0], 0.6, obj.core[1]]} castShadow>
        <meshStandardMaterial color="#3be2ff" emissive="#3be2ff" emissiveIntensity={2} toneMapped={false} />
        <pointLight color="#3be2ff" intensity={2} distance={6} />
      </Sphere>
      
      <Torus ref={extractRef} args={[0.8, 0.1, 16, 32]} position={[obj.extraction[0], 0.1, obj.extraction[1]]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color="#3bff6e" emissive="#3bff6e" emissiveIntensity={2} toneMapped={false} />
        <pointLight color="#3bff6e" intensity={2} distance={6} />
      </Torus>
    </group>
  );
}
