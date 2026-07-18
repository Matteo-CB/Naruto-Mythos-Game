'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { HoloCard } from '@/components/HoloCard';
import { Footer } from '@/components/Footer';
import { CloudBackground } from '@/components/CloudBackground';
import { TournamentNavButton, type TournamentMenuStatus } from '@/components/TournamentNavButton';
import { HomeMenuButton } from '@/components/HomeMenuButton';
import { useBoosterBadge } from '@/lib/hooks/useBoosterBadge';
import { useBattlepassBadge } from '@/lib/hooks/useBattlepassBadge';
import { useQuestBadge } from '@/lib/hooks/useQuestBadge';
import { useSocialBadge } from '@/lib/hooks/useSocialBadge';
import { MenuBadge } from '@/components/notifications/MenuBadge';
import '@/styles/holo-evolving.css';


const FEATURED_CARDS = [
  { src: '/images/cards/SS/sp_v/SS-122-SPV.webp', alt: 'Minato Namikaze', rarity: 'special' as const },
  { src: '/images/cards/SS/rare/SS-121-R.webp', alt: 'Naruto Uzumaki', rarity: 'rare' as const },
  { src: '/images/cards/SS/legendary/SS-000-L.webp', alt: 'Kakashi Hatake', rarity: 'legendary' as const },
  { src: '/images/cards/SS/pop_v/SS-147-POPV.webp', alt: 'Naruto Uzumaki', rarity: 'special' as const },
];


const cloudPositions = [
  
  { src: '/images/icons/cloud-2.webp', top: '2%', left: '4%', width: 110, opacity: 0.10, rotate: -8 },
  { src: '/images/icons/cloud-5.webp', top: '5%', left: '28%', width: 80, opacity: 0.07, rotate: 5 },
  { src: '/images/icons/cloud-6.webp', top: '1%', left: '55%', width: 100, opacity: 0.11, rotate: -3 },
  { src: '/images/icons/cloud-2.webp', top: '6%', left: '80%', width: 90, opacity: 0.08, rotate: 10 },
  
  { src: '/images/icons/cloud-5.webp', top: '18%', left: '10%', width: 75, opacity: 0.07, rotate: 15 },
  { src: '/images/icons/cloud-6.webp', top: '20%', left: '42%', width: 110, opacity: 0.09, rotate: -12 },
  { src: '/images/icons/cloud-2.webp', top: '15%', left: '72%', width: 85, opacity: 0.08, rotate: 3 },
  
  { src: '/images/icons/cloud-6.webp', top: '35%', left: '2%', width: 95, opacity: 0.10, rotate: -5 },
  { src: '/images/icons/cloud-5.webp', top: '37%', left: '32%', width: 75, opacity: 0.07, rotate: 8 },
  { src: '/images/icons/cloud-2.webp', top: '33%', left: '60%', width: 100, opacity: 0.09, rotate: -10 },
  { src: '/images/icons/cloud-6.webp', top: '40%', left: '84%', width: 70, opacity: 0.08, rotate: 6 },
  
  { src: '/images/icons/cloud-5.webp', top: '55%', left: '6%', width: 80, opacity: 0.08, rotate: 12 },
  { src: '/images/icons/cloud-2.webp', top: '52%', left: '38%', width: 90, opacity: 0.10, rotate: -7 },
  { src: '/images/icons/cloud-6.webp', top: '58%', left: '68%', width: 100, opacity: 0.09, rotate: 4 },
  
  { src: '/images/icons/cloud-2.webp', top: '72%', left: '12%', width: 85, opacity: 0.09, rotate: -15 },
  { src: '/images/icons/cloud-5.webp', top: '75%', left: '48%', width: 70, opacity: 0.07, rotate: 9 },
  { src: '/images/icons/cloud-6.webp', top: '70%', left: '78%', width: 105, opacity: 0.10, rotate: -4 },
  
  { src: '/images/icons/cloud-5.webp', top: '82%', left: '3%', width: 90, opacity: 0.08, rotate: 7 },
  { src: '/images/icons/cloud-2.webp', top: '84%', left: '35%', width: 75, opacity: 0.07, rotate: -11 },
  { src: '/images/icons/cloud-6.webp', top: '80%', left: '62%', width: 95, opacity: 0.09, rotate: 3 },
  { src: '/images/icons/cloud-5.webp', top: '83%', left: '82%', width: 80, opacity: 0.07, rotate: -6 },
];


