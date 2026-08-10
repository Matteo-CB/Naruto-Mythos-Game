import { create } from 'zustand';
import { validateStoredBoardPalette, type StoredBoardPalette } from '@/lib/game/boardPalette';

interface BackgroundOption {
  id: string;
  name: string;
  url: string;
}

function effectiveAnimations(pref: boolean): boolean {
  return pref;
}

export type ChatVisibilitySetting = 'everyone' | 'friends' | 'off';

export type SiteTheme = 'ks' | 'ss';

export const SITE_THEME_STORAGE_KEY = 'nmtcg-site-theme';

export function readStoredSiteTheme(): SiteTheme {
  if (typeof window === 'undefined') return 'ks';
  try {
    return localStorage.getItem(SITE_THEME_STORAGE_KEY) === 'ss' ? 'ss' : 'ks';
  } catch {
    return 'ks';
  }
}

export function applySiteTheme(theme: SiteTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
}

interface SettingsState {
  animationsEnabled: boolean;
  animationsPref: boolean;
  fastAnimations: boolean;
  chatVisibility: ChatVisibilitySetting;
  allowNonFriendMessages: boolean;
  privateProfile: boolean;
  siteTheme: SiteTheme;
  soundEnabled: boolean;
  soundVolume: number;
  allowSpectatorHand: boolean;
  hideDeckBuilderVariants: boolean;
  manualPowerMode: boolean;
  gamepadEnabled: boolean;
  countryCode: string | null;
  gameBackground: string; // background DB id or "default"
  gameBackgroundUrl: string; // resolved URL for the background image
  boardPalette: StoredBoardPalette | null;
  deckListLimit: number;
  favoriteDeckIds: string[];
  availableBackgrounds: BackgroundOption[];
  isLoaded: boolean;
  fetchFromServer: () => Promise<void>;
  setAnimationsEnabled: (v: boolean) => Promise<void>;
  setSiteTheme: (v: SiteTheme) => Promise<void>;
  setSoundEnabled: (v: boolean) => void;
  setSoundVolume: (v: number) => void;
  setAllowSpectatorHand: (v: boolean) => Promise<void>;
  setHideDeckBuilderVariants: (v: boolean) => Promise<void>;
  setManualPowerMode: (v: boolean) => Promise<void>;
  setGamepadEnabled: (v: boolean) => Promise<void>;
  setCountryCode: (code: string | null) => Promise<void>;
  setGameBackground: (id: string, url: string) => Promise<void>;
  setBoardPalette: (next: StoredBoardPalette | null) => void;
  setChatVisibility: (v: ChatVisibilitySetting) => Promise<void>;
  setFastAnimations: (v: boolean) => Promise<void>;
  setAllowNonFriendMessages: (v: boolean) => Promise<void>;
  setPrivateProfile: (v: boolean) => Promise<void>;
  setDeckListLimit: (v: number) => Promise<void>;
  setFavoriteDeckIds: (ids: string[]) => Promise<void>;
  toggleFavoriteDeck: (id: string) => Promise<void>;
}

export const DECK_LIST_LIMIT_MIN = 3;
export const DECK_LIST_LIMIT_MAX = 200;
export const MAX_FAVORITE_DECKS = 3;

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

function readBoardPalette(raw: unknown): StoredBoardPalette | null {
  const check = validateStoredBoardPalette(raw ?? null);
  return check.ok ? check.value : null;
}

const BOARD_PALETTE_SAVE_DELAY_MS = 500;

let boardPaletteSaveTimer: ReturnType<typeof setTimeout> | null = null;
let lastPersistedBoardPalette: StoredBoardPalette | null = null;

