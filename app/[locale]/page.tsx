'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { HoloCard } from '@/components/HoloCard';
import { Footer } from '@/components/Footer';

// Cloud positions — only cloud-2, cloud-5, cloud-6
const cloudPositions = [
  // Row 1 - top
  { src: '/images/icons/cloud-2.webp', top: '2%', left: '4%', width: 110, opacity: 0.10, rotate: -8 },
  { src: '/images/icons/cloud-5.webp', top: '5%', left: '28%', width: 80, opacity: 0.07, rotate: 5 },
  { src: '/images/icons/cloud-6.webp', top: '1%', left: '55%', width: 100, opacity: 0.11, rotate: -3 },
  { src: '/images/icons/cloud-2.webp', top: '6%', left: '80%', width: 90, opacity: 0.08, rotate: 10 },
  // Row 2
  { src: '/images/icons/cloud-5.webp', top: '18%', left: '10%', width: 75, opacity: 0.07, rotate: 15 },
  { src: '/images/icons/cloud-6.webp', top: '20%', left: '42%', width: 110, opacity: 0.09, rotate: -12 },
  { src: '/images/icons/cloud-2.webp', top: '15%', left: '72%', width: 85, opacity: 0.08, rotate: 3 },
  // Row 3
  { src: '/images/icons/cloud-6.webp', top: '35%', left: '2%', width: 95, opacity: 0.10, rotate: -5 },
  { src: '/images/icons/cloud-5.webp', top: '37%', left: '32%', width: 75, opacity: 0.07, rotate: 8 },
  { src: '/images/icons/cloud-2.webp', top: '33%', left: '60%', width: 100, opacity: 0.09, rotate: -10 },
  { src: '/images/icons/cloud-6.webp', top: '40%', left: '84%', width: 70, opacity: 0.08, rotate: 6 },
  // Row 4
  { src: '/images/icons/cloud-5.webp', top: '55%', left: '6%', width: 80, opacity: 0.08, rotate: 12 },
  { src: '/images/icons/cloud-2.webp', top: '52%', left: '38%', width: 90, opacity: 0.10, rotate: -7 },
  { src: '/images/icons/cloud-6.webp', top: '58%', left: '68%', width: 100, opacity: 0.09, rotate: 4 },
  // Row 5
  { src: '/images/icons/cloud-2.webp', top: '72%', left: '12%', width: 85, opacity: 0.09, rotate: -15 },
  { src: '/images/icons/cloud-5.webp', top: '75%', left: '48%', width: 70, opacity: 0.07, rotate: 9 },
  { src: '/images/icons/cloud-6.webp', top: '70%', left: '78%', width: 105, opacity: 0.10, rotate: -4 },
  // Row 6 - bottom
  { src: '/images/icons/cloud-5.webp', top: '82%', left: '3%', width: 90, opacity: 0.08, rotate: 7 },
  { src: '/images/icons/cloud-2.webp', top: '84%', left: '35%', width: 75, opacity: 0.07, rotate: -11 },
  { src: '/images/icons/cloud-6.webp', top: '80%', left: '62%', width: 95, opacity: 0.09, rotate: 3 },
  { src: '/images/icons/cloud-5.webp', top: '83%', left: '82%', width: 80, opacity: 0.07, rotate: -6 },
];

// Floating decorative weapon elements
const floatingElements = [
  { src: '/images/icons/kunai.webp', top: '10%', left: '2%', size: 36, opacity: 0.05, rotate: 45, duration: 8 },
  { src: '/images/icons/shuriken.webp', top: '22%', right: '3%', size: 30, opacity: 0.04, rotate: 0, duration: 12, spin: true },
  { src: '/images/icons/scroll-kunai.webp', top: '55%', left: '1%', size: 42, opacity: 0.05, rotate: -20, duration: 10 },
  { src: '/images/icons/kunai.webp', top: '42%', right: '2%', size: 30, opacity: 0.04, rotate: -135, duration: 9 },
  { src: '/images/icons/shuriken.webp', top: '78%', left: '4%', size: 26, opacity: 0.05, rotate: 0, duration: 14, spin: true },
  { src: '/images/icons/akatsuki-cloud.webp', top: '82%', right: '4%', size: 40, opacity: 0.04, rotate: 5, duration: 11 },
];

