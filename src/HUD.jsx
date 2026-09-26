import React, { useState, useEffect, useCallback, useRef } from 'react';
import gameState from './gameState';

// ---------------------------------------------------------------------------
// Styles — dark/moody to match the game aesthetic
// ---------------------------------------------------------------------------
const S = {
  overlay: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    fontFamily: '"JetBrains Mono", "Fira Code", "Courier New", monospace',
    zIndex: 10,
    userSelect: 'none',
  },
  scanlines: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))',
    backgroundSize: '100% 4px, 3px 100%',
    boxShadow: 'inset 0 0 100px rgba(0,0,0,0.9)',
    zIndex: 5,
  },
  vignette: (isLowHealth) => ({
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    boxShadow: isLowHealth ? 'inset 0 0 150px rgba(255,0,0,0.5)' : 'none',
    transition: 'box-shadow 0.2s',
    animation: isLowHealth ? 'vignettePulse 1s alternate infinite' : 'none',
    zIndex: 4,
  }),

  // ── Top-Left: Health Only ──
  topLeft: {
    position: 'absolute',
    top: 24,
    left: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  healthOuter: {
    width: 220,
    height: 14,
    background: 'rgba(0,0,0,0.6)',
    borderRadius: 3,
    border: '1px solid rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  healthInner: (pct, color, justHealed) => ({
    width: `${pct}%`,
    height: '100%',
    background: justHealed ? '#00ff44' : color,
    boxShadow: justHealed ? '0 0 15px #00ff44' : 'none',
    transition: 'width 0.15s ease-out, background 0.3s, box-shadow 0.3s',
    animation: pct < 25 ? 'healthPulse 1.5s infinite alternate' : 'none',
    borderRadius: 3,
  }),
  healthLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.75)',
    textTransform: 'uppercase',
    marginBottom: 2,
  },

  // ── Top-Center: Objective + Level ──
  topCenter: {
    position: 'absolute',
    top: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  objectiveText: (highlight) => ({
    fontSize: 13,
    letterSpacing: 2,
    color: highlight ? '#3be2ff' : '#3bff6e',
    textTransform: 'uppercase',
    textShadow: highlight ? '0 0 8px rgba(59,226,255,0.4)' : '0 0 8px rgba(59,255,110,0.4)',
    fontWeight: 'bold',
  }),

  // ── Top-Right: Alert Bar ──
  topRight: {
    position: 'absolute',
    top: 24,
    right: 24,
  },
  alertBar: {
    background: 'rgba(150, 0, 0, 0.4)',
    border: '1px solid rgba(255, 59, 59, 0.6)',
    borderRadius: 4,
    padding: '6px 14px',
    display: 'flex',
    alignItems: 'center',
    color: '#ff3b3b',
    fontWeight: 800,
    fontSize: 13,
    letterSpacing: 2,
    textTransform: 'uppercase',
    textShadow: '0 0 10px rgba(255,59,59,0.7)',
    animation: 'alertPulse 0.6s infinite alternate',
    boxShadow: '0 0 15px rgba(255, 0, 0, 0.3)',
  },

  // ── Bottom-Left: Mode & Stats ──
  bottomLeft: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  modeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  modeSwatch: (color) => ({
    width: 12,
    height: 12,
    borderRadius: 2,
    background: color,
    boxShadow: `0 0 6px ${color}66`,
  }),
  modeText: {
    fontSize: 12,
    letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.9)',
    textTransform: 'uppercase',
    fontWeight: 'bold',
  },
  statsText: {
    fontSize: 10,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase',
  },

  // ── Bottom-Center: Controls ──
  bottomCenter: {
    position: 'absolute',
    bottom: 24,
    left: '50%',
    transform: 'translateX(-50%)',
    pointerEvents: 'auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  controlsPanel: (isExpanded) => ({
    background: 'rgba(0,0,0,0.85)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: isExpanded ? 4 : 24,
    padding: isExpanded ? '14px 18px' : '0',
    width: isExpanded ? 'auto' : 32,
    height: isExpanded ? 'auto' : 32,
    display: 'flex',
    flexDirection: 'column',
    alignItems: isExpanded ? 'flex-start' : 'center',
    justifyContent: isExpanded ? 'flex-start' : 'center',
    gap: 6,
    transition: 'all 0.4s ease',
    overflow: 'hidden',
    cursor: isExpanded ? 'default' : 'pointer',
    opacity: isExpanded ? 1 : 0.6,
  }),
  controlsIcon: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'rgba(255,255,255,0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  controlsHeading: {
    fontSize: 13,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.95)',
    textTransform: 'uppercase',
    marginBottom: 4,
    whiteSpace: 'nowrap',
  },
  controlsLine: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    textTransform: 'uppercase',
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    whiteSpace: 'nowrap',
  },
  kbd: {
    fontFamily: '"JetBrains Mono", "Fira Code", "Courier New", monospace',
    background: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    padding: '1px 4px',
    marginRight: 2,
    marginLeft: 2,
    display: 'inline-block',
  },
  controlsWarning: {
    fontSize: 9,
    color: 'rgba(255,80,80,0.75)',
    textTransform: 'uppercase',
    marginTop: 4,
    whiteSpace: 'nowrap',
  },

  // ── Game-over overlay ──
  gameOver: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.82)',
    pointerEvents: 'auto',
  },
  caughtText: {
    fontSize: 52,
    fontWeight: 800,
    letterSpacing: 14,
    color: '#ff3b3b',
    textShadow: '0 0 30px rgba(255,59,59,0.5)',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 13,
    letterSpacing: 3,
    color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase',
    marginBottom: 36,
  },
  restartBtn: {
    padding: '12px 36px',
    fontSize: 13,
    fontWeight: 700,
    fontFamily: 'inherit',
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: '#fff',
    background: 'rgba(255,59,59,0.15)',
    border: '1px solid rgba(255,59,59,0.4)',
    borderRadius: 4,
    cursor: 'pointer',
    transition: 'background 0.2s, border-color 0.2s',
    pointerEvents: 'auto',
  },

  // ── Victory Styles ──
  victoryText: {
    fontSize: 52,
    fontWeight: 800,
    letterSpacing: 14,
    color: '#3bff6e',
    textShadow: '0 0 30px rgba(59,255,110,0.5)',
    textTransform: 'uppercase',
    marginBottom: 12,
    textAlign: 'center',
  },
  restartBtnVictory: {
    padding: '12px 36px',
    fontSize: 13,
    fontWeight: 700,
    fontFamily: 'inherit',
    letterSpacing: 3,
    textTransform: 'uppercase',
    color: '#fff',
    background: 'rgba(59,255,110,0.15)',
    border: '1px solid rgba(59,255,110,0.4)',
    borderRadius: 4,
    cursor: 'pointer',
    transition: 'background 0.2s, border-color 0.2s',
    pointerEvents: 'auto',
  },
  
  // ── Level Complete Transition ──
  levelCompleteText: {
    fontSize: 42,
    fontWeight: 800,
    letterSpacing: 10,
    color: '#3be2ff',
    textShadow: '0 0 30px rgba(59,226,255,0.5)',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
};