function getLocalSound(): { enabled: boolean; volume: number } {
  try {
    if (typeof window === 'undefined') return { enabled: true, volume: 0.5 };
    const e = localStorage.getItem('nmtcg-sound-enabled');
    const v = localStorage.getItem('nmtcg-sound-volume');
    return { enabled: e !== 'false', volume: v ? parseFloat(v) : 0.5 };
  } catch { return { enabled: true, volume: 0.5 }; }
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  animationsEnabled: effectiveAnimations(true),
  animationsPref: true,
  fastAnimations: false,
  allowNonFriendMessages: true,
  privateProfile: false,
  chatVisibility: 'everyone',
  siteTheme: readStoredSiteTheme(),
  soundEnabled: getLocalSound().enabled,
  soundVolume: getLocalSound().volume,
  allowSpectatorHand: false,
  hideDeckBuilderVariants: false,
  manualPowerMode: false,
  gamepadEnabled: true,
  countryCode: null,
  gameBackground: 'default',
  gameBackgroundUrl: DEFAULT_BG_URL,
  boardPalette: null,
  deckListLimit: 20,
  favoriteDeckIds: [],
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

      const animPref = prefs.animationsEnabled ?? true;
      const serverTheme: SiteTheme | null = prefs.siteTheme === 'ss' || prefs.siteTheme === 'ks' ? prefs.siteTheme : null;
      if (serverTheme) applySiteTheme(serverTheme);
      set({
        animationsPref: animPref,
        animationsEnabled: effectiveAnimations(animPref),
        fastAnimations: prefs.fastAnimations ?? false,
        allowNonFriendMessages: prefs.allowNonFriendMessages ?? true,
        privateProfile: prefs.privateProfile ?? false,
        chatVisibility: (['everyone', 'friends', 'off'].includes(prefs.chatVisibility) ? prefs.chatVisibility : 'everyone') as ChatVisibilitySetting,
        soundEnabled: prefs.soundsEnabled ?? get().soundEnabled,
        siteTheme: serverTheme ?? get().siteTheme,
        allowSpectatorHand: prefs.allowSpectatorHand ?? false,
        hideDeckBuilderVariants: prefs.hideDeckBuilderVariants ?? false,
        manualPowerMode: prefs.manualPowerMode ?? false,
        gamepadEnabled: prefs.gamepadEnabled ?? true,
        countryCode: prefs.countryCode ?? null,
        gameBackground: bgId,
        gameBackgroundUrl: bgUrl,
        boardPalette: readBoardPalette(prefs.boardPalette),
        deckListLimit: typeof prefs.deckListLimit === 'number' ? prefs.deckListLimit : 20,
        favoriteDeckIds: Array.isArray(prefs.favoriteDeckIds) ? prefs.favoriteDeckIds.slice(0, MAX_FAVORITE_DECKS) : [],
        availableBackgrounds: backgrounds,
        isLoaded: true,
      });
      lastPersistedBoardPalette = get().boardPalette;
      const soundOn = get().soundEnabled;
      try { localStorage.setItem('nmtcg-sound-enabled', String(soundOn)); } catch { /* ignore */ }
      import('@/lib/sound/SoundManager').then(m => m.setMuted(!soundOn)).catch(() => {});
    } catch {
      set({ isLoaded: true });
    }
  },

  setAnimationsEnabled: async (v: boolean) => {
    const prevPref = get().animationsPref;
    set({ animationsPref: v, animationsEnabled: effectiveAnimations(v) });
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ animationsEnabled: v }),
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch {
      set({ animationsPref: prevPref, animationsEnabled: effectiveAnimations(prevPref) });
    }
  },

  setSiteTheme: async (v: SiteTheme) => {
    set({ siteTheme: v });
    applySiteTheme(v);
    try { localStorage.setItem(SITE_THEME_STORAGE_KEY, v); } catch { /* ignore */ }
    try {
      await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteTheme: v }),
      });
    } catch {
      /* le choix reste applique localement */
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

  setManualPowerMode: async (v: boolean) => {
    const prev = get().manualPowerMode;
    set({ manualPowerMode: v });
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualPowerMode: v }),
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch {
      set({ manualPowerMode: prev });
    }
  },

  setGamepadEnabled: async (v: boolean) => {
    const prev = get().gamepadEnabled;
    set({ gamepadEnabled: v });
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gamepadEnabled: v }),
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch {
      set({ gamepadEnabled: prev });
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

  setFastAnimations: async (v: boolean) => {
    const prev = get().fastAnimations;
    set({ fastAnimations: v });
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fastAnimations: v }),
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch {
      set({ fastAnimations: prev });
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

  setAllowNonFriendMessages: async (v: boolean) => {
    const prev = get().allowNonFriendMessages;
    set({ allowNonFriendMessages: v });
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowNonFriendMessages: v }),
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch {
      set({ allowNonFriendMessages: prev });
    }
  },

  setPrivateProfile: async (v: boolean) => {
    const prev = get().privateProfile;
    set({ privateProfile: v });
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privateProfile: v }),
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch {
      set({ privateProfile: prev });
    }
  },

  setDeckListLimit: async (v: number) => {
    const clamped = Math.max(DECK_LIST_LIMIT_MIN, Math.min(DECK_LIST_LIMIT_MAX, Math.round(v)));
    const prev = get().deckListLimit;
    set({ deckListLimit: clamped });
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckListLimit: clamped }),
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch {
      set({ deckListLimit: prev });
    }
  },

  setFavoriteDeckIds: async (ids: string[]) => {
    const next = ids.filter((id, i) => typeof id === 'string' && ids.indexOf(id) === i).slice(0, MAX_FAVORITE_DECKS);
    const prev = get().favoriteDeckIds;
    set({ favoriteDeckIds: next });
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favoriteDeckIds: next }),
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch {
      set({ favoriteDeckIds: prev });
    }
  },

  toggleFavoriteDeck: async (id: string) => {
    const current = get().favoriteDeckIds;
    let next: string[];
    if (current.includes(id)) {
      next = current.filter((x) => x !== id);
    } else {
      if (current.length >= MAX_FAVORITE_DECKS) return;
      next = [...current, id];
    }
    await get().setFavoriteDeckIds(next);
  },

  setBoardPalette: (next: StoredBoardPalette | null) => {
    const sanitized = readBoardPalette(next);
    set({ boardPalette: sanitized });
    if (boardPaletteSaveTimer) clearTimeout(boardPaletteSaveTimer);
    boardPaletteSaveTimer = setTimeout(() => {
      boardPaletteSaveTimer = null;
      fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardPalette: sanitized }),
      })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to save');
          lastPersistedBoardPalette = sanitized;
        })
        .catch(() => {
          set({ boardPalette: lastPersistedBoardPalette });
        });
    }, BOARD_PALETTE_SAVE_DELAY_MS);
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
