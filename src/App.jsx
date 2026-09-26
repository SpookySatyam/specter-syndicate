import React, { useState, useCallback, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import Scene from './Scene';
import HUD from './HUD';
import gameState from './gameState';

export default function App() {
  /**
   * runId drives the `key` prop on <Scene>. Incrementing it causes React to
   * unmount and remount the entire 3D scene, resetting all refs (health,
   * position, patrol indices) to initial values — the simplest hackathon-safe
   * restart mechanism.
   */
  const [runId, setRunId] = useState(0);

  const handleRestart = useCallback(() => {
    gameState.reset(true); // full reset
    setRunId((id) => id + 1);
  }, []);

  useEffect(() => {
    let lastLevel = gameState.level;
    return gameState.subscribe(() => {
      if (gameState.level > lastLevel) {
        lastLevel = gameState.level;
        gameState.reset(false); // partial reset
        setRunId((id) => id + 1);
      }
    });
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', margin: 0, padding: 0, overflow: 'hidden' }}>
      <Canvas shadows dpr={[1, 1.5]} gl={{ toneMappingExposure: 1.8 }} style={{ position: 'absolute', inset: 0 }}>
        <Scene key={runId} />
      </Canvas>
      <HUD onRestart={handleRestart} />
    </div>
  );
}