// ---------------------------------------------------------------------------
// Health bar color: green → yellow → red
// ---------------------------------------------------------------------------
function healthColor(pct) {
  if (pct > 60) return '#3bff6e';
  if (pct > 30) return '#ffd93b';
  return '#ff3b3b';
}

// ---------------------------------------------------------------------------
// HUD component — rendered as DOM overlay OUTSIDE <Canvas>
// ---------------------------------------------------------------------------
const keyframes = `
@keyframes healthPulse {
  0% { opacity: 1; box-shadow: 0 0 12px rgba(255, 59, 59, 0.8); }
  100% { opacity: 0.5; box-shadow: 0 0 2px rgba(255, 59, 59, 0.2); }
}
@keyframes vignettePulse {
  0% { box-shadow: inset 0 0 200px rgba(255, 0, 0, 0.6); }
  100% { box-shadow: inset 0 0 80px rgba(255, 0, 0, 0.2); }
}
@keyframes alertPulse {
  0% { opacity: 1; box-shadow: 0 0 20px rgba(255, 0, 0, 0.5); }
  100% { opacity: 0.6; box-shadow: 0 0 5px rgba(255, 0, 0, 0.1); }
}
`;

import TacticalMap from './TacticalMap';

export default function HUD({ onRestart }) {
  // Force-update counter — incremented by gameState.notify()
  const [, setTick] = useState(0);
  const [justHealed, setJustHealed] = useState(false);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [controlsHovered, setControlsHovered] = useState(false);
  const mountTimeRef = useRef(0);

  useEffect(() => {
    mountTimeRef.current = Date.now();
    let healTimeout;

    // Auto-collapse briefing panel after 5 seconds
    const briefingTimer = setTimeout(() => {
      if (gameState.showBriefing && !gameState.briefingCollapsed) {
        gameState.briefingCollapsed = true;
        gameState.notify();
      }
    }, 5000);

    const unsub = gameState.subscribe(() => {
      setTick((n) => n + 1);
      
      if (gameState.healPulse > 0 && Date.now() - gameState.healPulse < 100) {
        setJustHealed(true);
        clearTimeout(healTimeout);
        healTimeout = setTimeout(() => setJustHealed(false), 300);
      }

      // Collapse tutorial controls panel after player moves & jumps
      if (gameState.hasMoved && gameState.hasJumped && (Date.now() - mountTimeRef.current >= 3000)) {
        setControlsCollapsed(true);
      }
    });

    return () => {
      unsub();
      clearTimeout(healTimeout);
      clearTimeout(briefingTimer);
    };
  }, []);

  // Read live values from the singleton (already throttled by Player.jsx)
  const hp = Math.round(Math.max(0, gameState.health));
  const pct = (hp / gameState.maxHealth) * 100;
  const isGameOver = gameState.gameOver;
  const isVictory = gameState.victory;
  const isLevelComplete = gameState.levelComplete;
  const hideHint = isGameOver || isVictory || isLevelComplete || gameState.mapOpen;
  const isLowHealth = hp > 0 && hp < 25;
  const mins = Math.floor(gameState.syncedSurvivalTime / 60);
  const secs = (gameState.syncedSurvivalTime % 60).toString().padStart(2, '0');

  const handleRestart = useCallback(() => {
    if (onRestart) onRestart();
  }, [onRestart]);

  const showFullControls = !controlsCollapsed || controlsHovered;

  // Boss HP & Phase calculation
  const guardianHpPct = Math.max(0, (gameState.guardianHealth / gameState.guardianMaxHealth) * 100);
  const showBossBar = !gameState.guardianDefeated && (gameState.currentObjectiveStep >= 3 || gameState.hasAmmo);

  return (
    <div style={S.overlay}>
      <style>{keyframes}</style>
      <div style={S.scanlines} />
      <div style={S.vignette(isLowHealth)} />

      {/* ── Tactical Map Overlay Component ── */}
      {gameState.mapOpen && (
        <TacticalMap onClose={() => gameState.toggleMap()} />
      )}
      
      {/* ── Top-Left: Health & Ammo ── */}
      <div style={S.topLeft}>
        <div style={S.healthLabel}>Hull Integrity</div>
        <div style={S.healthOuter}>
          <div style={S.healthInner(pct, healthColor(pct), justHealed)} />
        </div>
        <div style={{ marginTop: 6, fontSize: 11, letterSpacing: 1.5, color: gameState.hasAmmo ? '#3be2ff' : 'rgba(255,255,255,0.4)', fontWeight: 'bold', textTransform: 'uppercase' }}>
          AMMO: {gameState.ammo} / {gameState.maxAmmo}
        </div>
      </div>

      {/* ── Top-Center: Boss Health Bar OR Mission Briefing / Objective Tracker ── */}
      <div style={S.topCenter}>
        {showBossBar ? (
          <div style={{
            background: 'rgba(15, 10, 15, 0.92)',
            border: `1px solid ${gameState.hasAmmo ? '#ff8800' : '#ff2200'}`,
            borderRadius: 6,
            padding: '10px 20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: 320,
            backdropFilter: 'blur(6px)',
            boxShadow: '0 0 20px rgba(255,59,59,0.3)',
          }}>
            <div style={{ fontSize: 11, letterSpacing: 2, color: gameState.hasAmmo ? '#ffaa00' : '#ff3b3b', fontWeight: 800, textTransform: 'uppercase', marginBottom: 4 }}>
              THE GUARDIAN &middot; PHASE {gameState.guardianPhase}
            </div>
            {/* Boss HP Bar */}
            <div style={{ width: '100%', height: 10, background: 'rgba(0,0,0,0.7)', borderRadius: 3, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{
                width: `${guardianHpPct}%`,
                height: '100%',
                background: gameState.hasAmmo ? 'linear-gradient(90deg, #ff8800, #ffaa00)' : '#ff2200',
                transition: 'width 0.15s ease-out',
                boxShadow: '0 0 10px #ff8800',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginTop: 4, fontSize: 10, letterSpacing: 1.5, color: 'rgba(255,255,255,0.7)' }}>
              <span>HP {Math.round(gameState.guardianHealth)} / {gameState.guardianMaxHealth}</span>
              <span style={{ color: gameState.hasAmmo ? '#3bff6e' : '#ff3b3b', fontWeight: 'bold' }}>
                {gameState.hasAmmo ? 'VULNERABLE [F]' : 'IMMUNE — ACQUIRE AMMO'}
              </span>
            </div>
          </div>
        ) : gameState.briefingOpen ? (
          /* Full Mission Briefing Card at Level Start */
          <div style={{
            background: 'rgba(10, 12, 20, 0.94)',
            border: '1px solid #3be2ff',
            borderRadius: 8,
            padding: '14px 20px',
            width: 320,
            maxWidth: '90vw',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            backdropFilter: 'blur(8px)',
            boxShadow: '0 0 25px rgba(59,226,255,0.3)',
            animation: 'fadeIn 0.3s ease-out',
            boxSizing: 'border-box',
          }}>
            <div style={{ fontSize: 12, letterSpacing: 2.5, color: '#3be2ff', fontWeight: 800, textTransform: 'uppercase' }}>
              MISSION 0{gameState.level} &middot; RECOVER THE CORE
            </div>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.75)', fontStyle: 'italic', borderLeft: '2px solid #3be2ff', paddingLeft: 8, lineHeight: 1.4 }}>
              "Enemy forces control the central stronghold. Locate the Supply Core before engaging the Guardian."
            </div>
            <div style={{ fontSize: 10, letterSpacing: 1.5, color: '#3bff6e', fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>
              OBJECTIVES
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10.5 }}>
              {[
                { id: 1, text: 'Reach Supply Core' },
                { id: 2, text: 'Acquire Ammunition' },
                { id: 3, text: 'Eliminate Guardian' },
                { id: 4, text: 'Reach Extraction' }
              ].map(obj => {
                const completed = gameState.objectivesCompleted[obj.id];
                const isCurrent = gameState.currentObjectiveStep === obj.id;
                let color = 'rgba(255,255,255,0.4)';
                if (completed) color = '#3bff6e';
                else if (isCurrent) color = '#3be2ff';

                return (
                  <div key={obj.id} style={{ color, display: 'flex', alignItems: 'center', gap: 8, fontWeight: isCurrent ? 700 : 400 }}>
                    <span>{completed ? '✓' : '○'}</span>
                    <span>{obj.text}</span>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => gameState.toggleBriefing()}
              style={{
                marginTop: 4,
                padding: '4px 10px',
                fontSize: 10,
                letterSpacing: 1.5,
                background: 'rgba(59,226,255,0.15)',
                border: '1px solid rgba(59,226,255,0.4)',
                borderRadius: 3,
                color: '#3be2ff',
                cursor: 'pointer',
                alignSelf: 'flex-end',
              }}
            >
              [J] COLLAPSE BRIEFING
            </button>
          </div>
        ) : (
          /* Compact Objective Tracker */
          <div style={{
            background: 'rgba(10, 12, 18, 0.85)',
            border: '1px solid rgba(59, 226, 255, 0.3)',
            borderRadius: 6,
            padding: '6px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            backdropFilter: 'blur(4px)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            cursor: 'pointer',
          }} onClick={() => gameState.toggleBriefing()}>
            <span style={{ fontSize: 10, letterSpacing: 1.5, color: '#3be2ff', fontWeight: 800 }}>OBJECTIVE</span>
            <span style={{ fontSize: 12, letterSpacing: 1, color: '#3bff6e', fontWeight: 700 }}>
              → {[
                'Reach Supply Core',
                'Acquire Ammunition',
                'Eliminate Guardian',
                'Reach Extraction'
              ][gameState.currentObjectiveStep - 1] || 'Reach Extraction'}
            </span>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginLeft: 6 }}>[J]</span>
          </div>
        )}
      </div>

      {/* ── Top-Right: Detection Meter & Alert ── */}
      {!hideHint && (
        <div style={S.topRight}>
          <div style={{
            background: 'rgba(10, 12, 18, 0.85)',
            border: `1px solid ${
              gameState.detectionLevel >= 80 ? '#ff3b3b' :
              gameState.detectionLevel >= 50 ? '#ff8800' :
              gameState.detectionLevel >= 20 ? '#ffd93b' : 'rgba(255,255,255,0.12)'
            }`,
            borderRadius: 6,
            padding: '8px 14px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 4,
            backdropFilter: 'blur(4px)',
            boxShadow: gameState.detectionLevel >= 80 ? '0 0 15px rgba(255,59,59,0.4)' : '0 4px 16px rgba(0,0,0,0.5)',
            transition: 'border-color 0.2s, box-shadow 0.2s',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: 140, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}>
              <span>Detection</span>
              <span style={{
                color: gameState.detectionLevel >= 80 ? '#ff3b3b' :
                       gameState.detectionLevel >= 50 ? '#ff8800' :
                       gameState.detectionLevel >= 20 ? '#ffd93b' : '#3be2ff',
                fontWeight: 'bold'
              }}>
                {Math.round(gameState.detectionLevel)}%
              </span>
            </div>
            {/* Meter Bar */}
            <div style={{ width: 140, height: 6, background: 'rgba(0,0,0,0.6)', borderRadius: 2, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{
                width: `${gameState.detectionLevel}%`,
                height: '100%',
                background: gameState.detectionLevel >= 80 ? '#ff3b3b' :
                            gameState.detectionLevel >= 50 ? '#ff8800' :
                            gameState.detectionLevel >= 20 ? '#ffd93b' : '#3be2ff',
                transition: 'width 0.1s ease-out, background 0.2s',
                borderRadius: 2,
              }} />
            </div>
            <div style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              color: gameState.detectionLevel >= 80 ? '#ff3b3b' :
                     gameState.detectionLevel >= 50 ? '#ff8800' :
                     gameState.detectionLevel >= 20 ? '#ffd93b' : 'rgba(255,255,255,0.4)',
            }}>
              {gameState.getDetectionStatus()}
            </div>
          </div>
        </div>
      )}

      {/* ── Score Notifications Feed ── */}
      <div style={{
        position: 'absolute',
        top: 90,
        right: 24,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 6,
        pointerEvents: 'none',
        zIndex: 20
      }}>
        {gameState.scorePopups.slice(-3).map(popup => (
          <div key={popup.id} style={{
            background: 'rgba(10, 12, 18, 0.9)',
            border: `1px solid ${popup.points < 0 ? '#ff3b3b' : '#3bff6e'}`,
            color: popup.points < 0 ? '#ff3b3b' : '#3bff6e',
            borderRadius: 4,
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 1.5,
            boxShadow: `0 0 10px ${popup.points < 0 ? 'rgba(255,59,59,0.3)' : 'rgba(59,255,110,0.3)'}`,
          }}>
            {popup.points >= 0 ? `+${popup.points}` : popup.points} {popup.text}
          </div>
        ))}
      </div>

      {/* ── Bottom-Left: Mode & Stats ── */}
      <div style={S.bottomLeft}>
        <div style={S.modeRow}>
          <div style={S.modeSwatch(gameState.modeColor)} />
          <span style={S.modeText}>{gameState.modeName} Mode</span>
        </div>
        <div style={S.statsText}>
          SCORE: {gameState.score} &middot; SURVIVED: {mins}:{secs} &middot; THREATS: {gameState.hunterCount}
        </div>
      </div>

      {/* ── Interaction Prompt & Progress ── */}
      {gameState.interactionText && !hideHint && (
        <div style={{
          position: 'absolute',
          bottom: 120,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(10, 12, 18, 0.92)',
          border: '1px solid #3be2ff',
          borderRadius: 6,
          padding: '10px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          boxShadow: '0 0 20px rgba(59,226,255,0.4)',
          zIndex: 30,
        }}>
          <div style={{ fontSize: 11, letterSpacing: 1.5, color: '#3be2ff', fontWeight: 800, textTransform: 'uppercase' }}>
            {gameState.interactionText}
          </div>
          {gameState.isInteracting && (
            <div style={{ width: 160, height: 6, background: 'rgba(0,0,0,0.6)', borderRadius: 3, overflow: 'hidden', border: '1px solid rgba(59,226,255,0.3)' }}>
              <div style={{
                width: `${gameState.interactionProgress * 100}%`,
                height: '100%',
                background: '#3be2ff',
                boxShadow: '0 0 10px #3be2ff',
                transition: 'width 0.05s linear',
              }} />
            </div>
          )}
        </div>
      )}

      {/* ── Bottom-Center: Controls ── */}
      {!hideHint && (
        <div 
          style={S.bottomCenter}
          onMouseEnter={() => setControlsHovered(true)}
          onMouseLeave={() => setControlsHovered(false)}
        >
          <div style={S.controlsPanel(showFullControls)}>
            {showFullControls ? (
              <>
                <div style={S.controlsHeading}>Controls</div>
                <div style={S.controlsLine}>
                  <span style={S.kbd}>WASD</span> / <span style={S.kbd}>Arrows</span> — Move
                </div>
                <div style={S.controlsLine}>
                  <span style={S.kbd}>Space</span> — Jump / Vault
                </div>
                <div style={S.controlsLine}>
                  <span style={S.kbd}>F</span> — Fire Bullet / Air Strike
                </div>
                <div style={S.controlsLine}>
                  <span style={S.kbd}>M</span> — Tactical Map
                </div>
                <div style={S.controlsLine}>
                  <span style={S.kbd}>J</span> — Objective Briefing
                </div>
                <div style={S.controlsLine}>
                  <span style={S.kbd}>1</span> / <span style={S.kbd}>2</span> / <span style={S.kbd}>3</span> — Mode Switch
                </div>
              </>
            ) : (
              <div style={S.controlsIcon}>?</div>
            )}
          </div>
        </div>
      )}

      {/* ── Game-over screen ── */}
      {isGameOver && (
        <div style={S.gameOver}>
          <div style={S.caughtText}>Caught</div>
          <div style={S.subtitle}>The shadows could not hide you</div>
          <button
            style={S.restartBtn}
            onClick={handleRestart}
          >
            Try Again
          </button>
        </div>
      )}

      {/* ── Mission Complete / Victory Screen Overlay ── */}
      {(isVictory || isLevelComplete) && (
        <div style={S.gameOver}>
          <div style={{
            background: 'rgba(10, 14, 22, 0.94)',
            border: '1px solid #3bff6e',
            borderRadius: 8,
            padding: '28px 40px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            boxShadow: '0 0 40px rgba(59,255,110,0.3)',
            backdropFilter: 'blur(10px)',
            maxWidth: 460,
            width: '90%',
          }}>
            <div style={S.victoryText}>MISSION COMPLETE</div>
            <div style={{ fontSize: 13, letterSpacing: 3, color: '#3be2ff', fontWeight: 700, textTransform: 'uppercase' }}>
              RATING: {gameState.detectionCount === 0 ? 'S-RANK [PERFECT STEALTH]' : gameState.detectionCount <= 2 ? 'A-RANK [PROFESSIONAL]' : 'B-RANK [SURVIVOR]'}
            </div>

            <div style={{ width: '100%', height: 1, background: 'rgba(255,255,255,0.1)', margin: '8px 0' }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', width: '100%', fontSize: 11, letterSpacing: 1.5, color: 'rgba(255,255,255,0.8)' }}>
              <div>SURVIVAL TIME: <span style={{ color: '#fff', fontWeight: 'bold' }}>{mins}:{secs}</span></div>
              <div>GUARDS ELIMINATED: <span style={{ color: '#fff', fontWeight: 'bold' }}>{gameState.guardsEliminated}</span></div>
              <div>STEALTH KILLS: <span style={{ color: '#3bff6e', fontWeight: 'bold' }}>{gameState.stealthKills}</span></div>
              <div>AIR ASSASSINATIONS: <span style={{ color: '#3be2ff', fontWeight: 'bold' }}>{gameState.airAssassinations}</span></div>
              <div>DETECTION EVENTS: <span style={{ color: gameState.detectionCount === 0 ? '#3bff6e' : '#ff3b3b', fontWeight: 'bold' }}>{gameState.detectionCount}</span></div>
              <div>AMMO FIRED: <span style={{ color: '#fff', fontWeight: 'bold' }}>{gameState.ammoFired}</span></div>
            </div>

            <div style={{ width: '100%', height: 1, background: 'rgba(255,255,255,0.1)', margin: '8px 0' }} />

            <div style={{ fontSize: 16, letterSpacing: 3, color: '#3bff6e', fontWeight: 800 }}>
              TOTAL SCORE: {gameState.score + (gameState.detectionCount === 0 ? 500 : 0)}
            </div>

            <button
              style={S.restartBtnVictory}
              onClick={handleRestart}
              onMouseEnter={(e) => {
                e.target.style.background = 'rgba(59,255,110,0.3)';
                e.target.style.borderColor = 'rgba(59,255,110,0.7)';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'rgba(59,255,110,0.15)';
                e.target.style.borderColor = 'rgba(59,255,110,0.4)';
              }}
            >
              {gameState.level < 3 && isLevelComplete && !isVictory ? 'PROCEED TO NEXT LEVEL' : 'PLAY AGAIN'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
