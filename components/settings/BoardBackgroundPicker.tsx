'use client';

import { useTranslations } from 'next-intl';
import { useSettingsStore } from '@/stores/settingsStore';

export function BoardBackgroundPicker() {
  const t = useTranslations('settings');
  const gameBackground = useSettingsStore((s) => s.gameBackground);
  const backgrounds = useSettingsStore((s) => s.availableBackgrounds);
  const setGameBackground = useSettingsStore((s) => s.setGameBackground);
  const isLoaded = useSettingsStore((s) => s.isLoaded);

  if (backgrounds.length === 0) return null;

  const tiles = [{ id: 'random', name: t('gameBackgroundRandom'), url: '' }, ...backgrounds];

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <span className="text-[11px] font-bold uppercase tracking-[0.25em]" style={{ color: 'var(--t-muted)' }}>
        {t('gameBackground')}
      </span>
      <div
        className="flex gap-2 overflow-x-auto pb-1"
        style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
      >
        {tiles.map((bg) => {
          const active = gameBackground === bg.id;
          return (
            <button
              key={bg.id}
              type="button"
              disabled={!isLoaded}
              onClick={() => setGameBackground(bg.id, bg.url)}
              title={bg.name}
              aria-label={bg.name}
              aria-pressed={active}
              className="relative shrink-0 overflow-hidden"
              style={{
                width: '76px',
                aspectRatio: '16/9',
                scrollSnapAlign: 'start',
                cursor: isLoaded ? 'pointer' : 'default',
                opacity: !isLoaded ? 0.5 : active ? 1 : 0.62,
                backgroundColor: 'var(--t-accent-tint)',
                boxShadow: active
                  ? '0 0 16px color-mix(in srgb, var(--t-accent) 55%, transparent)'
                  : '0 4px 12px var(--t-shadow)',
                transition: 'opacity 180ms ease, box-shadow 180ms ease',
              }}
            >
              {bg.id === 'random' ? (
                <span
                  className="flex h-full w-full items-center justify-center text-xl font-bold"
                  style={{ color: 'var(--t-accent)', fontFamily: "'NJNaruto', sans-serif" }}
                >
                  ?
                </span>
              ) : (
                <img
                  src={bg.url}
                  alt=""
                  loading="lazy"
                  draggable={false}
                  className="h-full w-full object-cover"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
