'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { PlayerNameLink } from '@/components/social/PlayerNameLink';
import { useRouter } from '@/lib/i18n/navigation';
import { useSocketStore } from '@/lib/socket/client';
import { useGameStore } from '@/stores/gameStore';

interface Props {
  filter?: 'all' | 'evolving' | 'ranked';
}

export function LiveGamesSection({ filter = 'all' }: Props) {
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

  const publicGames = activeGames.filter((g) => {
    if (g.isPrivate) return false;
    if (filter === 'evolving' && !g.isEvolving) return false;
    if (filter === 'ranked' && g.isEvolving) return false;
    return true;
  });

  const [spectateLoading, setSpectateLoading] = useState<string | null>(null);
  const handleSpectate = async (game: typeof publicGames[0]) => {
    if (!session?.user?.id || spectateLoading) return;
    setSpectateLoading(game.roomCode);

    const ss = useSocketStore.getState();
    if (ss.isSpectating || ss.spectatingRoomCode) {
      ss.leaveSpectating();
    }

    useGameStore.setState({ visibleState: null, gameState: null, gameOver: false, isOnlineGame: false });

    const ss2 = useSocketStore.getState();
    if (!ss2.connected) {
      try {
        await ss2.connect(session.user.id, session.user.name ?? undefined);
      } catch {
        setSpectateLoading(null);
        return;
      }
    }

    spectateGame(game.roomCode, session.user.id, session.user.name ?? 'Spectator');

    let waited = 0;
    const poll = setInterval(() => {
      waited += 200;
      const st = useSocketStore.getState();
      if (st.visibleState && st.isSpectating) {
        clearInterval(poll);
        setSpectateLoading(null);
        router.push('/game' as '/');
      } else if (waited >= 10000) {
        clearInterval(poll);
        setSpectateLoading(null);
        st.leaveSpectating();
      }
    }, 200);
  };

  return (
    <div className="w-full mt-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--t-success)' }} />
        <span className="text-xs uppercase font-bold tracking-wider" style={{ color: 'var(--t-accent)' }}>
          {t('spectator.liveGames')}
        </span>
        <span className="text-[10px]" style={{ color: 'var(--t-dim)' }}>({publicGames.length})</span>
      </div>
      <div className="rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--t-surface)', border: '1px solid var(--t-border)' }}>
        {publicGames.length === 0 ? (
          <div className="px-4 py-4 text-center">
            <span className="text-[11px]" style={{ color: 'var(--t-dim)' }}>
              {t('spectator.noLiveGames')}
            </span>
          </div>
        ) : (
          <div className="max-h-48 overflow-y-auto">
            {publicGames.map((game) => (
              <div key={game.roomCode} className="flex items-center justify-between px-4 py-2.5"
                style={{ borderBottom: '1px solid var(--t-surface-2)' }}>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium" style={{ color: 'var(--t-text)' }}>
                    <PlayerNameLink username={game.player1Name} disabled={game.player1Name === '__anonymous__'} /> <span style={{ color: 'var(--t-dim)' }}>{t('spectator.vs')}</span> <PlayerNameLink username={game.player2Name} disabled={game.player2Name === '__anonymous__'} />
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px]" style={{ color: 'var(--t-muted)' }}>
                      {t('spectator.turn', { turn: game.turn })}
                    </span>
                    <span className="text-[9px]" style={{ color: game.isRanked ? 'var(--t-accent)' : 'var(--t-dim)' }}>
                      {game.isRanked ? t('spectator.ranked') : t('spectator.casual')}
                    </span>
                    {game.isEvolving && (
                      <span className="text-[9px] uppercase font-bold" style={{ color: 'var(--t-accent)' }}>
                        {t('evolving.modeTag')}
                      </span>
                    )}
                    {game.spectatorCount > 0 && (
                      <span className="text-[9px]" style={{ color: 'var(--t-dim)' }}>
                        {t('spectator.spectators', { count: game.spectatorCount })}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => handleSpectate(game)}
                  disabled={spectateLoading === game.roomCode}
                  className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
                  style={{ backgroundColor: 'var(--t-accent-glow)', border: '1px solid rgba(196,163,90,0.3)', color: 'var(--t-accent)' }}>
                  {spectateLoading === game.roomCode ? '...' : t('spectator.joinSpectate')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
