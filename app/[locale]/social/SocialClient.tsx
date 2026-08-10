'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Z_APP_MODAL } from '@/lib/ui/zIndex';
import { DISCORD_SERVERS, type DiscordServerEntry } from '@/lib/data/discordServers';

const PANEL_CLIP = 'polygon(14px 0, calc(100% - 14px) 0, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0 calc(100% - 14px), 0 14px)';
const DISCORD_BLUE = '#5865F2';

function ServerLogo({ src, name, size }: { src: string; name: string; size: number }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, backgroundColor: 'var(--t-surface-2)' };
  if (failed || !src) {
    return (
      <span className="inline-flex shrink-0 items-center justify-center" style={style}>
        <span className="font-display font-black uppercase" style={{ color: 'var(--t-accent)', fontSize: size * 0.4 }}>{name.charAt(0)}</span>
      </span>
    );
  }
  return (
    <img src={src} alt="" draggable={false} onError={() => setFailed(true)} className="shrink-0 object-cover" style={style} />
  );
}

function JoinButton({ inviteUrl, label, className }: { inviteUrl: string; label: string; className: string }) {
  return (
    <a
      href={inviteUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`whitespace-nowrap ${className}`}
      style={{ color: DISCORD_BLUE, backgroundColor: 'rgba(88,101,242,0.14)' }}
    >
      <svg width="15" height="12" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.8 40.8 0 00-1.8 3.7 54 54 0 00-16.2 0A37.3 37.3 0 0025.4.3a.2.2 0 00-.2-.1 58.4 58.4 0 00-14.7 4.6.2.2 0 00-.1.1C1.5 18.7-.9 32.2.3 45.5v.1a58.8 58.8 0 0017.9 9.1.2.2 0 00.3-.1 42 42 0 003.6-5.9.2.2 0 00-.1-.3 38.8 38.8 0 01-5.5-2.7.2.2 0 01 0-.4l1.1-.9a.2.2 0 01.2 0 42 42 0 0035.8 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .4 36.4 36.4 0 01-5.5 2.7.2.2 0 00-.1.3 47.2 47.2 0 003.6 5.9.2.2 0 00.3.1A58.6 58.6 0 0070.7 45.6v-.1c1.4-15-2.3-28-9.8-39.5a.2.2 0 00-.1-.1zM23.7 37.3c-3.4 0-6.2-3.1-6.2-7s2.7-7 6.2-7 6.3 3.2 6.2 7-2.8 7-6.2 7zm22.9 0c-3.4 0-6.2-3.1-6.2-7s2.7-7 6.2-7 6.3 3.2 6.2 7-2.8 7-6.2 7z" fill="currentColor"/>
      </svg>
      {label}
    </a>
  );
}

function ServerCard({ server, joinLabel, index, onOpen }: { server: DiscordServerEntry; joinLabel: string; index: number; onOpen: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.05 * index }}
      className="group flex items-center gap-3 p-4 transition-transform"
      style={{ backgroundColor: 'var(--t-surface-2)', clipPath: PANEL_CLIP, boxShadow: '0 12px 32px var(--t-shadow)' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
    >
      <button
        type="button"
        onClick={onOpen}
        data-gp
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-4 border-0 bg-transparent p-0 text-left"
      >
        <ServerLogo src={server.logo} name={server.name} size={56} />
        <span className="min-w-0 flex-1">
          <span className="font-display block truncate text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--t-text)' }}>{server.name}</span>
          <span className="mt-1 block truncate text-xs leading-relaxed" style={{ color: 'var(--t-muted)' }}>{server.description || ' '}</span>
        </span>
      </button>
      <JoinButton
        inviteUrl={server.inviteUrl}
        label={joinLabel}
        className="font-display shrink-0 self-center flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors"
      />
    </motion.div>
  );
}

