import { create } from 'zustand';

interface SettingsState {
  animationsEnabled: boolean;
  gameBackground: string;
  isLoaded: boolean;
  fetchFromServer: () => Promise<void>;
  setAnimationsEnabled: (v: boolean) => Promise<void>;
  setGameBackground: (v: string) => Promise<void>;
}

const DEFAULT_BACKGROUND = 'bg-game';

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  animationsEnabled: true,
  gameBackground: DEFAULT_BACKGROUND,
  isLoaded: false,

  fetchFromServer: async () => {
    try {
      const res = await fetch('/api/user/preferences');
      if (!res.ok) return;
      const data = (await res.json()) as { animationsEnabled: boolean; gameBackground?: string };
      set({
        animationsEnabled: data.animationsEnabled,
        gameBackground: data.gameBackground || DEFAULT_BACKGROUND,
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

  setGameBackground: async (v: string) => {
    const prev = get().gameBackground;
    set({ gameBackground: v });
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameBackground: v }),
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch {
      set({ gameBackground: prev });
    }
  },
}));
