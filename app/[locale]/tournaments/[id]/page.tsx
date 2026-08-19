'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import Image from 'next/image';
import { getCardById } from '@/lib/data/cardIndex';
import { getCardName, getCardTitle } from '@/lib/utils/cardLocale';
import { useSession } from 'next-auth/react';
import { useParams } from 'next/navigation';
import { Link, useRouter } from '@/lib/i18n/navigation';
import { motion } from 'framer-motion';
import { CloudBackground } from '@/components/CloudBackground';
import { ChakraIcon, CHAKRA_COLOR } from '@/components/icons/GameIcons';
import { Footer } from '@/components/Footer';
import { BracketTree } from '@/components/tournament/BracketTree';
import { PlayerNameLink } from '@/components/social/PlayerNameLink';
import { SwissStandings } from '@/components/tournament/SwissStandings';
import type { SwissStandingEntry } from '@/components/tournament/SwissStandings';
import { TournamentAdmin } from '@/components/tournament/TournamentAdmin';
import { AbsenceTimer } from '@/components/tournament/AbsenceTimer';
import { LiveMatchesPanel } from '@/components/tournament/LiveMatchesPanel';
import { TournamentResults } from '@/components/tournament/TournamentResults';
import { EvolvingDeckHolo } from '@/components/evolving/EvolvingDeckHolo';
import { EvolvingDeckBadge } from '@/components/evolving/EvolvingDeckBadge';
import { useTournamentStore } from '@/stores/tournamentStore';
import { useSocketStore, armReadiedMatch, isMatchReadied } from '@/lib/socket/client';
import { selectCurrentMatchForUser } from '@/lib/tournament/matchSelection';
import { useSettingsStore } from '@/stores/settingsStore';
import type { TournamentMatch, TournamentData } from '@/stores/tournamentStore';
import { computeStandings } from '@/lib/tournament/swissEngine';
import type { SwissMatchResult } from '@/lib/tournament/swissEngine';
import { LEAGUE_TIERS, getPlayerLeague } from '@/lib/tournament/leagueUtils';

const ADMIN_EMAILS = ['matteo.biyikli3224@gmail.com'];
const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Daiki0'];

