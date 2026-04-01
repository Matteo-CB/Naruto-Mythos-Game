import { create } from 'zustand';

interface BackgroundOption {
  id: string;
  name: string;
  url: string;
}

interface SettingsState {
  animationsEnabled: boolean;
  soundEnabled: boolean;
  soundVolume: number;
  allowSpectatorHand: boolean;
  gameBackground: string; // background DB id or "default"
  gameBackgroundUrl: string; // resolved URL for the background image
  availableBackgrounds: BackgroundOption[];
  isLoaded: boolean;
  fetchFromServer: () => Promise<void>;
  setAnimationsEnabled: (v: boolean) => Promise<void>;
  setSoundEnabled: (v: boolean) => void;
  setSoundVolume: (v: number) => void;
  setAllowSpectatorHand: (v: boolean) => Promise<void>;
  setGameBackground: (id: string, url: string) => Promise<void>;
}

const DEFAULT_BG_URL = '/images/backgrounds/bg-game.webp';

// Load cached backgrounds from localStorage for instant display
function getCachedBackgrounds(): BackgroundOption[] {
  try {
    if (typeof window === 'undefined') return [];
    const cached = localStorage.getItem('nmtcg-backgrounds');
    if (cached) {
      const { backgrounds, ts } = JSON.parse(cached);
      // Use cache if less than 5 minutes old
      if (Date.now() - ts < 300000 && Array.isArray(backgrounds)) return backgrounds;
    }
  } catch { /* ignore */ }
  return [];
}

function cacheBackgrounds(backgrounds: BackgroundOption[]): void {
  try {
    localStorage.setItem('nmtcg-backgrounds', JSON.stringify({ backgrounds, ts: Date.now() }));
  } catch { /* ignore */ }
}

function getLocalSound(): { enabled: boolean; volume: number } {
  try {
    if (typeof window === 'undefined') return { enabled: true, volume: 0.5 };
    const e = localStorage.getItem('nmtcg-sound-enabled');
    const v = localStorage.getItem('nmtcg-sound-volume');
    return { enabled: e !== 'false', volume: v ? parseFloat(v) : 0.5 };
  } catch { return { enabled: true, volume: 0.5 }; }
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  animationsEnabled: true,
  soundEnabled: getLocalSound().enabled,
  soundVolume: getLocalSound().volume,
  allowSpectatorHand: false,
  gameBackground: 'default',
  gameBackgroundUrl: DEFAULT_BG_URL,
  availableBackgrounds: getCachedBackgrounds(),
  isLoaded: false,

  fetchFromServer: async () => {
    try {
      const [prefsRes, bgsRes] = await Promise.all([
        fetch('/api/user/preferences'),
        fetch('/api/backgrounds'),
      ]);

      const prefs = prefsRes.ok ? await prefsRes.json() : {};
      const bgsData = bgsRes.ok ? await bgsRes.json() : { backgrounds: [] };
      const backgrounds = bgsData.backgrounds || [];
      const bgId = prefs.gameBackground || 'default';

      // Resolve URL from backgrounds list
      const match = backgrounds.find((bg: { id: string }) => bg.id === bgId);
      const bgUrl = match?.url || DEFAULT_BG_URL;

      // Cache for instant display on next page load
      cacheBackgrounds(backgrounds);

      set({
        animationsEnabled: prefs.animationsEnabled ?? true,
        allowSpectatorHand: prefs.allowSpectatorHand ?? false,
        gameBackground: bgId,
        gameBackgroundUrl: bgUrl,
        availableBackgrounds: backgrounds,
        isLoaded: true,
      });
    } catch {
      set({ isLoaded: true });
    }
  },

  setAnimationsEnabled: async (v: boolean) => {
    const prev = get().animationsEnabled;
    set({ animationsEnabled: v });
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ animationsEnabled: v }),
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch {
      set({ animationsEnabled: prev });
    }
  },

  setSoundEnabled: (v: boolean) => {
    set({ soundEnabled: v });
    try { localStorage.setItem('nmtcg-sound-enabled', String(v)); } catch { /* ignore */ }
    import('@/lib/sound/SoundManager').then(m => m.setMuted(!v)).catch(() => {});
  },

  setSoundVolume: (v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    set({ soundVolume: clamped });
    try { localStorage.setItem('nmtcg-sound-volume', String(clamped)); } catch { /* ignore */ }
    import('@/lib/sound/SoundManager').then(m => m.setVolume(clamped)).catch(() => {});
  },

  setAllowSpectatorHand: async (v: boolean) => {
    const prev = get().allowSpectatorHand;
    set({ allowSpectatorHand: v });
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowSpectatorHand: v }),
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch {
      set({ allowSpectatorHand: prev });
    }
  },

  setGameBackground: async (id: string, url: string) => {
    const prevId = get().gameBackground;
    const prevUrl = get().gameBackgroundUrl;
    set({ gameBackground: id, gameBackgroundUrl: url });
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameBackground: id }),
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch {
      set({ gameBackground: prevId, gameBackgroundUrl: prevUrl });
    }
  },
}));
