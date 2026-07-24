import { create } from 'zustand';
import { augmentRawCards } from '@/lib/data/cardLoader';
import { resetCardIndexCaches } from '@/lib/data/cardIndex';
import { augmentEffectDescriptions } from '@/lib/data/effectDescriptions';
import { resetSlugCache } from '@/lib/cards/slug';
import { applySetStatusOverrides } from '@/lib/data/sets/registry';
import { applyVariantObtentionOverrides } from '@/lib/variants/obtention';
import { clearVariantPoolCache } from '@/lib/variants/variantPool';

interface RevealingState {
  loaded: boolean;
  loading: boolean;
  privileged: boolean;
  version: number;
  unrevealedIds: Set<string>;
  load: () => Promise<void>;
}

// Client-side merge of runtime-delivered revealing-set cards into the card index. The static
// client bundle contains released sets only; this store fetches the cards the viewer is
// entitled to (revealed for everyone, all revealing-set cards for admins/testers) and merges
// them so browsing surfaces and the client engine can resolve them. `version` bumps on merge
// so subscribed components re-derive their card lists.
export const useRevealingStore = create<RevealingState>((set, get) => ({
  loaded: false,
  loading: false,
  privileged: false,
  version: 0,
  unrevealedIds: new Set<string>(),
  load: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true });
    try {
      const res = await fetch('/api/cards/revealing', { cache: 'no-store' });
      if (!res.ok) {
        set({ loaded: true, loading: false });
        return;
      }
      const data = await res.json();
      const cards = (data?.cards ?? {}) as Record<string, unknown>;
      const descriptions = (data?.descriptions ?? {}) as Record<string, Record<string, string[]>>;
      applySetStatusOverrides((data?.setStatuses ?? null) as Record<string, unknown> | null);
      applyVariantObtentionOverrides((data?.variantObtention ?? null) as Record<string, unknown> | null);
      clearVariantPoolCache();
      if (Object.keys(cards).length > 0) {
        augmentRawCards(cards);
        resetCardIndexCaches();
        resetSlugCache();
        augmentEffectDescriptions(descriptions);
      }
      set({
        loaded: true,
        loading: false,
        privileged: !!data?.privileged,
        unrevealedIds: new Set<string>((data?.unrevealedIds ?? []) as string[]),
        version: get().version + 1,
      });
    } catch {
      set({ loaded: true, loading: false });
    }
  },
}));
