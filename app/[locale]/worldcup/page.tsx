'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from '@/lib/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { CountryFlag } from '@/components/CountryFlag';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';
import { PlayerNameLink } from '@/components/social/PlayerNameLink';
import { useLocaleBcp47 } from '@/lib/i18n/useLocaleMeta';
import { COUNTRIES } from '@/lib/data/countries';
import { getCardGroup } from '@/lib/utils/cardLocale';
import { MIN_RANKED_PLAYERS, WORLDCUP_MIN_ELO, TEAM_SIZE } from '@/lib/worldcup/fairScore';

const ROW_CLIP = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';
const MEDAL_COLORS = ['#c4a35a', '#a8a9ad', '#a06b42'];

interface CountryPlayer {
  username: string;
  elo: number;
  wins7d: number;
  games7d: number;
}

interface CountryRow {
  countryCode: string;
  ranked: boolean;
  players: number;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  score: number;
  avgElo: number;
  topPlayers: CountryPlayer[];
  topGroup: string | null;
  topGroupShare: number;
}

interface WorldcupPayload {
  standings: CountryRow[];
  totals: { countries: number; players: number; games: number };
  windowDays: number;
}

function useCountryName(bcp47: string): (code: string) => string {
  return useMemo(() => {
    let dn: Intl.DisplayNames | null = null;
    try { dn = new Intl.DisplayNames([bcp47], { type: 'region' }); } catch { dn = null; }
    const fallback = new Map(COUNTRIES.map((c) => [c.code, c.name]));
    return (code: string) => {
      try {
        const n = dn?.of(code.toUpperCase());
        if (n && n.toUpperCase() !== code.toUpperCase()) return n;
      } catch { /* fall through */ }
      return fallback.get(code) ?? code.toUpperCase();
    };
  }, [bcp47]);
}

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="flex flex-col items-center gap-1 px-4 py-3 flex-1 min-w-0"
      style={{ backgroundColor: 'rgba(17, 17, 17, 0.85)', clipPath: ROW_CLIP }}
    >
      <span className="font-display text-xl sm:text-2xl tabular-nums" style={{ color: '#c4a35a' }}>
        {value}
      </span>
      <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.2em] text-center" style={{ color: '#777' }}>
        {label}
      </span>
    </div>
  );
}

function PodiumCard({
  row,
  rank,
  countryName,
  delay,
}: {
  row: CountryRow;
  rank: number;
  countryName: string;
  delay: number;
}) {
  const t = useTranslations('worldcup');
  const medal = MEDAL_COLORS[rank - 1];
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: 'easeOut' }}
      className="relative flex flex-col items-center gap-2 px-4 pt-5 pb-4 flex-1 min-w-0"
      style={{
        backgroundColor: 'rgba(17, 17, 17, 0.9)',
        clipPath: ROW_CLIP,
        boxShadow: rank === 1 ? '0 0 32px rgba(196, 163, 90, 0.22)' : 'none',
      }}
    >
      <span className="font-display text-2xl leading-none" style={{ color: medal }}>
        {rank}
      </span>
      <CountryFlag code={row.countryCode} size={rank === 1 ? 46 : 38} />
      <span
        className="font-display text-xs sm:text-sm uppercase tracking-wider text-center leading-tight"
        style={{ color: '#e8e8e8' }}
      >
        {countryName}
      </span>
      <span className="font-display text-lg tabular-nums" style={{ color: medal }}>
        {row.winRate.toFixed(1)}%
      </span>
      <span className="text-[9px] uppercase tracking-[0.2em]" style={{ color: '#666' }}>
        {t('colWinRate')}
      </span>
      <span className="text-[10px] tabular-nums" style={{ color: '#888' }}>
        {t('recordLine', { wins: row.wins, losses: row.losses })}
      </span>
    </motion.div>
  );
}

