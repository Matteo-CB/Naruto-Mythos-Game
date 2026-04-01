/**
 * SoundManager — singleton that preloads and plays game sound effects.
 * Uses HTMLAudioElement.cloneNode() for concurrent playback.
 */

export type SoundName = 'cardPlay' | 'mulligan' | 'newTurn' | 'jutsu';

const SOUND_PATHS: Record<SoundName, string> = {
  cardPlay: '/sound/cardplaying.wav',
  mulligan: '/sound/mulligan.wav',
  newTurn: '/sound/newturn.mp3',
  jutsu: '/sound/justu.mp3',
};

/** Per-sound volume multiplier (relative to global volume) */
const SOUND_GAIN: Record<SoundName, number> = {
  cardPlay: 1.0,
  mulligan: 1.0,
  newTurn: 0.2,
  jutsu: 0.25,
};

/** Sounds that should fade out instead of cutting abruptly */
const FADE_OUT: Partial<Record<SoundName, number>> = {
  newTurn: 600,
};

let audioCache: Record<string, HTMLAudioElement> | null = null;
let volume = 0.7;
let muted = false;

function ensureCache(): Record<string, HTMLAudioElement> {
  if (audioCache) return audioCache;
  if (typeof window === 'undefined') return {};
  audioCache = {};
  for (const [name, path] of Object.entries(SOUND_PATHS)) {
    const audio = new Audio(path);
    audio.preload = 'auto';
    audioCache[name] = audio;
  }
  return audioCache;
}

export function playSound(name: SoundName): void {
  if (muted || typeof window === 'undefined') return;
  const cache = ensureCache();
  const source = cache[name];
  if (!source) return;
  try {
    const clone = source.cloneNode(true) as HTMLAudioElement;
    const gain = SOUND_GAIN[name] ?? 1.0;
    const finalVol = Math.max(0, Math.min(1, volume * gain));
    clone.volume = finalVol;

    const fadeDuration = FADE_OUT[name];
    if (fadeDuration && fadeDuration > 0) {
      // Set up fade-out before the sound ends
      clone.addEventListener('timeupdate', () => {
        if (!clone.duration || isNaN(clone.duration)) return;
        const remaining = (clone.duration - clone.currentTime) * 1000;
        if (remaining < fadeDuration && remaining > 0) {
          clone.volume = Math.max(0, finalVol * (remaining / fadeDuration));
        }
      });
    }

    clone.play().catch(() => {});
  } catch {
    // Ignore — browser may block autoplay before user interaction
  }
}

export function playSoundDelayed(name: SoundName, delayMs: number): void {
  if (muted || typeof window === 'undefined') return;
  setTimeout(() => playSound(name), delayMs);
}

export function setVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v));
}

export function setMuted(m: boolean): void {
  muted = m;
}

export function isMuted(): boolean {
  return muted;
}
