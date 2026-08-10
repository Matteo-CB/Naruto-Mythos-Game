'use client';

import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { useSettingsStore } from '@/stores/settingsStore';

const ACCENT = 'var(--t-accent)';
const GLOW_OFF = 'color-mix(in srgb, var(--t-accent) 0%, transparent)';
const GLOW_ON = 'color-mix(in srgb, var(--t-accent) 55%, transparent)';
const GLOW_STATIC = 'color-mix(in srgb, var(--t-accent) 40%, transparent)';

export function LinkDiscordButton() {
  const { data: session } = useSession();
  const t = useTranslations('discord');
  const animationsEnabled = useSettingsStore((s) => s.animationsEnabled);

  const discordId = (session?.user as Record<string, unknown> | undefined)?.discordId;
  if (!session || discordId) return null;

  return (
    <motion.a
      href="/api/user/link-discord"
      aria-label={t('linkDiscord')}
      title={t('linkDiscord')}
      className="relative flex shrink-0 items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-bold uppercase tracking-wider"
      style={{ color: ACCENT, backgroundColor: 'var(--t-accent-tint)' }}
      animate={
        animationsEnabled
          ? {
              scale: [1, 1.07, 1],
              boxShadow: [
                `0 0 0px ${GLOW_OFF}`,
                `0 0 14px ${GLOW_ON}`,
                `0 0 0px ${GLOW_OFF}`,
              ],
            }
          : { scale: 1.05, boxShadow: `0 0 12px ${GLOW_STATIC}` }
      }
      transition={
        animationsEnabled
          ? { duration: 2.2, repeat: Infinity, ease: 'easeInOut' }
          : { duration: 0.2 }
      }
      whileHover={{ scale: 1.13 }}
      whileTap={{ scale: 0.95 }}
    >
      <svg width="15" height="12" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.8 40.8 0 00-1.8 3.7 54 54 0 00-16.2 0A37.3 37.3 0 0025.4.3a.2.2 0 00-.2-.1 58.4 58.4 0 00-14.7 4.6.2.2 0 00-.1.1C1.5 18.7-.9 32.2.3 45.5v.1a58.8 58.8 0 0017.9 9.1.2.2 0 00.3-.1 42 42 0 003.6-5.9.2.2 0 00-.1-.3 38.8 38.8 0 01-5.5-2.7.2.2 0 01 0-.4l1.1-.9a.2.2 0 01.2 0 42 42 0 0035.8 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .4 36.4 36.4 0 01-5.5 2.7.2.2 0 00-.1.3 47.2 47.2 0 003.6 5.9.2.2 0 00.3.1A58.6 58.6 0 0070.7 45.6v-.1c1.4-15-2.3-28-9.8-39.5a.2.2 0 00-.1-.1zM23.7 37.3c-3.4 0-6.2-3.1-6.2-7s2.7-7 6.2-7 6.3 3.2 6.2 7-2.8 7-6.2 7zm22.9 0c-3.4 0-6.2-3.1-6.2-7s2.7-7 6.2-7 6.3 3.2 6.2 7-2.8 7-6.2 7z" fill="currentColor"/>
      </svg>
      <span className="hidden sm:inline">{t('linkDiscord')}</span>
    </motion.a>
  );
}