export default function WorldcupPage() {
  const t = useTranslations('worldcup');
  const tc = useTranslations('common');
  const tCardMeta = useTranslations('cardMeta');
  const bcp47 = useLocaleBcp47();
  const countryName = useCountryName(bcp47);

  const [data, setData] = useState<WorldcupPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/worldcup')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: WorldcupPayload | null) => {
        if (cancelled) return;
        setData(d && Array.isArray(d.standings) ? d : null);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const standings = data?.standings ?? [];
  const rankedRows = standings.filter((r) => r.ranked);
  const unrankedRows = standings.filter((r) => !r.ranked);
  const podium = rankedRows.slice(0, 3);
  const podiumOrder = podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium;
  const podiumRanks = podium.length === 3 ? [2, 1, 3] : podium.map((_, i) => i + 1);

  const renderCountryRow = (row: CountryRow, rank: number | null, index: number) => {
    const isOpen = expanded === row.countryCode;
    const altBg = index % 2 === 0 ? '#0c0b10' : '#0a0a0d';
    return (
                  <motion.div
                    key={row.countryCode}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.45), ease: 'easeOut' }}
                    className="mb-1"
                    style={{ backgroundColor: isOpen ? 'rgba(196, 163, 90, 0.06)' : altBg, clipPath: ROW_CLIP }}
                  >
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : row.countryCode)}
                      className="block w-full px-3 sm:px-5 py-2.5 cursor-pointer text-left"
                    >
                      <span className="grid items-center gap-2 sm:gap-3 grid-cols-[2rem_auto_minmax(0,1fr)_auto] sm:grid-cols-[2.25rem_minmax(0,1fr)_7rem_5rem_4rem]">
                        <span
                          className="font-display text-base sm:text-lg tabular-nums text-center"
                          style={{ color: rank !== null && rank <= 3 ? MEDAL_COLORS[rank - 1] : '#666' }}
                        >
                          {rank ?? '-'}
                        </span>
                        <span className="flex items-center gap-2 min-w-0">
                          <CountryFlag code={row.countryCode} size={22} />
                          <span className="hidden sm:flex flex-col min-w-0">
                            <span className="font-display text-sm uppercase tracking-wide truncate" style={{ color: '#e8e8e8' }}>
                              {countryName(row.countryCode)}
                            </span>
                            {row.topGroup && (
                              <span className="text-[9px] uppercase tracking-widest truncate" style={{ color: '#6f6249' }}>
                                {getCardGroup(row.topGroup, tCardMeta)}
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="sm:hidden flex flex-col min-w-0">
                          <span className="font-display text-xs uppercase tracking-wide truncate" style={{ color: '#e8e8e8' }}>
                            {countryName(row.countryCode)}
                          </span>
                          <span className="text-[9px] tabular-nums" style={{ color: '#777' }}>
                            {t('recordLine', { wins: row.wins, losses: row.losses })}
                          </span>
                        </span>
                        <span className="flex items-center justify-end gap-2">
                          <span className="hidden sm:block h-1 w-12 overflow-hidden" style={{ backgroundColor: '#1c1a16' }}>
                            <motion.span
                              className="block h-full"
                              style={{ backgroundColor: '#c4a35a' }}
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(100, row.score)}%` }}
                              transition={{ duration: 0.7, delay: 0.2, ease: 'easeOut' }}
                            />
                          </span>
                          <span className="font-display text-sm sm:text-base tabular-nums" style={{ color: row.winRate >= 50 ? '#8fbf8f' : '#c48f8f' }}>
                            {row.winRate.toFixed(1)}%
                          </span>
                        </span>
                        <span className="hidden sm:block text-right text-xs tabular-nums" style={{ color: '#999' }}>
                          {t('recordLine', { wins: row.wins, losses: row.losses })}
                        </span>
                        <span className="hidden sm:block text-right text-xs tabular-nums" style={{ color: '#999' }}>
                          {row.players}
                        </span>
                      </span>
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.28, ease: 'easeOut' }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 sm:px-6 pb-4 pt-1">
                            <div className="flex flex-wrap gap-x-6 gap-y-1.5 mb-3 text-[10px] uppercase tracking-widest" style={{ color: '#777' }}>
                              <span>{t('detailGames')}: <span className="tabular-nums" style={{ color: '#c4a35a' }}>{row.games}</span></span>
                              <span>{t('detailAvgElo')}: <span className="tabular-nums" style={{ color: '#c4a35a' }}>{row.avgElo}</span></span>
                              <span className="sm:hidden">{t('colWinRate')}: <span className="tabular-nums" style={{ color: row.winRate >= 50 ? '#8fbf8f' : '#c48f8f' }}>{row.winRate.toFixed(1)}%</span></span>
                              <span className="sm:hidden">{t('colPlayers')}: <span className="tabular-nums" style={{ color: '#c4a35a' }}>{row.players}</span></span>
                              {row.topGroup && (
                                <span>
                                  {t('detailTopGroup')}: <span style={{ color: '#c4a35a' }}>{getCardGroup(row.topGroup, tCardMeta)}</span>
                                  <span className="tabular-nums" style={{ color: '#666' }}> ({row.topGroupShare}%)</span>
                                </span>
                              )}
                            </div>
                            <div className="text-[9px] uppercase tracking-[0.2em] mb-1.5" style={{ color: '#555' }}>
                              {t('topPlayersTitle')}
                            </div>
                            <div className="flex flex-col gap-1">
                              {row.topPlayers.map((p, pi) => (
                                <div
                                  key={p.username}
                                  className="flex items-center gap-3 px-3 py-1.5"
                                  style={{ backgroundColor: 'rgba(255, 255, 255, 0.025)' }}
                                >
                                  <span className="font-display text-xs tabular-nums w-5 text-center" style={{ color: '#666' }}>
                                    {pi + 1}
                                  </span>
                                  <PlayerNameLink
                                    username={p.username}
                                    className="text-xs font-medium truncate flex-1"
                                    style={{ color: '#e0e0e0' }}
                                  />
                                  <span className="text-[10px] tabular-nums" style={{ color: '#999' }}>
                                    {t('recordLine', { wins: p.wins7d, losses: p.games7d - p.wins7d })}
                                  </span>
                                  <span className="font-display text-xs tabular-nums" style={{ color: '#c4a35a' }}>
                                    {p.elo}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
    );
  };

  return (
    <main id="main-content" className="min-h-screen relative flex flex-col overflow-hidden" style={{ backgroundColor: '#08070a' }}>
      <CloudBackground />
      <div className="w-full max-w-5xl mx-auto relative z-10 flex-1 px-4 sm:px-8 py-6 sm:py-10">

        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="mb-6 sm:mb-8"
        >
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <h1
              className="font-display text-3xl sm:text-5xl tracking-wider uppercase leading-none"
              style={{ color: '#f2efe7', letterSpacing: '0.08em', textShadow: '0 0 22px rgba(196, 163, 90, 0.18)' }}
            >
              {t('title')}
            </h1>
            <div className="flex items-center gap-1.5">
              <LanguageSwitcher />
              <Link
                href="/"
                className="font-display px-3 py-1.5 text-[11px] uppercase tracking-widest transition-colors hover:text-[#c4a35a]"
                style={{ color: '#888' }}
              >
                {tc('back')}
              </Link>
            </div>
          </div>
          <p className="text-[11px] mt-3" style={{ color: '#555' }}>
            {t('subtitle', { days: data?.windowDays ?? 7 })}
          </p>
        </motion.header>

        {loading ? (
          <div className="flex justify-center py-20">
            <motion.span
              className="font-display text-sm uppercase tracking-widest"
              style={{ color: '#c4a35a' }}
              animate={{ opacity: [0.35, 1, 0.35] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            >
              {tc('loading')}
            </motion.span>
          </div>
        ) : standings.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-3 py-20 text-center"
          >
            <span className="font-display text-base uppercase tracking-widest" style={{ color: '#c4a35a' }}>
              {t('emptyTitle')}
            </span>
            <p className="text-xs max-w-md" style={{ color: '#777' }}>
              {t('emptyText')}
            </p>
          </motion.div>
        ) : (
          <>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 }}
              className="flex gap-2 sm:gap-3 mb-6"
            >
              <StatBlock label={t('totalCountries')} value={data?.totals.countries ?? 0} />
              <StatBlock label={t('totalPlayers')} value={data?.totals.players ?? 0} />
              <StatBlock label={t('totalGames')} value={data?.totals.games ?? 0} />
            </motion.div>

            {podium.length > 0 && (
              <div className="flex items-end gap-2 sm:gap-4 mb-8">
                {podiumOrder.map((row, i) => (
                  <PodiumCard
                    key={row.countryCode}
                    row={row}
                    rank={podiumRanks[i]}
                    countryName={countryName(row.countryCode)}
                    delay={0.1 + i * 0.08}
                  />
                ))}
              </div>
            )}

            <div
              className="hidden sm:grid items-center gap-3 px-5 pb-2 text-[9px] uppercase tracking-[0.2em]"
              style={{ color: '#555', gridTemplateColumns: '2.25rem 1fr 7rem 5rem 4rem' }}
            >
              <span />
              <span>{t('colCountry')}</span>
              <span className="text-right">{t('colWinRate')}</span>
              <span className="text-right">{t('colRecord')}</span>
              <span className="text-right">{t('colPlayers')}</span>
            </div>

            <div>
              {rankedRows.map((row, index) => renderCountryRow(row, index + 1, index))}
            </div>

            {unrankedRows.length > 0 && (
              <div className="mt-8">
                <div className="px-1 pb-2 text-[10px] uppercase tracking-[0.25em]" style={{ color: '#8a7b55' }}>
                  {t('unrankedTitle', { min: MIN_RANKED_PLAYERS })}
                </div>
                <div style={{ opacity: 0.72 }}>
                  {unrankedRows.map((row, index) => renderCountryRow(row, null, rankedRows.length + index))}
                </div>
              </div>
            )}

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              className="mt-8 px-5 py-4"
              style={{ backgroundColor: 'rgba(17, 17, 17, 0.7)', clipPath: ROW_CLIP }}
            >
              <div className="text-[10px] uppercase tracking-[0.25em] mb-3" style={{ color: '#c4a35a' }}>
                {t('rulesTitle')}
              </div>
              <ol className="flex flex-col gap-2">
                {([
                  t('rule1'),
                  t('rule2'),
                  t('rule3', { elo: WORLDCUP_MIN_ELO }),
                  t('rule4', { team: TEAM_SIZE }),
                  t('rule5', { team: TEAM_SIZE }),
                ]).map((rule, i) => (
                  <li key={i} className="flex gap-2.5 text-[11px] leading-relaxed" style={{ color: '#999' }}>
                    <span className="font-display shrink-0 tabular-nums" style={{ color: '#c4a35a' }}>{i + 1}.</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ol>
            </motion.div>
          </>
        )}
      </div>
      <Footer />
    </main>
  );
}
