import { create } from 'zustand';

interface BackgroundOption {
  id: string;
  name: string;
  url: string;
}

export type ChatVisibilitySetting = 'everyone' | 'friends' | 'off';

interface SettingsState {
  animationsEnabled: boolean;
  chatVisibility: ChatVisibilitySetting;
  soundEnabled: boolean;
  soundVolume: number;
  allowSpectatorHand: boolean;
  hideDeckBuilderVariants: boolean;
  countryCode: string | null;
  gameBackground: string; // background DB id or "default"
  gameBackgroundUrl: string; // resolved URL for the background image
  availableBackgrounds: BackgroundOption[];
  isLoaded: boolean;
  fetchFromServer: () => Promise<void>;
  setAnimationsEnabled: (v: boolean) => Promise<void>;
  setSoundEnabled: (v: boolean) => void;
  setSoundVolume: (v: number) => void;
  setAllowSpectatorHand: (v: boolean) => Promise<void>;
  setHideDeckBuilderVariants: (v: boolean) => Promise<void>;
  setCountryCode: (code: string | null) => Promise<void>;
  setGameBackground: (id: string, url: string) => Promise<void>;
  setChatVisibility: (v: ChatVisibilitySetting) => Promise<void>;
}

const DEFAULT_BG_URL = '/images/backgrounds/1.webp';


function getCachedBackgrounds(): BackgroundOption[] {
  try {
    if (typeof window === 'undefined') return [];
    const cached = localStorage.getItem('nmtcg-backgrounds');
    if (cached) {
      const { backgrounds, ts } = JSON.parse(cached);
      
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
  chatVisibility: 'everyone',
  soundEnabled: getLocalSound().enabled,
  soundVolume: getLocalSound().volume,
  allowSpectatorHand: false,
  hideDeckBuilderVariants: false,
  countryCode: null,
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
      const backgrounds: BackgroundOption[] = bgsData.backgrounds || [];
      const bgId = prefs.gameBackground || 'default';

      let bgUrl: string;
      if (bgId === 'random' && backgrounds.length > 0) {
        bgUrl = backgrounds[Math.floor(Math.random() * backgrounds.length)].url;
      } else {
        const match = backgrounds.find((bg) => bg.id === bgId);
        bgUrl = match?.url || DEFAULT_BG_URL;
      }

      cacheBackgrounds(backgrounds);

      set({
        animationsEnabled: prefs.animationsEnabled ?? true,
        chatVisibility: (['everyone', 'friends', 'off'].includes(prefs.chatVisibility) ? prefs.chatVisibility : 'everyone') as ChatVisibilitySetting,
        soundEnabled: prefs.soundsEnabled ?? get().soundEnabled,
        allowSpectatorHand: prefs.allowSpectatorHand ?? false,
        hideDeckBuilderVariants: prefs.hideDeckBuilderVariants ?? false,
        countryCode: prefs.countryCode ?? null,
        gameBackground: bgId,
        gameBackgroundUrl: bgUrl,
        availableBackgrounds: backgrounds,
        isLoaded: true,
      });
      const soundOn = get().soundEnabled;
      try { localStorage.setItem('nmtcg-sound-enabled', String(soundOn)); } catch { /* ignore */ }
      import('@/lib/sound/SoundManager').then(m => m.setMuted(!soundOn)).catch(() => {});
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
    fetch('/api/user/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soundsEnabled: v }),
    }).catch(() => {});
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

  setHideDeckBuilderVariants: async (v: boolean) => {
    const prev = get().hideDeckBuilderVariants;
    set({ hideDeckBuilderVariants: v });
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hideDeckBuilderVariants: v }),
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch {
      set({ hideDeckBuilderVariants: prev });
    }
  },

  setCountryCode: async (code: string | null) => {
    const prev = get().countryCode;
    set({ countryCode: code });
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countryCode: code }),
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch {
      set({ countryCode: prev });
    }
  },

  setChatVisibility: async (v: ChatVisibilitySetting) => {
    const prev = get().chatVisibility;
    set({ chatVisibility: v });
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatVisibility: v }),
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch {
      set({ chatVisibility: prev });
    }
  },

  setGameBackground: async (id: string, url: string) => {
    const prevId = get().gameBackground;
    const prevUrl = get().gameBackgroundUrl;
    let resolvedUrl = url;
    if (id === 'random') {
      const list = get().availableBackgrounds;
      if (list.length > 0) {
        resolvedUrl = list[Math.floor(Math.random() * list.length)].url;
      } else {
        resolvedUrl = DEFAULT_BG_URL;
      }
    }
    set({ gameBackground: id, gameBackgroundUrl: resolvedUrl });
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
