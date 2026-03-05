import { create } from 'zustand';

interface SettingsState {
  animationsEnabled: boolean;
  gameBackground: string; // background DB id or "default"
  gameBackgroundUrl: string; // resolved URL for the background image
  isLoaded: boolean;
  fetchFromServer: () => Promise<void>;
  setAnimationsEnabled: (v: boolean) => Promise<void>;
  setGameBackground: (id: string, url: string) => Promise<void>;
}

const DEFAULT_BG_URL = '/images/backgrounds/bg-game.webp';

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  animationsEnabled: true,
  gameBackground: 'default',
  gameBackgroundUrl: DEFAULT_BG_URL,
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

      set({
        animationsEnabled: prefs.animationsEnabled ?? true,
        gameBackground: bgId,
        gameBackgroundUrl: bgUrl,
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