function ScheduledCountdown({ deadline }: { deadline: string }) {
  const t = useTranslations('tournament');
  const [remaining, setRemaining] = useState('');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const tick = () => {
      const left = new Date(deadline).getTime() - Date.now();
      if (left <= 0) { setExpired(true); setRemaining('0:00'); return; }
      const h = Math.floor(left / 3600000);
      const m = Math.floor((left % 3600000) / 60000);
      const s = Math.floor((left % 60000) / 1000);
      setRemaining(h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s` : `${m}:${s.toString().padStart(2, '0')}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  return (
    <div
      className="mt-3 px-4 py-3 text-center flex items-center justify-center gap-2 flex-wrap"
      style={{
        backgroundColor: 'var(--t-bg)',
        clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
        boxShadow: '0 0 30px -12px rgba(196, 163, 90, 0.35)',
      }}
    >
      <span className="font-display text-[11px] uppercase tracking-widest" style={{ color: 'var(--t-muted)' }}>
        {expired ? t('startingSoon') : t('startsInLabel')}
      </span>
      {!expired && (
        <span className="font-display text-base font-bold tabular-nums" style={{ color: 'var(--t-accent)' }}>
          {remaining}
        </span>
      )}
    </div>
  );
}

export default function TournamentDetailPage() {
  const t = useTranslations('tournament');
  const tSpectate = useTranslations('tournamentSpectate');
  const tc = useTranslations('common');
  const tRoot = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const params = useParams();
  const tournamentId = params?.id as string;
  const { data: session, status } = useSession();
  const { animationsEnabled } = useSettingsStore();
  const { socket, connect, connected } = useSocketStore();
  const { activeTournament, loading, error, errorKey: storeErrorKey, fetchTournament, joinTournament, leaveTournament, selectDeck, clearActiveTournament, handleTournamentUpdate, handleMatchUpdate, handleTournamentComplete, handleRoundComplete, handleStandingsUpdate, handleSwissRoundGenerated, clearError } = useTournamentStore();

  const userId = (session?.user as { id?: string })?.id;
  const [myDecks, setMyDecks] = useState<Array<{ id: string; name: string; evolvingPoints?: number; evolvingCompatible?: boolean }>>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [deckErrors, setDeckErrors] = useState<string[]>([]);
  const [deckLoading, setDeckLoading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const isAdmin = ADMIN_EMAILS.includes(session?.user?.email ?? '') || ADMIN_USERNAMES.includes(session?.user?.name ?? '');
  const isCreator = activeTournament?.creatorId === userId;
  const isParticipant = activeTournament?.participants.some((p) => p.userId === userId);
  const myMatch: TournamentMatch | undefined = selectCurrentMatchForUser(
    (activeTournament?.matches ?? []) as unknown as Array<{ id: string; round: number; matchIndex: number; status: string; roomCode?: string | null; player1Id?: string | null; player2Id?: string | null; isBye?: boolean }>,
    userId,
    activeTournament?.currentRound,
  ) as unknown as TournamentMatch | undefined;
  const myAbsenceDeadline = myMatch?.absenceDeadline ? myMatch.absenceDeadline : null;

  useEffect(() => { if (status === 'unauthenticated') router.replace('/login'); }, [status, router]);
  useEffect(() => {
    if (tournamentId && session?.user) fetchTournament(tournamentId);
    return () => { clearActiveTournament(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId, session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;
    if (connected) return;
    const existing = useSocketStore.getState().socket;
    if (existing && existing.active) return;
    connect(session.user.id, session.user.name ?? undefined);
  }, [session, connected, connect]);

  useEffect(() => {
    const st = useSocketStore.getState();
    if (st.gameEnded || st.gameCancelled) {
      st.leaveMatchContext();
    }
  }, []);

  useEffect(() => {
    if (!socket || !tournamentId) return;
    socket.emit('tournament:subscribe', { tournamentId });
    const onU = (d: Parameters<typeof handleTournamentUpdate>[0]) => handleTournamentUpdate(d);
    const onM = (d: Parameters<typeof handleMatchUpdate>[0]) => handleMatchUpdate(d);
    const onC = (d: Parameters<typeof handleTournamentComplete>[0]) => handleTournamentComplete(d);
    const onR = (d: Parameters<typeof handleRoundComplete>[0]) => handleRoundComplete(d);
    const onF = (d: { matchId: string; forfeitedPlayerId: string; winnerId: string; winnerUsername: string }) => { handleMatchUpdate({ matchId: d.matchId, status: 'forfeit', winnerId: d.winnerId, winnerUsername: d.winnerUsername } as any); };
    const onMR = (d: { matchId: string; roomCode: string }) => { handleMatchUpdate({ matchId: d.matchId, status: 'in_progress', roomCode: d.roomCode } as any); fetchTournament(tournamentId); };
    const onAT = (d: { matchId: string; playerId: string; deadline: string }) => { handleMatchUpdate({ matchId: d.matchId, absenceDeadline: d.deadline, absentPlayerId: d.playerId } as any); };
    const onSU = (d: Parameters<typeof handleStandingsUpdate>[0]) => handleStandingsUpdate(d);
    const onSRG = (d: Parameters<typeof handleSwissRoundGenerated>[0]) => handleSwissRoundGenerated(d);
    const onRefresh = () => { fetchTournament(tournamentId); };
    const onPleaseConfirm = (d: { matchId: string }) => {
      if (!userId || !d?.matchId) return;
      fetchTournament(tournamentId);
    };
    const onConnect = () => {
      socket.emit('tournament:subscribe', { tournamentId });
      fetchTournament(tournamentId);
    };
    socket.on('tournament:update', onU); socket.on('tournament:match-updated', onM); socket.on('tournament:completed', onC); socket.on('tournament:round-complete', onR);
    socket.on('tournament:player-forfeited', onF); socket.on('tournament:match-ready', onMR); socket.on('tournament:absence-timer', onAT);
    socket.on('tournament:standings-updated', onSU); socket.on('tournament:swiss-round-generated', onSRG);
    socket.on('tournament:refresh', onRefresh);
    socket.on('tournament:cancelled', onRefresh); socket.on('tournament:started', onRefresh);
    socket.on('tournament:please-confirm-ready', onPleaseConfirm);
    socket.on('connect', onConnect);
    return () => { socket.emit('tournament:unsubscribe', { tournamentId }); socket.off('tournament:update', onU); socket.off('tournament:match-updated', onM); socket.off('tournament:completed', onC); socket.off('tournament:round-complete', onR); socket.off('tournament:player-forfeited', onF); socket.off('tournament:match-ready', onMR); socket.off('tournament:absence-timer', onAT); socket.off('tournament:standings-updated', onSU); socket.off('tournament:swiss-round-generated', onSRG); socket.off('tournament:refresh', onRefresh); socket.off('tournament:cancelled', onRefresh); socket.off('tournament:started', onRefresh); socket.off('tournament:please-confirm-ready', onPleaseConfirm); socket.off('connect', onConnect); };
  }, [socket, tournamentId, userId, handleTournamentUpdate, handleMatchUpdate, handleTournamentComplete, handleRoundComplete, handleStandingsUpdate, handleSwissRoundGenerated, fetchTournament]);

  useEffect(() => {
    if (!tournamentId || !session?.user) return;
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchTournament(tournamentId);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
    };
  }, [tournamentId, session?.user, fetchTournament]);

  const isSealedTournament = activeTournament?.gameMode === 'sealed';
  const isEvolvingTournament = activeTournament?.gameMode === 'evolving';
  const decksFetchedRef = useRef(false);
  useEffect(() => {
    if (!session?.user || !activeTournament || isSealedTournament) return;
    if (decksFetchedRef.current) return;
    decksFetchedRef.current = true;
    const url = isEvolvingTournament ? '/api/decks?evolving=true' : '/api/decks';
    fetch(url).then(r => r.ok ? r.json() : null).then(data => {
      const decks = Array.isArray(data) ? data : data?.decks ?? [];
      if (decks.length > 0) setMyDecks(decks.map((d: { id: string; name: string; evolvingPoints?: number; evolvingCompatible?: boolean }) => ({ id: d.id, name: d.name, evolvingPoints: typeof d.evolvingPoints === 'number' ? d.evolvingPoints : 0, evolvingCompatible: d.evolvingCompatible === true })));
    }).catch(() => { decksFetchedRef.current = false; });
  }, [session?.user, isSealedTournament, isEvolvingTournament, activeTournament]);

  useEffect(() => {
    if (!activeTournament || !userId) return;
    const myParticipant = activeTournament.participants.find(p => p.userId === userId);
    if (myParticipant && (myParticipant as any).deckId) {
      setSelectedDeckId((myParticipant as any).deckId);
    }
  }, [activeTournament, userId]);

  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinError, setJoinError] = useState('');
  
  const [discordPopupType, setDiscordPopupType] = useState<'not-linked' | 'not-in-server' | null>(null);

  const userDiscordId = (session?.user as Record<string, unknown>)?.discordId as string | null;
  const hasDiscordLinked = !!userDiscordId;

  const doJoin = useCallback(async () => {
    if (!tournamentId) return;
    clearError();
    setJoinError('');
    try {
      const code = activeTournament && !activeTournament.isPublic ? joinCodeInput.trim() : undefined;
      await joinTournament(tournamentId, code);
      if (activeTournament?.gameMode === 'sealed') {
        router.push(('/tournaments/' + tournamentId + '/sealed-build') as '/');
        return;
      }
      fetchTournament(tournamentId);
    } catch (err) {
      const errorKey = (err as Error & { errorKey?: string })?.errorKey;
      if (typeof errorKey === 'string') {
        try { setJoinError(tRoot(errorKey)); return; }
        catch { /* fall through */ }
      }
      setJoinError(err instanceof Error ? err.message : t('admin.error'));
    }
  }, [tournamentId, joinTournament, fetchTournament, clearError, joinCodeInput, activeTournament, t, tRoot, router]);

  const handleJoin = useCallback(async () => {
    if (!hasDiscordLinked) {
      setDiscordPopupType('not-linked');
      return;
    }

    if ((activeTournament as { partner?: string | null } | null)?.partner === 'nwl') {
      doJoin();
      return;
    }

    try {
      const res = await fetch('/api/discord/check-member');
      const data = await res.json();
      if (!data.isMember) {
        setDiscordPopupType('not-in-server');
        return;
      }
    } catch {

    }
    doJoin();
  }, [hasDiscordLinked, doJoin, activeTournament]);

  const handleLeave = useCallback(async () => { if (!tournamentId) return; clearError(); try { await leaveTournament(tournamentId); fetchTournament(tournamentId); } catch { /* err in store */ } }, [tournamentId, leaveTournament, fetchTournament, clearError]);

  const myMatchId = myMatch?.id;
  const myMatchStatus = myMatch?.status;
  const myMatchRoom = myMatch?.roomCode;

  useEffect(() => {
    if (!socket || !tournamentId || !userId || !myMatchId) return;
    if (myMatchRoom && myMatchStatus === 'in_progress') return;
    if (myMatchStatus !== 'ready' && myMatchStatus !== 'pending') return;
    const emitReady = () => {
      if (!isMatchReadied(myMatchId)) return;
      socket.emit('tournament:ready', { tournamentId, matchId: myMatchId, userId });
    };
    emitReady();
    const id = setInterval(emitReady, 4000);
    return () => clearInterval(id);
  }, [socket, tournamentId, userId, myMatchId, myMatchStatus, myMatchRoom]);

  useEffect(() => {
    if (!myMatchRoom || myMatchStatus !== 'in_progress') return;
    const code = myMatchRoom;
    const id = setTimeout(() => {
      const st = useSocketStore.getState();
      if (st.roomCode === code && st.gameStarted) return;
      if (st.roomCode && st.roomCode !== code) st.leaveMatchContext();
      router.push(('/play/online?room=' + code) as '/');
    }, 1200);
    return () => clearTimeout(id);
  }, [myMatchRoom, myMatchStatus, router]);

  const handlePlayMatch = useCallback(() => {
    if (!socket || !tournamentId || !userId || !myMatch) return;
    armReadiedMatch(myMatch.id);
    socket.emit('tournament:ready', { tournamentId, matchId: myMatch.id, userId });
    
    setTimeout(() => fetchTournament(tournamentId), 1000);
  }, [socket, tournamentId, userId, myMatch, fetchTournament]);

  const handleSelectDeck = useCallback(async (deckId: string) => {
    if (!tournamentId) return;
    setDeckLoading(true);
    setDeckErrors([]);
    try {
      const result = await selectDeck(tournamentId, deckId);
      setSelectedDeckId(deckId);
      if (!result.valid) {
        const localized = (result.errorKeys ?? []).map((e, i) => {
          try { return tRoot(e.key, e.params as Record<string, string | number> | undefined); }
          catch { return result.errors[i] ?? e.key; }
        });
        setDeckErrors(localized.length > 0 ? localized : result.errors);
      }
    } catch (err) {
      const errorKey = (err as Error & { errorKey?: string })?.errorKey;
      if (typeof errorKey === 'string') {
        try { setDeckErrors([tRoot(errorKey)]); return; }
        catch { /* fall through */ }
      }
      setDeckErrors([err instanceof Error ? err.message : t('admin.error')]);
    } finally {
      setDeckLoading(false);
    }
  }, [tournamentId, selectDeck, t, tRoot]);

  const handleShare = useCallback(() => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }).catch(() => {});
  }, []);

  const tour = activeTournament;
  const isSwiss = tour?.format === 'swiss';
  const isDoubleElim = tour?.format === 'double_elimination';
  const swissStandings: SwissStandingEntry[] = useMemo(() => {
    if (!isSwiss || !tour) return [];
    if (tour.standings && tour.standings.length > 0) {
      return tour.standings.map((s) => ({
        userId: s.userId, username: s.username, rank: s.rank,
        wins: s.wins, losses: s.losses, draws: s.draws,
        matchPoints: s.matchPoints, buchholz: s.buchholz, buchholzExtended: s.buchholzExtended,
        seed: s.seed, hadBye: s.hadBye,
      }));
    }
    if (tour.matches.length === 0 || tour.participants.length === 0) return [];
    const players = tour.participants.map((p) => ({ userId: p.userId, username: p.username, seed: p.seed ?? 0 }));
    const results: SwissMatchResult[] = tour.matches
      .filter((m) => m.status === 'completed' || m.status === 'forfeit' || m.isBye)
      .map((m) => ({ round: m.round, player1Id: m.player1Id ?? '', player2Id: m.player2Id ?? '', winnerId: m.winnerId, isBye: m.isBye }));
    if (results.length === 0) {
      return players.sort((a, b) => a.seed - b.seed).map((p, i) => ({
        userId: p.userId, username: p.username, rank: i + 1,
        wins: 0, losses: 0, draws: 0, matchPoints: 0, buchholz: 0, buchholzExtended: 0,
        seed: p.seed, hadBye: false,
      }));
    }
    try { return computeStandings(players, results); } catch { return []; }
  }, [isSwiss, tour?.standings, tour?.matches, tour?.participants]);

  if (status === 'loading' || status === 'unauthenticated') {
    return (<div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--t-bg)' }}><p className="text-sm" style={{ color: 'var(--t-muted)' }}>{tc('loading')}</p></div>);
  }
  if (loading && !tour) {
    return (<div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--t-bg)' }}><p className="text-sm" style={{ color: 'var(--t-muted)' }}>{tc('loading')}</p></div>);
  }
  if (!tour) {
    return (<div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: 'var(--t-bg)' }}><p className="text-sm mb-4" style={{ color: 'var(--t-muted)' }}>{t('notFound')}</p><Link href={'/tournaments' as '/'} className="text-sm transition-colors" style={{ color: 'var(--t-accent)' }}>{t('backToList')}</Link></div>);
  }

  const statusKey = tour.status === 'registration' ? 'statusRegistration' : tour.status === 'in_progress' ? 'statusInProgress' : tour.status === 'completed' ? 'statusCompleted' : 'statusCancelled';
  const modeKey = tour.gameMode === 'sealed' ? 'sealed' : tour.gameMode === 'restricted' ? 'modeRestricted' : tour.gameMode === 'evolving' ? 'modeEvolving' : 'classic';
  const myParticipant = tour.participants.find(p => p.userId === userId);
  const myDeckValid = (myParticipant as any)?.deckValid ?? false;
  const myDeckId = (myParticipant as any)?.deckId ?? null;
  const mySealedDeck = (myParticipant as any)?.sealedDeck ?? null;
  const myJoinedAt = (myParticipant as any)?.joinedAt ? new Date((myParticipant as any).joinedAt).getTime() : 0;
  const sealedBuildDeadline = myJoinedAt ? myJoinedAt + 15 * 60 * 1000 : 0;
  const needsSealedBuild = isParticipant && tour.gameMode === 'sealed' && tour.status === 'registration' && !mySealedDeck;
  const needsDeck = isParticipant && tour.gameMode !== 'sealed' && tour.status === 'registration';
  const hasRestrictions = tour.gameMode === 'restricted' || (tour as any).bannedCardIds?.length > 0;

  const myMatchPanel = myMatch ? (
    <div
      className="mb-6 p-5"
      style={{
        backgroundColor: 'var(--t-surface)',
        boxShadow: myMatch.roomCode
          ? '0 12px 32px rgba(0,0,0,0.45), 0 0 26px rgba(74,158,255,0.35)'
          : (myMatch.status === 'ready' || myMatch.status === 'in_progress')
            ? '0 12px 32px rgba(0,0,0,0.45), 0 0 22px rgba(196,163,90,0.30)'
            : '0 12px 32px rgba(0,0,0,0.4)',
      }}
    >
      <h2 className="text-xs font-bold uppercase tracking-[0.25em] mb-3" style={{ color: myMatch.roomCode ? '#4a9eff' : 'var(--t-accent)' }}>
        {t('yourMatchReady')}
      </h2>
      <p className="text-base font-bold text-center mb-4" style={{ color: 'var(--t-text)' }}>
        {myMatch.player1Username ?? t('tbd')} <span style={{ color: 'var(--t-dim)' }}>vs</span> {myMatch.player2Username ?? t('tbd')}
      </p>

      {((myMatch.player1GameWins ?? 0) > 0 || (myMatch.player2GameWins ?? 0) > 0) && (
        <p className="text-center text-xs font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--t-accent)' }}>
          {t('seriesScore', { p1: String(myMatch.player1GameWins ?? 0), p2: String(myMatch.player2GameWins ?? 0) })}
        </p>
      )}

      {myAbsenceDeadline && !myMatch.roomCode && (
        <div className="mb-4">
          <AbsenceTimer deadline={myAbsenceDeadline} onExpired={() => fetchTournament(tournamentId)} />
        </div>
      )}

      {myMatch.roomCode ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm font-medium" style={{ color: '#4a9eff' }}>{t('matchStarting')}</p>
          <Link
            href={('/play/online?room=' + myMatch.roomCode) as '/'}
            onClick={handlePlayMatch}
            className="block w-full text-center py-4 text-base font-black uppercase tracking-widest"
            style={{ backgroundColor: '#4a9eff', color: 'var(--t-bg)' }}>
            {t('enterMatch')}
          </Link>
        </div>
      ) : (myMatch.status === 'ready' || myMatch.status === 'in_progress') ? (
        <div className="flex flex-col items-center gap-2">
          <motion.button
            onClick={handlePlayMatch}
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.98 }}
            className="w-full py-4 text-base font-black uppercase tracking-widest cursor-pointer"
            style={{ backgroundColor: 'var(--t-accent)', color: 'var(--t-bg)' }}>
            {t('launchMatch')}
          </motion.button>
          <p className="text-xs text-center" style={{ color: 'var(--t-accent)' }}>{t('launchHint')}</p>
          <p className="text-[11px] text-center" style={{ color: 'var(--t-dim)' }}>{t('waitingBothReady')}</p>
        </div>
      ) : (
        <p className="text-sm text-center" style={{ color: 'var(--t-muted)' }}>{t('waitingOpponent')}</p>
      )}
    </div>
  ) : null;

  return (
    <main id="main-content" className="min-h-screen relative flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--t-bg)' }}>
      <CloudBackground animated={animationsEnabled} />
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="max-w-4xl mx-auto relative z-10 flex-1 w-full px-4 sm:px-8 py-6 sm:py-10">

        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="mb-6">
          <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-wider mb-2 leading-tight wrap-break-word" style={{ color: 'var(--t-text)', letterSpacing: '0.06em' }}>{tour.name}</h1>
          <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--t-muted)' }}>
            <span className="px-2 py-1 uppercase tracking-wider" style={{ backgroundColor: 'var(--t-accent-glow)', color: 'var(--t-accent)' }}>{tour.type === 'simulator' ? t('typeSimulator') : t('typePlayer')}</span>
            <span className="px-2 py-1 uppercase tracking-wider" style={{ backgroundColor: 'var(--t-panel)', border: '1px solid var(--t-border)', color: 'var(--t-text)' }}>{t(statusKey)}</span>
            <span style={{ color: 'var(--t-dim)' }}>{t(modeKey)}</span>
            <span style={{ color: 'var(--t-dim)' }}>{t('players')}: {tour.participants.length}/{tour.maxPlayers}</span>
            <span style={{ color: 'var(--t-dim)' }}>{t('createdBy')}: {tour.creatorUsername}</span>
          </div>
          {tour.allowedLeagues && tour.allowedLeagues.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span style={{ color: 'var(--t-muted)' }}>{t('allowedLeagues')}:</span>
              {tour.allowedLeagues.map(leagueKey => (
                <span key={leagueKey} className="px-2 py-0.5 uppercase tracking-wider" style={{ backgroundColor: 'var(--t-surface-2)', border: '1px solid var(--t-border-strong)', color: 'var(--t-text)' }}>{t(`leagueName.${leagueKey}`)}</span>
              ))}
            </div>
          )}
        </motion.div>

        {(tour as { partner?: string | null }).partner === 'nwl' && (
          <div className="mb-6 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            {}
            <img
              src="/images/tournaments/nwl-friday.webp"
              alt={t('nwlPosterAlt')}
              className="w-full max-w-xs shrink-0"
              style={{ boxShadow: '0 12px 32px var(--t-shadow)' }}
            />
            <div className="flex-1">
              <p className="text-sm leading-relaxed" style={{ color: '#c9c7c0' }}>{t('nwlRequirement')}</p>
              <a
                href="https://discord.gg/UXQX8McFD3"
                target="_blank"
                rel="noopener noreferrer"
                className="font-display mt-3 inline-flex items-center px-4 py-2 text-[11px] uppercase tracking-widest"
                style={{ color: '#7f9cf5', backgroundColor: 'rgba(88,101,242,0.14)' }}
              >
                {t('nwlJoinServer')}
              </a>
            </div>
          </div>
        )}

        {tour.status === 'registration' && tour.scheduledStartAt && (
          <ScheduledCountdown deadline={tour.scheduledStartAt} />
        )}

        <div className="mb-4 flex gap-2">
          <button onClick={handleShare} className="px-4 py-1.5 text-xs font-medium uppercase tracking-wider cursor-pointer transition-colors"
            style={{ backgroundColor: linkCopied ? '#1a3a1a' : 'var(--t-surface-2)', color: linkCopied ? 'var(--t-success)' : 'var(--t-muted)' }}>
            {linkCopied ? t('copied') : t('share')}
          </button>
        </div>

        {needsDeck && !(myDeckId && myDeckValid) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.12 }}
            className="mb-4 p-4"
            style={{ backgroundColor: 'rgba(204, 68, 68, 0.12)', boxShadow: '0 0 14px rgba(204, 68, 68, 0.22)' }}
          >
            <motion.h2
              animate={{ opacity: [1, 0.55, 1] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              className="text-sm font-medium uppercase tracking-wider mb-1"
              style={{ color: 'var(--t-danger)' }}
            >
              {t('deckMissingTitle')}
            </motion.h2>
            <p className="text-xs" style={{ color: 'var(--t-text)' }}>{t('deckMissingBody')}</p>
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}
          className="mb-4 p-4" style={{ backgroundColor: 'var(--t-panel)', border: '1px solid var(--t-border)', }}>
          <h2 className="text-sm font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--t-accent)' }}>{t('rulesTitle')}</h2>
          <div className="flex flex-col gap-1.5 text-xs" style={{ color: 'var(--t-muted)' }}>
            <p>{isSwiss ? t('rulesFormatSwiss') : t('rulesFormat')}</p>
            {tour.gameMode === 'classic' && <p>{t('rulesClassic')}</p>}
            {tour.gameMode === 'sealed' && <p>{t('rulesSealed')}</p>}
            {tour.gameMode === 'restricted' && <p>{t('rulesRestricted')}</p>}
            {tour.gameMode === 'evolving' && <p>{t('rulesEvolving')}</p>}
            {tour.gameMode !== 'sealed' && <p>{t('rulesDeck')}</p>}
            <p>{t('rulesMatch')}</p>
            <p>{t('rulesAbsence')}</p>
            <p>{t('rulesEdge')}</p>
          </div>
        </motion.div>

        {tour.prizeCardId && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.18 }}
            className="mb-4 p-4 flex gap-4 items-center" style={{ backgroundColor: 'var(--t-panel)', border: '1px solid var(--t-border)' }}>
            <div className="relative shrink-0" style={{ width: 110, height: 160 }}>
              <Image
                src={`/images/cards/KS/mythos_v/${tour.prizeCardId}.webp`}
                alt=""
                fill
                sizes="110px"
                style={{ objectFit: 'cover', boxShadow: '0 0 18px var(--t-accent)44' }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--t-accent)' }}>{t('prizePanelTitle')}</h2>
              {(() => {
                const card = getCardById(tour.prizeCardId);
                const number = tour.prizeCardId.split('-')[1] ?? '';
                if (!card) return <p className="text-xs" style={{ color: 'var(--t-muted)' }}>{tour.prizeCardId}</p>;
                return (
                  <>
                    <p className="text-xs font-display" style={{ color: 'var(--t-text)' }}>{getCardName(card, locale as 'en' | 'fr')}</p>
                    <p className="text-[10px]" style={{ color: 'var(--t-muted)' }}>{getCardTitle(card, locale as 'en' | 'fr')}</p>
                    <p className="text-[10px]" style={{ color: 'var(--t-dim)' }}>{number} Mythos V</p>
                    <p className="text-[10px] mt-2" style={{ color: 'var(--t-muted)' }}>{t('prizeDescription')}</p>
                    <p className="text-[10px] mt-2 italic" style={{ color: 'var(--t-muted)' }}>{t('prizeDisclaimer')}</p>
                  </>
                );
              })()}
            </div>
          </motion.div>
        )}

        {hasRestrictions && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}
            className="mb-4 p-4" style={{ backgroundColor: 'var(--t-panel)', border: '1px solid var(--t-border)', }}>
            <h2 className="text-sm font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--t-danger)' }}>{t('restrictions')}</h2>
            <div className="flex flex-col gap-2 text-xs" style={{ color: 'var(--t-text)' }}>
              {(tour as any).allowedGroups?.length > 0 && (
                <div><span style={{ color: 'var(--t-muted)' }}>{t('allowedGroups')}:</span> <span style={{ color: 'var(--t-success)' }}>{(tour as any).allowedGroups.join(', ')}</span></div>
              )}
              {(tour as any).bannedGroups?.length > 0 && (
                <div><span style={{ color: 'var(--t-muted)' }}>{t('bannedGroups')}:</span> <span style={{ color: 'var(--t-danger)' }}>{(tour as any).bannedGroups.join(', ')}</span></div>
              )}
              {(tour as any).allowedKeywords?.length > 0 && (
                <div><span style={{ color: 'var(--t-muted)' }}>{t('allowedKeywords')}:</span> <span style={{ color: 'var(--t-success)' }}>{(tour as any).allowedKeywords.join(', ')}</span></div>
              )}
              {(tour as any).bannedKeywords?.length > 0 && (
                <div><span style={{ color: 'var(--t-muted)' }}>{t('bannedKeywords')}:</span> <span style={{ color: 'var(--t-danger)' }}>{(tour as any).bannedKeywords.join(', ')}</span></div>
              )}
              {(tour as any).allowedRarities?.length > 0 && (
                <div><span style={{ color: 'var(--t-muted)' }}>{t('allowedRarities')}:</span> <span style={{ color: 'var(--t-success)' }}>{(tour as any).allowedRarities.join(', ')}</span></div>
              )}
              {(tour as any).bannedRarities?.length > 0 && (
                <div><span style={{ color: 'var(--t-muted)' }}>{t('bannedRarities')}:</span> <span style={{ color: 'var(--t-danger)' }}>{(tour as any).bannedRarities.join(', ')}</span></div>
              )}
              {(tour as any).maxPerRarity && Object.keys((tour as any).maxPerRarity).length > 0 && (
                <div><span style={{ color: 'var(--t-muted)' }}>{t('maxPerRarity')}:</span> {Object.entries((tour as any).maxPerRarity).map(([r, v]) => <span key={r} className="ml-1" style={{ color: 'var(--t-accent)' }}>{r}: {String(v)}</span>)}</div>
              )}
              {(tour as any).maxCopiesPerCard != null && <div><span style={{ color: 'var(--t-muted)' }}>{t('maxCopiesPerCard')}:</span> <span style={{ color: 'var(--t-accent)' }}>{(tour as any).maxCopiesPerCard}</span></div>}
              {(tour as any).maxChakraCost != null && <div><span style={{ color: 'var(--t-muted)' }}>{t('maxChakraCostLabel')}:</span> <span className="inline-flex items-center gap-1 align-middle" style={{ color: 'var(--t-accent)' }}><ChakraIcon size={14} color={CHAKRA_COLOR} />{(tour as any).maxChakraCost}</span></div>}
              {(tour as any).minDeckSize != null && <div><span style={{ color: 'var(--t-muted)' }}>{t('minDeckSizeLabel')}:</span> <span style={{ color: 'var(--t-accent)' }}>{(tour as any).minDeckSize}</span></div>}
              {(tour as any).maxDeckSize != null && <div><span style={{ color: 'var(--t-muted)' }}>{t('maxDeckSizeLabel')}:</span> <span style={{ color: 'var(--t-accent)' }}>{(tour as any).maxDeckSize}</span></div>}
              {(tour as any).bannedCardIds?.length > 0 && (
                <div><span style={{ color: 'var(--t-muted)' }}>{t('bannedCards')}:</span> <span style={{ color: 'var(--t-danger)' }}>{(tour as any).bannedCardIds.join(', ')}</span></div>
              )}
              {(tour as any).restrictionNote && (
                <div className="mt-1 p-2" style={{ backgroundColor: 'var(--t-bg)', border: '1px solid var(--t-border-strong)' }}>
                  <span style={{ color: 'var(--t-accent)' }}>{(tour as any).restrictionNote}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {needsSealedBuild && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.25 }}
            className="mb-4 p-4" style={{ backgroundColor: 'var(--t-panel)' }}>
            <h2 className="text-sm font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--t-accent)' }}>
              {t('sealedBuildAction')}
            </h2>
            <p className="text-xs mb-3" style={{ color: 'var(--t-muted)' }}>
              {t('sealedBuildDeadline')}: {sealedBuildDeadline ? new Date(sealedBuildDeadline).toLocaleTimeString() : '-'}
            </p>
            <Link
              href={('/tournaments/' + tournamentId + '/sealed-build') as '/'}
              className="inline-block px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
              style={{ backgroundColor: 'var(--t-accent-glow)', border: '1px solid var(--t-accent)', color: 'var(--t-accent)' }}
            >
              {t('sealedBuildAction')}
            </Link>
          </motion.div>
        )}

        {isParticipant && tour.gameMode === 'sealed' && mySealedDeck && tour.status === 'registration' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.25 }}
            className="mb-4 p-4" style={{ backgroundColor: 'var(--t-panel)' }}>
            <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--t-success)' }}>
              {t('sealedDeckReady')}
            </p>
          </motion.div>
        )}

        {needsDeck && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.25 }}
            className="mb-4 p-4" style={{ backgroundColor: 'var(--t-panel)', }}>
            <h2 className="text-sm font-medium uppercase tracking-wider mb-2" style={{ color: myDeckId && myDeckValid ? 'var(--t-success)' : 'var(--t-danger)' }}>
              {t('selectDeck')}
            </h2>
            <p className="text-xs mb-3" style={{ color: 'var(--t-muted)' }}>{t('selectDeckHint')}</p>
            
            {((tour as any).allowedGroups?.length > 0 || (tour as any).allowedKeywords?.length > 0 || (tour as any).bannedRarities?.length > 0 || (tour as any).bannedCardIds?.length > 0 || (tour as any).maxCopiesPerCard || (tour as any).restrictionNote) && (
              <div className="mb-3 p-2 text-xs" style={{ backgroundColor: 'var(--t-accent-tint)', }}>
                <p className="font-medium mb-1" style={{ color: 'var(--t-accent)' }}>{t('restrictions')}:</p>
                {(tour as any).allowedGroups?.length > 0 && <p style={{ color: 'var(--t-muted)' }}>{t('allowedGroups')}: <span style={{ color: 'var(--t-success)' }}>{(tour as any).allowedGroups.join(', ')}</span></p>}
                {(tour as any).allowedKeywords?.length > 0 && <p style={{ color: 'var(--t-muted)' }}>{t('allowedKeywords')}: <span style={{ color: 'var(--t-success)' }}>{(tour as any).allowedKeywords.join(', ')}</span></p>}
                {(tour as any).bannedRarities?.length > 0 && <p style={{ color: 'var(--t-muted)' }}>{t('bannedRarities')}: <span style={{ color: 'var(--t-danger)' }}>{(tour as any).bannedRarities.join(', ')}</span></p>}
                {(tour as any).bannedCardIds?.length > 0 && <p style={{ color: 'var(--t-muted)' }}>{t('bannedCards')}: <span style={{ color: 'var(--t-danger)' }}>{(tour as any).bannedCardIds.join(', ')}</span></p>}
                {(tour as any).maxCopiesPerCard && <p style={{ color: 'var(--t-muted)' }}>{t('maxCopies')}: <span style={{ color: 'var(--t-accent)' }}>{(tour as any).maxCopiesPerCard}</span></p>}
                {(tour as any).restrictionNote && <p style={{ color: 'var(--t-accent)' }}>{(tour as any).restrictionNote}</p>}
              </div>
            )}
            {myDeckId && (
              <p className="text-xs mb-2" style={{ color: myDeckValid ? 'var(--t-success)' : 'var(--t-danger)' }}>
                {myDeckValid ? t('deckValid') : t('deckInvalid')}
              </p>
            )}
            {deckErrors.length > 0 && (
              <div className="mb-3 p-2 text-xs" style={{ backgroundColor: 'rgba(204, 68, 68, 0.1)', border: '1px solid rgba(204, 68, 68, 0.3)', color: 'var(--t-danger)' }}>
                <p className="font-medium mb-1">{t('deckErrors')}:</p>
                {deckErrors.map((err, i) => <p key={i}>- {err}</p>)}
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              {myDecks.map(deck => (
                <EvolvingDeckHolo key={deck.id} points={deck.evolvingPoints ?? 0} enabled={deck.evolvingCompatible === true} intensity="subtle">
                <button onClick={() => handleSelectDeck(deck.id)} disabled={deckLoading}
                  className="flex items-center justify-between px-3 py-2 text-xs cursor-pointer transition-colors w-full"
                  style={{
                    backgroundColor: selectedDeckId === deck.id ? 'var(--t-accent-glow)' : 'var(--t-bg)',
                    color: selectedDeckId === deck.id ? 'var(--t-accent)' : 'var(--t-text)',
                  }}>
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="truncate">{deck.name}</span>
                    {deck.evolvingCompatible === true && <EvolvingDeckBadge points={deck.evolvingPoints ?? 0} />}
                  </div>
                  {selectedDeckId === deck.id && <span style={{ color: myDeckValid ? 'var(--t-success)' : 'var(--t-danger)' }}>{myDeckValid ? t('deckValid') : t('deckInvalid')}</span>}
                </button>
                </EvolvingDeckHolo>
              ))}
              {myDecks.length === 0 && (
                <p className="text-xs" style={{ color: 'var(--t-muted)' }}>
                  {isEvolvingTournament ? t('noEvolvingDeckWarning') : t('noDeckWarning')}
                </p>
              )}
              {myDecks.length > 0 && !myDeckValid && (
                <p className="text-xs mt-2" style={{ color: 'var(--t-muted)' }}>
                  {t('noValidDeckHint')}
                </p>
              )}
            </div>
          </motion.div>
        )}

        {error && <div className="mb-4 p-3 text-xs" style={{ backgroundColor: 'rgba(204, 68, 68, 0.1)', border: '1px solid rgba(204, 68, 68, 0.3)', color: 'var(--t-danger)' }}>{(() => {
          if (storeErrorKey) {
            try { return tRoot(storeErrorKey); } catch { /* fall through */ }
          }
          return error;
        })()}</div>}

        {tour.status === 'registration' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
            
            <div className="mb-4 p-4" style={{ backgroundColor: 'var(--t-panel)', border: '1px solid var(--t-border)' }}>
              <h2 className="text-sm font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--t-accent)' }}>{t('players')} ({tour.participants.length}/{tour.maxPlayers})</h2>
              {tour.participants.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--t-dim)' }}>{t('registrationOpen')}</p>
              ) : (
                <div className="space-y-1">
                  {tour.participants.map((p) => {
                    const excludedNoDeck = p.eliminated && (p.eliminatedRound ?? null) === 0;
                    return (
                      <div key={p.id} className="flex items-center gap-2 px-2 py-1 text-sm" style={{ color: excludedNoDeck ? 'var(--t-dim)' : 'var(--t-text)' }}>
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: excludedNoDeck ? 'var(--t-dim)' : 'var(--t-accent)' }} />
                        <PlayerNameLink username={p.username} />
                        {excludedNoDeck ? (
                          <span className="text-xs" style={{ color: '#a33636' }}>{t('excludedNoDeck')}</span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mb-4">
              {!isParticipant ? (
                <div className="p-4" style={{ backgroundColor: 'var(--t-panel)', border: '1px solid var(--t-border)' }}>
                  
                  {discordPopupType && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }} onClick={() => setDiscordPopupType(null)}>
                      <div className="max-w-sm w-full mx-4 p-5" style={{ backgroundColor: 'var(--t-panel)', border: '1px solid var(--t-border-strong)' }} onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(88, 101, 242, 0.15)', border: '2px solid rgba(88, 101, 242, 0.4)' }}>
                            <span className="text-lg font-bold" style={{ color: '#5865F2' }}>D</span>
                          </div>
                          <p className="text-sm font-medium" style={{ color: 'var(--t-text)' }}>
                            {discordPopupType === 'not-linked' ? t('discordPopupTitleNotLinked') : t('discordPopupTitleNotInServer')}
                          </p>
                        </div>
                        <p className="text-xs mb-4 leading-relaxed" style={{ color: 'var(--t-muted)' }}>
                          {discordPopupType === 'not-linked' ? t('discordPopupDescNotLinked') : t('discordPopupDescNotInServer')}
                        </p>
                        <div className="flex flex-col gap-2">
                          {discordPopupType === 'not-linked' ? (
                            <Link href={'/settings' as '/'} className="w-full px-4 py-2 text-xs font-medium uppercase tracking-wider text-center transition-colors"
                              style={{ backgroundColor: 'rgba(88, 101, 242, 0.15)', border: '1px solid rgba(88, 101, 242, 0.4)', color: '#5865F2' }}>
                              {t('discordLinkAccount')}
                            </Link>
                          ) : (
                            <a href="https://discord.com/invite/BBXVUsU3hn" target="_blank" rel="noopener noreferrer"
                              className="w-full px-4 py-2 text-xs font-medium uppercase tracking-wider text-center transition-colors block"
                              style={{ backgroundColor: 'rgba(88, 101, 242, 0.15)', border: '1px solid rgba(88, 101, 242, 0.4)', color: '#5865F2' }}>
                              {t('discordJoinServer')}
                            </a>
                          )}
                          <button onClick={() => { setDiscordPopupType(null); doJoin(); }}
                            className="w-full px-4 py-2 text-xs font-medium uppercase tracking-wider cursor-pointer transition-colors"
                            style={{ backgroundColor: 'var(--t-accent-tint)', color: 'var(--t-muted)' }}>
                            {t('discordContinueWithout')}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-3">
                    
                    {!tour.isPublic && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t-muted)' }}>{t('enterCode')}</label>
                        <div className="flex gap-2">
                          <input type="text" value={joinCodeInput} onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                            placeholder={t('codePlaceholder')} maxLength={8}
                            className="flex-1 px-3 py-2 text-sm font-mono text-center uppercase tracking-widest"
                            style={{ backgroundColor: 'var(--t-bg)', border: '1px solid var(--t-border-strong)', color: 'var(--t-accent)' }}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleJoin(); }}
                          />
                        </div>
                      </div>
                    )}

                    <button onClick={handleJoin}
                      disabled={tour.participants.length >= tour.maxPlayers || (!tour.isPublic && !joinCodeInput.trim())}
                      className="w-full px-5 py-2.5 text-sm font-medium uppercase tracking-wider cursor-pointer transition-colors disabled:opacity-40"
                      style={{ backgroundColor: 'var(--t-accent-glow)', color: 'var(--t-accent)' }}>
                      {t('join')}
                    </button>

                    {joinError && (
                      <p className="text-xs px-2 py-1.5" style={{ backgroundColor: 'rgba(204, 68, 68, 0.1)', border: '1px solid rgba(204, 68, 68, 0.3)', color: 'var(--t-danger)' }}>
                        {joinError}
                      </p>
                    )}

                    {tour.participants.length >= tour.maxPlayers && (
                      <p className="text-xs text-center" style={{ color: 'var(--t-muted)' }}>{t('full')}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button onClick={handleLeave} className="px-5 py-2.5 text-sm font-medium uppercase tracking-wider cursor-pointer transition-colors"
                    style={{ backgroundColor: 'rgba(204, 68, 68, 0.08)', border: '1px solid rgba(204, 68, 68, 0.3)', color: 'var(--t-danger)' }}>
                    {t('leave')}
                  </button>
                </div>
              )}
            </div>

            {(isAdmin || isCreator) && !tour.isPublic && tour.joinCode && (
              <div className="mb-4 p-3 flex items-center gap-3" style={{ backgroundColor: 'var(--t-panel)', border: '1px solid var(--t-border-strong)' }}>
                <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--t-muted)' }}>{t('codeLabel')}:</span>
                <span className="text-sm font-mono tracking-widest" style={{ color: 'var(--t-accent)' }}>{tour.joinCode}</span>
              </div>
            )}

            {(isAdmin || isCreator) && <TournamentAdmin tournamentId={tournamentId} isAdmin={isAdmin} isCreator={isCreator} />}
          </motion.div>
        )}

        {tour.status === 'in_progress' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
            {!isParticipant && (
              <div className="mb-4 flex justify-end">
                <Link
                  href={`/tournaments/${tournamentId}/spectate`}
                  data-gp="true"
                  className="px-4 py-2 text-[11px] uppercase tracking-[0.16em]"
                  style={{ backgroundColor: 'var(--t-accent-glow)', color: 'var(--t-accent)', borderRadius: '3px' }}
                >
                  {tSpectate('watchLive')}
                </Link>
              </div>
            )}
            <LiveMatchesPanel
              matches={tour.matches}
              currentRound={tour.currentRound}
              totalRounds={tour.totalRounds}
              userId={userId}
              format={tour.format}
            />
            {myMatchPanel}
            <div className="p-4 overflow-x-auto" style={{ backgroundColor: 'var(--t-panel)', border: '1px solid var(--t-border)' }}>
              <h2 className="text-sm font-medium uppercase tracking-wider mb-4" style={{ color: 'var(--t-accent)' }}>{isSwiss ? t('swissStandings') : t('bracket')}</h2>
              {isSwiss ? (
                <SwissStandings standings={swissStandings} matches={tour.matches} totalRounds={tour.totalRounds} currentRound={tour.currentRound} winnerId={tour.winnerId} winnerUsername={tour.winnerUsername} />
              ) : isDoubleElim ? (
                <div className="flex flex-col gap-6">
                  <div>
                    <h3 className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--t-accent)' }}>{t('bracketWinners')}</h3>
                    <BracketTree matches={tour.matches.filter((m) => m.bracket === 'winners')} totalRounds={Math.max(1, ...tour.matches.filter((m) => m.bracket === 'winners').map((m) => m.round))} currentRound={tour.currentRound} winnerId={tour.winnerId} winnerUsername={tour.winnerUsername} />
                  </div>
                  <div>
                    <h3 className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--t-accent)' }}>{t('bracketLosers')}</h3>
                    <BracketTree matches={tour.matches.filter((m) => m.bracket === 'losers')} totalRounds={Math.max(1, ...tour.matches.filter((m) => m.bracket === 'losers').map((m) => m.round))} currentRound={tour.currentRound} winnerId={tour.winnerId} winnerUsername={tour.winnerUsername} />
                  </div>
                  <div>
                    <h3 className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--t-accent)' }}>{t('bracketGrandFinal')}</h3>
                    <BracketTree matches={tour.matches.filter((m) => m.bracket === 'grand_final')} totalRounds={Math.max(1, ...tour.matches.filter((m) => m.bracket === 'grand_final').map((m) => m.round))} currentRound={tour.currentRound} winnerId={tour.winnerId} winnerUsername={tour.winnerUsername} />
                  </div>
                </div>
              ) : (
                <BracketTree matches={tour.matches} totalRounds={tour.totalRounds} currentRound={tour.currentRound} winnerId={tour.winnerId} winnerUsername={tour.winnerUsername} />
              )}
            </div>
            {(isAdmin || isCreator) && <div className="mt-4"><TournamentAdmin tournamentId={tournamentId} isAdmin={isAdmin} isCreator={isCreator} /></div>}
          </motion.div>
        )}

        {tour.status === 'completed' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
            {myMatchPanel}
            <TournamentResults tournament={tour} />
            <div className="mt-6 p-4 overflow-x-auto" style={{ backgroundColor: 'var(--t-panel)', border: '1px solid var(--t-border)' }}>
              <h2 className="text-sm font-medium uppercase tracking-wider mb-4" style={{ color: 'var(--t-accent)' }}>{isSwiss ? t('swissStandings') : t('bracket')}</h2>
              {isSwiss ? (
                <SwissStandings standings={swissStandings} matches={tour.matches} totalRounds={tour.totalRounds} currentRound={tour.currentRound} winnerId={tour.winnerId} winnerUsername={tour.winnerUsername} />
              ) : isDoubleElim ? (
                <div className="flex flex-col gap-6">
                  <div>
                    <h3 className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--t-accent)' }}>{t('bracketWinners')}</h3>
                    <BracketTree matches={tour.matches.filter((m) => m.bracket === 'winners')} totalRounds={Math.max(1, ...tour.matches.filter((m) => m.bracket === 'winners').map((m) => m.round))} currentRound={tour.currentRound} winnerId={tour.winnerId} winnerUsername={tour.winnerUsername} />
                  </div>
                  <div>
                    <h3 className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--t-accent)' }}>{t('bracketLosers')}</h3>
                    <BracketTree matches={tour.matches.filter((m) => m.bracket === 'losers')} totalRounds={Math.max(1, ...tour.matches.filter((m) => m.bracket === 'losers').map((m) => m.round))} currentRound={tour.currentRound} winnerId={tour.winnerId} winnerUsername={tour.winnerUsername} />
                  </div>
                  <div>
                    <h3 className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--t-accent)' }}>{t('bracketGrandFinal')}</h3>
                    <BracketTree matches={tour.matches.filter((m) => m.bracket === 'grand_final')} totalRounds={Math.max(1, ...tour.matches.filter((m) => m.bracket === 'grand_final').map((m) => m.round))} currentRound={tour.currentRound} winnerId={tour.winnerId} winnerUsername={tour.winnerUsername} />
                  </div>
                </div>
              ) : (
                <BracketTree matches={tour.matches} totalRounds={tour.totalRounds} currentRound={tour.currentRound} winnerId={tour.winnerId} winnerUsername={tour.winnerUsername} />
              )}
            </div>
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.4 }} className="mt-8 text-center">
          <Link href={'/tournaments' as '/'} className="text-sm transition-colors" style={{ color: 'var(--t-muted)' }}>{'<'} {t('backToList')}</Link>
        </motion.div>
      </motion.div>
      <Footer />
    </main>
  );
}
