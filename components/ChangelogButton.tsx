'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocale, useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import changelog from '@/lib/data/changelog.json';
import { Z_APP_MODAL } from '@/lib/ui/zIndex';

type Entry = {
  date: string;
  title_fr: string;
  title_en: string;
  changes_fr: string[];
  changes_en: string[];
};

const STORAGE_KEY = 'naruto-mythos-changelog-lastseen';

function formatDate(iso: string, locale: string): string {
  try {
    const d = new Date(iso + 'T00:00:00Z');
    return d.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
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
  const [open, setOpen] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const entries = (changelog.entries ?? []) as Entry[];
  const latestDate = entries[0]?.date ?? '';

  useEffect(() => {
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      setHasNew(seen !== latestDate && latestDate !== '');
    } catch {
      
    }
  }, [latestDate]);

  function openModal() {
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

              <div className="overflow-y-auto px-5 py-5">
                {entries.length === 0 ? (
                  <p className="text-sm" style={{ color: '#777777' }}>
                    {t('empty')}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-6">
                    {entries.map((entry, idx) => {
                      const title = locale === 'fr' ? entry.title_fr : entry.title_en;
                      const items = locale === 'fr' ? entry.changes_fr : entry.changes_en;
                      const isLatest = idx === 0;
                      return (
                        <li key={`${entry.date}-${idx}`}>
                          <div className="mb-2 flex items-center gap-3">
                            <span
                              className="text-xs font-bold uppercase tracking-widest"
                              style={{ color: isLatest ? '#c4a35a' : '#666666' }}
                            >
                              {formatDate(entry.date, locale)}
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
                            {items.map((line, i) => (
                              <li
                                key={i}
                                className="flex gap-2 text-sm leading-relaxed"
                                style={{ color: '#bbbbbb' }}
                              >
                                <span style={{ color: '#c4a35a' }} aria-hidden="true">•</span>
                                <span className="font-body">{line}</span>
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
