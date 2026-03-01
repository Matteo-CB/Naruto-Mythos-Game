import { create } from 'zustand';

interface SettingsState {
  animationsEnabled: boolean;
  isLoaded: boolean;
  fetchFromServer: () => Promise<void>;
  setAnimationsEnabled: (v: boolean) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  animationsEnabled: true,
  isLoaded: false,

  fetchFromServer: async () => {
    try {
      const res = await fetch('/api/user/preferences');
      if (!res.ok) return;
      const data = (await res.json()) as { animationsEnabled: boolean };
      set({ animationsEnabled: data.animationsEnabled, isLoaded: true });
    } catch {
      set({ isLoaded: true });
    }
  },

  setAnimationsEnabled: async (v: boolean) => {
    const prev = get().animationsEnabled;
    // Optimistic update
    set({ animationsEnabled: v });
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ animationsEnabled: v }),
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch {
      // Revert on failure
      set({ animationsEnabled: prev });
    }
  },
}));
