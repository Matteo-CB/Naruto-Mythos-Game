'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import changelog from '@/lib/data/changelog.json';
import '@/styles/holo-menu.css';

type Entry = {
  date: string;
  title_fr: string;
  title_en: string;
  changes_fr: string[];
  changes_en: string[];
};

const STORAGE_KEY = 'naruto-mythos-changelog-lastseen';
const PANEL_CLIP = 'polygon(18px 0, calc(100% - 18px) 0, 100% 18px, 100% calc(100% - 18px), calc(100% - 18px) 100%, 18px 100%, 0 calc(100% - 18px), 0 18px)';
const ENTRY_CLIP = 'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)';

function formatDate(iso: string, locale: string): string {
  try {
    const d = new Date(iso + 'T00:00:00Z');
    return d.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch { return iso; }
}

export function ChangelogButton() {
  const locale = useLocale();
  const t = useTranslations('changelog');
  const [open, setOpen] = useState(false);
  const [hasNew, setHasNew] = useState(false);

  const entries = (changelog.entries ?? []) as Entry[];
  const latestDate = entries[0]?.date ?? '';

  useEffect(() => {
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      setHasNew(seen !== latestDate && latestDate !== '');
    } catch { /* no-op */ }
  }, [latestDate]);

  function openModal() {
    setOpen(true);
    try { localStorage.setItem(STORAGE_KEY, latestDate); } catch { /* no-op */ }
    setHasNew(false);
  }

  function closeModal() { setOpen(false); }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="font-display relative px-2.5 py-1 text-[11px] uppercase tracking-widest transition-colors cursor-pointer hover:text-[#c4a35a]"
        style={{ color: hasNew ? '#c4a35a' : '#888' }}
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

      <AnimatePresence>
        {open && (
          <motion.div
            key="changelog-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-100 flex items-center justify-center p-3 sm:p-6"
            style={{ backgroundColor: 'rgba(0,0,0,0.82)' }}
            onClick={closeModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="changelog-title"
          >
            <motion.div
              key="changelog-panel"
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 220, damping: 22 }}
              onClick={(e) => e.stopPropagation()}
              className="holo-menu-foil relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden"
              style={{
                backgroundColor: '#0d0c10',
                clipPath: PANEL_CLIP,
                boxShadow: '0 24px 80px rgba(0, 0, 0, 0.75), 0 0 70px -30px rgba(196, 163, 90, 0.4)',
                ['--foil' as string]: '#c4a35a',
              } as React.CSSProperties}
            >
              <div className="relative flex items-end justify-between gap-3 px-5 sm:px-7 pt-5 sm:pt-6 pb-3 flex-wrap">
                <span
                  aria-hidden
                  className="font-display pointer-events-none absolute left-5 sm:left-7 leading-none"
                  style={{
                    color: 'rgba(196, 163, 90, 0.07)',
                    fontSize: 'clamp(80px, 16vw, 130px)',
                    top: -22,
                    letterSpacing: '-0.04em',
                  }}
                >
                  {(t('modalTitle') as string).slice(0, 1)}
                </span>

                <div className="relative">
                  <h2
                    id="changelog-title"
                    className="font-display text-xl sm:text-2xl uppercase tracking-wider leading-none"
                    style={{ color: '#f2efe7', letterSpacing: '0.08em', textShadow: '0 0 18px rgba(196, 163, 90, 0.18)' }}
                  >
                    {t('modalTitle')}
                  </h2>
                  <p className="text-[10px] sm:text-[11px] uppercase tracking-widest mt-2" style={{ color: '#666' }}>
                    {t('modalSubtitle')}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeModal}
                  className="font-display px-3 py-1.5 text-[11px] uppercase tracking-widest cursor-pointer transition-colors hover:text-[#c4a35a]"
                  style={{ color: '#888' }}
                  aria-label={t('close')}
                >
                  {t('close')}
                </button>
              </div>

              <div className="overflow-y-auto px-5 sm:px-7 pb-6 pt-2 relative z-10">
                {entries.length === 0 ? (
                  <p className="font-display text-sm uppercase tracking-widest py-6" style={{ color: '#555' }}>
                    {t('empty')}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3 sm:gap-4">
                    {entries.map((entry, idx) => {
                      const title = locale === 'fr' ? entry.title_fr : entry.title_en;
                      const items = locale === 'fr' ? entry.changes_fr : entry.changes_en;
                      const isLatest = idx === 0;
                      return (
                        <motion.li
                          key={`${entry.date}-${idx}`}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.04, duration: 0.32, ease: 'easeOut' }}
                          className="relative px-4 sm:px-5 py-3 sm:py-4"
                          style={{
                            backgroundColor: idx % 2 === 0 ? '#0c0b10' : '#0a0a0d',
                            clipPath: ENTRY_CLIP,
                          }}
                        >
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span
                              className="font-display text-[10px] sm:text-[11px] uppercase tracking-widest"
                              style={{ color: isLatest ? '#c4a35a' : '#666' }}
                            >
                              {formatDate(entry.date, locale)}
                            </span>
                            {isLatest && (
                              <span
                                className="font-display text-[9px] uppercase tracking-widest px-1.5 py-0.5"
                                style={{
                                  color: '#c4a35a',
                                  backgroundColor: 'rgba(196, 163, 90, 0.1)',
                                  borderRadius: 9999,
                                }}
                              >
                                {t('latestBadge')}
                              </span>
                            )}
                          </div>
                          <h3
                            className="font-display text-sm sm:text-base mb-2"
                            style={{ color: '#f0eee7', letterSpacing: '0.03em' }}
                          >
                            {title}
                          </h3>
                          <ul className="flex flex-col gap-1.5">
                            {items.map((line, i) => (
                              <li
                                key={i}
                                className="flex gap-2 text-[12px] sm:text-sm leading-relaxed"
                                style={{ color: '#bdb8ad' }}
                              >
                                <span style={{ color: '#c4a35a' }} aria-hidden="true">·</span>
                                <span className="font-body">{line}</span>
                              </li>
                            ))}
                          </ul>
                        </motion.li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
