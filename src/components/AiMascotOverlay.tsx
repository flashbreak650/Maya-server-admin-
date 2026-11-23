import React, { useEffect, useRef } from 'react';

type MascotState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'hang'
  | 'sit'
  | 'sing'
  | 'dance'
  | 'jump'
  | 'wave'
  | 'laugh'
  | 'sleep'
  | 'annoyed'
  | 'angry'
  | 'drag';

type AnchorMode = 'button-hang' | 'card-sleep' | 'card-sit' | 'card-dance' | 'card-jump' | null;

interface DomTarget {
  el: HTMLElement;
  mode: Exclude<AnchorMode, null>;
  offsetXRatio: number;
}

interface MelodyNote {
  f: number;
  d: number;
  chord?: number[];
  vowel?: number;
  accent?: boolean;
}

const SONG_MELODIES: MelodyNote[][] = [
  // Tune 1: Cheerful Bright Emerald-Idol Pop Phrase
  [
    { f: 523.25, d: 0.21, chord: [261.63, 329.63, 392.0], vowel: 980, accent: true },
    { f: 659.25, d: 0.21, vowel: 1180 },
    { f: 783.99, d: 0.24, vowel: 1320, accent: true },
    { f: 659.25, d: 0.19, vowel: 1100 },
    { f: 880.0, d: 0.28, chord: [220.0, 261.63, 329.63], vowel: 1380, accent: true },
    { f: 783.99, d: 0.21, vowel: 1200 },
    { f: 659.25, d: 0.21, vowel: 1050 },
    { f: 587.33, d: 0.26, chord: [196.0, 246.94, 293.66], vowel: 920 },
    { f: 659.25, d: 0.2, vowel: 1080 },
    { f: 698.46, d: 0.2, chord: [174.61, 220.0, 261.63], vowel: 1150, accent: true },
    { f: 783.99, d: 0.22, vowel: 1260 },
    { f: 880.0, d: 0.24, vowel: 1350 },
    { f: 1046.5, d: 0.44, chord: [261.63, 329.63, 392.0], vowel: 1420, accent: true },
  ],
  // Tune 2: Sweet Playful Bounce Tune
  [
    { f: 587.33, d: 0.2, chord: [196.0, 246.94, 293.66], vowel: 950, accent: true },
    { f: 783.99, d: 0.22, vowel: 1220 },
    { f: 880.0, d: 0.2, vowel: 1340 },
    { f: 987.77, d: 0.26, chord: [164.81, 196.0, 246.94], vowel: 1400, accent: true },
    { f: 880.0, d: 0.19, vowel: 1240 },
    { f: 783.99, d: 0.24, vowel: 1120 },
    { f: 659.25, d: 0.24, chord: [261.63, 329.63, 392.0], vowel: 1000, accent: true },
    { f: 783.99, d: 0.2, vowel: 1180 },
    { f: 880.0, d: 0.22, vowel: 1290 },
    { f: 783.99, d: 0.22, chord: [293.66, 369.99, 440.0], vowel: 1160 },
    { f: 659.25, d: 0.22, vowel: 1040 },
    { f: 783.99, d: 0.42, chord: [196.0, 246.94, 293.66], vowel: 1260, accent: true },
  ],
  // Tune 3: Upbeat Dance Groove Synth Tune
  [
    { f: 659.25, d: 0.17, chord: [261.63, 329.63, 392.0], vowel: 1100, accent: true },
    { f: 659.25, d: 0.17, vowel: 1180 },
    { f: 783.99, d: 0.21, vowel: 1300, accent: true },
    { f: 880.0, d: 0.19, chord: [220.0, 261.63, 329.63], vowel: 1350 },
    { f: 783.99, d: 0.18, vowel: 1220 },
    { f: 1046.5, d: 0.26, vowel: 1420, accent: true },
    { f: 880.0, d: 0.18, chord: [174.61, 220.0, 261.63], vowel: 1250 },
    { f: 783.99, d: 0.18, vowel: 1150 },
    { f: 659.25, d: 0.2, chord: [196.0, 246.94, 293.66], vowel: 1080, accent: true },
    { f: 587.33, d: 0.18, vowel: 980 },
    { f: 659.25, d: 0.19, vowel: 1120 },
    { f: 783.99, d: 0.36, chord: [261.63, 329.63, 392.0], vowel: 1340, accent: true },
  ],
];

