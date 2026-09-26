import React, { useEffect, useRef } from 'react';
import gameState from './gameState';
import playerState from './playerState';
import hunterState from './hunterState';
import { getObjectiveForLevel, getPillarsForLevel, PLAYABLE_BOUNDS } from './levelGeometry';

const GUARDIAN_POS = [0, -4];

export default function TacticalMap({ onClose }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;

    const renderMap = () => {
      const width = canvas.width;
      const height = canvas.height;
      const size = Math.min(width, height) - 40;
      const originX = width / 2;
      const originY = height / 2;

      // Coordinate converter: World (x, z) -> Canvas (cx, cy)
      const WORLD_LIMIT = 20;
      const worldToCanvas = (wx, wz) => {
        const cx = originX + (wx / WORLD_LIMIT) * (size / 2);
        const cy = originY + (wz / WORLD_LIMIT) * (size / 2);
        return { cx, cy };
      };

      // 1. Clear background
      ctx.fillStyle = '#0a0c12';
      ctx.fillRect(0, 0, width, height);

      // 2. Draw outer bezel / frame
      ctx.strokeStyle = '#1e2838';
      ctx.lineWidth = 2;
      ctx.strokeRect(originX - size / 2, originY - size / 2, size, size);

      // Radar scanlines grid
      ctx.strokeStyle = 'rgba(59, 226, 255, 0.06)';
      ctx.lineWidth = 1;
      const GRID_STEPS = 10;
      const stepPx = size / GRID_STEPS;
      for (let i = 0; i <= GRID_STEPS; i++) {
        const p = originX - size / 2 + i * stepPx;
        ctx.beginPath();
        ctx.moveTo(p, originY - size / 2);
        ctx.lineTo(p, originY + size / 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(originX - size / 2, p);
        ctx.lineTo(originX + size / 2, p);
        ctx.stroke();
      }

      // 3. Draw Fog of War & Discovered Areas
      const tileSizePx = (2 / WORLD_LIMIT) * (size / 2); // 2-unit tiles
      for (let gx = 0; gx < 20; gx++) {
        for (let gz = 0; gz < 20; gz++) {
          const key = `${gx},${gz}`;
          const isDiscovered = gameState.discoveredGrid.has(key);
          const worldX = gx * 2 - 20;
          const worldZ = gz * 2 - 20;
          const { cx, cy } = worldToCanvas(worldX, worldZ);

          if (!isDiscovered) {
            ctx.fillStyle = 'rgba(5, 6, 10, 0.88)';
            ctx.fillRect(cx, cy, tileSizePx, tileSizePx);
          } else {
            ctx.fillStyle = 'rgba(26, 36, 54, 0.15)';
            ctx.fillRect(cx, cy, tileSizePx, tileSizePx);
          }
        }
      }

      // 4. Draw Playable Arena Bounds
      const boundsMin = worldToCanvas(-PLAYABLE_BOUNDS, -PLAYABLE_BOUNDS);
      const boundsMax = worldToCanvas(PLAYABLE_BOUNDS, PLAYABLE_BOUNDS);
      ctx.strokeStyle = 'rgba(59, 226, 255, 0.3)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(boundsMin.cx, boundsMin.cy, boundsMax.cx - boundsMin.cx, boundsMax.cy - boundsMin.cy);
      ctx.setLineDash([]);

      // 5. Draw Pillars & Obstacles
      const pillars = getPillarsForLevel(gameState.level);
      ctx.fillStyle = '#3a4259';
      for (const [px, pz] of pillars) {
        const { cx, cy } = worldToCanvas(px, pz);
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // 6. Draw Objectives
      const currentLevelObj = getObjectiveForLevel(gameState.level);
      const corePos = currentLevelObj.core;
      const extractPos = currentLevelObj.extraction;

      // Supply Core Marker
      const coreCoord = worldToCanvas(corePos[0], corePos[1]);
      ctx.fillStyle = gameState.hasAmmo ? '#2a4d5c' : '#3be2ff';
      ctx.shadowColor = gameState.hasAmmo ? 'transparent' : '#3be2ff';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(coreCoord.cx, coreCoord.cy, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (!gameState.hasAmmo && gameState.currentObjectiveStep <= 2) {
        ctx.fillStyle = '#3be2ff';
        ctx.font = 'bold 9px monospace';
        ctx.fillText('◆ CORE', coreCoord.cx + 10, coreCoord.cy + 3);
      }

      // Guardian Boss Marker
      if (!gameState.guardianDefeated) {
        const guardianCoord = worldToCanvas(GUARDIAN_POS[0], GUARDIAN_POS[1]);
        ctx.fillStyle = '#ff3b3b';
        ctx.shadowColor = '#ff3b3b';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(guardianCoord.cx, guardianCoord.cy, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#ff3b3b';
        ctx.font = 'bold 9px monospace';
        ctx.fillText('☠ GUARDIAN', guardianCoord.cx + 12, guardianCoord.cy + 3);
      }

      // Extraction Marker
      const extractCoord = worldToCanvas(extractPos[0], extractPos[1]);
      const isExtractActive = gameState.guardianDefeated || gameState.coreCollected;
      ctx.strokeStyle = isExtractActive ? '#3bff6e' : '#1e4a2c';
      ctx.lineWidth = 2;
      ctx.shadowColor = isExtractActive ? '#3bff6e' : 'transparent';
      ctx.shadowBlur = isExtractActive ? 10 : 0;
      ctx.beginPath();
      ctx.arc(extractCoord.cx, extractCoord.cy, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      if (isExtractActive) {
        ctx.fillStyle = '#3bff6e';
        ctx.font = 'bold 9px monospace';
        ctx.fillText('★ EXTRACTION', extractCoord.cx + 11, extractCoord.cy + 3);
      }

      // 7. Draw Enemy Threats
      const px = playerState.position.x;
      const pz = playerState.position.z;

      for (const id in hunterState.positions) {
        const st = hunterState.states[id];
        const hpos = hunterState.positions[id];
        if (!hpos) continue;

        if (st === 'defeated') {
          // Defeated guard marker X
          const { cx, cy } = worldToCanvas(hpos.x, hpos.z);
          ctx.strokeStyle = '#555';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cx - 4, cy - 4); ctx.lineTo(cx + 4, cy + 4);
          ctx.moveTo(cx + 4, cy - 4); ctx.lineTo(cx - 4, cy + 4);
          ctx.stroke();
          continue;
        }

        const dx = hpos.x - px;
        const dz = hpos.z - pz;
        const distSq = dx * dx + dz * dz;

        const isThreatActive = st === 'alert' || st === 'combat' || st === 'investigating' || st === 'suspicious';
        const isNearPlayer = distSq <= 144; // within 12 units

        // Reveal rule: visible if near player OR alerted/investigating
        if (isNearPlayer || isThreatActive) {
          const { cx, cy } = worldToCanvas(hpos.x, hpos.z);
          let color = '#ffd93b'; // suspicious / default
          if (st === 'alert' || st === 'combat') color = '#ff3b3b';
          else if (st === 'investigating') color = '#ff8800';

          ctx.fillStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(cx, cy, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;

          if (isThreatActive) {
            ctx.fillStyle = color;
            ctx.font = 'bold 8px monospace';
            ctx.fillText('!', cx + 7, cy - 5);
          }
        }
      }

      // 8. Draw Player Marker
      const pCoord = worldToCanvas(px, pz);
      ctx.fillStyle = gameState.modeColor || '#a63bff';
      ctx.shadowColor = gameState.modeColor || '#a63bff';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(pCoord.cx, pCoord.cy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pCoord.cx, pCoord.cy, 8, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px monospace';
      ctx.fillText('● OPERATIVE', pCoord.cx + 11, pCoord.cy + 3);

      animId = requestAnimationFrame(renderMap);
    };

    renderMap();
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(5, 7, 12, 0.92)',
        backdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto',
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      }}
    >
      {/* Header Banner */}
      <div style={{ marginBottom: 12, textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 4, color: '#3be2ff', textTransform: 'uppercase' }}>
          TACTICAL RADAR OVERLAY
        </div>
        <div style={{ fontSize: 11, letterSpacing: 2, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
          MISSION 0{gameState.level} &middot; AREA OF OPERATIONS
        </div>
      </div>

      {/* Canvas Radar */}
      <canvas
        ref={canvasRef}
        width={520}
        height={520}
        style={{
          border: '1px solid rgba(59, 226, 255, 0.3)',
          borderRadius: 8,
          boxShadow: '0 0 30px rgba(0,0,0,0.8), inset 0 0 20px rgba(59,226,255,0.05)',
        }}
      />

      {/* Legend & Controls Footer */}
      <div
        style={{
          marginTop: 16,
          display: 'flex',
          gap: 20,
          fontSize: 11,
          letterSpacing: 1.5,
          color: 'rgba(255,255,255,0.7)',
          background: 'rgba(15, 20, 30, 0.8)',
          padding: '8px 20px',
          borderRadius: 20,
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <span style={{ color: '#a63bff', fontWeight: 'bold' }}>● OPERATIVE</span>
        <span style={{ color: '#3be2ff', fontWeight: 'bold' }}>◆ CORE</span>
        <span style={{ color: '#ff3b3b', fontWeight: 'bold' }}>☠ GUARDIAN</span>
        <span style={{ color: '#3bff6e', fontWeight: 'bold' }}>★ EXTRACTION</span>
        <span style={{ color: '#ffd93b', fontWeight: 'bold' }}>! THREAT</span>
      </div>

      <button
        onClick={onClose}
        style={{
          marginTop: 14,
          padding: '8px 24px',
          background: 'rgba(59, 226, 255, 0.15)',
          border: '1px solid rgba(59, 226, 255, 0.4)',
          borderRadius: 4,
          color: '#3be2ff',
          fontSize: 12,
          letterSpacing: 2,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        [M / ESC] CLOSE MAP
      </button>
    </div>
  );
}