const floatingElements = [
  { src: '/images/icons/shuriken.webp', top: '22%', right: '3%', size: 30, opacity: 0.04, rotate: 0, duration: 12, spin: true },
  { src: '/images/icons/shuriken.webp', top: '78%', left: '4%', size: 26, opacity: 0.05, rotate: 0, duration: 14, spin: true },
  { src: '/images/icons/akatsuki-cloud.webp', top: '82%', right: '4%', size: 40, opacity: 0.04, rotate: 5, duration: 11 },
];


const menuButtons = [
  { key: 'play' as const,          href: '/play',         primary: true  },
  { key: 'deckBuilder' as const,   href: '/deck-builder', primary: false },
  { key: 'collection' as const,    href: '/collection',   primary: false },
  { key: 'leaderboard' as const,   href: '/leaderboard',  primary: false },
  { key: 'tournaments' as const,   href: '/tournaments',  primary: false },
  { key: 'battlepass' as const,    href: '/battlepass',   primary: false },
  { key: 'helpUs' as const,        href: '/help-us',      primary: false },
];


const accountButtons = [
  { key: 'signIn' as const, href: '/login' },
  { key: 'register' as const, href: '/register' },
];

export default function Home() {
  const t = useTranslations('home');
  const td = useTranslations('discord');
  const ta = useTranslations('a11y');
  const { data: session, update: updateSession } = useSession();
  const [mounted, setMounted] = useState(false);
  const [featuredCard] = useState(() =>
    FEATURED_CARDS[Math.floor(Math.random() * FEATURED_CARDS.length)]
  );

  const [sessionRefreshed, setSessionRefreshed] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  
  useEffect(() => {
    if (session && !sessionRefreshed) {
      setSessionRefreshed(true);
      updateSession();
    }
  }, [session, sessionRefreshed, updateSession]);

  const [tournamentStatus, setTournamentStatus] = useState<'none' | 'registration' | 'in_progress'>('none');
  const [tournamentNeedsDeck, setTournamentNeedsDeck] = useState(false);
  const [tournamentAvailable, setTournamentAvailable] = useState(false);
  const [nextTournamentStartAt, setNextTournamentStartAt] = useState<string | null>(null);
  const [meRefresh, setMeRefresh] = useState(0);
  const { totalUnopened: totalUnopenedBoosters } = useBoosterBadge();
  const { showBadge: showBattlepassBadge, cardClaimableTiers: bpClaimable } = useBattlepassBadge();
  const { showBadge: showQuestBadge, unclaimedStandardCount, dailyClaimable } = useQuestBadge();
  const { total: socialBadgeTotal } = useSocialBadge();

  useEffect(() => {
    if (!session?.user) return;
    let cancelled = false;
    fetch('/api/user/me')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (cancelled || !data) return;
        if (data.role) setUserRole(data.role);
        setTournamentStatus(data.tournamentStatus ?? 'none');
        setTournamentNeedsDeck(!!data.tournamentNeedsDeck);
        setTournamentAvailable(!!data.tournamentAvailable);
        setNextTournamentStartAt(typeof data.nextTournamentStartAt === 'string' ? data.nextTournamentStartAt : null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [session, meRefresh]);

  useEffect(() => {
    if (!session?.user) return;
    const onFocus = () => setMeRefresh((n) => n + 1);
    window.addEventListener('focus', onFocus);

    let interval: ReturnType<typeof setInterval> | null = null;
    const startInterval = () => {
      if (interval || document.hidden) return;
      interval = setInterval(() => setMeRefresh((n) => n + 1), 60_000);
    };
    const stopInterval = () => {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    };
    const onVisibilityChange = () => {
      if (document.hidden) stopInterval();
      else startInterval();
    };
    startInterval();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      stopInterval();
    };
  }, [session]);

  // Compute the rich status that the new TournamentNavButton consumes
  const tournamentMenuStatus: TournamentMenuStatus = (() => {
    if (tournamentStatus === 'in_progress') return 'in_progress';
    if (tournamentNeedsDeck) return 'needs_deck';
    if (tournamentStatus === 'registration') return 'registered';
    if (tournamentAvailable) return 'available';
    return 'none';
  })();

  const titleText = t('title');
  const titleLetters = titleText.split('');

  return (
    <main
      id="main-content"
      className="relative min-h-screen w-full overflow-x-hidden overflow-y-auto flex flex-col"
      style={{ backgroundColor: '#0a0a0a' }}
    >
      <CloudBackground />

      
      <div className="relative z-50 flex justify-end px-4 pt-4 pb-1 sm:absolute sm:top-4 sm:right-6 sm:p-0 sm:block">
        <LanguageSwitcher />
      </div>


      <div className="relative z-10 flex flex-1 items-center justify-center px-4 pt-4 pb-6 sm:px-8 sm:py-0">
        <div className="flex w-full max-w-5xl flex-col items-center gap-6 lg:flex-row lg:items-center lg:justify-between lg:gap-8">

          
          <div className="flex w-full flex-col items-start flex-shrink-0 lg:max-w-[420px]">
            
            <div className="mb-1">
              <div className="flex items-center flex-wrap">
                {titleLetters.map((letter, i) => (
                  <motion.span
                    key={`letter-${i}`}
                    className="font-display inline-block text-3xl font-black tracking-wider sm:text-4xl lg:text-5xl"
                    style={{
                      color: '#c4a35a',
                      textShadow: '0 0 40px rgba(196, 163, 90, 0.3), 0 0 80px rgba(196, 163, 90, 0.1)',
                    }}
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.3,
                      delay: 0.1 + i * 0.04,
                      ease: [0.25, 0.46, 0.45, 0.94],
                    }}
                  >
                    {letter === ' ' ? '\u00A0' : letter}
                  </motion.span>
                ))}
              </div>
            </div>

            
            <motion.p
              className="font-display mb-5 text-xs font-medium uppercase tracking-[0.35em] sm:mb-8 sm:text-sm"
              style={{ color: '#888888' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              {t('subtitle')}
            </motion.p>

            
            <motion.nav
              aria-label={ta('mainNavigation')}
              className="flex w-full flex-col gap-2"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.7 }}
            >
              {menuButtons.map((btn, i) => {
                if (btn.key === 'tournaments') {
                  return (
                    <TournamentNavButton
                      key={btn.key}
                      status={tournamentMenuStatus}
                      label={t(btn.key)}
                      primary={btn.primary}
                      delay={0.8 + i * 0.06}
                      nextStartAt={nextTournamentStartAt}
                    />
                  );
                }
                const isBp = btn.key === 'battlepass';
                return (
                  <HomeMenuButton
                    key={btn.key}
                    href={btn.href}
                    label={t(btn.key)}
                    variant={isBp ? 'pink' : (btn.primary ? 'primary' : 'muted')}
                    delay={0.8 + i * 0.06}
                    innerClassName={isBp ? 'holo-evolving holo-evolving--subtle' : ''}
                    innerStyle={isBp ? { ['--foil' as string]: '#f472b6' } : undefined}
                    rightSlot={
                      btn.key === 'leaderboard' && socialBadgeTotal > 0
                        ? <MenuBadge accent="gold" count={socialBadgeTotal} tooltip={t('socialBadgeTooltip', { count: socialBadgeTotal })} />
                        : isBp && (totalUnopenedBoosters > 0 || showBattlepassBadge || showQuestBadge)
                        ? <MenuBadge
                            accent="pink"
                            count={
                              (showBattlepassBadge ? bpClaimable.length : 0)
                              + totalUnopenedBoosters
                              + (showQuestBadge ? unclaimedStandardCount + (dailyClaimable ? 1 : 0) : 0)
                            }
                            tooltip={[
                              showBattlepassBadge ? t('battlepassBadgeTooltip', { count: bpClaimable.length }) : null,
                              totalUnopenedBoosters > 0 ? t('boostersBadgeTooltip', { count: totalUnopenedBoosters }) : null,
                              showQuestBadge ? t('questsBadgeTooltip', { count: unclaimedStandardCount + (dailyClaimable ? 1 : 0) }) : null,
                            ].filter(Boolean).join(' · ')}
                          />
                        : undefined
                    }
                  />
                );
              })}

              <HomeMenuButton
                href="/play/sealed"
                label={t('sealed')}
                variant="primary"
                delay={1.26}
              />

              <HomeMenuButton
                href="/worldcup"
                label={t('worldcup')}
                variant="muted"
                delay={1.32}
              />
            </motion.nav>

            
            <motion.div
              className="my-2.5 h-px w-full sm:my-3"
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.06)' }}
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ duration: 0.3, delay: 1.4 }}
            />

            
            <motion.div
              className="flex w-full flex-wrap gap-2.5"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 1.5 }}
            >
              {session ? (
                <>
                  {session?.user?.email === 'matteo.biyikli3224@gmail.com' && (
                    <Link
                      href="/admin"
                      className="flex h-9 basis-full items-center justify-center text-xs font-medium tracking-wide transition-all sm:h-10 sm:text-sm"
                      style={{
                        backgroundColor: 'transparent',
                        border: '1px solid #ef4444',
                        color: '#ef4444',
                      }}
                      onMouseEnter={(e) => {
                        const target = e.currentTarget as HTMLElement;
                        target.style.backgroundColor = 'rgba(239, 68, 68, 0.05)';
                        target.style.boxShadow = '0 0 16px rgba(239, 68, 68, 0.12)';
                      }}
                      onMouseLeave={(e) => {
                        const target = e.currentTarget as HTMLElement;
                        target.style.backgroundColor = 'transparent';
                        target.style.boxShadow = 'none';
                      }}
                    >
                      {t('admin')}
                    </Link>
                  )}
                  {!(session.user as Record<string, unknown>)?.discordId && (
                    <a
                      href="/api/user/link-discord"
                      className="flex h-9 basis-full items-center justify-center gap-1.5 text-xs font-medium tracking-wide transition-all sm:h-10 sm:text-sm"
                      style={{
                        backgroundColor: 'transparent',
                        border: '1px solid #5865F2',
                        color: '#5865F2',
                      }}
                      onMouseEnter={(e) => {
                        const target = e.currentTarget as HTMLElement;
                        target.style.backgroundColor = 'rgba(88, 101, 242, 0.08)';
                        target.style.boxShadow = '0 0 16px rgba(88, 101, 242, 0.12)';
                      }}
                      onMouseLeave={(e) => {
                        const target = e.currentTarget as HTMLElement;
                        target.style.backgroundColor = 'transparent';
                        target.style.boxShadow = 'none';
                      }}
                    >
                      <svg width="14" height="11" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.8 40.8 0 00-1.8 3.7 54 54 0 00-16.2 0A37.3 37.3 0 0025.4.3a.2.2 0 00-.2-.1 58.4 58.4 0 00-14.7 4.6.2.2 0 00-.1.1C1.5 18.7-.9 32.2.3 45.5v.1a58.8 58.8 0 0017.9 9.1.2.2 0 00.3-.1 42 42 0 003.6-5.9.2.2 0 00-.1-.3 38.8 38.8 0 01-5.5-2.7.2.2 0 01 0-.4l1.1-.9a.2.2 0 01.2 0 42 42 0 0035.8 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .4 36.4 36.4 0 01-5.5 2.7.2.2 0 00-.1.3 47.2 47.2 0 003.6 5.9.2.2 0 00.3.1A58.6 58.6 0 0070.7 45.6v-.1c1.4-15-2.3-28-9.8-39.5a.2.2 0 00-.1-.1zM23.7 37.3c-3.4 0-6.2-3.1-6.2-7s2.7-7 6.2-7 6.3 3.2 6.2 7-2.8 7-6.2 7zm22.9 0c-3.4 0-6.2-3.1-6.2-7s2.7-7 6.2-7 6.3 3.2 6.2 7-2.8 7-6.2 7z" fill="#5865F2"/>
                      </svg>
                      {td('linkDiscord')}
                    </a>
                  )}
                  <Link
                    href={`/profile/${encodeURIComponent(session.user?.name ?? '')}`}
                    className="flex h-9 flex-1 items-center justify-center text-xs font-medium tracking-wide transition-all sm:h-10 sm:text-sm"
                    style={{
                      backgroundColor: 'transparent',
                      border: '1px solid #c4a35a',
                      color: '#c4a35a',
                    }}
                    onMouseEnter={(e) => {
                      const target = e.currentTarget as HTMLElement;
                      target.style.backgroundColor = 'rgba(196, 163, 90, 0.08)';
                      target.style.boxShadow = '0 0 16px rgba(196, 163, 90, 0.12)';
                    }}
                    onMouseLeave={(e) => {
                      const target = e.currentTarget as HTMLElement;
                      target.style.backgroundColor = 'transparent';
                      target.style.boxShadow = 'none';
                    }}
                  >
                    {t('profile')}
                  </Link>
                  <Link
                    href="/settings"
                    className="flex h-9 flex-1 items-center justify-center text-xs font-medium tracking-wide transition-all sm:h-10 sm:text-sm"
                    style={{
                      backgroundColor: 'transparent',
                      border: '1px solid #c4a35a',
                      color: '#c4a35a',
                    }}
                    onMouseEnter={(e) => {
                      const target = e.currentTarget as HTMLElement;
                      target.style.backgroundColor = 'rgba(196, 163, 90, 0.08)';
                      target.style.boxShadow = '0 0 16px rgba(196, 163, 90, 0.12)';
                    }}
                    onMouseLeave={(e) => {
                      const target = e.currentTarget as HTMLElement;
                      target.style.backgroundColor = 'transparent';
                      target.style.boxShadow = 'none';
                    }}
                  >
                    {t('customization')}
                  </Link>
                  <button
                    onClick={() => signOut({ callbackUrl: '/' })}
                    className="flex h-9 flex-1 items-center justify-center text-xs font-medium tracking-wide transition-all cursor-pointer sm:h-10 sm:text-sm"
                    style={{
                      backgroundColor: 'transparent',
                      border: '1px solid #333333',
                      color: '#888888',
                    }}
                    onMouseEnter={(e) => {
                      const target = e.currentTarget as HTMLElement;
                      target.style.borderColor = '#ef4444';
                      target.style.color = '#ef4444';
                      target.style.backgroundColor = 'rgba(239, 68, 68, 0.05)';
                    }}
                    onMouseLeave={(e) => {
                      const target = e.currentTarget as HTMLElement;
                      target.style.borderColor = '#333333';
                      target.style.color = '#888888';
                      target.style.backgroundColor = 'transparent';
                    }}
                  >
                    {t('signOut')}
                  </button>
                </>
              ) : (
                accountButtons.map((btn) => (
                  <Link
                    key={btn.key}
                    href={btn.href}
                    className="flex h-9 flex-1 items-center justify-center text-xs font-medium tracking-wide transition-all sm:h-10 sm:text-sm"
                    style={{
                      backgroundColor: 'transparent',
                      border: '1px solid #333333',
                      color: '#888888',
                    }}
                    onMouseEnter={(e) => {
                      const target = e.currentTarget as HTMLElement;
                      target.style.borderColor = '#c4a35a';
                      target.style.color = '#c4a35a';
                      target.style.backgroundColor = 'rgba(196, 163, 90, 0.05)';
                    }}
                    onMouseLeave={(e) => {
                      const target = e.currentTarget as HTMLElement;
                      target.style.borderColor = '#333333';
                      target.style.color = '#888888';
                      target.style.backgroundColor = 'transparent';
                    }}
                  >
                    {t(btn.key)}
                  </Link>
                ))
              )}
            </motion.div>

            
            <motion.div
              className="mt-2.5 w-full sm:mt-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 1.6 }}
            >
              <a
                href="https://discord.gg/BBXVUsU3hn"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-9 w-full items-center justify-center text-xs font-medium tracking-wide transition-all sm:h-10 sm:text-sm"
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid #444444',
                  color: '#999999',
                }}
                onMouseEnter={(e) => {
                  const target = e.currentTarget as HTMLElement;
                  target.style.borderColor = '#7289da';
                  target.style.color = '#7289da';
                  target.style.backgroundColor = 'rgba(114, 137, 218, 0.05)';
                }}
                onMouseLeave={(e) => {
                  const target = e.currentTarget as HTMLElement;
                  target.style.borderColor = '#444444';
                  target.style.color = '#999999';
                  target.style.backgroundColor = 'transparent';
                }}
              >
                {t('discord')}
              </a>
            </motion.div>

            
            <motion.p
              className="mt-4 text-[10px] tracking-widest uppercase sm:mt-6 sm:text-xs"
              style={{ color: '#333333' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 1.7 }}
            >
              Naruto Mythos TCG
            </motion.p>
          </div>

          
          <motion.div
            className="relative hidden flex-shrink-0 items-center justify-center lg:flex"
            initial={{ opacity: 0, x: 80 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: 0.8,
              delay: 0.2,
              ease: [0.25, 0.46, 0.45, 0.94],
            }}
          >
            
            <motion.div
              className="absolute rounded-2xl"
              style={{
                width: '340px',
                height: '480px',
                backgroundColor: 'rgba(196, 163, 90, 0.08)',
                filter: 'blur(60px)',
              }}
              animate={{
                opacity: [0.4, 0.8, 0.4],
                scale: [0.95, 1.05, 0.95],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />

            <HoloCard
              src={featuredCard.src}
              alt={featuredCard.alt}
              width={320}
              height={448}
              rarity={featuredCard.rarity}
            />
          </motion.div>

        </div>
      </div>
      <Footer />
    </main>
  );
}
