'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { useRouter } from '@/lib/i18n/navigation';
import { useSocketStore } from '@/lib/socket/client';
import { useGameStore } from '@/stores/gameStore';
import { HoloSurface } from '@/components/HoloSurface';

export function LiveGamesBar() {
  const t = useTranslations();
  const router = useRouter();
  const { data: session } = useSession();
  const activeGames = useSocketStore((s) => s.activeGames);
  const requestActiveGames = useSocketStore((s) => s.requestActiveGames);
  const spectateGame = useSocketStore((s) => s.spectateGame);
  const unsubscribeActiveGames = useSocketStore((s) => s.unsubscribeActiveGames);

  useEffect(() => {
    requestActiveGames();
    const interval = setInterval(requestActiveGames, 5000);
    return () => {
      clearInterval(interval);
      unsubscribeActiveGames();
    };
  }, [requestActiveGames, unsubscribeActiveGames]);

  const publicGames = activeGames.filter((g) => !g.isPrivate);

  const [loadingCode, setLoadingCode] = useState<string | null>(null);
  const handleSpectate = async (game: typeof publicGames[0]) => {
    if (!session?.user?.id || loadingCode) return;
    setLoadingCode(game.roomCode);

    const ss = useSocketStore.getState();
    if (ss.isSpectating || ss.spectatingRoomCode) ss.leaveSpectating();
    useGameStore.setState({ visibleState: null, gameState: null, gameOver: false, isOnlineGame: false });

    const ss2 = useSocketStore.getState();
    if (!ss2.connected) {
      try { await ss2.connect(session.user.id, session.user.name ?? undefined); }
      catch { setLoadingCode(null); return; }
    }
    spectateGame(game.roomCode, session.user.id, session.user.name ?? 'Spectator');

    let waited = 0;
    const poll = setInterval(() => {
      waited += 200;
      const st = useSocketStore.getState();
      if (st.visibleState && st.isSpectating) {
        clearInterval(poll);
        setLoadingCode(null);
        router.push('/game' as '/');
      } else if (waited >= 10000) {
        clearInterval(poll);
        setLoadingCode(null);
        st.leaveSpectating();
      }
    }, 200);
  };

  return (
    <section
      className="w-full"
      style={{
        backgroundColor: 'rgba(15, 15, 20, 0.78)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
      }}
    >
      <header
        className="flex items-center justify-between px-3 py-2"
        style={{ boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.04)' }}
      >
        <h2 className="text-[11px] font-bold uppercase" style={{ color: '#c4a35a', letterSpacing: '0.22em' }}>
          {t('online.activeGames.title')}
        </h2>
        <span className="text-[9px] tabular-nums" style={{ color: '#555' }}>{publicGames.length}</span>
      </header>

      {publicGames.length === 0 ? (
        <div className="px-3 py-3 text-center">
          <span className="text-[10px]" style={{ color: '#555' }}>{t('online.activeGames.empty')}</span>
        </div>
      ) : (
        <div
          className="flex gap-2 px-2 py-2 overflow-x-auto"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {publicGames.map((g) => (
            <LiveGameCard
              key={g.roomCode}
              game={g}
              loading={loadingCode === g.roomCode}
              onSpectate={() => handleSpectate(g)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface LiveGame {
  roomCode: string;
  player1Name: string;
  player2Name: string;
  spectatorCount: number;
  turn: number;
  isRanked: boolean;
  isPrivate: boolean;
  isEvolving: boolean;
  holoHue: number | null;
  isAnonymous: boolean;
  phase: string;
}

function LiveGameCard({ game, loading, onSpectate }: { game: LiveGame; loading: boolean; onSpectate: () => void }) {
  const t = useTranslations();

  const anon = game.isAnonymous || game.player1Name === '__anonymous__';
  const p1 = anon ? t('online.anonymous.name') : game.player1Name;
  const p2 = anon ? t('online.anonymous.name') : game.player2Name;

  const isWaiting = game.phase === 'mulligan';
  const isLatePhase = game.turn >= 4;

  const card = (
    <motion.div
      animate={isWaiting ? { opacity: [0.92, 1, 0.92] } : { opacity: 1 }}
      transition={isWaiting ? { duration: 4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
      className="flex flex-col gap-1.5 px-3 py-2.5 cursor-pointer shrink-0 no-select"
      onClick={onSpectate}
      style={{
        backgroundColor: game.isEvolving ? 'rgba(10, 10, 14, 0.55)' : 'rgba(15, 15, 20, 0.85)',
        scrollSnapAlign: 'start',
        minWidth: 200,
        maxWidth: 260,
        position: 'relative',
        zIndex: 1,
      }}
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span
          className="text-[11px] font-medium truncate flex-1"
          style={{ color: '#e8e8e8' }}
        >
          {p1}
        </span>
        <span className="text-[9px]" style={{ color: '#444' }}>{t('spectator.vs')}</span>
        <span
          className="text-[11px] font-medium truncate flex-1 text-right"
          style={{ color: '#e8e8e8' }}
        >
          {p2}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[8.5px] uppercase font-bold" style={{ color: '#555', letterSpacing: '0.18em' }}>
            {t('spectator.turn', { turn: game.turn })}
          </span>
          {game.isRanked && (
            <span className="text-[8.5px] uppercase font-bold" style={{ color: '#b33e3e', letterSpacing: '0.18em' }}>
              {t('spectator.ranked')}
            </span>
          )}
          {game.isEvolving && (
            <span className="text-[8.5px] uppercase font-bold" style={{ color: '#c4a35a', letterSpacing: '0.18em' }}>
              {t('online.badge.evolving')}
            </span>
          )}
        </div>
        {game.spectatorCount > 0 && (
          <span className="text-[8.5px] tabular-nums" style={{ color: '#444' }}>
            {t('spectator.spectators', { count: game.spectatorCount })}
          </span>
        )}
      </div>
      {loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
        >
          <span className="text-[10px] uppercase font-bold" style={{ color: '#c4a35a', letterSpacing: '0.2em' }}>
            ...
          </span>
        </motion.div>
      )}
    </motion.div>
  );

  if (!game.isEvolving) return card;

  return (
    <HoloSurface
      hue={game.holoHue}
      intensity="banner"
      motion={isWaiting || isLatePhase ? 'active' : 'idle'}
      className="shrink-0 overflow-hidden"
      style={{ scrollSnapAlign: 'start' }}
    >
      {card}
    </HoloSurface>
  );
}
