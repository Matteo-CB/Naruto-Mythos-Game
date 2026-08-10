'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { getCardById } from '@/lib/data/cardIndex';
import { useSession } from 'next-auth/react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';
import { HoloCard } from '@/components/HoloCard';
import { useRevealingStore } from '@/stores/revealingStore';
import { useToastStore } from '@/stores/toastStore';
import { getAllCards } from '@/lib/data/cardIndex';
import { formatCardLabelShort } from '@/lib/variants/cardLabel';
import { normalizeImagePath, portraitImagePath } from '@/lib/utils/imagePath';
import { isHoloId } from '@/lib/holo/holoId';
import { holoRarity, type HoloRarity } from '@/lib/cards/holoRarity';
import { ALL_SET_IDS, getSetName } from '@/lib/data/sets/registry';
import { facetOptions, facetPool, isFacetWorthShowing } from '@/lib/collection/facets';
import { useValidFacetSelection } from '@/lib/collection/useFacets';
import { isAdmin as checkIsAdmin } from '@/lib/auth/admins';
import type { CardData } from '@/lib/engine/types';

const FEATURED_MAX_FALLBACK = 6;

interface PickerCard {
  id: string;
  set: string;
  label: string;
  src: string;
  rarity: HoloRarity;
  locked: boolean;
}

