'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { getCardById } from '@/lib/data/cardIndex';
import { getCardGroup } from '@/lib/utils/cardLocale';
import { normalizeImagePath } from '@/lib/utils/imagePath';
import type { DeckSnapshot } from '@/lib/social/types';

const DeckViewerModal = dynamic(() => import('@/components/profile/DeckViewerModal'), { ssr: false });

const GROUP_COLORS: Record<string, string> = {
  'Leaf Village': '#4a9e4a',
  'Sand Village': '#c9a24b',
  'Sound Village': '#8b6fc0',
  'Akatsuki': '#b8474a',
  'Independent': '#7a7a80',
};

function groupColor(group: string): string {
  return GROUP_COLORS[group] ?? '#7a7a80';
}

export function DeckEmbed({ deck, onOpen }: { deck: DeckSnapshot; onOpen?: () => void }) {
  const t = useTranslations('feed');
  const tCardMeta = useTranslations('cardMeta');
  const [viewerOpen, setViewerOpen] = useState(false);

  const { groups, headline, total } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const id of deck.cardIds) {
      const card = getCardById(id);
      const g = card?.group || 'Independent';
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    const seen = new Set<string>();
    const unique = deck.cardIds
      .filter((id) => (seen.has(id) ? false : (seen.add(id), true)))
      .map((id) => getCardById(id))
      .filter((c): c is NonNullable<typeof c> => !!c && !!c.image_file);
    unique.sort((a, b) => (b.power ?? 0) - (a.power ?? 0));
    return {
      groups: [...counts.entries()].sort((a, b) => b[1] - a[1]),
      headline: unique.slice(0, 5),
      total: deck.cardIds.length,
    };
  }, [deck.cardIds]);

  const openViewer = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (onOpen) { onOpen(); return; }
    setViewerOpen(true);
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        data-gp
        onClick={openViewer}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openViewer(e); } }}
        className="block w-full text-left mt-2 overflow-hidden"
        style={{
          backgroundColor: '#0d0c10',
          border: '1px solid #1e1e22',
          cursor: 'pointer',
        }}
      >
        {headline.length > 0 && (
          <div className="relative flex items-end gap-0 px-3 pt-3" style={{ height: 92 }}>
            {headline.map((card, i) => {
              const src = normalizeImagePath(card.image_file);
              return (
                <div
                  key={card.id + i}
                  className="relative shrink-0 overflow-hidden"
                  style={{
                    width: 58,
                    height: 80,
                    marginLeft: i === 0 ? 0 : -20,
                    zIndex: headline.length - i,
                    transform: `rotate(${(i - (headline.length - 1) / 2) * 3}deg)`,
                    transformOrigin: 'bottom center',
                    boxShadow: '0 6px 14px rgba(0,0,0,0.5)',
                    backgroundColor: '#000',
                  }}
                >
                  {}
                  <img src={src ?? ''} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" decoding="async" />
                </div>
              );
            })}
            <div className="absolute inset-0" style={{ boxShadow: 'inset 0 -28px 24px -20px #0d0c10' }} />
          </div>
        )}

        <div className="px-3 pb-3 pt-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-display text-sm truncate" style={{ color: '#e8e6df', letterSpacing: '0.02em' }}>
              {deck.name}
            </span>
            <span className="font-inter-force text-[10px] shrink-0" style={{ color: '#6a6a70' }}>
              {t('cards', { count: total })} · {t('missions', { count: deck.missionIds.length })}
            </span>
          </div>

          {groups.length > 0 && (
            <>
              <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: '#050506' }}>
                {groups.map(([g, n]) => (
                  <div key={g} style={{ width: `${(n / total) * 100}%`, backgroundColor: groupColor(g) }} />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {groups.map(([g, n]) => (
                  <span key={g} className="flex items-center gap-1.5 text-[10px]" style={{ color: '#9a9a9f' }}>
                    <span className="inline-block h-2 w-2" style={{ backgroundColor: groupColor(g) }} />
                    {getCardGroup(g, tCardMeta)} {n}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {viewerOpen && !onOpen && (
        <DeckViewerModal
          deck={{ id: deck.deckId ?? 'shared-deck', name: deck.name, cardIds: deck.cardIds, missionIds: deck.missionIds }}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </>
  );
}
