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
import type { TournamentMatch } from '@/stores/tournamentStore';
import { LEAGUE_TIERS, getPlayerLeague } from '@/lib/tournament/leagueUtils';

const ADMIN_EMAILS = ['matteo.biyikli3224@gmail.com'];
const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Andy', 'Daiki0'];

export default function TournamentDetailPage() {
  const t = useTranslations('tournament');
  const tc = useTranslations('common');
  const router = useRouter();
  const params = useParams();
  const tournamentId = params?.id as string;
  const { data: session, status } = useSession();
  const { animationsEnabled } = useSettingsStore();
  const { socket } = useSocketStore();
  const { activeTournament, loading, error, fetchTournament, joinTournament, leaveTournament, clearActiveTournament, handleTournamentUpdate, handleMatchUpdate, handleTournamentComplete, handleRoundComplete, clearError } = useTournamentStore();

  const userId = (session?.user as { id?: string })?.id;
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
    socket.on('tournament:update', onU); socket.on('tournament:match-update', onM); socket.on('tournament:complete', onC); socket.on('tournament:round-complete', onR);
    return () => { socket.emit('tournament:unsubscribe', { tournamentId }); socket.off('tournament:update', onU); socket.off('tournament:match-update', onM); socket.off('tournament:complete', onC); socket.off('tournament:round-complete', onR); };
  }, [socket, tournamentId, handleTournamentUpdate, handleMatchUpdate, handleTournamentComplete, handleRoundComplete]);

  const handleJoin = useCallback(async () => { if (!tournamentId) return; clearError(); try { await joinTournament(tournamentId); fetchTournament(tournamentId); } catch { /* err in store */ } }, [tournamentId, joinTournament, fetchTournament, clearError]);
  const handleLeave = useCallback(async () => { if (!tournamentId) return; clearError(); try { await leaveTournament(tournamentId); fetchTournament(tournamentId); } catch { /* err in store */ } }, [tournamentId, leaveTournament, fetchTournament, clearError]);

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
  const modeKey = tour.gameMode === 'sealed' ? 'sealed' : 'classic';

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

        {error && <div className="mb-4 p-3 text-xs" style={{ backgroundColor: 'rgba(204, 68, 68, 0.1)', border: '1px solid rgba(204, 68, 68, 0.3)', color: '#cc4444' }}>{error}</div>}
        {myAbsenceDeadline && (<motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-4"><AbsenceTimer deadline={myAbsenceDeadline} onExpired={() => fetchTournament(tournamentId)} /></motion.div>)}

        {/* Registration */}
        {tour.status === 'registration' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
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
            <div className="flex gap-3 mb-4">
              {!isParticipant ? (
                <button onClick={handleJoin} disabled={tour.participants.length >= tour.maxPlayers} className="px-5 py-2.5 text-sm font-medium uppercase tracking-wider cursor-pointer transition-colors disabled:opacity-40" style={{ backgroundColor: 'rgba(196, 163, 90, 0.1)', border: '1px solid rgba(196, 163, 90, 0.3)', color: '#c4a35a' }}>{t('join')}</button>
              ) : (
                <button onClick={handleLeave} className="px-5 py-2.5 text-sm font-medium uppercase tracking-wider cursor-pointer transition-colors" style={{ backgroundColor: 'rgba(204, 68, 68, 0.08)', border: '1px solid rgba(204, 68, 68, 0.3)', color: '#cc4444' }}>{t('leave')}</button>
              )}
            </div>
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
                  <Link href={('/play/online?code=' + myMatch.roomCode) as '/'} className="inline-block px-5 py-2.5 text-sm font-medium uppercase tracking-wider transition-colors" style={{ backgroundColor: 'rgba(196, 163, 90, 0.15)', border: '1px solid rgba(196, 163, 90, 0.4)', color: '#c4a35a' }}>{t('playMatch')}</Link>
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
