'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { useParams } from 'next/navigation';
import { Link, useRouter } from '@/lib/i18n/navigation';
import { motion } from 'framer-motion';
import { CloudBackground } from '@/components/CloudBackground';
import { DecorativeIcons } from '@/components/DecorativeIcons';
import { Footer } from '@/components/Footer';
import { BracketTree } from '@/components/tournament/BracketTree';
import { TournamentAdmin } from '@/components/tournament/TournamentAdmin';
import { AbsenceTimer } from '@/components/tournament/AbsenceTimer';
import { TournamentResults } from '@/components/tournament/TournamentResults';
import { useTournamentStore } from '@/stores/tournamentStore';
import { useSocketStore } from '@/lib/socket/client';
import { useSettingsStore } from '@/stores/settingsStore';
import type { TournamentMatch, TournamentData } from '@/stores/tournamentStore';
import { LEAGUE_TIERS, getPlayerLeague } from '@/lib/tournament/leagueUtils';

const ADMIN_EMAILS = ['matteo.biyikli3224@gmail.com'];
const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Daiki0'];

export default function TournamentDetailPage() {
  const t = useTranslations('tournament');
  const tc = useTranslations('common');
  const router = useRouter();
  const params = useParams();
  const tournamentId = params?.id as string;
  const { data: session, status } = useSession();
  const { animationsEnabled } = useSettingsStore();
  const { socket } = useSocketStore();
  const { activeTournament, loading, error, fetchTournament, joinTournament, leaveTournament, selectDeck, clearActiveTournament, handleTournamentUpdate, handleMatchUpdate, handleTournamentComplete, handleRoundComplete, clearError } = useTournamentStore();

  const userId = (session?.user as { id?: string })?.id;
  const [myDecks, setMyDecks] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [deckErrors, setDeckErrors] = useState<string[]>([]);
  const [deckLoading, setDeckLoading] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const isAdmin = ADMIN_EMAILS.includes(session?.user?.email ?? '') || ADMIN_USERNAMES.includes(session?.user?.name ?? '');
  const isCreator = activeTournament?.creatorId === userId;
  const isParticipant = activeTournament?.participants.some((p) => p.userId === userId);
  const myMatch: TournamentMatch | undefined = activeTournament?.matches.find((m) => (m.player1Id === userId || m.player2Id === userId) && (m.status === 'pending' || m.status === 'ready' || m.status === 'in_progress'));
  const myAbsenceDeadline = myMatch?.absenceDeadline && myMatch.absentPlayerId === userId ? myMatch.absenceDeadline : null;

  useEffect(() => { if (status === 'unauthenticated') router.replace('/login'); }, [status, router]);
  useEffect(() => { if (tournamentId && session?.user) fetchTournament(tournamentId); return () => { clearActiveTournament(); }; }, [tournamentId, session, fetchTournament, clearActiveTournament]);

  useEffect(() => {
    if (!socket || !tournamentId) return;
    socket.emit('tournament:subscribe', { tournamentId });
    const onU = (d: Parameters<typeof handleTournamentUpdate>[0]) => handleTournamentUpdate(d);
    const onM = (d: Parameters<typeof handleMatchUpdate>[0]) => handleMatchUpdate(d);
    const onC = (d: Parameters<typeof handleTournamentComplete>[0]) => handleTournamentComplete(d);
    const onR = (d: Parameters<typeof handleRoundComplete>[0]) => handleRoundComplete(d);
    const onF = (d: { matchId: string; forfeitedPlayerId: string; winnerId: string; winnerUsername: string }) => { handleMatchUpdate({ matchId: d.matchId, status: 'forfeit', winnerId: d.winnerId, winnerUsername: d.winnerUsername } as any); };
    const onMR = (d: { matchId: string; roomCode: string }) => { handleMatchUpdate({ matchId: d.matchId, status: 'in_progress', roomCode: d.roomCode } as any); fetchTournament(tournamentId); };
    socket.on('tournament:update', onU); socket.on('tournament:match-updated', onM); socket.on('tournament:completed', onC); socket.on('tournament:round-complete', onR);
    socket.on('tournament:player-forfeited', onF); socket.on('tournament:match-ready', onMR);
    return () => { socket.emit('tournament:unsubscribe', { tournamentId }); socket.off('tournament:update', onU); socket.off('tournament:match-updated', onM); socket.off('tournament:completed', onC); socket.off('tournament:round-complete', onR); socket.off('tournament:player-forfeited', onF); socket.off('tournament:match-ready', onMR); };
  }, [socket, tournamentId, handleTournamentUpdate, handleMatchUpdate, handleTournamentComplete, handleRoundComplete]);

  // Fetch user's decks for deck selection
  useEffect(() => {
    if (!session?.user || !activeTournament || activeTournament.gameMode === 'sealed') return;
    fetch('/api/decks').then(r => r.ok ? r.json() : null).then(data => {
      if (data?.decks) setMyDecks(data.decks.map((d: { id: string; name: string }) => ({ id: d.id, name: d.name })));
    }).catch(() => {});
    // Check if participant already has a deck selected
    const myParticipant = activeTournament.participants.find(p => p.userId === userId);
    if (myParticipant && (myParticipant as any).deckId) {
      setSelectedDeckId((myParticipant as any).deckId);
    }
  }, [session, activeTournament, userId]);

  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinError, setJoinError] = useState('');
  // Discord popup: 'not-linked' | 'not-in-server' | null
  const [discordPopupType, setDiscordPopupType] = useState<'not-linked' | 'not-in-server' | null>(null);

  // Discord status from session
  const userDiscordId = (session?.user as Record<string, unknown>)?.discordId as string | null;
  const hasDiscordLinked = !!userDiscordId;

  const doJoin = useCallback(async () => {
    if (!tournamentId) return;
    clearError();
    setJoinError('');
    try {
      const code = activeTournament && !activeTournament.isPublic ? joinCodeInput.trim() : undefined;
      await joinTournament(tournamentId, code);
      fetchTournament(tournamentId);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to join');
    }
  }, [tournamentId, joinTournament, fetchTournament, clearError, joinCodeInput, activeTournament]);

  const handleJoin = useCallback(async () => {
    if (!hasDiscordLinked) {
      setDiscordPopupType('not-linked');
      return;
    }
    // Check server membership via API
    try {
      const res = await fetch('/api/discord/check-member');
      const data = await res.json();
      if (!data.isMember) {
        setDiscordPopupType('not-in-server');
        return;
      }
    } catch {
      // If check fails, let them join anyway
    }
    doJoin();
  }, [hasDiscordLinked, doJoin]);

  const handleLeave = useCallback(async () => { if (!tournamentId) return; clearError(); try { await leaveTournament(tournamentId); fetchTournament(tournamentId); } catch { /* err in store */ } }, [tournamentId, leaveTournament, fetchTournament, clearError]);

  // Auto-emit tournament:ready when player has an active match
  useEffect(() => {
    if (!socket || !tournamentId || !userId || !myMatch) return;
    if (myMatch.status === 'ready' || myMatch.status === 'pending') {
      socket.emit('tournament:ready', { tournamentId, matchId: myMatch.id, userId });
    }
  }, [socket, tournamentId, userId, myMatch]);

  const handlePlayMatch = useCallback(() => {
    if (!socket || !tournamentId || !userId || !myMatch) return;
    socket.emit('tournament:ready', { tournamentId, matchId: myMatch.id, userId });
  }, [socket, tournamentId, userId, myMatch]);

  const handleSelectDeck = useCallback(async (deckId: string) => {
    if (!tournamentId) return;
    setDeckLoading(true);
    setDeckErrors([]);
    try {
      const result = await selectDeck(tournamentId, deckId);
      setSelectedDeckId(deckId);
      if (!result.valid) setDeckErrors(result.errors);
    } catch (err) {
      setDeckErrors([err instanceof Error ? err.message : 'Error']);
    } finally {
      setDeckLoading(false);
    }
  }, [tournamentId, selectDeck]);

  const handleShare = useCallback(() => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }).catch(() => {});
  }, []);

  if (status === 'loading' || status === 'unauthenticated') {
    return (<div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}><p className="text-sm" style={{ color: '#888888' }}>{tc('loading')}</p></div>);
  }
  if (loading && !activeTournament) {
    return (<div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}><p className="text-sm" style={{ color: '#888888' }}>{tc('loading')}</p></div>);
  }
  if (!activeTournament) {
    return (<div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}><p className="text-sm mb-4" style={{ color: '#888888' }}>{t('notFound')}</p><Link href={'/tournaments' as '/'} className="text-sm transition-colors" style={{ color: '#c4a35a' }}>{t('backToList')}</Link></div>);
  }

  const tour = activeTournament;
  const statusKey = tour.status === 'registration' ? 'statusRegistration' : tour.status === 'in_progress' ? 'statusInProgress' : tour.status === 'completed' ? 'statusCompleted' : 'statusCancelled';
  const modeKey = tour.gameMode === 'sealed' ? 'sealed' : tour.gameMode === 'restricted' ? 'modeRestricted' : 'classic';
  const myParticipant = tour.participants.find(p => p.userId === userId);
  const myDeckValid = (myParticipant as any)?.deckValid ?? false;
  const myDeckId = (myParticipant as any)?.deckId ?? null;
  const needsDeck = isParticipant && tour.gameMode !== 'sealed' && tour.status === 'registration';
  const hasRestrictions = tour.gameMode === 'restricted' || (tour as any).bannedCardIds?.length > 0;

  return (
    <div id="main-content" className="min-h-screen relative flex flex-col" style={{ backgroundColor: '#0a0a0a' }}>
      <CloudBackground animated={animationsEnabled} />
      <DecorativeIcons animated={animationsEnabled} />
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="max-w-4xl mx-auto relative z-10 flex-1 w-full px-4 py-8">

        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="mb-6">
          <h1 className="text-2xl font-bold uppercase tracking-wider mb-2" style={{ color: '#c4a35a' }}>{tour.name}</h1>
          <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: '#888888' }}>
            <span className="px-2 py-1 uppercase tracking-wider" style={{ backgroundColor: 'rgba(196, 163, 90, 0.1)', border: '1px solid rgba(196, 163, 90, 0.2)', color: '#c4a35a' }}>{tour.type === 'simulator' ? t('typeSimulator') : t('typePlayer')}</span>
            <span className="px-2 py-1 uppercase tracking-wider" style={{ backgroundColor: '#111111', border: '1px solid #262626', color: '#e0e0e0' }}>{t(statusKey)}</span>
            <span style={{ color: '#666666' }}>{t(modeKey)}</span>
            <span style={{ color: '#666666' }}>{t('players')}: {tour.participants.length}/{tour.maxPlayers}</span>
            <span style={{ color: '#666666' }}>{t('createdBy')}: {tour.creatorUsername}</span>
          </div>
          {tour.allowedLeagues && tour.allowedLeagues.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span style={{ color: '#888' }}>{t('allowedLeagues')}:</span>
              {tour.allowedLeagues.map(leagueKey => (
                <span key={leagueKey} className="px-2 py-0.5 uppercase tracking-wider" style={{ backgroundColor: '#1a1a1a', border: '1px solid #333', color: '#ccc' }}>{t(`leagueName.${leagueKey}`)}</span>
              ))}
            </div>
          )}
        </motion.div>

        {/* Share button */}
        <div className="mb-4 flex gap-2">
          <button onClick={handleShare} className="px-4 py-1.5 text-xs font-medium uppercase tracking-wider cursor-pointer transition-colors"
            style={{ backgroundColor: linkCopied ? '#1a3a1a' : '#1a1a1a', border: `1px solid ${linkCopied ? '#4ade80' : '#333'}`, color: linkCopied ? '#4ade80' : '#888' }}>
            {linkCopied ? t('copied') : t('share')}
          </button>
        </div>

        {/* Rules section */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}
          className="mb-4 p-4" style={{ backgroundColor: '#111111', border: '1px solid #262626', borderLeft: '3px solid rgba(196, 163, 90, 0.3)' }}>
          <h2 className="text-sm font-medium uppercase tracking-wider mb-3" style={{ color: '#c4a35a' }}>{t('rulesTitle')}</h2>
          <div className="flex flex-col gap-1.5 text-xs" style={{ color: '#aaa' }}>
            <p>{t('rulesFormat')}</p>
            {tour.gameMode === 'classic' && <p>{t('rulesClassic')}</p>}
            {tour.gameMode === 'sealed' && <p>{t('rulesSealed')}</p>}
            {tour.gameMode === 'restricted' && <p>{t('rulesRestricted')}</p>}
            {tour.gameMode !== 'sealed' && <p>{t('rulesDeck')}</p>}
            <p>{t('rulesMatch')}</p>
            <p>{t('rulesAbsence')}</p>
            <p>{t('rulesEdge')}</p>
          </div>
        </motion.div>

        {/* Restrictions display */}
        {hasRestrictions && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}
            className="mb-4 p-4" style={{ backgroundColor: '#111111', border: '1px solid #262626', borderLeft: '3px solid #ef4444' }}>
            <h2 className="text-sm font-medium uppercase tracking-wider mb-3" style={{ color: '#ef4444' }}>{t('restrictions')}</h2>
            <div className="flex flex-col gap-2 text-xs" style={{ color: '#ccc' }}>
              {(tour as any).allowedGroups?.length > 0 && (
                <div><span style={{ color: '#888' }}>{t('allowedGroups')}:</span> <span style={{ color: '#4ade80' }}>{(tour as any).allowedGroups.join(', ')}</span></div>
              )}
              {(tour as any).bannedGroups?.length > 0 && (
                <div><span style={{ color: '#888' }}>{t('bannedGroups')}:</span> <span style={{ color: '#f87171' }}>{(tour as any).bannedGroups.join(', ')}</span></div>
              )}
              {(tour as any).allowedKeywords?.length > 0 && (
                <div><span style={{ color: '#888' }}>{t('allowedKeywords')}:</span> <span style={{ color: '#4ade80' }}>{(tour as any).allowedKeywords.join(', ')}</span></div>
              )}
              {(tour as any).bannedKeywords?.length > 0 && (
                <div><span style={{ color: '#888' }}>{t('bannedKeywords')}:</span> <span style={{ color: '#f87171' }}>{(tour as any).bannedKeywords.join(', ')}</span></div>
              )}
              {(tour as any).allowedRarities?.length > 0 && (
                <div><span style={{ color: '#888' }}>{t('allowedRarities')}:</span> <span style={{ color: '#4ade80' }}>{(tour as any).allowedRarities.join(', ')}</span></div>
              )}
              {(tour as any).bannedRarities?.length > 0 && (
                <div><span style={{ color: '#888' }}>{t('bannedRarities')}:</span> <span style={{ color: '#f87171' }}>{(tour as any).bannedRarities.join(', ')}</span></div>
              )}
              {(tour as any).maxPerRarity && Object.keys((tour as any).maxPerRarity).length > 0 && (
                <div><span style={{ color: '#888' }}>{t('maxPerRarity')}:</span> {Object.entries((tour as any).maxPerRarity).map(([r, v]) => <span key={r} className="ml-1" style={{ color: '#c4a35a' }}>{r}: {String(v)}</span>)}</div>
              )}
              {(tour as any).maxCopiesPerCard != null && <div><span style={{ color: '#888' }}>{t('maxCopiesPerCard')}:</span> <span style={{ color: '#c4a35a' }}>{(tour as any).maxCopiesPerCard}</span></div>}
              {(tour as any).maxChakraCost != null && <div><span style={{ color: '#888' }}>{t('maxChakraCostLabel')}:</span> <span style={{ color: '#c4a35a' }}>{(tour as any).maxChakraCost}</span></div>}
              {(tour as any).minDeckSize != null && <div><span style={{ color: '#888' }}>{t('minDeckSizeLabel')}:</span> <span style={{ color: '#c4a35a' }}>{(tour as any).minDeckSize}</span></div>}
              {(tour as any).maxDeckSize != null && <div><span style={{ color: '#888' }}>{t('maxDeckSizeLabel')}:</span> <span style={{ color: '#c4a35a' }}>{(tour as any).maxDeckSize}</span></div>}
              {(tour as any).bannedCardIds?.length > 0 && (
                <div><span style={{ color: '#888' }}>{t('bannedCards')}:</span> <span style={{ color: '#f87171' }}>{(tour as any).bannedCardIds.join(', ')}</span></div>
              )}
              {(tour as any).restrictionNote && (
                <div className="mt-1 p-2" style={{ backgroundColor: '#0d0d0d', border: '1px solid #333' }}>
                  <span style={{ color: '#c4a35a' }}>{(tour as any).restrictionNote}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Deck selection (registration phase, non-sealed) */}
        {needsDeck && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.25 }}
            className="mb-4 p-4" style={{ backgroundColor: '#111111', border: `1px solid ${myDeckId && myDeckValid ? '#333' : '#ef4444'}`, borderLeft: `3px solid ${myDeckId && myDeckValid ? '#4ade80' : '#ef4444'}` }}>
            <h2 className="text-sm font-medium uppercase tracking-wider mb-2" style={{ color: myDeckId && myDeckValid ? '#4ade80' : '#ef4444' }}>
              {t('selectDeck')}
            </h2>
            <p className="text-xs mb-3" style={{ color: '#888' }}>{t('selectDeckHint')}</p>
            {/* Show tournament restrictions inline so player knows what their deck must respect */}
            {((tour as any).allowedGroups?.length > 0 || (tour as any).allowedKeywords?.length > 0 || (tour as any).bannedRarities?.length > 0 || (tour as any).bannedCardIds?.length > 0 || (tour as any).maxCopiesPerCard || (tour as any).restrictionNote) && (
              <div className="mb-3 p-2 text-xs" style={{ backgroundColor: 'rgba(196, 163, 90, 0.05)', border: '1px solid rgba(196, 163, 90, 0.2)' }}>
                <p className="font-medium mb-1" style={{ color: '#c4a35a' }}>{t('restrictions')}:</p>
                {(tour as any).allowedGroups?.length > 0 && <p style={{ color: '#999' }}>{t('allowedGroups')}: <span style={{ color: '#4ade80' }}>{(tour as any).allowedGroups.join(', ')}</span></p>}
                {(tour as any).allowedKeywords?.length > 0 && <p style={{ color: '#999' }}>{t('allowedKeywords')}: <span style={{ color: '#4ade80' }}>{(tour as any).allowedKeywords.join(', ')}</span></p>}
                {(tour as any).bannedRarities?.length > 0 && <p style={{ color: '#999' }}>{t('bannedRarities')}: <span style={{ color: '#f87171' }}>{(tour as any).bannedRarities.join(', ')}</span></p>}
                {(tour as any).bannedCardIds?.length > 0 && <p style={{ color: '#999' }}>{t('bannedCards')}: <span style={{ color: '#f87171' }}>{(tour as any).bannedCardIds.join(', ')}</span></p>}
                {(tour as any).maxCopiesPerCard && <p style={{ color: '#999' }}>{t('maxCopies')}: <span style={{ color: '#c4a35a' }}>{(tour as any).maxCopiesPerCard}</span></p>}
                {(tour as any).restrictionNote && <p style={{ color: '#c4a35a' }}>{(tour as any).restrictionNote}</p>}
              </div>
            )}
            {myDeckId && (
              <p className="text-xs mb-2" style={{ color: myDeckValid ? '#4ade80' : '#f87171' }}>
                {myDeckValid ? t('deckValid') : t('deckInvalid')}
              </p>
            )}
            {deckErrors.length > 0 && (
              <div className="mb-3 p-2 text-xs" style={{ backgroundColor: 'rgba(204, 68, 68, 0.1)', border: '1px solid rgba(204, 68, 68, 0.3)', color: '#f87171' }}>
                <p className="font-medium mb-1">{t('deckErrors')}:</p>
                {deckErrors.map((err, i) => <p key={i}>- {err}</p>)}
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              {myDecks.map(deck => (
                <button key={deck.id} onClick={() => handleSelectDeck(deck.id)} disabled={deckLoading}
                  className="flex items-center justify-between px-3 py-2 text-xs cursor-pointer transition-colors"
                  style={{
                    backgroundColor: selectedDeckId === deck.id ? 'rgba(196, 163, 90, 0.1)' : '#0d0d0d',
                    border: `1px solid ${selectedDeckId === deck.id ? '#c4a35a' : '#333'}`,
                    color: selectedDeckId === deck.id ? '#c4a35a' : '#ccc',
                  }}>
                  <span>{deck.name}</span>
                  {selectedDeckId === deck.id && <span style={{ color: myDeckValid ? '#4ade80' : '#f87171' }}>{myDeckValid ? t('deckValid') : t('deckInvalid')}</span>}
                </button>
              ))}
              {myDecks.length === 0 && (
                <p className="text-xs" style={{ color: '#666' }}>
                  <Link href={'/deck-builder' as '/'} style={{ color: '#c4a35a' }}>{t('noDeckWarning')}</Link>
                </p>
              )}
            </div>
          </motion.div>
        )}

        {error && <div className="mb-4 p-3 text-xs" style={{ backgroundColor: 'rgba(204, 68, 68, 0.1)', border: '1px solid rgba(204, 68, 68, 0.3)', color: '#cc4444' }}>{error}</div>}
        {myAbsenceDeadline && (<motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-4"><AbsenceTimer deadline={myAbsenceDeadline} onExpired={() => fetchTournament(tournamentId)} /></motion.div>)}

        {/* Registration */}
        {tour.status === 'registration' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
            {/* Participant list */}
            <div className="mb-4 p-4" style={{ backgroundColor: '#111111', border: '1px solid #262626' }}>
              <h2 className="text-sm font-medium uppercase tracking-wider mb-3" style={{ color: '#c4a35a' }}>{t('players')} ({tour.participants.length}/{tour.maxPlayers})</h2>
              {tour.participants.length === 0 ? (
                <p className="text-xs" style={{ color: '#666666' }}>{t('registrationOpen')}</p>
              ) : (
                <div className="space-y-1">
                  {tour.participants.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 px-2 py-1 text-sm" style={{ color: '#e0e0e0' }}>
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#c4a35a' }} />
                      {p.username}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Join / Leave section */}
            <div className="mb-4">
              {!isParticipant ? (
                <div className="p-4" style={{ backgroundColor: '#111111', border: '1px solid #262626' }}>
                  {/* Discord recommendation popup */}
                  {discordPopupType && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }} onClick={() => setDiscordPopupType(null)}>
                      <div className="max-w-sm w-full mx-4 p-5" style={{ backgroundColor: '#111', border: '1px solid #333' }} onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(88, 101, 242, 0.15)', border: '2px solid rgba(88, 101, 242, 0.4)' }}>
                            <span className="text-lg font-bold" style={{ color: '#5865F2' }}>D</span>
                          </div>
                          <p className="text-sm font-medium" style={{ color: '#ddd' }}>
                            {discordPopupType === 'not-linked' ? t('discordPopupTitleNotLinked') : t('discordPopupTitleNotInServer')}
                          </p>
                        </div>
                        <p className="text-xs mb-4 leading-relaxed" style={{ color: '#999' }}>
                          {discordPopupType === 'not-linked' ? t('discordPopupDescNotLinked') : t('discordPopupDescNotInServer')}
                        </p>
                        <div className="flex flex-col gap-2">
                          {discordPopupType === 'not-linked' ? (
                            <Link href={'/settings' as '/'} className="w-full px-4 py-2 text-xs font-medium uppercase tracking-wider text-center transition-colors"
                              style={{ backgroundColor: 'rgba(88, 101, 242, 0.15)', border: '1px solid rgba(88, 101, 242, 0.4)', color: '#5865F2' }}>
                              {t('discordLinkAccount')}
                            </Link>
                          ) : (
                            <a href="https://discord.gg/narutomythos" target="_blank" rel="noopener noreferrer"
                              className="w-full px-4 py-2 text-xs font-medium uppercase tracking-wider text-center transition-colors block"
                              style={{ backgroundColor: 'rgba(88, 101, 242, 0.15)', border: '1px solid rgba(88, 101, 242, 0.4)', color: '#5865F2' }}>
                              {t('discordJoinServer')}
                            </a>
                          )}
                          <button onClick={() => { setDiscordPopupType(null); doJoin(); }}
                            className="w-full px-4 py-2 text-xs font-medium uppercase tracking-wider cursor-pointer transition-colors"
                            style={{ backgroundColor: 'rgba(196, 163, 90, 0.08)', border: '1px solid rgba(196, 163, 90, 0.2)', color: '#888' }}>
                            {t('discordContinueWithout')}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-3">
                    {/* Private tournament: code input */}
                    {!tour.isPublic && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] uppercase tracking-wider" style={{ color: '#888' }}>{t('enterCode')}</label>
                        <div className="flex gap-2">
                          <input type="text" value={joinCodeInput} onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                            placeholder="XXXXXX" maxLength={8}
                            className="flex-1 px-3 py-2 text-sm font-mono text-center uppercase tracking-widest"
                            style={{ backgroundColor: '#0a0a0a', border: '1px solid #333', color: '#c4a35a' }}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleJoin(); }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Join button */}
                    <button onClick={handleJoin}
                      disabled={tour.participants.length >= tour.maxPlayers || (!tour.isPublic && !joinCodeInput.trim())}
                      className="w-full px-5 py-2.5 text-sm font-medium uppercase tracking-wider cursor-pointer transition-colors disabled:opacity-40"
                      style={{ backgroundColor: 'rgba(196, 163, 90, 0.1)', border: '1px solid rgba(196, 163, 90, 0.3)', color: '#c4a35a' }}>
                      {t('join')}
                    </button>

                    {/* Join error */}
                    {joinError && (
                      <p className="text-xs px-2 py-1.5" style={{ backgroundColor: 'rgba(204, 68, 68, 0.1)', border: '1px solid rgba(204, 68, 68, 0.3)', color: '#f87171' }}>
                        {joinError}
                      </p>
                    )}

                    {tour.participants.length >= tour.maxPlayers && (
                      <p className="text-xs text-center" style={{ color: '#888' }}>{t('full')}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button onClick={handleLeave} className="px-5 py-2.5 text-sm font-medium uppercase tracking-wider cursor-pointer transition-colors"
                    style={{ backgroundColor: 'rgba(204, 68, 68, 0.08)', border: '1px solid rgba(204, 68, 68, 0.3)', color: '#cc4444' }}>
                    {t('leave')}
                  </button>
                </div>
              )}
            </div>

            {/* Show join code only to creator/admin for private tournaments */}
            {(isAdmin || isCreator) && !tour.isPublic && tour.joinCode && (
              <div className="mb-4 p-3 flex items-center gap-3" style={{ backgroundColor: '#111', border: '1px solid #333' }}>
                <span className="text-[10px] uppercase tracking-wider" style={{ color: '#888' }}>{t('codeLabel')}:</span>
                <span className="text-sm font-mono tracking-widest" style={{ color: '#c4a35a' }}>{tour.joinCode}</span>
              </div>
            )}

            {(isAdmin || isCreator) && <TournamentAdmin tournamentId={tournamentId} isAdmin={isAdmin} isCreator={isCreator} />}
          </motion.div>
        )}

        {/* In progress */}
        {tour.status === 'in_progress' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
            {myMatch && (
              <div className="mb-6 p-4" style={{ backgroundColor: '#111111', border: '1px solid rgba(196, 163, 90, 0.3)' }}>
                <h2 className="text-sm font-medium uppercase tracking-wider mb-3" style={{ color: '#c4a35a' }}>{t('yourMatchReady')}</h2>
                <p className="text-xs mb-3" style={{ color: '#e0e0e0' }}>{myMatch.player1Username ?? t('tbd')} vs {myMatch.player2Username ?? t('tbd')}</p>
                {myMatch.status === 'ready' && myMatch.roomCode && (
                  <Link href={('/play/online?code=' + myMatch.roomCode) as '/'} onClick={handlePlayMatch} className="inline-block px-5 py-2.5 text-sm font-medium uppercase tracking-wider transition-colors" style={{ backgroundColor: 'rgba(196, 163, 90, 0.15)', border: '1px solid rgba(196, 163, 90, 0.4)', color: '#c4a35a' }}>{t('playMatch')}</Link>
                )}
                {myMatch.status === 'pending' && <p className="text-xs" style={{ color: '#888888' }}>{t('waitingOpponent')}</p>}
              </div>
            )}
            <div className="p-4 overflow-x-auto" style={{ backgroundColor: '#111111', border: '1px solid #262626' }}>
              <h2 className="text-sm font-medium uppercase tracking-wider mb-4" style={{ color: '#c4a35a' }}>{t('bracket')}</h2>
              <BracketTree matches={tour.matches} totalRounds={tour.totalRounds} currentRound={tour.currentRound} winnerId={tour.winnerId} winnerUsername={tour.winnerUsername} />
            </div>
            {(isAdmin || isCreator) && <div className="mt-4"><TournamentAdmin tournamentId={tournamentId} isAdmin={isAdmin} isCreator={isCreator} /></div>}
          </motion.div>
        )}

        {/* Completed */}
        {tour.status === 'completed' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
            <TournamentResults tournament={tour} />
            <div className="mt-6 p-4 overflow-x-auto" style={{ backgroundColor: '#111111', border: '1px solid #262626' }}>
              <h2 className="text-sm font-medium uppercase tracking-wider mb-4" style={{ color: '#c4a35a' }}>{t('bracket')}</h2>
              <BracketTree matches={tour.matches} totalRounds={tour.totalRounds} currentRound={tour.currentRound} winnerId={tour.winnerId} winnerUsername={tour.winnerUsername} />
            </div>
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.4 }} className="mt-8 text-center">
          <Link href={'/tournaments' as '/'} className="text-sm transition-colors" style={{ color: '#888888' }}>{'<'} {t('backToList')}</Link>
        </motion.div>
      </motion.div>
      <Footer />
    </div>
  );
}
