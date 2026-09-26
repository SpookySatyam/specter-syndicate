let audioCtx = null;

export function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playTone(freq, type, duration, vol) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

export function playAlert() {
  playTone(880, 'square', 0.2, 0.05);
  setTimeout(() => playTone(1108, 'square', 0.3, 0.05), 100);
}

export function playGameOver() {
  playTone(150, 'sawtooth', 1.0, 0.1);
}

export function playVictory() {
  playTone(440, 'sine', 0.2, 0.05);
  setTimeout(() => playTone(554, 'sine', 0.2, 0.05), 150);
  setTimeout(() => playTone(659, 'sine', 0.4, 0.05), 300);
}

export function playHeartbeat() {
  playTone(60, 'sine', 0.2, 0.1);
  setTimeout(() => playTone(50, 'sine', 0.3, 0.08), 200);
}
