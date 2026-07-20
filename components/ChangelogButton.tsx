'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocale, useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import changelog from '@/lib/data/changelog.json';
import { Z_APP_MODAL } from '@/lib/ui/zIndex';

type Category = 'fix' | 'feature';

type Entry = {
  date: string;
  title_fr: string;
  title_en: string;
  changes_fr: string[];
  changes_en: string[];
  [key: string]: string | string[] | undefined;
};

type TabKey = 'all' | Category;

const TABS: TabKey[] = ['all', 'feature', 'fix'];

const TAB_LABEL_KEY: Record<TabKey, string> = {
  all: 'tabAll',
  feature: 'tabFeature',
  fix: 'tabFix',
};

const CATEGORY_STYLE: Record<Category, { color: string; bg: string }> = {
  fix: { color: '#d98d8d', bg: 'rgba(217,141,141,0.13)' },
  feature: { color: '#c4a35a', bg: 'rgba(196,163,90,0.13)' },
};

interface ChangeItem {
  text: string;
  category: Category;
}

function localizedTitle(entry: Entry, locale: string): string {
  const v = entry[`title_${locale}`];
  if (typeof v === 'string' && v) return v;
  return entry.title_en || entry.title_fr;
}

function localizedChanges(entry: Entry, locale: string): ChangeItem[] {
  const raw = entry[`changes_${locale}`];
  const arr = (Array.isArray(raw) && raw.length ? raw : (entry.changes_en ?? entry.changes_fr)) as string[];
  const cats = (Array.isArray(entry.categories) ? entry.categories : []) as Category[];
  return arr.map((text, i) => ({ text, category: cats[i] ?? 'fix' }));
}

const STORAGE_KEY = 'naruto-mythos-changelog-lastseen';

function formatDate(iso: string, bcp47: string): string {
  try {
    const d = new Date(iso + 'T00:00:00Z');
    return d.toLocaleDateString(bcp47, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function ChangelogButton() {
  const locale = useLocale();
  const t = useTranslations('changelog');
  const tMeta = useTranslations('_meta');
  const [open, setOpen] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('all');

  useEffect(() => {
    setMounted(true);
  }, []);

  const entries = useMemo(() => (changelog.entries ?? []) as Entry[], []);
  const latestDate = entries[0]?.date ?? '';

  useEffect(() => {
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      setHasNew(seen !== latestDate && latestDate !== '');
    } catch {

    }
  }, [latestDate]);

  const visibleEntries = useMemo(() => {
    return entries
      .map((entry) => ({
        entry,
        items: localizedChanges(entry, locale).filter(
          (it) => activeTab === 'all' || it.category === activeTab,
        ),
      }))
      .filter((x) => x.items.length > 0);
  }, [entries, locale, activeTab]);

  function openModal() {
    setActiveTab('all');
    setOpen(true);
    try {
      localStorage.setItem(STORAGE_KEY, latestDate);
    } catch {

    }
    setHasNew(false);
  }

  function closeModal() {
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const modal = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="changelog-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.75)', zIndex: Z_APP_MODAL }}
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="changelog-title"
        >
            <motion.div
              key="changelog-panel"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-md border shadow-2xl"
              style={{
                backgroundColor: '#111111',
                borderColor: '#2a2a2a',
              }}
            >
              <header
                className="flex items-center justify-between border-b px-5 py-4"
                style={{ borderColor: '#2a2a2a' }}
              >
                <div className="flex items-baseline gap-3">
                  <h2
                    id="changelog-title"
                    className="font-display text-xl font-black tracking-wider uppercase"
                    style={{ color: '#c4a35a' }}
                  >
                    {t('modalTitle')}
                  </h2>
                  <span className="text-xs uppercase tracking-widest" style={{ color: '#555555' }}>
                    {t('modalSubtitle')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="text-xs font-bold uppercase tracking-widest transition-colors"
                  style={{ color: '#888888' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#c4a35a')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#888888')}
                  aria-label={t('close')}
                >
                  {t('close')}
                </button>
              </header>

              <div
                className="flex flex-wrap gap-1.5 border-b px-5 py-2.5"
                style={{ borderColor: '#2a2a2a' }}
                role="tablist"
              >
                {TABS.map((tab) => {
                  const active = activeTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setActiveTab(tab)}
                      className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors"
                      style={
                        active
                          ? { color: '#c4a35a', backgroundColor: 'rgba(196,163,90,0.12)' }
                          : { color: '#777777', backgroundColor: 'transparent' }
                      }
                    >
                      {t(TAB_LABEL_KEY[tab])}
                    </button>
                  );
                })}
              </div>

              <div className="overflow-y-auto px-5 py-5">
                {visibleEntries.length === 0 ? (
                  <p className="text-sm" style={{ color: '#777777' }}>
                    {entries.length === 0 ? t('empty') : t('emptyTab')}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-6">
                    {visibleEntries.map(({ entry, items }) => {
                      const title = localizedTitle(entry, locale);
                      const isLatest = entry.date === latestDate;
                      return (
                        <li key={entry.date}>
                          <div className="mb-2 flex items-center gap-3">
                            <span
                              className="text-xs font-bold uppercase tracking-widest"
                              style={{ color: isLatest ? '#c4a35a' : '#666666' }}
                            >
                              {formatDate(entry.date, tMeta('bcp47'))}
                            </span>
                            {isLatest && (
                              <span
                                className="rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest"
                                style={{
                                  backgroundColor: 'rgba(196,163,90,0.15)',
                                  color: '#c4a35a',
                                  }}
                              >
                                {t('latestBadge')}
                              </span>
                            )}
                          </div>
                          <h3
                            className="mb-2 text-base font-bold"
                            style={{ color: '#e8e8e8' }}
                          >
                            {title}
                          </h3>
                          <ul className="flex flex-col gap-1.5">
                            {items.map((item, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-2 text-sm leading-relaxed"
                                style={{ color: '#bbbbbb' }}
                              >
                                <span
                                  className="mt-0.5 shrink-0 rounded-sm px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest"
                                  style={{
                                    color: CATEGORY_STYLE[item.category].color,
                                    backgroundColor: CATEGORY_STYLE[item.category].bg,
                                  }}
                                >
                                  {t(TAB_LABEL_KEY[item.category])}
                                </span>
                                <span className="font-body">{item.text}</span>
                              </li>
                            ))}
                          </ul>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="relative px-2 py-1 text-xs font-bold uppercase tracking-wider transition-colors"
        style={{
          color: hasNew ? '#c4a35a' : '#888888',
        }}
        aria-label={t('buttonLabel')}
      >
        {t('buttonLabel')}
        {hasNew && (
          <span
            className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: '#c4a35a' }}
            aria-hidden="true"
          />
        )}
      </button>
      {mounted ? createPortal(modal, document.body) : null}
    </>
  );
}
