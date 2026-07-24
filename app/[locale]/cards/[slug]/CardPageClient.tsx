'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { hasScenario } from '@/lib/cards/sim/keys';

const SimulationGame = dynamic(
  () => import('@/components/cards/sim/SimulationGame').then((m) => m.SimulationGame),
  { ssr: false },
);
import { getCardById, getCardsByName } from '@/lib/data/cardIndex';
import { useRevealingStore } from '@/stores/revealingStore';
import { getAdjacentCardIds, compareBySetOrder } from '@/lib/cards/order';
import { cardIdToSlug } from '@/lib/cards/slug';
import { getCardName, getCardTitle, getCardGroup, getCardKeyword, getRarityLabel } from '@/lib/utils/cardLocale';
import { getCardEffectDescriptions } from '@/lib/data/effectDescriptions';
import { getSetName } from '@/lib/data/sets/registry';
import { normalizeImagePath } from '@/lib/utils/imagePath';
import { isLockedVariantCard } from '@/lib/variants/isVariant';
import { USAGE_TIER_COLORS } from '@/lib/cards/usageTiers';
import { HoloCard } from '@/components/HoloCard';
import CardFace from '@/components/cards/CardFace';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { CardBackgroundDecor } from '@/components/CardBackgroundDecor';
import { Footer } from '@/components/Footer';
import { useIsFinePointer } from '@/lib/hooks/useIsFinePointer';
import { useCardUsage } from '@/lib/hooks/useCardUsage';
import type { CardData, CharacterCard, MissionCard, Rarity } from '@/lib/engine/types';

const GOLD = '#c4a35a';

const EFFECT_TYPE_COLORS: Record<string, string> = {
  MAIN: '#60a5fa',
  UPGRADE: '#a78bfa',
  AMBUSH: '#f97316',
  SCORE: '#eab308',
  DUEL: '#ef4444',
  ATTACH: '#5A7ABB',
};

const RARITY_COLORS: Record<Rarity, string> = {
  C: '#9ca3af', UC: '#22c55e', R: '#3b82f6', RA: '#a855f7',
  S: '#eab308', SV: '#eab308', M: '#ef4444', MV: '#ef4444', L: '#eab308',
  SP: '#06b6d4', SPV: '#06b6d4', POP: '#e84393', POPV: '#e84393',
  CHIBI: '#10b981', CHIBIV: '#10b981', MMS: '#5a8ab5',
};

function holoRarity(rarity: Rarity): 'common' | 'rare' | 'secret' | 'mythos' | 'legendary' | 'special' {
  if (rarity === 'C' || rarity === 'UC') return 'common';
  if (rarity === 'R' || rarity === 'RA' || rarity === 'MMS') return 'rare';
  if (rarity === 'S' || rarity === 'SV') return 'secret';
  if (rarity === 'M' || rarity === 'MV') return 'mythos';
  if (rarity === 'L') return 'legendary';
  return 'special';
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {dir === 'left' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
    </svg>
  );
}

