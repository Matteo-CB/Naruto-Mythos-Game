'use client';

import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { BracketMatch } from './BracketMatch';
import type { TournamentMatch } from '@/stores/tournamentStore';
import { useMemo, useRef, useEffect, useState, useCallback } from 'react';

interface Props {
  matches: TournamentMatch[];
  totalRounds: number;
  currentRound: number;
  winnerId?: string | null;
  winnerUsername?: string | null;
}

export function BracketTree({ matches, totalRounds, currentRound, winnerId, winnerUsername }: Props) {
  const t = useTranslations('tournament');
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<Array<{ x1: number; y1: number; x2: number; y2: number; isWinnerPath: boolean }>>([]);

  const roundGroups = useMemo(() => {
    const groups: TournamentMatch[][] = [];
    for (let r = 1; r <= totalRounds; r++) {
      groups.push(
        matches
          .filter(m => m.round === r)
          .sort((a, b) => a.matchIndex - b.matchIndex),
      );
    }
    return groups;
  }, [matches, totalRounds]);

  const getRoundLabel = useCallback((round: number) => {
    if (round === totalRounds) return t('final');
    if (round === totalRounds - 1) return t('semifinal');
    if (round === totalRounds - 2) return t('quarterfinal');
    return `${t('round')} ${round}`;
  }, [totalRounds, t]);

  // Calculate SVG connection lines
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const matchElements = container.querySelectorAll('[data-match-id]');
    const newLines: typeof lines = [];

    for (let r = 1; r < totalRounds; r++) {
      const roundMatches = matches.filter(m => m.round === r).sort((a, b) => a.matchIndex - b.matchIndex);

      for (let i = 0; i < roundMatches.length; i += 2) {
        const m1 = roundMatches[i];
        const m2 = roundMatches[i + 1];
        if (!m1 || !m2) continue;

        const nextMatch = matches.find(m => m.round === r + 1 && m.matchIndex === Math.floor(i / 2));
        if (!nextMatch) continue;

        const el1 = Array.from(matchElements).find(el => el.getAttribute('data-match-id') === m1.id);
        const el2 = Array.from(matchElements).find(el => el.getAttribute('data-match-id') === m2.id);
        const elNext = Array.from(matchElements).find(el => el.getAttribute('data-match-id') === nextMatch.id);

        if (el1 && el2 && elNext) {
          const r1 = el1.getBoundingClientRect();
          const r2 = el2.getBoundingClientRect();
          const rn = elNext.getBoundingClientRect();
          const co = container.getBoundingClientRect();

          const x1 = r1.right - co.left;
          const y1 = r1.top + r1.height / 2 - co.top;
          const x2 = r2.right - co.left;
          const y2 = r2.top + r2.height / 2 - co.top;
          const xn = rn.left - co.left;
          const yn = rn.top + rn.height / 2 - co.top;

          const isWP1 = m1.winnerId && nextMatch.player1Id === m1.winnerId || nextMatch.player2Id === m1.winnerId;
          const isWP2 = m2.winnerId && nextMatch.player1Id === m2.winnerId || nextMatch.player2Id === m2.winnerId;

          newLines.push({ x1, y1, x2: (x1 + xn) / 2, y2: y1, isWinnerPath: !!isWP1 });
          newLines.push({ x1: (x1 + xn) / 2, y1, x2: (x1 + xn) / 2, y2: (y1 + y2) / 2, isWinnerPath: !!isWP1 });
          newLines.push({ x1: x2, y1: y2, x2: (x2 + xn) / 2, y2: y2, isWinnerPath: !!isWP2 });
          newLines.push({ x1: (x2 + xn) / 2, y1: y2, x2: (x2 + xn) / 2, y2: (y1 + y2) / 2, isWinnerPath: !!isWP2 });
          newLines.push({ x1: (x1 + xn) / 2, y1: (y1 + y2) / 2, x2: xn, y2: yn, isWinnerPath: !!isWP1 || !!isWP2 });
        }
      }
    }
    setLines(newLines);
  }, [matches, totalRounds]);

  return (
    <div className="relative" ref={containerRef}>
      {/* SVG lines */}
      <svg
        ref={svgRef}
        className="absolute inset-0 pointer-events-none"
        style={{ width: '100%', height: '100%', overflow: 'visible' }}
      >
        {lines.map((line, i) => (
          <motion.line
            key={i}
            x1={line.x1} y1={line.y1}
            x2={line.x2} y2={line.y2}
            stroke={line.isWinnerPath ? '#c4a35a' : '#333'}
            strokeWidth={line.isWinnerPath ? 2 : 1}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: i * 0.02, duration: 0.3 }}
          />
        ))}
      </svg>

      {/* Bracket grid */}
      <div className="flex gap-8 overflow-x-auto pb-4" style={{ minHeight: 200 }}>
        {roundGroups.map((roundMatches, roundIdx) => (
          <div key={roundIdx} className="flex flex-col items-center flex-shrink-0">
            <div
              className="text-[10px] font-bold uppercase tracking-widest mb-4"
              style={{ color: roundIdx + 1 === currentRound ? '#c4a35a' : '#555' }}
            >
              {getRoundLabel(roundIdx + 1)}
            </div>
            <div
              className="flex flex-col justify-around flex-1"
              style={{ gap: `${Math.pow(2, roundIdx) * 20 + 16}px` }}
            >
              {roundMatches.map((match, matchIdx) => (
                <div key={match.id} data-match-id={match.id}>
                  <BracketMatch
                    match={match}
                    index={roundIdx * 10 + matchIdx}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Champion display */}
        {winnerId && (
          <div className="flex flex-col items-center justify-center flex-shrink-0 ml-4">
            <div className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: '#c4a35a' }}>
              {t('champion')}
            </div>
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="flex items-center justify-center px-6 py-4"
              style={{
                border: '2px solid #c4a35a',
                backgroundColor: 'rgba(196, 163, 90, 0.1)',
              }}
            >
              <motion.span
                className="text-sm font-bold tracking-wide"
                style={{ color: '#c4a35a' }}
                animate={{ textShadow: ['0 0 10px rgba(196,163,90,0.3)', '0 0 20px rgba(196,163,90,0.6)', '0 0 10px rgba(196,163,90,0.3)'] }}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                {winnerUsername}
              </motion.span>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
