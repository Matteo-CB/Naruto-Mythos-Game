'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname, useRouter } from '@/lib/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { routing } from '@/lib/i18n/routing';
import { ChangelogButton } from './ChangelogButton';
import { SurveysButton } from './SurveysButton';
import { LinkDiscordButton } from './LinkDiscordButton';

type AppLocale = (typeof routing.locales)[number];
const ACCENT = 'var(--t-accent)';

export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('a11y');
  const tLang = useTranslations('languages');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const nameOf = (loc: string) => (tLang.has(loc) ? tLang(loc) : loc.toUpperCase());

  const switchLocale = (newLocale: string) => {
    setOpen(false);
    if (newLocale !== locale) router.replace(pathname, { locale: newLocale as AppLocale });
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <nav className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1" aria-label={t('topMenu')}>
      <LinkDiscordButton />
      <SurveysButton />
      <ChangelogButton />
      <span className="text-xs" style={{ color: 'var(--t-muted)' }} aria-hidden="true">|</span>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={t('language')}
          aria-expanded={open}
          className="flex items-center gap-1.5 px-2 py-1 transition-colors"
          style={{
            border: `1px solid ${open ? `${ACCENT}55` : 'var(--t-border)'}`,
            borderRadius: 3,
            backgroundColor: open ? `${ACCENT}12` : 'transparent',
          }}
        >
          <img
            src="/images/icons/globe.svg"
            alt=""
            draggable={false}
            style={{ width: 13, height: 13, opacity: open ? 0.85 : 0.5, transition: 'opacity 150ms' }}
          />
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: ACCENT }}>
            {locale}
          </span>
          <span
            aria-hidden
            style={{
              width: 5, height: 5,
              borderRight: `1.5px solid ${ACCENT}`,
              borderBottom: `1.5px solid ${ACCENT}`,
              transform: open ? 'rotate(-135deg)' : 'rotate(45deg)',
              transition: 'transform 150ms ease',
              marginTop: open ? 2 : -2,
              opacity: 0.85,
            }}
          />
        </button>

        <AnimatePresence>
          {open && (
            <motion.ul
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
              className="absolute right-0 z-50 mt-1.5 overflow-hidden"
              style={{
                minWidth: 156,
                backgroundColor: 'var(--t-bg-elevated)',
                border: '1px solid var(--t-border)',
                boxShadow: '0 14px 34px var(--t-shadow)',
                borderRadius: 4,
              }}
            >
              {routing.locales.map((loc) => {
                const selected = loc === locale;
                return (
                  <li key={loc}>
                    <button
                      type="button"
                      onClick={() => switchLocale(loc)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors"
                      style={{ backgroundColor: selected ? `${ACCENT}16` : 'transparent' }}
                      onMouseEnter={(e) => { if (!selected) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.035)'; }}
                      onMouseLeave={(e) => { if (!selected) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
                    >
                      <span className="text-sm tracking-wide" style={{ color: selected ? ACCENT : '#dcdcdc' }}>
                        {nameOf(loc)}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: selected ? ACCENT : 'var(--t-dim)' }}>
                        {loc}
                      </span>
                    </button>
                  </li>
                );
              })}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
}