// Menu button configs - game section
const menuButtons = [
  { key: 'playAI' as const, href: '/play/ai', primary: true },
  { key: 'playOnline' as const, href: '/play/online', primary: false },
  { key: 'friends' as const, href: '/friends', primary: false },
  { key: 'collection' as const, href: '/collection', primary: false },
  { key: 'deckBuilder' as const, href: '/deck-builder', primary: false },
  { key: 'learn' as const, href: '/learn', primary: false },
  { key: 'quiz' as const, href: '/quiz', primary: false },
  { key: 'leaderboard' as const, href: '/leaderboard', primary: false },
  { key: 'bugReport' as const, href: '/bug-report', primary: false },
];

// Account buttons
const accountButtons = [
  { key: 'signIn' as const, href: '/login' },
  { key: 'register' as const, href: '/register' },
];

export default function Home() {
  const t = useTranslations('home');
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const titleText = t('title');
  const titleLetters = titleText.split('');

  return (
    <main
      id="main-content"
      className="relative h-screen w-full overflow-hidden flex flex-col"
      style={{ backgroundColor: '#0a0a0a' }}
    >
      {/* === BACKGROUND CLOUD PATTERN === */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {cloudPositions.map((cloud, i) => (
          <div
            key={`cloud-${i}`}
            className="absolute"
            style={{
              top: cloud.top,
              left: cloud.left,
              width: cloud.width,
              height: cloud.width * 0.6,
              opacity: cloud.opacity,
              transform: `rotate(${cloud.rotate}deg)`,
            }}
          >
            <Image
              src={cloud.src}
              alt=""
              width={cloud.width}
              height={Math.round(cloud.width * 0.6)}
              className="select-none"
              style={{ filter: 'saturate(0.7)' }}
              priority={false}
            />
          </div>
        ))}
      </div>

      {/* === FLOATING WEAPON DECORATIONS === */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {mounted && floatingElements.map((el, i) => (
          <motion.div
            key={`float-${i}`}
            className="absolute"
            style={{
              top: el.top,
              left: 'left' in el ? el.left : undefined,
              right: 'right' in el ? el.right : undefined,
              width: el.size,
              height: el.size,
              opacity: el.opacity,
            }}
            animate={
              el.spin
                ? {
                    y: [0, -10, 0, 10, 0],
                    rotate: [0, 360],
                  }
                : {
                    y: [0, -8, 0, 8, 0],
                    rotate: [el.rotate - 3, el.rotate + 3, el.rotate - 3],
                  }
            }
            transition={
              el.spin
                ? {
                    y: { duration: el.duration, repeat: Infinity, ease: 'easeInOut' },
                    rotate: { duration: el.duration * 2, repeat: Infinity, ease: 'linear' },
                  }
                : {
                    y: { duration: el.duration, repeat: Infinity, ease: 'easeInOut' },
                    rotate: { duration: el.duration * 1.5, repeat: Infinity, ease: 'easeInOut' },
                  }
            }
          >
            <Image
              src={el.src}
              alt=""
              width={el.size}
              height={el.size}
              className="select-none"
              style={{ objectFit: 'contain' }}
            />
          </motion.div>
        ))}
      </div>

      {/* === LANGUAGE SWITCHER (top-right) === */}
      <div className="absolute top-4 right-6 z-50">
        <LanguageSwitcher />
      </div>

      {/* === MAIN CONTENT: side-by-side layout === */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-8">
        <div className="flex w-full max-w-5xl items-center justify-between gap-8">

          {/* LEFT SIDE: Title + Navigation */}
          <div className="flex flex-col items-start flex-shrink-0" style={{ maxWidth: '420px' }}>
            {/* Title - animated letter by letter */}
            <div className="mb-2">
              <div className="flex items-center flex-wrap">
                {titleLetters.map((letter, i) => (
                  <motion.span
                    key={`letter-${i}`}
                    className="inline-block text-5xl font-black tracking-wider"
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

            {/* Subtitle */}
            <motion.p
              className="mb-8 text-sm font-medium uppercase tracking-[0.35em]"
              style={{ color: '#888888' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              {t('subtitle')}
            </motion.p>

            {/* Navigation Buttons */}
            <motion.nav
              aria-label="Main navigation"
              className="flex w-full flex-col gap-2.5"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.7 }}
            >
              {menuButtons.map((btn, i) => (
                <motion.div
                  key={btn.key}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    duration: 0.3,
                    delay: 0.8 + i * 0.06,
                    ease: 'easeOut',
                  }}
                >
                  <Link
                    href={btn.href}
                    className="group relative flex h-12 items-center justify-center overflow-hidden text-base font-semibold tracking-wide transition-all"
                    style={{
                      backgroundColor: '#141414',
                      border: btn.primary ? '1px solid #c4a35a' : '1px solid #262626',
                      color: btn.primary ? '#c4a35a' : '#e0e0e0',
                    }}
                    onMouseEnter={(e) => {
                      const target = e.currentTarget as HTMLElement;
                      target.style.transform = 'scale(1.03)';
                      target.style.borderColor = '#c4a35a';
                      target.style.boxShadow = '0 0 20px rgba(196, 163, 90, 0.15)';
                      target.style.color = '#c4a35a';
                      target.style.backgroundColor = '#1a1a1a';
                    }}
                    onMouseLeave={(e) => {
                      const target = e.currentTarget as HTMLElement;
                      target.style.transform = 'scale(1)';
                      target.style.borderColor = btn.primary ? '#c4a35a' : '#262626';
                      target.style.boxShadow = 'none';
                      target.style.color = btn.primary ? '#c4a35a' : '#e0e0e0';
                      target.style.backgroundColor = '#141414';
                    }}
                  >
                    {/* Accent bar on left */}
                    <span
                      className="absolute left-0 top-0 h-full w-1 transition-all"
                      style={{
                        backgroundColor: btn.primary ? '#c4a35a' : 'transparent',
                      }}
                    />
                    {t(btn.key)}
                  </Link>
                </motion.div>
              ))}
            </motion.nav>

            {/* Divider */}
            <motion.div
              className="my-3 h-px w-full"
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.06)' }}
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ duration: 0.3, delay: 1.4 }}
            />

            {/* Account buttons */}
            <motion.div
              className="flex w-full gap-2.5"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 1.5 }}
            >
              {session ? (
                <Link
                  href={`/profile/${session.user?.name ?? ''}`}
                  className="flex h-10 flex-1 items-center justify-center text-sm font-medium tracking-wide transition-all"
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
              ) : (
                accountButtons.map((btn) => (
                  <Link
                    key={btn.key}
                    href={btn.href}
                    className="flex h-10 flex-1 items-center justify-center text-sm font-medium tracking-wide transition-all"
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

            {/* Discord link */}
            <motion.div
              className="mt-3 w-full"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 1.6 }}
            >
              <a
                href="https://discord.gg/KGMG3jADyF"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-full items-center justify-center text-sm font-medium tracking-wide transition-all"
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

            {/* Footer text */}
            <motion.p
              className="mt-6 text-xs tracking-widest uppercase"
              style={{ color: '#333333' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 1.7 }}
            >
              Naruto Mythos TCG
            </motion.p>
          </div>

          {/* RIGHT SIDE: Holographic Naruto card */}
          <motion.div
            className="relative flex-shrink-0 flex items-center justify-center"
            initial={{ opacity: 0, x: 80 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: 0.8,
              delay: 0.2,
              ease: [0.25, 0.46, 0.45, 0.94],
            }}
          >
            {/* Glow pulse behind card */}
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
              src="/images/rare/108-130_NARUTO_UZUMAKI.webp"
              alt="Naruto Uzumaki — Rare Card 108/130"
              width={320}
              height={448}
              rarity="rare"
            />
          </motion.div>

        </div>
      </div>
      <Footer />
    </main>
  );
}