export const AiMascotOverlay: React.FC = () => {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const charRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const overlayEl = overlayRef.current;
    const charEl = charRef.current;
    if (!overlayEl || !charEl) return;

    let isUnmounted = false;
    let audioCtx: AudioContext | null = null;
    let compressor: DynamicsCompressorNode | null = null;
    let warmShelf: BiquadFilterNode | null = null;
    let delayNode: DelayNode | null = null;
    let songTimers: number[] = [];
    let songIndex = 0;

    const initAudio = () => {
      if (isUnmounted) return;
      if (!audioCtx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;

        audioCtx = new AudioCtx();
        compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-20, audioCtx.currentTime);
        compressor.knee.setValueAtTime(18, audioCtx.currentTime);
        compressor.ratio.setValueAtTime(8, audioCtx.currentTime);
        compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
        compressor.release.setValueAtTime(0.18, audioCtx.currentTime);

        warmShelf = audioCtx.createBiquadFilter();
        warmShelf.type = 'lowpass';
        warmShelf.frequency.setValueAtTime(4800, audioCtx.currentTime);

        const masterGain = audioCtx.createGain();
        masterGain.gain.setValueAtTime(1.45, audioCtx.currentTime);

        delayNode = audioCtx.createDelay(0.5);
        delayNode.delayTime.setValueAtTime(0.19, audioCtx.currentTime);

        const feedback = audioCtx.createGain();
        feedback.gain.setValueAtTime(0.24, audioCtx.currentTime);

        const delayFilter = audioCtx.createBiquadFilter();
        delayFilter.type = 'lowpass';
        delayFilter.frequency.setValueAtTime(2200, audioCtx.currentTime);

        const wetGain = audioCtx.createGain();
        wetGain.gain.setValueAtTime(0.28, audioCtx.currentTime);

        compressor.connect(warmShelf);
        warmShelf.connect(masterGain);

        warmShelf.connect(delayNode);
        delayNode.connect(delayFilter);
        delayFilter.connect(feedback);
        feedback.connect(delayNode);
        delayFilter.connect(wetGain);
        wetGain.connect(masterGain);

        masterGain.connect(audioCtx.destination);
      }

      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
    };

    const clearSongSchedule = () => {
      songTimers.forEach((id) => window.clearTimeout(id));
      songTimers = [];
    };

    const spawnParticles = (list: string[], count = 3) => {
      if (!overlayEl || isUnmounted) return;
      for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'ai-mascot-particle';
        p.textContent = list[Math.floor(Math.random() * list.length)];
        p.style.left = `${x + 38 + (Math.random() * 52 - 26)}px`;
        p.style.top = `${y + 8 + (Math.random() * 24 - 12)}px`;
        overlayEl.appendChild(p);
        window.setTimeout(() => p.remove(), 1220);
      }
    };

    const playWarmChord = (freqs: number[], durationSec: number) => {
      if (!audioCtx || !compressor) return;
      const now = audioCtx.currentTime;
      freqs.forEach((f) => {
        if (!audioCtx || !compressor) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.085, now + 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

        osc.connect(gain);
        gain.connect(compressor);
        osc.start(now);
        osc.stop(now + durationSec + 0.03);
      });
    };

    const playSingingSong = (customIndex?: number) => {
      initAudio();
      clearSongSchedule();
      if (!audioCtx || !compressor) return;

      const idxToUse = typeof customIndex === 'number' ? customIndex : songIndex;
      const melody = SONG_MELODIES[idxToUse % SONG_MELODIES.length];
      songIndex += 1;

      let offsetMs = 0;
      melody.forEach((note, idx) => {
        const timerId = window.setTimeout(() => {
          if (!audioCtx || !compressor || isUnmounted || document.hidden) return;
          if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
          }

          const now = audioCtx.currentTime;

          if (note.chord) {
            playWarmChord(note.chord, note.d * 2.5);
          }

          const leadTri = audioCtx.createOscillator();
          const leadSaw = audioCtx.createOscillator();
          const formant = audioCtx.createBiquadFilter();
          const voiceGain = audioCtx.createGain();

          leadTri.type = 'triangle';
          leadSaw.type = 'sawtooth';

          leadTri.frequency.setValueAtTime(note.f * 0.96, now);
          leadTri.frequency.exponentialRampToValueAtTime(note.f, now + 0.045);

          leadSaw.frequency.setValueAtTime(note.f * 0.96, now);
          leadSaw.frequency.exponentialRampToValueAtTime(note.f, now + 0.045);

          const vib = audioCtx.createOscillator();
          const vibGain = audioCtx.createGain();
          vib.frequency.setValueAtTime(5.6, now);
          vibGain.gain.setValueAtTime(note.d > 0.25 ? 5.5 : 2.5, now);
          vib.connect(vibGain);
          vibGain.connect(leadTri.frequency);
          vibGain.connect(leadSaw.frequency);

          formant.type = 'bandpass';
          formant.frequency.setValueAtTime((note.vowel || 1050) * 0.85, now);
          formant.frequency.linearRampToValueAtTime(note.vowel || 1150, now + note.d * 0.55);
          formant.Q.setValueAtTime(1.85, now);

          const sawAtten = audioCtx.createGain();
          sawAtten.gain.setValueAtTime(0.35, now);

          voiceGain.gain.setValueAtTime(0.001, now);
          voiceGain.gain.linearRampToValueAtTime(0.36, now + 0.032);
          voiceGain.gain.setValueAtTime(0.32, now + note.d * 0.72);
          voiceGain.gain.exponentialRampToValueAtTime(0.001, now + note.d + 0.04);

          leadTri.connect(formant);
          leadSaw.connect(sawAtten);
          sawAtten.connect(formant);
          formant.connect(voiceGain);
          voiceGain.connect(compressor);

          if (note.accent) {
            const chime = audioCtx.createOscillator();
            const chimeGain = audioCtx.createGain();
            chime.type = 'sine';
            chime.frequency.setValueAtTime(note.f * 2, now);
            chimeGain.gain.setValueAtTime(0.001, now);
            chimeGain.gain.linearRampToValueAtTime(0.14, now + 0.01);
            chimeGain.gain.exponentialRampToValueAtTime(0.001, now + note.d * 1.15);
            chime.connect(chimeGain);
            chimeGain.connect(compressor);
            chime.start(now);
            chime.stop(now + note.d * 1.2);
          }

          vib.start(now);
          leadTri.start(now);
          leadSaw.start(now);
          vib.stop(now + note.d + 0.06);
          leadTri.stop(now + note.d + 0.06);
          leadSaw.stop(now + note.d + 0.06);

          if (idx % 2 === 0) {
            spawnParticles(['🎵', '🎶', '💚', '♪'], 2);
          }
        }, offsetMs);

        songTimers.push(timerId);
        offsetMs += note.d * 1000 + 28;
      });
    };

    const playJumpSound = () => {
      initAudio();
      if (!audioCtx || !compressor) return;
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(860, now + 0.16);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.25);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.28, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.27);
      osc.connect(gain);
      gain.connect(compressor);
      osc.start(now);
      osc.stop(now + 0.28);
    };

    const playHiSound = () => {
      initAudio();
      if (!audioCtx || !compressor) return;
      const now = audioCtx.currentTime;
      [659.25, 830.61, 987.77, 1318.5].forEach((freq, i) => {
        if (!audioCtx || !compressor) return;
        const t = now + i * 0.075;
        const osc = audioCtx.createOscillator();
        const overtone = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sine';
        overtone.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        overtone.frequency.setValueAtTime(freq * 1.5, t);

        const overGain = audioCtx.createGain();
        overGain.gain.setValueAtTime(0.18, t);

        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.26, t + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.34);

        osc.connect(gain);
        overtone.connect(overGain);
        overGain.connect(gain);
        gain.connect(compressor);

        osc.start(t);
        overtone.start(t);
        osc.stop(t + 0.36);
        overtone.stop(t + 0.36);
      });
    };

    const playLaughSound = () => {
      initAudio();
      if (!audioCtx || !compressor) return;
      const now = audioCtx.currentTime;
      [740, 920, 810, 990, 870, 1110, 1240].forEach((freq, i) => {
        if (!audioCtx || !compressor) return;
        const t = now + i * 0.068;
        const osc = audioCtx.createOscillator();
        const formant = audioCtx.createBiquadFilter();
        const gain = audioCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.84, t + 0.055);

        formant.type = 'bandpass';
        formant.frequency.setValueAtTime(1100 + i * 80, t);
        formant.Q.setValueAtTime(1.6, t);

        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.38, t + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.075);

        osc.connect(formant);
        formant.connect(gain);
        gain.connect(compressor);
        osc.start(t);
        osc.stop(t + 0.08);
      });
    };

    const playSleepLullaby = () => {
      initAudio();
      if (!audioCtx || !compressor) return;
      const now = audioCtx.currentTime;
      [783.99, 659.25, 523.25].forEach((freq, i) => {
        if (!audioCtx || !compressor) return;
        const t = now + i * 0.24;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.16, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        osc.connect(gain);
        gain.connect(compressor);
        osc.start(t);
        osc.stop(t + 0.48);
      });
    };

    const playSleepBreath = () => {
      if (!audioCtx || !compressor || audioCtx.state !== 'running') return;
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const filter = audioCtx.createBiquadFilter();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(185, now);
      osc.frequency.linearRampToValueAtTime(145, now + 0.65);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(340, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.07, now + 0.22);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.72);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(compressor);
      osc.start(now);
      osc.stop(now + 0.76);
    };

    const playAnnoyedSound = () => {
      initAudio();
      if (!audioCtx || !compressor) return;
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const filter = audioCtx.createBiquadFilter();
      const gain = audioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.28);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, now);
      filter.frequency.exponentialRampToValueAtTime(360, now + 0.28);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(compressor);
      osc.start(now);
      osc.stop(now + 0.35);
    };

    const playAngrySound = () => {
      initAudio();
      if (!audioCtx || !compressor) return;
      const now = audioCtx.currentTime;
      [220, 330].forEach((base) => {
        if (!audioCtx || !compressor) return;
        const osc = audioCtx.createOscillator();
        const filter = audioCtx.createBiquadFilter();
        const gain = audioCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(base * 1.4, now);
        osc.frequency.linearRampToValueAtTime(base * 0.75, now + 0.22);
        osc.frequency.linearRampToValueAtTime(base * 1.15, now + 0.38);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1400, now);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.28, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(compressor);
        osc.start(now);
        osc.stop(now + 0.45);
      });
    };

    const playDragSound = (drop = false) => {
      initAudio();
      if (!audioCtx || !compressor) return;
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      if (!drop) {
        osc.frequency.setValueAtTime(410, now);
        osc.frequency.exponentialRampToValueAtTime(980, now + 0.16);
      } else {
        osc.frequency.setValueAtTime(590, now);
        osc.frequency.exponentialRampToValueAtTime(210, now + 0.16);
      }
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.28, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
      osc.connect(gain);
      gain.connect(compressor);
      osc.start(now);
      osc.stop(now + 0.21);
    };

    const playStepSound = () => {
      if (!audioCtx || !compressor || audioCtx.state !== 'running') return;
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(58, now + 0.045);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(gain);
      gain.connect(compressor);
      osc.start(now);
      osc.stop(now + 0.055);
    };

    const getBounds = () => {
      const vw = Math.max(240, window.innerWidth);
      const vh = Math.max(300, window.innerHeight);
      return {
        minX: 8,
        maxX: Math.max(60, vw - 132),
        minY: 54,
        maxY: Math.max(120, vh - 190),
      };
    };

    // Real DOM target finders so the mascot actually interacts with buttons & cards!
    const computeAnchorCoords = (target: DomTarget): { x: number; y: number } | null => {
      if (!document.body.contains(target.el)) return null;
      const rect = target.el.getBoundingClientRect();
      if (rect.width < 20 || rect.height < 16) return null;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (rect.bottom < 45 || rect.top > vh - 40) return null;

      let targetX = rect.left + Math.max(0, rect.width - 124) * target.offsetXRatio;
      targetX = Math.min(Math.max(6, targetX), vw - 130);

      let targetY = rect.top;
      if (target.mode === 'button-hang') {
        targetX = Math.min(Math.max(6, rect.left + rect.width * 0.5 - 62), vw - 130);
        // Hands inside SVG sit around y=8, so anchor right below the button edge
        targetY = Math.min(Math.max(48, rect.bottom - 9), vh - 148);
      } else if (target.mode === 'card-sleep') {
        // Curled sleeping body bottom aligns at ~114px inside container
        targetY = Math.min(Math.max(12, rect.top - 114), vh - 155);
      } else if (target.mode === 'card-sit') {
        // Seated hips rest on card top (~89px), legs dangle in front of card
        targetY = Math.min(Math.max(18, rect.top - 89), vh - 145);
      } else if (target.mode === 'card-dance' || target.mode === 'card-jump') {
        // Feet stand squarely at ~112px inside container right on top border of the card
        targetY = Math.min(Math.max(16, rect.top - 112), vh - 150);
      }

      return { x: targetX, y: targetY };
    };

    const pickDomTarget = (preferredMode: Exclude<AnchorMode, null>): DomTarget | null => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (preferredMode === 'button-hang') {
        const candidates = Array.from(
          document.querySelectorAll<HTMLElement>('.btn, button.mode-btn, .sub-back-btn, .hero-actions button')
        ).filter((el) => {
          if (el.closest('.ai-mascot-overlay')) return false;
          const r = el.getBoundingClientRect();
          return (
            r.width >= 52 &&
            r.height >= 24 &&
            r.top >= 56 &&
            r.bottom <= vh - 145 &&
            r.left >= 4 &&
            r.right <= vw - 4
          );
        });
        if (candidates.length === 0) return null;
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        return { el: chosen, mode: 'button-hang', offsetXRatio: 0.5 };
      }

      // Card surface targets: sleep on card, sit on card, dance/jump on card!
      const minTop = preferredMode === 'card-sit' ? 92 : 114;
      const maxTop = preferredMode === 'card-sit' ? vh - 95 : vh - 80;
      const cards = Array.from(
        document.querySelectorAll<HTMLElement>('.card, .hero, .stat, .subpanel-soft')
      ).filter((el) => {
        if (el.closest('.ai-mascot-overlay')) return false;
        const r = el.getBoundingClientRect();
        return r.width >= 120 && r.height >= 48 && r.top >= minTop && r.top <= maxTop;
      });

      if (cards.length === 0) return null;
      const chosen = cards[Math.floor(Math.random() * cards.length)];
      return {
        el: chosen,
        mode: preferredMode,
        offsetXRatio: 0.15 + Math.random() * 0.7,
      };
    };

    const initialBounds = getBounds();
    let x = Math.min(Math.max(initialBounds.minX, window.innerWidth * 0.62), initialBounds.maxX);
    let y = Math.min(Math.max(initialBounds.minY, window.innerHeight * 0.22), initialBounds.maxY);
    let tx = x;
    let ty = y;
    let speed = 1.75;
    let state: MascotState = 'walk';
    let arrivalPose: MascotState | null = null;
    let pendingTarget: DomTarget | null = null;
    let activeTarget: DomTarget | null = null;
    let aiTimer: number | null = null;
    let loopSfxTimer: number | null = null;
    let stepCounter = 0;

    let dragging = false;
    let moved = false;
    let offsetX = 0;
    let offsetY = 0;
    let pokeCount = 0;
    let pokeResetTimer: number | null = null;
    let rafId = 0;

    const ALL_STATE_CLASSES = [
      'state-idle',
      'state-walk',
      'state-run',
      'state-hang',
      'state-sit',
      'state-sing',
      'state-dance',
      'state-jump',
      'state-wave',
      'state-laugh',
      'state-sleep',
      'state-annoyed',
      'state-angry',
      'state-drag',
    ];

    const setState = (nextState: MascotState, domAnchored = false) => {
      state = nextState;
      if (loopSfxTimer !== null) {
        window.clearInterval(loopSfxTimer);
        loopSfxTimer = null;
      }
      charEl.classList.remove(...ALL_STATE_CLASSES, 'has-dom-anchor');
      charEl.classList.add(`state-${nextState}`);
      if (domAnchored) {
        charEl.classList.add('has-dom-anchor');
      }
    };

    const planNextBehavior = () => {
      if (dragging || isUnmounted) return;
      if (aiTimer !== null) window.clearTimeout(aiTimer);
      if (loopSfxTimer !== null) {
        window.clearInterval(loopSfxTimer);
        loopSfxTimer = null;
      }

      activeTarget = null;
      pendingTarget = null;

      const b = getBounds();
      const r = Math.random();

      if (r < 0.22) {
        // Hang onto a real visible button!
        arrivalPose = 'hang';
        const btnTarget = pickDomTarget('button-hang');
        if (btnTarget) {
          pendingTarget = btnTarget;
          const pos = computeAnchorCoords(btnTarget);
          if (pos) {
            tx = pos.x;
            ty = pos.y;
          }
        } else {
          tx = b.minX + Math.random() * (b.maxX - b.minX);
          ty = b.minY + Math.random() * Math.max(40, (b.maxY - b.minY) * 0.5);
        }
        speed = 2.05;
      } else if (r < 0.42) {
        // Lie down & sleep right on top of a real card!
        arrivalPose = 'sleep';
        const cardTarget = pickDomTarget('card-sleep');
        if (cardTarget) {
          pendingTarget = cardTarget;
          const pos = computeAnchorCoords(cardTarget);
          if (pos) {
            tx = pos.x;
            ty = pos.y;
          }
        } else {
          tx = b.minX + Math.random() * (b.maxX - b.minX);
          ty = b.minY + Math.max(30, (b.maxY - b.minY) * 0.4) + Math.random() * ((b.maxY - b.minY) * 0.55);
        }
        speed = 1.65;
      } else if (r < 0.60) {
        // Sit on top edge of a real card with dangling legs!
        arrivalPose = 'sit';
        const cardTarget = pickDomTarget('card-sit');
        if (cardTarget) {
          pendingTarget = cardTarget;
          const pos = computeAnchorCoords(cardTarget);
          if (pos) {
            tx = pos.x;
            ty = pos.y;
          }
        } else {
          tx = b.minX + Math.random() * (b.maxX - b.minX);
          ty = b.minY + Math.random() * (b.maxY - b.minY);
        }
        speed = 1.7;
      } else if (r < 0.77) {
        // Dance happily on top of a card (or open area)!
        arrivalPose = 'dance';
        const cardTarget = pickDomTarget('card-dance');
        if (cardTarget) {
          pendingTarget = cardTarget;
          const pos = computeAnchorCoords(cardTarget);
          if (pos) {
            tx = pos.x;
            ty = pos.y;
          }
        } else {
          tx = b.minX + Math.random() * (b.maxX - b.minX);
          ty = b.minY + Math.random() * (b.maxY - b.minY);
        }
        speed = 2.0;
      } else if (r < 0.90) {
        // Jump energetically on top of a card (or open area)!
        arrivalPose = 'jump';
        const cardTarget = pickDomTarget('card-jump');
        if (cardTarget) {
          pendingTarget = cardTarget;
          const pos = computeAnchorCoords(cardTarget);
          if (pos) {
            tx = pos.x;
            ty = pos.y;
          }
        } else {
          tx = b.minX + Math.random() * (b.maxX - b.minX);
          ty = b.minY + Math.random() * (b.maxY - b.minY);
        }
        speed = 2.1;
      } else {
        // Sing a joyful melody & wave!
        arrivalPose = Math.random() < 0.65 ? 'sing' : 'wave';
        tx = b.minX + Math.random() * (b.maxX - b.minX);
        ty = b.minY + Math.random() * (b.maxY - b.minY);
        speed = 1.75;
      }

      setState(speed > 1.95 ? 'run' : 'walk', false);
      if (tx < x) charEl.classList.add('facing-left');
      else charEl.classList.remove('facing-left');
    };

    const runPose = (pose: MascotState, attachedTarget: DomTarget | null = null) => {
      if (isUnmounted) return;
      if (aiTimer !== null) window.clearTimeout(aiTimer);
      clearSongSchedule();
      arrivalPose = null;
      pendingTarget = null;
      activeTarget = attachedTarget;
      const isDomAnchored = Boolean(attachedTarget);

      if (pose === 'hang') {
        setState('hang', isDomAnchored);
        spawnParticles(['✨', '💚'], 2);
        aiTimer = window.setTimeout(planNextBehavior, 4600);
      } else if (pose === 'sit') {
        setState('sit', isDomAnchored);
        spawnParticles(['✨', '💚'], 2);
        aiTimer = window.setTimeout(planNextBehavior, 4400);
      } else if (pose === 'sing') {
        setState('sing', isDomAnchored);
        playSingingSong();
        aiTimer = window.setTimeout(planNextBehavior, 3900);
      } else if (pose === 'dance') {
        setState('dance', isDomAnchored);
        playSingingSong(2);
        spawnParticles(['💃', '✨', '🎵'], 3);
        loopSfxTimer = window.setInterval(() => spawnParticles(['🎶', '✨', '💚'], 2), 950);
        aiTimer = window.setTimeout(planNextBehavior, 3900);
      } else if (pose === 'jump') {
        setState('jump', isDomAnchored);
        playJumpSound();
        spawnParticles(['⭐', '💚', '✨'], 3);
        loopSfxTimer = window.setInterval(() => {
          playJumpSound();
          spawnParticles(['✨', '⭐'], 2);
        }, 680);
        aiTimer = window.setTimeout(planNextBehavior, 3200);
      } else if (pose === 'wave') {
        setState('wave', isDomAnchored);
        playHiSound();
        spawnParticles(['👋', '💚'], 3);
        aiTimer = window.setTimeout(planNextBehavior, 2600);
      } else if (pose === 'laugh') {
        setState('laugh', false);
        playLaughSound();
        spawnParticles(['😆', '✨', '💚'], 4);
        aiTimer = window.setTimeout(planNextBehavior, 2500);
      } else if (pose === 'sleep') {
        setState('sleep', isDomAnchored);
        playSleepLullaby();
        spawnParticles(['💤', '💚'], 2);
        loopSfxTimer = window.setInterval(() => {
          spawnParticles(['💤'], 1);
          playSleepBreath();
        }, 1850);
        aiTimer = window.setTimeout(planNextBehavior, 5200);
      } else if (pose === 'annoyed') {
        setState('annoyed', false);
        playAnnoyedSound();
        spawnParticles(['😤', '✨'], 3);
        aiTimer = window.setTimeout(planNextBehavior, 2200);
      } else if (pose === 'angry') {
        setState('angry', false);
        playAngrySound();
        spawnParticles(['⚡', '😤', '💫'], 4);
        loopSfxTimer = window.setInterval(() => {
          playAngrySound();
          spawnParticles(['⚡', '💫'], 2);
        }, 900);
        aiTimer = window.setTimeout(() => {
          pokeCount = 0;
          planNextBehavior();
        }, 3200);
      }
    };

    const handleGlobalGesture = () => {
      initAudio();
    };

    const handlePointerDown = (e: PointerEvent) => {
      e.stopPropagation();
      initAudio();
      if (aiTimer !== null) window.clearTimeout(aiTimer);
      if (loopSfxTimer !== null) {
        window.clearInterval(loopSfxTimer);
        loopSfxTimer = null;
      }
      clearSongSchedule();
      arrivalPose = null;
      pendingTarget = null;
      activeTarget = null;

      dragging = true;
      moved = false;
      offsetX = e.clientX - x;
      offsetY = e.clientY - y;

      charEl.setPointerCapture(e.pointerId);
      charEl.classList.add('is-dragging');
      setState('drag', false);
      playDragSound(false);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = Math.abs(e.clientX - offsetX - x);
      const dy = Math.abs(e.clientY - offsetY - y);
      if (dx > 6 || dy > 6) moved = true;

      const nextX = Math.min(Math.max(4, e.clientX - offsetX), window.innerWidth - 124);
      if (nextX < x - 1) charEl.classList.add('facing-left');
      else if (nextX > x + 1) charEl.classList.remove('facing-left');

      x = nextX;
      y = Math.min(Math.max(8, e.clientY - offsetY), window.innerHeight - 160);
      tx = x;
      ty = y;
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      charEl.classList.remove('is-dragging');
      try {
        charEl.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture already released
      }

      if (moved) {
        playDragSound(true);
        setState('idle', false);
        aiTimer = window.setTimeout(planNextBehavior, 1000);
      } else {
        pokeCount += 1;
        if (pokeResetTimer !== null) window.clearTimeout(pokeResetTimer);
        pokeResetTimer = window.setTimeout(() => {
          pokeCount = 0;
        }, 3500);

        if (pokeCount <= 2) {
          runPose(Math.random() < 0.5 ? 'laugh' : 'jump');
        } else if (pokeCount === 3) {
          runPose('annoyed');
        } else {
          runPose('angry');
        }
      }
    };

    const handleResize = () => {
      const b = getBounds();
      x = Math.min(Math.max(4, x), b.maxX);
      y = Math.min(Math.max(8, y), b.maxY);
      tx = Math.min(Math.max(b.minX, tx), b.maxX);
      ty = Math.min(Math.max(b.minY, ty), b.maxY);
    };

    const handleVisibility = () => {
      if (document.hidden) {
        clearSongSchedule();
        if (loopSfxTimer !== null) {
          window.clearInterval(loopSfxTimer);
          loopSfxTimer = null;
        }
      }
    };

    const frameLoop = () => {
      if (isUnmounted) return;

      if (!dragging && (state === 'walk' || state === 'run')) {
        // Dynamically track moving/scrolled target while walking toward a real button or card
        if (pendingTarget) {
          const livePos = computeAnchorCoords(pendingTarget);
          if (livePos) {
            tx = livePos.x;
            ty = livePos.y;
          } else {
            pendingTarget = null;
          }
        }

        const dx = tx - x;
        const dy = ty - y;
        const dist = Math.hypot(dx, dy);

        if (dist > 3.5) {
          x += (dx / dist) * speed;
          y += (dy / dist) * speed;
          if (tx < x) charEl.classList.add('facing-left');
          else if (tx > x) charEl.classList.remove('facing-left');
          stepCounter += 1;
          if (stepCounter % 24 === 0) playStepSound();
        } else {
          x = tx;
          y = ty;
          if (arrivalPose) runPose(arrivalPose, pendingTarget);
          else planNextBehavior();
        }
      } else if (!dragging && activeTarget) {
        // Keep glued smoothly onto the exact card top or button bottom even if user scrolls!
        const livePos = computeAnchorCoords(activeTarget);
        if (livePos) {
          x = livePos.x;
          y = livePos.y;
        } else {
          activeTarget = null;
          charEl.classList.remove('has-dom-anchor');
        }
      }

      charEl.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      rafId = window.requestAnimationFrame(frameLoop);
    };

    window.addEventListener('pointerdown', handleGlobalGesture, { passive: true });
    window.addEventListener('touchstart', handleGlobalGesture, { passive: true });
    window.addEventListener('resize', handleResize);
    document.addEventListener('visibilitychange', handleVisibility);

    charEl.addEventListener('pointerdown', handlePointerDown);
    charEl.addEventListener('pointermove', handlePointerMove);
    charEl.addEventListener('pointerup', handlePointerUp);
    charEl.addEventListener('pointercancel', handlePointerUp);

    charEl.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    aiTimer = window.setTimeout(() => runPose('wave'), 550);
    rafId = window.requestAnimationFrame(frameLoop);

    return () => {
      isUnmounted = true;
      window.cancelAnimationFrame(rafId);
      if (aiTimer !== null) window.clearTimeout(aiTimer);
      if (loopSfxTimer !== null) window.clearInterval(loopSfxTimer);
      if (pokeResetTimer !== null) window.clearTimeout(pokeResetTimer);
      clearSongSchedule();

      window.removeEventListener('pointerdown', handleGlobalGesture);
      window.removeEventListener('touchstart', handleGlobalGesture);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibility);

      charEl.removeEventListener('pointerdown', handlePointerDown);
      charEl.removeEventListener('pointermove', handlePointerMove);
      charEl.removeEventListener('pointerup', handlePointerUp);
      charEl.removeEventListener('pointercancel', handlePointerUp);

      if (audioCtx) {
        audioCtx.close().catch(() => {});
      }
    };
  }, []);

  return (
    <div ref={overlayRef} className="ai-mascot-overlay" aria-hidden="true">
      <div ref={charRef} className="ai-mascot-char state-idle">
        {/* Clean Emerald-Mint fallback props when not anchored directly to a card or button */}
        <div className="ai-mascot-hang-bar" />
        <div className="ai-mascot-sit-ledge" />
        <div className="ai-mascot-sleep-pillow" />

        {/* Cute Emerald-Mint WAGuard AI Guardian Mascot (Matches Server Aesthetic) */}
        <div className="ai-mascot-body-wrap">
          <svg viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="aiMascotSkin" x1="60" y1="22" x2="60" y2="96" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#fff3e6" />
                <stop offset="0.7" stopColor="#fde2cb" />
                <stop offset="1" stopColor="#f7caad" />
              </linearGradient>
              <linearGradient id="aiMascotHair" x1="32" y1="12" x2="88" y2="68" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#0e4a38" />
                <stop offset="0.55" stopColor="#083024" />
                <stop offset="1" stopColor="#041c15" />
              </linearGradient>
              <linearGradient id="aiMascotHorn" x1="40" y1="6" x2="46" y2="26" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#a7f3d0" />
                <stop offset="0.45" stopColor="#10b975" />
                <stop offset="1" stopColor="#047857" />
              </linearGradient>
              <linearGradient id="aiMascotWing" x1="20" y1="48" x2="48" y2="80" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#a7f3d0" />
                <stop offset="0.55" stopColor="#34d399" />
                <stop offset="1" stopColor="#059669" />
              </linearGradient>
              <linearGradient id="aiMascotOutfit" x1="42" y1="58" x2="78" y2="92" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#14bd7a" />
                <stop offset="0.6" stopColor="#087f55" />
                <stop offset="1" stopColor="#065f3e" />
              </linearGradient>
              <linearGradient id="aiMascotIris" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#34d399" />
                <stop offset="0.55" stopColor="#059669" />
                <stop offset="1" stopColor="#064e3b" />
              </linearGradient>
              <linearGradient id="aiMascotBoot" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#087f55" />
                <stop offset="1" stopColor="#043f2b" />
              </linearGradient>
            </defs>

            {/* ================= LAYER 1: UPRIGHT / WALK / DANCE / JUMP / SIT / HANG / SING ================= */}
            <g className="pose-upright">
              {/* Cute Swishing Mint-Emerald Leaf/Heart Tail */}
              <g className="demon-tail">
                <path
                  d="M62 86C74 90 92 85 98 73C101 66 96 59 92 64"
                  stroke="#047857"
                  strokeWidth="3.4"
                  strokeLinecap="round"
                />
                <path
                  d="M62 86C74 90 92 85 98 73C101 66 96 59 92 64"
                  stroke="#6ee7b7"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  opacity="0.85"
                />
                <path
                  d="M91 64C87 60 89 54 94 56C96 52 102 54 100 60C99 63 94 65 91 64Z"
                  fill="#10b975"
                  stroke="#064e3b"
                  strokeWidth="1"
                />
                <circle cx="95.5" cy="58" r="1.2" fill="#ecfdf5" />
              </g>

              {/* Cute Translucent Mint Fairy-Chibi Wings */}
              <g className="wing-left">
                <path
                  d="M44 63C32 51 15 49 12 58C17 61 19 65 16 69C23 68 27 72 25 76C32 72 39 73 45 71Z"
                  fill="url(#aiMascotWing)"
                  stroke="#047857"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                  opacity="0.92"
                />
                <path d="M43 64C34 57 24 56 17 58" stroke="#ecfdf5" strokeWidth="1" strokeLinecap="round" opacity="0.75" />
                <path d="M43 67C35 64 28 65 22 68" stroke="#ecfdf5" strokeWidth="0.9" strokeLinecap="round" opacity="0.6" />
              </g>
              <g className="wing-right">
                <path
                  d="M76 63C88 51 105 49 108 58C103 61 101 65 104 69C97 68 93 72 95 76C88 72 81 73 75 71Z"
                  fill="url(#aiMascotWing)"
                  stroke="#047857"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                  opacity="0.92"
                />
                <path d="M77 64C86 57 96 56 103 58" stroke="#ecfdf5" strokeWidth="1" strokeLinecap="round" opacity="0.75" />
                <path d="M77 67C85 64 92 65 98 68" stroke="#ecfdf5" strokeWidth="0.9" strokeLinecap="round" opacity="0.6" />
              </g>

              {/* Standing / Walking / Dancing / Jumping / Hanging Legs */}
              <g className="pose-standing">
                <g className="leg-left">
                  <rect x="46.5" y="84" width="9.5" height="24" rx="4.6" fill="url(#aiMascotSkin)" stroke="#e5b89d" strokeWidth="0.8" />
                  <ellipse cx="51" cy="96" rx="2.4" ry="1.3" fill="#fda4af" opacity="0.45" />
                  <rect x="46" y="102" width="10.5" height="5" rx="2" fill="#ffffff" stroke="#a7f3d0" strokeWidth="0.8" />
                  <path
                    d="M44.5 106H56.5C58 106 59 107.2 59 109V112.5C59 113.8 57.9 114.5 56.5 114.5H44.5C43 114.5 42 113.5 42 112V108.5C42 107 43.1 106 44.5 106Z"
                    fill="url(#aiMascotBoot)"
                    stroke="#ffffff"
                    strokeWidth="1.2"
                  />
                  <line x1="44" y1="112.5" x2="57" y2="112.5" stroke="#6ee7b7" strokeWidth="1.1" strokeLinecap="round" />
                </g>

                <g className="leg-right">
                  <rect x="64" y="84" width="9.5" height="24" rx="4.6" fill="url(#aiMascotSkin)" stroke="#e5b89d" strokeWidth="0.8" />
                  <ellipse cx="68.5" cy="96" rx="2.4" ry="1.3" fill="#fda4af" opacity="0.45" />
                  <rect x="63.5" y="102" width="10.5" height="5" rx="2" fill="#ffffff" stroke="#a7f3d0" strokeWidth="0.8" />
                  <path
                    d="M63.5 106H75.5C77 106 78 107.2 78 109V112.5C78 113.8 76.9 114.5 75.5 114.5H63.5C62 114.5 61 113.5 61 112V108.5C61 107 62.1 106 63.5 106Z"
                    fill="url(#aiMascotBoot)"
                    stroke="#ffffff"
                    strokeWidth="1.2"
                  />
                  <line x1="63" y1="112.5" x2="76" y2="112.5" stroke="#6ee7b7" strokeWidth="1.1" strokeLinecap="round" />
                </g>
              </g>

              {/* REALISTIC SITTING ON TOP OF CARD EDGE */}
              <g className="pose-sitting">
                <rect x="44" y="84" width="12.5" height="14" rx="6" fill="url(#aiMascotSkin)" stroke="#e5b89d" strokeWidth="0.8" />
                <rect x="63.5" y="84" width="12.5" height="14" rx="6" fill="url(#aiMascotSkin)" stroke="#e5b89d" strokeWidth="0.8" />
                <path d="M40 81H80L82 88.5C70 91 50 91 38 88.5L40 81Z" fill="url(#aiMascotOutfit)" stroke="#ffffff" strokeWidth="1.2" />

                <g className="sit-shin-left">
                  <rect x="45.5" y="94" width="8.5" height="18" rx="4.2" fill="url(#aiMascotSkin)" stroke="#e5b89d" strokeWidth="0.8" />
                  <rect x="45" y="106" width="9.5" height="4.5" rx="1.8" fill="#ffffff" stroke="#a7f3d0" strokeWidth="0.7" />
                  <path
                    d="M44 109.5H56C57.5 109.5 58.2 111 58.2 112.5V115.5C58.2 116.8 57 117.5 55.8 117.5H44C42.8 117.5 41.8 116.5 41.8 115V112C41.8 110.5 42.8 109.5 44 109.5Z"
                    fill="url(#aiMascotBoot)"
                    stroke="#ffffff"
                    strokeWidth="1.1"
                  />
                </g>

                <g className="sit-shin-right">
                  <rect x="66" y="94" width="8.5" height="18" rx="4.2" fill="url(#aiMascotSkin)" stroke="#e5b89d" strokeWidth="0.8" />
                  <rect x="65.5" y="106" width="9.5" height="4.5" rx="1.8" fill="#ffffff" stroke="#a7f3d0" strokeWidth="0.7" />
                  <path
                    d="M64 109.5H76C77.5 109.5 78.2 111 78.2 112.5V115.5C78.2 116.8 77 117.5 75.8 117.5H64C62.8 117.5 61.8 116.5 61.8 115V112C61.8 110.5 62.8 109.5 64 109.5Z"
                    fill="url(#aiMascotBoot)"
                    stroke="#ffffff"
                    strokeWidth="1.1"
                  />
                </g>
              </g>

              {/* Default Left Arm */}
              <g className="arms-default">
                <g className="arm-left">
                  <rect x="36" y="60" width="8.5" height="23" rx="4.2" fill="url(#aiMascotSkin)" stroke="#e5b89d" strokeWidth="0.8" />
                  <path d="M35 59.5C35 57 45 57 45 59.5L44.5 67.5H35.5L35 59.5Z" fill="#10b975" stroke="#ffffff" strokeWidth="1" />
                  <circle cx="40.2" cy="83.5" r="4.6" fill="url(#aiMascotSkin)" stroke="#e5b89d" strokeWidth="0.7" />
                </g>
              </g>

              {/* Dedicated Hanging Arms reaching upward to grip real Button bottom edge */}
              <g className="hang-arms">
                <path d="M42 61C34 45 31 26 33 10" stroke="url(#aiMascotSkin)" strokeWidth="8.2" strokeLinecap="round" />
                <path d="M42 61C39 54 37 49 36 44" stroke="#10b975" strokeWidth="9.4" strokeLinecap="round" />
                <path d="M78 61C86 45 89 26 87 10" stroke="url(#aiMascotSkin)" strokeWidth="8.2" strokeLinecap="round" />
                <path d="M78 61C81 54 83 49 84 44" stroke="#10b975" strokeWidth="9.4" strokeLinecap="round" />

                <rect x="28.5" y="4.5" width="9.5" height="7" rx="3.5" fill="url(#aiMascotSkin)" stroke="#059669" strokeWidth="1.1" />
                <line x1="31.5" y1="5" x2="31.5" y2="11" stroke="#e5b89d" strokeWidth="0.9" />
                <line x1="34.5" y1="5" x2="34.5" y2="11" stroke="#e5b89d" strokeWidth="0.9" />

                <rect x="82" y="4.5" width="9.5" height="7" rx="3.5" fill="url(#aiMascotSkin)" stroke="#059669" strokeWidth="1.1" />
                <line x1="85" y1="5" x2="85" y2="11" stroke="#e5b89d" strokeWidth="0.9" />
                <line x1="88" y1="5" x2="88" y2="11" stroke="#e5b89d" strokeWidth="0.9" />
              </g>

              {/* Upper Body + WAGuard Emerald Hero Tunic + Cute Head */}
              <g className="upper-body">
                <path
                  d="M44 58C44 55 76 55 76 58L81 86C81 88.5 78.8 90 76 90H44C41.2 90 39 88.5 39 86L44 58Z"
                  fill="url(#aiMascotOutfit)"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
                <path
                  d="M48 57L60 66L72 57"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path d="M41.5 79H78.5" stroke="#a7f3d0" strokeWidth="2" strokeLinecap="round" opacity="0.85" />
                {/* WAGuard Shield Core Crest */}
                <circle cx="60" cy="72.5" r="5" fill="#d1fae5" stroke="#ffffff" strokeWidth="1.2" />
                <path d="M58 72.5L59.5 74L62.5 71" stroke="#065f3e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

                <rect x="55.5" y="49" width="9" height="9" rx="3.5" fill="url(#aiMascotSkin)" />
                <path d="M55.5 51.5C58 53.5 62 53.5 64.5 51.5" stroke="#e5b89d" strokeWidth="2" opacity="0.6" />

                <g className="head-group">
                  {/* Cute Pointed Elf/Imp Ears */}
                  <path d="M35 38L27 33L33 44Z" fill="url(#aiMascotSkin)" stroke="#e5b89d" strokeWidth="1" strokeLinejoin="round" />
                  <path d="M85 38L93 33L87 44Z" fill="url(#aiMascotSkin)" stroke="#e5b89d" strokeWidth="1" strokeLinejoin="round" />

                  {/* Rich Emerald-Pine Hair */}
                  <path
                    d="M30 39C30 19 90 19 90 39C90 52 84 61 77 63L74 56H46L43 63C36 61 30 52 30 39Z"
                    fill="url(#aiMascotHair)"
                  />

                  {/* Cute Glossy Emerald Mini Horns */}
                  <path
                    d="M43 24C38 18 37 11 41.5 7.5C43.5 11.5 46 16 49 22Z"
                    fill="url(#aiMascotHorn)"
                    stroke="#064e3b"
                    strokeWidth="1"
                    strokeLinejoin="round"
                  />
                  <path d="M41.5 10C40.5 13.5 41.5 17 44 19.5" stroke="#ecfdf5" strokeWidth="1.2" strokeLinecap="round" opacity="0.9" />

                  <path
                    d="M77 24C82 18 83 11 78.5 7.5C76.5 11.5 74 16 71 22Z"
                    fill="url(#aiMascotHorn)"
                    stroke="#064e3b"
                    strokeWidth="1"
                    strokeLinejoin="round"
                  />
                  <path d="M78.5 10C79.5 13.5 78.5 17 76 19.5" stroke="#ecfdf5" strokeWidth="1.2" strokeLinecap="round" opacity="0.9" />

                  {/* Floating Mini AI Halo Core */}
                  <g className="ai-halo">
                    <ellipse cx="60" cy="10" rx="10.5" ry="3" stroke="#10b975" strokeWidth="2" fill="none" opacity="0.9" />
                    <circle cx="60" cy="10" r="2.2" fill="#6ee7b7" stroke="#065f3e" strokeWidth="0.7" />
                  </g>

                  {/* Face Oval */}
                  <rect
                    x="37"
                    y="23"
                    width="46"
                    height="33"
                    rx="16"
                    fill="url(#aiMascotSkin)"
                    stroke="#f3cbb2"
                    strokeWidth="1.2"
                  />

                  {/* Layered Bangs + Mint Highlight */}
                  <path
                    d="M35 34C36 18 84 18 85 34C80 28 73 26 67 30C63 25 57 25 53 30C47 26 40 28 35 34Z"
                    fill="url(#aiMascotHair)"
                  />
                  <path
                    d="M44 23C52 20 68 20 76 23"
                    stroke="#34d399"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    opacity="0.55"
                  />

                  {/* Normal Expression */}
                  <g className="expr expr-normal">
                    <g className="blink-eyes">
                      <ellipse cx="49" cy="40" rx="4.2" ry="5" fill="#ffffff" />
                      <ellipse cx="49.2" cy="40.3" rx="3.3" ry="4.1" fill="url(#aiMascotIris)" />
                      <circle cx="49.2" cy="40.5" r="1.6" fill="#022c22" />
                      <circle cx="50.5" cy="38.5" r="1.4" fill="#ffffff" />
                      <circle cx="48" cy="42.2" r="0.65" fill="#ffffff" opacity="0.9" />
                      <path d="M44.5 36.5C47 34.5 51.5 34.5 53.5 36.8" stroke="#064e3b" strokeWidth="1.7" strokeLinecap="round" />

                      <ellipse cx="71" cy="40" rx="4.2" ry="5" fill="#ffffff" />
                      <ellipse cx="70.8" cy="40.3" rx="3.3" ry="4.1" fill="url(#aiMascotIris)" />
                      <circle cx="70.8" cy="40.5" r="1.6" fill="#022c22" />
                      <circle cx="72.1" cy="38.5" r="1.4" fill="#ffffff" />
                      <circle cx="69.6" cy="42.2" r="0.65" fill="#ffffff" opacity="0.9" />
                      <path d="M66.5 36.8C68.5 34.5 73 34.5 75.5 36.5" stroke="#064e3b" strokeWidth="1.7" strokeLinecap="round" />
                    </g>
                    <ellipse cx="43" cy="45.2" rx="3.4" ry="1.8" fill="#fda4af" opacity="0.6" />
                    <ellipse cx="77" cy="45.2" rx="3.4" ry="1.8" fill="#fda4af" opacity="0.6" />
                    <path d="M55.5 47.5C58 50 62 50 64.5 47.5" stroke="#065f3e" strokeWidth="1.9" strokeLinecap="round" />
                  </g>

                  {/* Wave / Hang / Jump Happy Expression */}
                  <g className="expr expr-wave">
                    <ellipse cx="49" cy="40" rx="4.4" ry="5.2" fill="#ffffff" />
                    <ellipse cx="49.2" cy="40.2" rx="3.5" ry="4.3" fill="url(#aiMascotIris)" />
                    <circle cx="49.2" cy="40.4" r="1.6" fill="#022c22" />
                    <circle cx="50.7" cy="38.2" r="1.5" fill="#ffffff" />
                    <path d="M44.5 36C47 34 51.5 34 53.5 36.2" stroke="#064e3b" strokeWidth="1.8" strokeLinecap="round" />

                    <ellipse cx="71" cy="40" rx="4.4" ry="5.2" fill="#ffffff" />
                    <ellipse cx="70.8" cy="40.2" rx="3.5" ry="4.3" fill="url(#aiMascotIris)" />
                    <circle cx="70.8" cy="40.4" r="1.6" fill="#022c22" />
                    <circle cx="72.3" cy="38.2" r="1.5" fill="#ffffff" />
                    <path d="M66.5 36.2C68.5 34 73 34 75.5 36" stroke="#064e3b" strokeWidth="1.8" strokeLinecap="round" />

                    <ellipse cx="43" cy="45.4" rx="3.8" ry="2" fill="#fb7185" opacity="0.62" />
                    <ellipse cx="77" cy="45.4" rx="3.8" ry="2" fill="#fb7185" opacity="0.62" />
                    <path
                      d="M54 46.5H66C66 51 63 52.8 60 52.8C57 52.8 54 51 54 46.5Z"
                      fill="#fb7185"
                      stroke="#065f3e"
                      strokeWidth="1.3"
                    />
                  </g>

                  {/* Laugh / Dance Joyful Expression */}
                  <g className="expr expr-laugh">
                    <path d="M44.5 41C47 36.5 51.5 36.5 53.8 41" stroke="#064e3b" strokeWidth="2.4" strokeLinecap="round" />
                    <path d="M66.2 41C68.5 36.5 73 36.5 75.5 41" stroke="#064e3b" strokeWidth="2.4" strokeLinecap="round" />
                    <ellipse cx="42.5" cy="45.5" rx="4.2" ry="2.2" fill="#fb7185" opacity="0.68" />
                    <ellipse cx="77.5" cy="45.5" rx="4.2" ry="2.2" fill="#fb7185" opacity="0.68" />
                    <path
                      d="M52.5 46H67.5C67.5 52 64 54.5 60 54.5C56 54.5 52.5 52 52.5 46Z"
                      fill="#f43f5e"
                      stroke="#065f3e"
                      strokeWidth="1.3"
                    />
                    <path d="M56 51.5C57.5 50 62.5 50 64 51.5C63 53.5 61.5 54 60 54C58.5 54 57 53.5 56 51.5Z" fill="#fecdd3" />
                  </g>

                  {/* Singing Expression */}
                  <g className="expr expr-sing">
                    <path d="M44.5 40.5C47 36.5 51.5 36.5 53.8 40.5" stroke="#064e3b" strokeWidth="2.3" strokeLinecap="round" />
                    <path d="M66.2 40.5C68.5 36.5 73 36.5 75.5 40.5" stroke="#064e3b" strokeWidth="2.3" strokeLinecap="round" />
                    <ellipse cx="43" cy="45.2" rx="3.8" ry="2" fill="#fb7185" opacity="0.62" />
                    <ellipse cx="77" cy="45.2" rx="3.8" ry="2" fill="#fb7185" opacity="0.62" />
                    <g className="sing-mouth">
                      <ellipse cx="60" cy="49" rx="4.5" ry="4.4" fill="#fb7185" stroke="#065f3e" strokeWidth="1.3" />
                      <ellipse cx="60" cy="51" rx="2.3" ry="1.3" fill="#ffe4e6" />
                    </g>
                  </g>

                  {/* Annoyed Pout Expression */}
                  <g className="expr expr-annoyed">
                    <path d="M44 35L53 38" stroke="#065f3e" strokeWidth="2.2" strokeLinecap="round" />
                    <path d="M76 35L67 38" stroke="#065f3e" strokeWidth="2.2" strokeLinecap="round" />
                    <ellipse cx="49" cy="41.5" rx="3.6" ry="2.6" fill="#064e3b" />
                    <circle cx="49.8" cy="40.8" r="1" fill="#a7f3d0" />
                    <ellipse cx="71" cy="41.5" rx="3.6" ry="2.6" fill="#064e3b" />
                    <circle cx="71.8" cy="40.8" r="1" fill="#a7f3d0" />
                    <ellipse cx="42.5" cy="45.5" rx="3.8" ry="2" fill="#fda4af" opacity="0.68" />
                    <ellipse cx="77.5" cy="45.5" rx="3.8" ry="2" fill="#fda4af" opacity="0.68" />
                    <path d="M55 49.5C57.5 47.2 62.5 47.2 65 49.5" stroke="#065f3e" strokeWidth="2.1" strokeLinecap="round" />
                  </g>

                  {/* Cute Grumpy / Tantrum Pout (Friendly Anime style, never spooky) */}
                  <g className="expr expr-angry">
                    <rect x="37" y="23" width="46" height="33" rx="16" fill="#fed7aa" opacity="0.4" />
                    <path d="M72 28L74 30L76 28M72 32L74 30L76 32" stroke="#d97706" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M43 34L54 38.5" stroke="#78350f" strokeWidth="2.4" strokeLinecap="round" />
                    <path d="M77 34L66 38.5" stroke="#78350f" strokeWidth="2.4" strokeLinecap="round" />
                    <circle cx="49" cy="41.5" r="3.6" fill="#fef08a" stroke="#78350f" strokeWidth="1.4" />
                    <circle cx="49" cy="41.5" r="1.7" fill="#78350f" />
                    <circle cx="71" cy="41.5" r="3.6" fill="#fef08a" stroke="#78350f" strokeWidth="1.4" />
                    <circle cx="71" cy="41.5" r="1.7" fill="#78350f" />
                    <path d="M52 50.5C54 45.8 66 45.8 68 50.5H52Z" fill="#f59e0b" stroke="#78350f" strokeWidth="1.3" />
                  </g>

                  {/* Surprised / Dragged Expression */}
                  <g className="expr expr-surprised">
                    <circle cx="49" cy="40" r="4.8" fill="#ffffff" stroke="#064e3b" strokeWidth="1.4" />
                    <circle cx="49" cy="40" r="2.2" fill="#059669" />
                    <circle cx="49" cy="40" r="1" fill="#022c22" />
                    <circle cx="71" cy="40" r="4.8" fill="#ffffff" stroke="#064e3b" strokeWidth="1.4" />
                    <circle cx="71" cy="40" r="2.2" fill="#059669" />
                    <circle cx="71" cy="40" r="1" fill="#022c22" />
                    <ellipse cx="42.5" cy="46" rx="3.4" ry="1.8" fill="#fda4af" opacity="0.6" />
                    <ellipse cx="77.5" cy="46" rx="3.4" ry="1.8" fill="#fda4af" opacity="0.6" />
                    <ellipse cx="60" cy="49.5" rx="4" ry="4.8" fill="#fb7185" stroke="#064e3b" strokeWidth="1.3" />
                  </g>
                </g>
              </g>

              {/* Default Right Arm */}
              <g className="arms-default">
                <g className="arm-right">
                  <rect x="75.5" y="60" width="8.5" height="23" rx="4.2" fill="url(#aiMascotSkin)" stroke="#e5b89d" strokeWidth="0.8" />
                  <path d="M75 59.5C75 57 85 57 85 59.5L84.5 67.5H75.5L75 59.5Z" fill="#10b975" stroke="#ffffff" strokeWidth="1" />
                  <circle cx="79.8" cy="83.5" r="4.6" fill="url(#aiMascotSkin)" stroke="#e5b89d" strokeWidth="0.7" />
                </g>
              </g>
            </g>

            {/* ================= LAYER 2: REALISTIC CURLED SLEEPING POSE ON TOP OF CARD ================= */}
            <g className="pose-sleeping">
              <path
                d="M78 106C92 108 104 102 103 93C102 88 96 89 94 93"
                stroke="#047857"
                strokeWidth="3.2"
                strokeLinecap="round"
              />
              <path
                d="M91 93C88 90 89 85 93 86.5C95 83.5 100 85 98 90C97 92.5 93 94 91 93Z"
                fill="#10b975"
                stroke="#064e3b"
                strokeWidth="1"
              />

              <path
                d="M68 101C78 96 90 100 92 108C93 114 82 117 75 113Z"
                fill="url(#aiMascotSkin)"
                stroke="#e5b89d"
                strokeWidth="0.9"
              />
              <path
                d="M73 108C83 105 94 109 94 115C93 120 82 121 76 117Z"
                fill="url(#aiMascotSkin)"
                stroke="#e5b89d"
                strokeWidth="0.9"
              />
              <rect x="86" y="106" width="11" height="8" rx="3.5" transform="rotate(14 86 106)" fill="url(#aiMascotBoot)" stroke="#ffffff" strokeWidth="1.1" />
              <rect x="88" y="113" width="11" height="8" rx="3.5" transform="rotate(10 88 113)" fill="url(#aiMascotBoot)" stroke="#ffffff" strokeWidth="1.1" />

              <path
                d="M49 94C58 88 76 91 81 101C83 106 79 113 71 114C60 115 48 110 47 102C46 98 47 95 49 94Z"
                fill="url(#aiMascotOutfit)"
                stroke="#ffffff"
                strokeWidth="1.3"
              />
              <path
                d="M55 93C66 84 82 86 87 95C82 99 76 99 70 101C63 100 57 98 55 93Z"
                fill="url(#aiMascotWing)"
                stroke="#047857"
                strokeWidth="1.1"
              />

              <path
                d="M49 102C44 109 38 111 33 107C30 104 33 99 38 101"
                stroke="url(#aiMascotSkin)"
                strokeWidth="6.5"
                strokeLinecap="round"
              />

              <g transform="translate(-8, 63) rotate(-14 48 36)">
                <path d="M25 36C25 19 75 19 75 36C75 48 69 54 62 55H36C30 54 25 47 25 36Z" fill="url(#aiMascotHair)" />
                <path d="M35 23C30 17 29 10 33 7C35 11 37 15 41 20Z" fill="url(#aiMascotHorn)" stroke="#064e3b" strokeWidth="1" />
                <path d="M64 23C69 17 70 10 66 7C64 11 62 15 58 20Z" fill="url(#aiMascotHorn)" stroke="#064e3b" strokeWidth="1" />
                <ellipse cx="49.5" cy="11" rx="9" ry="2.6" stroke="#10b975" strokeWidth="1.5" opacity="0.7" />

                <rect x="30" y="21" width="39" height="29" rx="14" fill="url(#aiMascotSkin)" stroke="#f3cbb2" strokeWidth="1.1" />
                <path
                  d="M29 31C30 17 69 17 70 31C65 26 59 25 54 28C50 24 45 24 41 28C36 25 32 26 29 31Z"
                  fill="url(#aiMascotHair)"
                />

                <g className="expr expr-sleep">
                  <path d="M37 36C39.2 38.5 43.2 38.5 45.2 36" stroke="#064e3b" strokeWidth="2.1" strokeLinecap="round" />
                  <path d="M54.5 36C56.7 38.5 60.7 38.5 62.7 36" stroke="#064e3b" strokeWidth="2.1" strokeLinecap="round" />
                  <ellipse cx="36" cy="40.5" rx="3.2" ry="1.7" fill="#fda4af" opacity="0.65" />
                  <ellipse cx="63.5" cy="40.5" rx="3.2" ry="1.7" fill="#fda4af" opacity="0.65" />
                  <circle cx="49.8" cy="43.8" r="2" fill="#fb7185" opacity="0.78" />
                </g>
              </g>
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
};
