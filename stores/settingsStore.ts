import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  animationsEnabled: boolean;
  setAnimationsEnabled: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      animationsEnabled: true,
      setAnimationsEnabled: (v) => set({ animationsEnabled: v }),
    }),
    { name: 'settings' },
  ),
);