export default function AdminFeaturedPage() {
  const t = useTranslations('adminFeatured');
  const locale = useLocale();
  const { data: session } = useSession();
  const showToast = useToastStore((s) => s.showToast);
  const loadRevealing = useRevealingStore((s) => s.load);
  const cardIndexVersion = useRevealingStore((s) => s.version);
  const unrevealedIds = useRevealingStore((s) => s.unrevealedIds);

  const [selected, setSelected] = useState<string[]>([]);
  const [max, setMax] = useState(FEATURED_MAX_FALLBACK);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [setFilter, setSetFilter] = useState('');
  const [rarityFilter, setRarityFilter] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);

  const isAdmin = checkIsAdmin({ username: session?.user?.name, email: session?.user?.email });

  useEffect(() => { loadRevealing(); }, [loadRevealing]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    fetch('/api/admin/featured-cards')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setSelected(Array.isArray(data.cardIds) ? data.cardIds : []);
        if (typeof data.max === 'number') setMax(data.max);
      })
      .catch(() => { })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isAdmin]);

  const allPickerCards = useMemo<PickerCard[]>(() => {
    void cardIndexVersion;
    return (getAllCards() as CardData[])
      .filter((c) => !!c.image_file && !isHoloId(c.id)
        && (c.card_type === 'character' || c.card_type === 'attachment' || c.card_type === 'mission'))
      .map((c) => ({
        id: c.id,
        set: c.set,
        label: formatCardLabelShort(c, locale),
        src: portraitImagePath(c) ?? '',
        rarity: holoRarity(c.rarity),
        locked: unrevealedIds.has(c.id),
      }))
      .sort((a, b) => a.set.localeCompare(b.set) || a.label.localeCompare(b.label));
  }, [cardIndexVersion, locale, unrevealedIds]);

  const cardById = useMemo(() => {
    const map = new Map<string, PickerCard>();
    for (const c of allPickerCards) map.set(c.id, c);
    return map;
  }, [allPickerCards]);

  const selectedIds = useMemo(() => new Set(selected), [selected]);
  const searchNeedle = useMemo(() => search.trim().toLowerCase(), [search]);

  const facetPredicates = useMemo(() => ({
    search: (c: PickerCard) => !searchNeedle || c.label.toLowerCase().includes(searchNeedle),
    set: (c: PickerCard) => !setFilter || c.set === setFilter,
    rarity: (c: PickerCard) => !rarityFilter || c.rarity === rarityFilter,
    selectedOnly: (c: PickerCard) => !selectedOnly || selectedIds.has(c.id),
  }), [searchNeedle, setFilter, rarityFilter, selectedOnly, selectedIds]);

  const filtered = useMemo(
    () => allPickerCards.filter((c) => Object.values(facetPredicates).every((match) => match(c))),
    [allPickerCards, facetPredicates],
  );

  const setOptions = useMemo(() => facetOptions({
    cards: allPickerCards,
    predicates: facetPredicates,
    dimension: 'set',
    valueOf: (c) => c.set,
    order: ALL_SET_IDS,
  }), [allPickerCards, facetPredicates]);

  const rarityOptions = useMemo(() => facetOptions({
    cards: allPickerCards,
    predicates: facetPredicates,
    dimension: 'rarity',
    valueOf: (c) => c.rarity,
  }), [allPickerCards, facetPredicates]);

  const selectedOnlyOptions = useMemo(() => {
    const pool = facetPool(allPickerCards, facetPredicates, 'selectedOnly');
    return pool.some((c) => selectedIds.has(c.id)) ? ['off', 'on'] : ['off'];
  }, [allPickerCards, facetPredicates, selectedIds]);

  const applySelectedOnly = useCallback((value: string) => setSelectedOnly(value === 'on'), []);

  useValidFacetSelection(setFilter, setOptions, '', setSetFilter);
  useValidFacetSelection(rarityFilter, rarityOptions, '', setRarityFilter);
  useValidFacetSelection(selectedOnly ? 'on' : 'off', selectedOnlyOptions, 'off', applySelectedOnly);

  const add = (id: string) => {
    setSelected((prev) => (prev.includes(id) || prev.length >= max ? prev : [...prev, id]));
  };

  const remove = (id: string) => setSelected((prev) => prev.filter((x) => x !== id));

  const move = (index: number, delta: number) => {
    setSelected((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/featured-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardIds: selected }),
      });
      if (res.ok) {
        showToast({ type: 'success', titleKey: 'adminFeatured.saved' });
      } else {
        const data = await res.json().catch(() => ({}));
        const code = typeof data?.code === 'string' ? data.code : 'invalid';
        showToast({ type: 'error', titleKey: 'adminFeatured.saveFailed', messageKey: `adminFeatured.error.${code}` });
      }
    } catch {
      showToast({ type: 'error', titleKey: 'adminFeatured.saveFailed', messageKey: 'adminFeatured.error.invalid' });
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--t-bg)' }}>
        <p style={{ color: 'var(--t-danger)' }}>{t('unauthorized')}</p>
      </main>
    );
  }

  const previewCard = selected.length > 0 ? cardById.get(selected[0]) : undefined;

  return (
    <main className="min-h-screen relative" style={{ backgroundColor: 'var(--t-bg)', color: 'var(--t-text)' }}>
      <CloudBackground />
      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        <Link href="/admin" style={{ color: 'var(--t-accent)', fontSize: 14 }}>
          {t('back')}
        </Link>
        <h1 className="mt-4" style={{ fontFamily: 'NJNaruto, sans-serif', fontSize: 28, letterSpacing: 1 }}>
          {t('title')}
        </h1>
        <p className="mt-2" style={{ color: 'var(--t-muted)', fontSize: 14, maxWidth: 680 }}>
          {t('subtitle')}
        </p>

        <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-start">
          <section className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('searchPlaceholder')}
                aria-label={t('searchPlaceholder')}
                className="min-w-0 flex-1 px-3 py-2 text-[13px]"
                style={{ backgroundColor: 'var(--t-bg)', border: '1px solid var(--t-border-strong)', color: 'var(--t-text)', outline: 'none' }}
              />
              {isFacetWorthShowing(setOptions) && (
                <select
                  value={setFilter}
                  onChange={(e) => setSetFilter(e.target.value)}
                  aria-label={t('setFilterAll')}
                  className="px-3 py-2 text-[13px]"
                  style={{ backgroundColor: 'var(--t-bg)', border: '1px solid var(--t-border-strong)', color: 'var(--t-text)', outline: 'none' }}
                >
                  <option value="">{t('setFilterAll')}</option>
                  {setOptions.map((id) => (
                    <option key={id} value={id}>{getSetName(id, locale)}</option>
                  ))}
                </select>
              )}
              {isFacetWorthShowing(rarityOptions) && (
                <select
                  value={rarityFilter}
                  onChange={(e) => setRarityFilter(e.target.value)}
                  aria-label={t('rarityFilterAll')}
                  className="px-3 py-2 text-[13px]"
                  style={{ backgroundColor: 'var(--t-bg)', border: '1px solid var(--t-border-strong)', color: 'var(--t-text)', outline: 'none' }}
                >
                  <option value="">{t('rarityFilterAll')}</option>
                  {rarityOptions.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              )}
              {isFacetWorthShowing(selectedOnlyOptions) && (
                <button
                  type="button"
                  onClick={() => setSelectedOnly((v) => !v)}
                  aria-pressed={selectedOnly}
                  className="px-3 py-2 text-[13px] font-bold uppercase tracking-wider"
                  style={{
                    backgroundColor: selectedOnly ? 'var(--t-accent-glow)' : 'var(--t-bg)',
                    color: selectedOnly ? 'var(--t-accent)' : 'var(--t-muted)',
                    border: '1px solid var(--t-border-strong)', cursor: 'pointer',
                  }}
                >
                  {t('selectedOnly')}
                </button>
              )}
            </div>

            {loading ? (
              <p className="mt-6" style={{ color: 'var(--t-muted)' }}>{t('loading')}</p>
            ) : filtered.length === 0 ? (
              <p className="mt-6" style={{ color: 'var(--t-muted)' }}>{t('empty')}</p>
            ) : (
              <div
                className="mt-4 grid gap-3"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}
              >
                {filtered.slice(0, 240).map((card) => {
                  const isSelected = selected.includes(card.id);
                  return (
                    <button
                      key={card.id}
                      type="button"
                      disabled={card.locked || (isSelected ? false : selected.length >= max)}
                      onClick={() => (isSelected ? remove(card.id) : add(card.id))}
                      className="flex flex-col gap-1.5 p-2 text-left cursor-pointer disabled:cursor-default"
                      style={{
                        backgroundColor: isSelected ? 'var(--t-accent-glow)' : 'var(--t-panel)',
                        border: 'none',
                        opacity: card.locked ? 0.45 : 1,
                      }}
                    >
                      <div
                        className="relative w-full overflow-hidden"
                        style={{ aspectRatio: '800 / 1100', backgroundColor: 'var(--t-surface-2)' }}
                      >
                        <img
                          src={portraitImagePath(getCardById(card.id)) ?? card.src}
                          alt=""
                          loading="lazy"
                          className="absolute inset-0 h-full w-full"
                          style={{ objectFit: 'cover' }}
                        />
                      </div>
                      <span
                        className="text-[11px] leading-tight"
                        style={{ color: isSelected ? 'var(--t-accent)' : 'var(--t-muted)' }}
                      >
                        {card.label}
                      </span>
                      {card.locked && (
                        <span className="text-[10px]" style={{ color: 'var(--t-danger)' }}>{t('notRevealed')}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="min-w-0 lg:w-90 lg:shrink-0 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <span style={{ fontFamily: 'NJNaruto, sans-serif', fontSize: 18, color: 'var(--t-accent)' }}>
                {t('selectionTitle')}
              </span>
              <span className="text-[12px]" style={{ color: 'var(--t-muted)' }}>
                {t('count', { selected: selected.length, max })}
              </span>
            </div>

            {selected.length === 0 ? (
              <p className="text-[13px]" style={{ color: 'var(--t-muted)' }}>{t('selectionEmpty')}</p>
            ) : (
              <div className="flex flex-col">
                {selected.map((id, index) => {
                  const card = cardById.get(id);
                  const missing = !card;
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-2 py-2"
                      style={{ borderBottom: '1px solid var(--t-divider)' }}
                    >
                      <span className="flex-1 min-w-0 text-[12px] truncate" style={{ color: missing ? 'var(--t-danger)' : 'var(--t-text)' }}>
                        {card?.label ?? t('unavailableCard')}
                      </span>
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                        style={{ backgroundColor: 'var(--t-divider)', color: 'var(--t-muted)', border: 'none' }}
                      >
                        {t('moveUp')}
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                        style={{ backgroundColor: 'var(--t-divider)', color: 'var(--t-muted)', border: 'none' }}
                      >
                        {t('moveDown')}
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(id)}
                        className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                        style={{ backgroundColor: 'rgba(179,62,62,0.14)', color: 'var(--t-danger)', border: 'none' }}
                      >
                        {t('remove')}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="self-start px-5 py-2 text-[11px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-40"
              style={{ backgroundColor: 'var(--t-accent-glow)', color: 'var(--t-accent)', border: 'none' }}
            >
              {saving ? t('saving') : t('save')}
            </button>

            {previewCard && (
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.25em]" style={{ color: 'var(--t-muted)' }}>
                  {t('previewTitle')}
                </span>
                <HoloCard
                  src={previewCard.src}
                  alt={previewCard.label}
                  width={240}
                  height={336}
                  rarity={previewCard.rarity}
                />
              </div>
            )}
          </aside>
        </div>
      </div>
      <Footer />
    </main>
  );
}