export function CardPageClient({ cardId }: { cardId: string }) {
  const locale = useLocale();
  const t = useTranslations('cardPage');
  const tCardMeta = useTranslations('cardMeta');
  const tBreadcrumbs = useTranslations('breadcrumbs');
  const fine = useIsFinePointer();
  const usage = useCardUsage(cardId);
  const [simEffect, setSimEffect] = useState<number | null>(null);
  const revealingVersion = useRevealingStore((s) => s.version);

  void revealingVersion;
  const card = getCardById(cardId) as CardData | undefined;
  if (!card) return null;

  const name = getCardName(card, locale);
  const title = getCardTitle(card, locale);
  const rarityLabel = getRarityLabel(card.rarity, tCardMeta);
  const rarityColor = RARITY_COLORS[card.rarity] ?? '#9ca3af';
  const setName = getSetName(card.set, locale);
  const imgSrc = normalizeImagePath(card.image_file);
  const hasImage = !!card.image_file && !!imgSrc;
  const locked = isLockedVariantCard(card);
  const isCharacter = card.card_type === 'character';
  const isMission = card.card_type === 'mission';
  const isAttachment = card.card_type === 'attachment';
  const isLandscape = isMission || (isAttachment && card.attach_to === 'mission');

  const localizedEffects = getCardEffectDescriptions(card.id, locale);
  const effects = card.effects.map((eff, i) => ({
    type: eff.type,
    text: localizedEffects?.[i] ?? eff.description,
  }));

  const { prev, next } = getAdjacentCardIds(cardId);
  const prevSlug = cardIdToSlug(prev);
  const nextSlug = cardIdToSlug(next);

  const sameName = getCardsByName(card.name_fr).slice().sort(compareBySetOrder);
  const variants = sameName.filter((c) => c.number === card.number);
  const otherVersions = sameName.filter((c) => c.number !== card.number);

  const renderThumb = (c: CardData) => {
    const isCurrent = c.id === card.id;
    const cRarityColor = RARITY_COLORS[c.rarity] ?? '#9ca3af';
    const content = (
      <div className="flex flex-col gap-1.5">
        <div className="relative rounded-md overflow-hidden" style={isCurrent ? { boxShadow: `0 0 0 2px ${GOLD}, 0 0 14px ${GOLD}55` } : undefined}>
          <CardFace card={c as CharacterCard | MissionCard} />
        </div>
        <span className="text-[10px] text-center uppercase tracking-wider truncate" style={{ color: isCurrent ? GOLD : cRarityColor }}>
          {isCurrent ? t('current') : getRarityLabel(c.rarity, tCardMeta)}
        </span>
      </div>
    );
    return isCurrent ? (
      <div key={c.id} aria-current="page">{content}</div>
    ) : (
      <Link key={c.id} href={`/cards/${cardIdToSlug(c.id)}`} className="block transition-transform hover:-translate-y-0.5">
        {content}
      </Link>
    );
  };

  const arrowClass = 'fixed top-1/2 -translate-y-1/2 z-40 flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full transition-shadow';
  const arrowStyle = { backgroundColor: `${GOLD}1f`, color: GOLD };

  return (
    <main id="main-content" className="font-body-force min-h-screen relative bg-[#0a0a0a] flex flex-col text-[#e8e8e8]">
      <CloudBackground />
      <DecorativeIcons />
      <CardBackgroundDecor variant="collection" />

      <Link href={`/cards/${prevSlug}`} aria-label={t('previous')} className={`${arrowClass} left-1 md:left-4`} style={arrowStyle}>
        <Chevron dir="left" />
      </Link>
      <Link href={`/cards/${nextSlug}`} aria-label={t('next')} className={`${arrowClass} right-1 md:right-4`} style={arrowStyle}>
        <Chevron dir="right" />
      </Link>

      <div className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 flex-1">
        <nav aria-label="breadcrumb" className="text-xs uppercase tracking-wider mb-6 flex flex-wrap items-center gap-2 text-[#8a8a8a]">
          <Link href="/" className="hover:text-[#e8e8e8] transition-colors">{tBreadcrumbs('root')}</Link>
          <span aria-hidden="true">/</span>
          <Link href="/collection" className="hover:text-[#e8e8e8] transition-colors">{tBreadcrumbs('page.collection')}</Link>
          <span aria-hidden="true">/</span>
          <span className="text-[#e8e8e8]">{name} {card.number}</span>
        </nav>

        <div className="flex flex-col md:flex-row gap-6 md:gap-10">
          <div className={`w-full ${isLandscape ? 'max-w-[440px]' : 'max-w-[300px]'} mx-auto md:mx-0 shrink-0`}>
            <div className="relative">
              {hasImage && fine ? (
                <HoloCard src={imgSrc!} alt={`${name} ${card.number}`} rarity={holoRarity(card.rarity)} width={isLandscape ? 440 : 300} height={isLandscape ? 322 : 420} />
              ) : (
                <div className="w-full" style={{ maxWidth: isLandscape ? 440 : 300 }}>
                  <CardFace card={card} />
                </div>
              )}
              {locked && (
                <span
                  className="absolute top-2 left-2 px-2 py-1 rounded text-[10px] uppercase tracking-wider font-semibold"
                  style={{ backgroundColor: 'rgba(10,10,10,0.82)', color: GOLD }}
                >
                  {t('lockedVariant')}
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="font-display-force text-2xl sm:text-3xl font-bold leading-tight">{name}</h1>
            {title && <p className="mt-1 text-base sm:text-lg text-[#b9b9b9] italic">{title}</p>}
            <p className="mt-1 text-sm text-[#8a8a8a] tracking-wider">N° {String(card.number).padStart(3, '0')}</p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="px-3 py-1.5 rounded text-sm font-semibold" style={{ backgroundColor: `${rarityColor}1f`, color: rarityColor }}>
                {rarityLabel}
              </span>
              <span className="px-3 py-1.5 rounded text-sm" style={{ backgroundColor: '#ffffff0a', color: '#d0d0d0' }}>
                {t('set')}: {setName}
              </span>
              {(isCharacter || isAttachment) && (
                <>
                  <span className="px-3 py-1.5 rounded text-sm" style={{ backgroundColor: '#ffffff0a', color: '#d0d0d0' }}>
                    {t('chakra')}: {card.chakra}
                  </span>
                  <span className="px-3 py-1.5 rounded text-sm" style={{ backgroundColor: '#ffffff0a', color: '#d0d0d0' }}>
                    {t('power')}: {card.power}
                  </span>
                </>
              )}
            </div>

            {card.group && !isMission && (
              <p className="mt-4 text-sm text-[#b9b9b9]">
                <span className="text-[#8a8a8a] uppercase tracking-wider text-xs">{t('group')} : </span>
                {getCardGroup(card.group, tCardMeta)}
              </p>
            )}
            {card.keywords.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 items-center">
                <span className="text-[#8a8a8a] uppercase tracking-wider text-xs">{t('keywords')} :</span>
                {card.keywords.map((kw) => (
                  <span key={kw} className="px-2.5 py-1 rounded text-xs" style={{ backgroundColor: '#ffffff0a', color: '#d0d0d0' }}>
                    {getCardKeyword(kw, tCardMeta)}
                  </span>
                ))}
              </div>
            )}

            {usage && (() => {
              const tierColor = USAGE_TIER_COLORS[usage.tier];
              const isBan = usage.tier === 'BAN';
              const hasData = usage.totalDecks > 0;
              const ratePct = Math.round(usage.rate * 1000) / 10;
              const stat = (label: string, value: string) => (
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[10px] uppercase tracking-wider text-[#7a7a7a] truncate">{label}</span>
                  <span className="text-base font-bold text-[#e8e8e8]">{value}</span>
                </div>
              );
              return (
                <div className="mt-6">
                  <h2 className="text-sm uppercase tracking-wider text-[#8a8a8a] mb-3">{t('usageTier')}</h2>
                  {!isBan && !hasData ? (
                    <div className="rounded-lg p-4" style={{ backgroundColor: '#ffffff08', boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
                      <p className="text-sm text-[#b9b9b9]">{t('usageCollecting')}</p>
                    </div>
                  ) : (
                    <div className="rounded-lg p-4" style={{ backgroundColor: `${tierColor}14`, boxShadow: `0 8px 24px rgba(0,0,0,0.35), inset 0 0 40px ${tierColor}0a` }}>
                      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-1">
                        <span className="text-2xl font-bold" style={{ color: tierColor }}>{t(`tier_${usage.tier}`)}</span>
                        <span className="text-[11px] font-bold tracking-widest px-2 py-0.5 rounded" style={{ backgroundColor: `${tierColor}2e`, color: tierColor }}>{usage.tier}</span>
                      </div>

                      {isBan ? (
                        <p className="text-sm text-[#b9b9b9] mt-1">{t('bannedInRanked')}</p>
                      ) : (
                        <>
                          <div className="flex items-baseline gap-2 mb-2">
                            <span className="text-3xl font-bold" style={{ color: tierColor }}>{ratePct}%</span>
                            <span className="text-xs text-[#8a8a8a]">{t('usageRateLabel')}</span>
                          </div>
                          <div className="relative h-2.5 rounded-full overflow-hidden mb-4" style={{ backgroundColor: '#ffffff12' }}>
                            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(1.5, Math.round(usage.rate * 100))}%`, backgroundColor: tierColor }} />
                          </div>

                          <div className="grid grid-cols-3 gap-3 pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            {stat(t('usageDecksLabel'), t('usageDecksValue', { count: usage.count, total: usage.totalDecks }))}
                            {stat(t('usagePlayersLabel'), String(usage.activePlayers))}
                            {stat(t('usageTierLabel'), usage.tier)}
                          </div>

                          <p className="mt-3 text-[10px] leading-relaxed text-[#6f6f6f]">{t('usageBasis')} · {t('updatedDaily')}</p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {usage?.gameStats && (() => {
              const gs = usage.gameStats;
              if (gs.gamesSeen <= 0) return null;
              const MIN_SAMPLE = 20;
              const isCharacter = card.card_type === 'character';
              const winPct = Math.round((gs.gamesWon / gs.gamesSeen) * 1000) / 10;
              const avgCopies = gs.copyDecks > 0 ? Math.round((gs.copiesSum / gs.copyDecks) * 10) / 10 : 0;
              const winColor = winPct >= 52 ? '#7fd4a8' : winPct <= 48 ? '#d97676' : '#e8e8e8';
              const stat = (label: string, value: string, color?: string) => (
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[10px] uppercase tracking-wider text-[#7a7a7a] truncate">{label}</span>
                  <span className="text-base font-bold" style={{ color: color ?? '#e8e8e8' }}>{value}</span>
                </div>
              );
              return (
                <div className="mt-6">
                  <h2 className="text-sm uppercase tracking-wider text-[#8a8a8a] mb-3">{t('gameStatsTitle')}</h2>
                  <div className="rounded-lg p-4" style={{ backgroundColor: '#ffffff08', boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
                    {gs.gamesSeen >= MIN_SAMPLE ? (
                      <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-3xl font-bold" style={{ color: winColor }}>{winPct}%</span>
                        <span className="text-xs text-[#8a8a8a]">{t('winRateLabel')}</span>
                      </div>
                    ) : (
                      <p className="text-sm text-[#b9b9b9] mb-2">{t('winRateCollecting', { count: gs.gamesSeen, min: MIN_SAMPLE })}</p>
                    )}
                    {gs.gamesSeen >= MIN_SAMPLE && (
                      <div className="relative h-2.5 rounded-full overflow-hidden mb-4" style={{ backgroundColor: '#ffffff12' }}>
                        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(1.5, Math.min(100, winPct))}%`, backgroundColor: winColor }} />
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {stat(t('gamesSeenLabel'), String(gs.gamesSeen))}
                      {avgCopies > 0 && isCharacter && stat(t('avgCopiesLabel'), String(avgCopies))}
                    </div>
                    <p className="mt-3 text-[10px] leading-relaxed text-[#6f6f6f]">{t('gameStatsBasis')} · {t('updatedDaily')}</p>
                  </div>
                </div>
              );
            })()}

            {effects.length > 0 && (
              <div className="mt-6">
                <h2 className="text-sm uppercase tracking-wider text-[#8a8a8a] mb-3">{t('effects')}</h2>
                <div className="flex flex-col gap-3">
                  {effects.map((eff, i) => {
                    const color = EFFECT_TYPE_COLORS[eff.type] ?? '#9ca3af';
                    return (
                      <div key={i} className="rounded-lg p-3" style={{ backgroundColor: '#ffffff08', boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
                        <div className="flex items-center justify-between gap-3 mb-1.5">
                          <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded" style={{ backgroundColor: `${color}22`, color }}>
                            {eff.type}
                          </span>
                          {hasScenario(card.id, i) ? (
                            <button type="button" onClick={() => setSimEffect(i)} className="text-[11px] uppercase tracking-wider px-2 py-1 rounded transition-colors hover:brightness-110" style={{ backgroundColor: '#c4a35a1f', color: '#c4a35a' }}>
                              {t('viewSimulation')}
                            </button>
                          ) : (
                            <button type="button" disabled className="text-[11px] uppercase tracking-wider px-2 py-1 rounded opacity-45 cursor-not-allowed" style={{ backgroundColor: '#ffffff08', color: '#9a9a9a' }}>
                              {t('viewSimulation')} · {t('simulationSoon')}
                            </button>
                          )}
                        </div>
                        <p className="text-sm text-[#dcdcdc] leading-relaxed">{eff.text}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {variants.length > 1 && (
          <section className="mt-10">
            <h2 className="text-sm uppercase tracking-wider text-[#8a8a8a] mb-4">{t('variantsSameEffect')}</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 sm:gap-4">
              {variants.map(renderThumb)}
            </div>
          </section>
        )}

        {otherVersions.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm uppercase tracking-wider text-[#8a8a8a] mb-4">{t('otherVersions')}</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 sm:gap-4">
              {otherVersions.map(renderThumb)}
            </div>
          </section>
        )}
      </div>

      <Footer />

      {simEffect !== null && (
        <SimulationGame cardId={card.id} effectIndex={simEffect} onClose={() => setSimEffect(null)} />
      )}
    </main>
  );
}
