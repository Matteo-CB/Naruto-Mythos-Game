'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { Link } from '@/lib/i18n/navigation';
import { useSocketStore } from '@/lib/socket/client';
import { useTournamentStore } from '@/stores/tournamentStore';
import { SpectateTilePicker } from '@/components/tournament/SpectateTilePicker';
import { readTileMessage } from '@/lib/spectate/tileMessages';
import {
  MAX_TILES,
  fillEmptyTiles,
  gridColumnsFor,
  pruneVanishedTiles,
  replaceEndedTile,
  toggleTile,
  type LiveMatch,
} from '@/lib/spectate/tileSelection';

const LIVE_REFRESH_MS = 5000;

export default function TournamentSpectatePage() {
  const params = useParams();
  const tournamentId = typeof params.id === 'string' ? params.id : '';
  const locale = useLocale();
  const t = useTranslations('tournamentSpectate');
  const { data: session, status } = useSession();

  const connect = useSocketStore((s) => s.connect);
  const connected = useSocketStore((s) => s.connected);
  const activeTournament = useTournamentStore((s) => s.activeTournament);
  const fetchTournament = useTournamentStore((s) => s.fetchTournament);

  const [live, setLive] = useState<LiveMatch[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const autoFilled = useRef(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (tournamentId) fetchTournament(tournamentId);
  }, [tournamentId, fetchTournament]);

  const userId = (session?.user as { id?: string } | undefined)?.id;
  const isParticipant = !!userId
    && !!activeTournament
    && activeTournament.id === tournamentId
    && activeTournament.participants.some((p) => p.userId === userId);

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.id) return;
    if (!connected) connect(session.user.id, session.user.name ?? 'Spectator');
  }, [status, session, connected, connect]);

  useEffect(() => {
    const socket = useSocketStore.getState().socket;
    if (!socket || !connected || !tournamentId) return;

    const onLive = (data: { tournamentId: string; matches: LiveMatch[] }) => {
      if (data.tournamentId !== tournamentId) return;
      setLive(data.matches ?? []);
    };

    socket.on('tournament:live-matches', onLive);
    socket.emit('tournament:subscribe', { tournamentId });
    socket.emit('tournament:live-matches', { tournamentId });

    const timer = setInterval(() => {
      socket.emit('tournament:live-matches', { tournamentId });
    }, LIVE_REFRESH_MS);

    return () => {
      socket.off('tournament:live-matches', onLive);
      clearInterval(timer);
    };
  }, [connected, tournamentId]);

  useEffect(() => {
    if (autoFilled.current || live.length === 0) return;
    autoFilled.current = true;
    setSelected((current) => fillEmptyTiles(current, live));
  }, [live]);

  useEffect(() => {
    setSelected((current) => {
      const pruned = pruneVanishedTiles(current, live);
      return pruned.length === current.length ? current : pruned;
    });
  }, [live]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const message = readTileMessage(event.data);
      if (!message) return;
      if (message.kind === 'ended' || message.kind === 'error') {
        setSelected((current) => replaceEndedTile(current, message.roomCode, live));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [live]);

  const handleToggle = useCallback((roomCode: string) => {
    setSelected((current) => toggleTile(current, roomCode));
  }, []);

  const columns = useMemo(() => gridColumnsFor(selected.length), [selected.length]);

  const tiles = useMemo(
    () => selected.map((roomCode) => ({
      roomCode,
      match: live.find((m) => m.roomCode === roomCode) ?? null,
    })),
    [selected, live],
  );

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0a0a0a]">
      <header className="flex items-center justify-between px-4 py-2" style={{ backgroundColor: '#111111' }}>
        <div className="flex items-baseline gap-3 overflow-hidden">
          <Link href={`/tournaments/${tournamentId}`} className="text-[11px] uppercase tracking-[0.16em] text-[#8a8a8a] hover:text-[#c4a35a]">
            {t('backToTournament')}
          </Link>
          <span className="truncate text-[12px] text-[#e8e8e8]">
            {t('liveCount', { count: live.length })}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          aria-label={t('openPanel')}
          data-gp="true"
          className="flex flex-col gap-[4px] px-3 py-2"
        >
          <span className="block h-[2px] w-[20px]" style={{ backgroundColor: '#c4a35a' }} />
          <span className="block h-[2px] w-[20px]" style={{ backgroundColor: '#c4a35a' }} />
          <span className="block h-[2px] w-[20px]" style={{ backgroundColor: '#c4a35a' }} />
        </button>
      </header>

      <main className="relative flex-1 overflow-hidden">
        {status !== 'authenticated' && (
          <CenteredNotice text={t('signInRequired')} />
        )}

        {status === 'authenticated' && isParticipant && (
          <CenteredNotice text={t('playersCannotWatch')} />
        )}

        {status === 'authenticated' && !isParticipant && tiles.length === 0 && (
          <CenteredNotice text={live.length === 0 ? t('noLiveMatches') : t('pickToStart')} />
        )}

        {status === 'authenticated' && !isParticipant && tiles.length > 0 && (
          <div
            className="grid h-full w-full gap-[2px]"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gridAutoRows: tiles.length > columns ? '1fr' : '100%',
              backgroundColor: '#050505',
            }}
          >
            {tiles.map((tile) => (
              <section key={tile.roomCode} className="relative overflow-hidden bg-[#0a0a0a]">
                <div
                  className="absolute left-0 right-0 top-0 flex items-center justify-between px-3 py-1"
                  style={{ backgroundColor: 'rgba(8,8,12,0.82)', zIndex: 2 }}
                >
                  <span className="truncate text-[11px] text-[#e8e8e8]">
                    {tile.match
                      ? `${tile.match.player1Name} ${t('versus')} ${tile.match.player2Name}`
                      : t('matchEnded')}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleToggle(tile.roomCode)}
                    aria-label={t('removeTile')}
                    data-gp="true"
                    className="px-2 text-[13px] text-[#8a8a8a] hover:text-[#e8e8e8]"
                  >
                    X
                  </button>
                </div>

                <iframe
                  key={tile.roomCode}
                  title={tile.match ? `${tile.match.player1Name} ${t('versus')} ${tile.match.player2Name}` : tile.roomCode}
                  src={`/${locale}/spectate/${tile.roomCode}`}
                  className="h-full w-full"
                  style={{ border: 'none' }}
                />
              </section>
            ))}
          </div>
        )}
      </main>

      <SpectateTilePicker
        open={panelOpen && !isParticipant}
        matches={live}
        selected={selected}
        onToggle={handleToggle}
        onClose={() => setPanelOpen(false)}
        mounted={mounted}
      />
    </div>
  );
}

function CenteredNotice({ text }: { text: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center px-6 text-center">
      <p className="max-w-md text-[13px] leading-relaxed text-[#8a8a8a]">{text}</p>
    </div>
  );
}

export { MAX_TILES };