function ServerModal({ server, joinLabel, closeLabel, onClose }: { server: DiscordServerEntry | null; joinLabel: string; closeLabel: string; onClose: () => void }) {
  useEffect(() => {
    if (!server) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [server, onClose]);

  return createPortal(
    <AnimatePresence>
      {server && (
        <motion.div
          key="server-overlay"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.78)', zIndex: Z_APP_MODAL }}
          onClick={onClose}
          role="dialog" aria-modal="true"
        >
          <motion.div
            key="server-panel"
            initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }} transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-[85vh] w-full max-w-md flex-col items-center overflow-y-auto p-6 pt-10 text-center"
            style={{ backgroundColor: 'var(--t-panel)', boxShadow: '0 24px 70px var(--t-shadow)' }}
          >
            <button type="button" onClick={onClose} aria-label={closeLabel} className="absolute right-3 top-3 px-2 py-1 text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--t-muted)' }}>
              {closeLabel}
            </button>

            <ServerLogo src={server.logo} name={server.name} size={88} />
            <h2 className="mt-4 wrap-break-word text-xl font-black uppercase tracking-wider" style={{ color: 'var(--t-text)' }}>{server.name}</h2>
            {server.description && (
              <p className="mt-3 max-w-sm wrap-break-word text-sm leading-relaxed" style={{ color: '#9a9a9f' }}>{server.description}</p>
            )}

            <JoinButton
              inviteUrl={server.inviteUrl}
              label={joinLabel}
              className="font-display mt-6 flex items-center gap-2 px-6 py-2.5 text-sm font-bold uppercase tracking-widest transition-colors"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function SocialClient() {
  const t = useTranslations('social');
  const tc = useTranslations('common');
  const [openServer, setOpenServer] = useState<DiscordServerEntry | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  return (
    <main id="main-content" className="relative flex min-h-screen flex-col overflow-hidden" style={{ backgroundColor: 'var(--t-bg)' }}>
      <CloudBackground />

      <div className="relative z-10 mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-8 sm:py-10">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link href="/" className="font-display px-3 py-1.5 text-[11px] uppercase tracking-widest transition-colors hover:text-[var(--t-accent)]" style={{ color: 'var(--t-muted)' }}>
            {tc('back')}
          </Link>
          <LanguageSwitcher />
        </div>

        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="mb-7"
        >
          <h1 className="font-display text-3xl uppercase tracking-wider sm:text-5xl" style={{ color: 'var(--t-text)', letterSpacing: '0.06em', textShadow: '0 0 22px var(--t-accent-glow)' }}>
            {t('title')}
          </h1>
          <p className="mt-2 text-sm" style={{ color: '#7a7a80' }}>{t('subtitle')}</p>
        </motion.header>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mb-9"
        >
          <Link
            href="/feed"
            className="group relative block overflow-hidden p-5 sm:p-6 transition-transform"
            style={{ backgroundColor: 'var(--t-surface-2)', clipPath: PANEL_CLIP, boxShadow: '0 14px 40px var(--t-shadow)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 18px 48px var(--t-shadow), 0 0 26px var(--t-accent-glow)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 14px 40px var(--t-shadow)'; }}
          >
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="font-display text-lg font-black uppercase tracking-wider sm:text-2xl" style={{ color: 'var(--t-accent)' }}>{t('feedTitle')}</p>
                <p className="mt-2 max-w-md text-xs leading-relaxed sm:text-sm" style={{ color: '#9a9a9f' }}>{t('feedDescription')}</p>
              </div>
              <span
                className="font-display shrink-0 px-4 py-2 text-[11px] font-bold uppercase tracking-widest transition-colors group-hover:text-[var(--t-accent-bright)] sm:text-xs"
                style={{ color: 'var(--t-accent)', backgroundColor: 'var(--t-accent-glow)' }}
              >
                {t('feedCta')}
              </span>
            </div>
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <div className="mb-4">
            <h2 className="font-display text-lg font-black uppercase tracking-wider" style={{ color: 'var(--t-text)' }}>{t('discordTitle')}</h2>
            <p className="mt-1 text-xs" style={{ color: '#6f6f75' }}>{t('discordSubtitle')}</p>
          </div>

          {DISCORD_SERVERS.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-12 text-center" style={{ backgroundColor: 'var(--t-surface-2)', clipPath: PANEL_CLIP }}>
              <p className="font-display text-sm font-bold uppercase tracking-widest" style={{ color: 'var(--t-muted)' }}>{t('emptyTitle')}</p>
              <p className="mt-2 max-w-sm text-xs leading-relaxed" style={{ color: '#5a5a60' }}>{t('emptyText')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {DISCORD_SERVERS.map((server, i) => (
                <ServerCard key={server.id} server={server} joinLabel={t('join')} index={i} onOpen={() => setOpenServer(server)} />
              ))}
            </div>
          )}
        </motion.div>
      </div>
      <Footer />

      {mounted && (
        <ServerModal server={openServer} joinLabel={t('join')} closeLabel={t('close')} onClose={() => setOpenServer(null)} />
      )}
    </main>
  );
}
