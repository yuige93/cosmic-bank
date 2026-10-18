// Decorative effects only: audio never participates in ticket generation.
export function createLuckEffects({ overlay, isSoundEnabled = () => true } = {}) {
  let context = null;
  let generation = 0;
  let cleanupTimer = null;
  const voices = new Set();
  const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const soundEnabled = () => {
    try { return Boolean(isSoundEnabled()); } catch { return false; }
  };

  function clearVisuals() {
    clearTimeout(cleanupTimer);
    cleanupTimer = null;
    if (!overlay) return;
    overlay.classList.remove('is-holding', 'is-celebrating', 'is-reduced-motion');
    overlay.replaceChildren();
  }

  function stopVoices() {
    for (const voice of [...voices]) {
      try {
        const now = context.currentTime;
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setTargetAtTime(0, now, 0.012);
        voice.oscillator.stop(now + 0.05);
      } catch { voice.dispose(); }
    }
  }

  function tone(frequency, start, duration, volume, endFrequency = frequency) {
    let oscillator;
    let gain;
    let voice;
    try {
      oscillator = context.createOscillator();
      gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + Math.min(0.07, duration / 4));
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      voice = { oscillator, gain, dispose() {
        voices.delete(voice);
        try { oscillator.disconnect(); } catch {}
        try { gain.disconnect(); } catch {}
      } };
      voices.add(voice);
      oscillator.onended = voice.dispose;
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    } catch {
      if (voice) voice.dispose();
      else {
        try { oscillator?.disconnect(); } catch {}
        try { gain?.disconnect(); } catch {}
      }
    }
  }

  function startHold() {
    const currentGeneration = ++generation;
    clearVisuals();
    stopVoices();
    if (overlay) {
      overlay.setAttribute('aria-hidden', 'true');
      overlay.classList.toggle('is-reduced-motion', reducedMotion());
      overlay.classList.add('is-holding');
    }
    if (!soundEnabled()) return;
    // Call this method directly inside the trusted pointer/key event handler.
    // resume() is invoked synchronously here; celebrate() never unlocks audio.
    try {
      const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContext) return;
      if (!context || context.state === 'closed') context = new AudioContext();
      const playRise = () => {
        if (generation !== currentGeneration || !soundEnabled() || context.state !== 'running') return;
        tone(220, context.currentTime, 1.45, 0.035, 660);
      };
      if (context.state === 'running') playRise();
      else Promise.resolve(context.resume()).then(playRise).catch(() => {});
    } catch { /* Unsupported or denied audio must not block the ritual. */ }
  }

  function cancelHold() {
    ++generation;
    clearVisuals();
    stopVoices();
  }

  function quiet() {
    ++generation;
    stopVoices();
  }

  function dispose() {
    cancelHold();
    try {
      if (context && context.state !== 'closed') Promise.resolve(context.close()).catch(() => {});
    } catch {}
    context = null;
  }

  function celebrate() {
    ++generation;
    clearVisuals();
    stopVoices();
    if (overlay) {
      const quiet = reducedMotion();
      overlay.setAttribute('aria-hidden', 'true');
      overlay.classList.toggle('is-reduced-motion', quiet);
      const halo = document.createElement('span');
      halo.className = 'luck-halo';
      overlay.append(halo);
      for (let i = 0; i < 12; i++) {
        const star = document.createElement('span');
        const angle = (i / 12) * Math.PI * 2;
        const distance = 90 + (i % 3) * 27;
        star.className = `luck-star${i % 3 === 0 ? ' luck-star-purple' : ''}`;
        star.textContent = '✦';
        star.style.setProperty('--luck-x', `${Math.cos(angle) * distance}px`);
        star.style.setProperty('--luck-y', `${Math.sin(angle) * distance}px`);
        star.style.setProperty('--luck-turn', `${i % 2 ? 65 : -65}deg`);
        star.style.setProperty('--luck-size', `${12 + (i % 3) * 4}px`);
        star.style.setProperty('--luck-delay', `${(i % 4) * 20}ms`);
        overlay.append(star);
      }
      overlay.classList.add('is-celebrating');
      cleanupTimer = setTimeout(clearVisuals, quiet ? 650 : 850);
    }
    try {
      if (!soundEnabled() || !context || context.state !== 'running') return;
      const start = context.currentTime;
      [523.25, 659.25, 783.99].forEach((frequency, i) => tone(frequency, start + i * 0.045, 0.65, 0.026));
      tone(1046.5, start + 0.12, 0.53, 0.012);
    } catch { /* Keep signing synchronous and independent of audio. */ }
  }

  return { startHold, cancelHold, celebrate, quiet, dispose };
}
