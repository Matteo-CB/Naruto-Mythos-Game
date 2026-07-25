'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import { useGameStore } from '@/stores/gameStore';
import { useUIStore } from '@/stores/uiStore';
import { useSocketStore } from '@/lib/socket/client';
import { Link, useRouter } from '@/lib/i18n/navigation';
import { EloBadge, PLACEMENT_MATCHES_REQUIRED } from '@/components/EloBadge';
import {
  PopupOverlay,
  PopupCornerFrame,
  PopupTitle,
  PopupActionButton,
  PopupDismissLink,
  PopupMinimizeX,
  PopupMinimizePill,
  SectionDivider,
} from './PopupPrimitives';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function GameEndScreen() {
  const t = useTranslations();
  const router = useRouter();
  const { data: session } = useSession();
  const gameOver = useGameStore((s) => s.gameOver);
  const winner = useGameStore((s) => s.winner);
  const visibleState = useGameStore((s) => s.visibleState);
  const isOnlineGame = useGameStore((s) => s.isOnlineGame);
  const isAIGame = useGameStore((s) => s.isAIGame);
  const gameState = useGameStore((s) => s.gameState);
  const playerDisplayNames = useGameStore((s) => s.playerDisplayNames);
  const resetGame = useGameStore((s) => s.resetGame);
  const replayInitialState = useGameStore((s) => s.replayInitialState);
  const gameResult = useSocketStore((s) => s.gameResult);
  const rematchState = useSocketStore((s) => s.rematchState);
  const offerRematch = useSocketStore((s) => s.offerRematch);
  const acceptRematch = useSocketStore((s) => s.acceptRematch);
  const declineRematch = useSocketStore((s) => s.declineRematch);
  const gameEndMinimized = useUIStore((s) => s.gameEndMinimized);
  const minimizeGameEnd = useUIStore((s) => s.minimizeGameEnd);
  const restoreGameEnd = useUIStore((s) => s.restoreGameEnd);

  const handleChangeDeck = useCallback(() => {
    resetGame();
    router.push('/play/ai');
  }, [resetGame, router]);

  const tournamentId = gameResult?.tournamentId;
  const tournamentRedirectRef = useRef(false);
  useEffect(() => {
    if (tournamentId && gameOver && !tournamentRedirectRef.current) {
      tournamentRedirectRef.current = true;
      const timer = setTimeout(() => {
        resetGame();
        router.push(`/tournaments/${tournamentId}`);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [tournamentId, gameOver, resetGame, router]);

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedGameId, setSavedGameId] = useState<string | null>(null);
  const autoSaveAttempted = useRef(false);
  const [leaguesEnabled, setLeaguesEnabled] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => setLeaguesEnabled(data.leaguesEnabled ?? false))
      .catch(() => {});
  }, []);

  const handleSaveReplay = useCallback(async () => {
    if (saveState === 'saving' || saveState === 'saved') return;
    setSaveState('saving');

    try {
      if (isAIGame && gameState) {
        const aiDifficulty = gameState.player2.isAI
          ? gameState.player2.aiDifficulty
          : gameState.player1.aiDifficulty;

        const createRes = await fetch('/api/game', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isAiGame: true, aiDifficulty: aiDifficulty ?? 'medium' }),
        });
        if (!createRes.ok) throw new Error('Failed to create game');
        const game = await createRes.json();

        const completeRes = await fetch('/api/game', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: game.id,
            winnerId: winner === 'player1' ? session?.user?.id : null,
            player1Score: gameState.player1.missionPoints,
            player2Score: gameState.player2.missionPoints,
          }),
        });
        if (!completeRes.ok) throw new Error('Failed to save game');

        setSavedGameId(game.id);
        setSaveState('saved');
      } else if (isOnlineGame && gameResult?.gameId && gameResult?.replayData) {
        const res = await fetch(`/api/game/${gameResult.gameId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameState: gameResult.replayData }),
        });
        if (!res.ok) throw new Error('Failed to save replay');

        setSavedGameId(gameResult.gameId);
        setSaveState('saved');
      } else {
        throw new Error('No replay data available');
      }
    } catch {
      setSaveState('error');
    }
  }, [saveState, isAIGame, isOnlineGame, gameState, gameResult, playerDisplayNames, winner, session?.user?.id, replayInitialState]);

  useEffect(() => {
    if (!gameOver || autoSaveAttempted.current) return;
    const isLoggedIn = !!session?.user?.id;
    const hasReplayData = isAIGame
      ? !!gameState?.log?.length
      : !!(gameResult?.gameId && gameResult?.replayData);
    if (isLoggedIn && hasReplayData) {
      autoSaveAttempted.current = true;
      handleSaveReplay();
    }
  }, [gameOver, session?.user?.id, isAIGame, gameState, gameResult, handleSaveReplay]);

  if (!gameOver || !visibleState) return null;

  const isRanked = isOnlineGame && gameResult?.isRanked;
  const isEvolving = isOnlineGame && gameResult?.isEvolving;
  const eloDelta = gameResult?.eloDelta;
  const newElo = gameResult?.newElo;
  const totalGames = gameResult?.totalGames;
  const winReason = gameResult?.winReason;
  const perfBonus = gameResult?.performanceBonus ?? null;
  const isPlacement = totalGames !== undefined && totalGames < PLACEMENT_MATCHES_REQUIRED;
  const justBecameRanked = totalGames !== undefined && totalGames === PLACEMENT_MATCHES_REQUIRED;

  const myPlayer = visibleState.myPlayer;
  const playerWon = winner === myPlayer;
  const isDraw = winner === null;
  const isForfeit = winReason === 'forfeit' || winReason === 'timeout' || winReason === 'clock' || winReason === 'idle' || winReason === 'disconnect';
  const tOr = (key: string, fallbackKey: string) => (t.has(key) ? t(key) : t(fallbackKey));

  const myScore = visibleState.myState.missionPoints;
  const oppScore = visibleState.opponentState.missionPoints;

  const forfeitedByMe = isForfeit && visibleState.forfeitedBy === myPlayer;

  let headingText: string;
  let headingColor: string;
  if (isForfeit) {
    if (forfeitedByMe) {
      if (winReason === 'clock') headingText = t('game.end.youLostOnClock');
      else if (winReason === 'disconnect') headingText = tOr('game.end.youLostByDisconnect', 'game.end.youAbandoned');
      else if (winReason === 'idle') headingText = t('game.end.youLostByIdle');
      else if (winReason === 'timeout') headingText = t('game.end.youTimedOut');
      else headingText = t('game.end.youAbandoned');
      headingColor = '#b33e3e';
    } else {
      if (winReason === 'clock') headingText = t('game.end.opponentLostOnClock');
      else if (winReason === 'disconnect') headingText = tOr('game.end.opponentLostByDisconnect', 'game.end.opponentAbandoned');
      else if (winReason === 'idle') headingText = t('game.end.opponentLostByIdle');
      else if (winReason === 'timeout') headingText = t('game.end.opponentTimedOut');
      else headingText = t('game.end.opponentAbandoned');
      headingColor = '#c4a35a';
    }
  } else if (isDraw) {
    headingText = t('game.end.draw');
    headingColor = '#888888';
  } else if (playerWon) {
    headingText = t('game.end.victory');
    headingColor = '#c4a35a';
  } else {
    headingText = t('game.end.defeat');
    headingColor = '#b33e3e';
  }

  if (gameEndMinimized) {
    return (
      <PopupMinimizePill
        text={`${headingText} ${myScore}-${oppScore}`}
        onRestore={restoreGameEnd}
      />
    );
  }

  return (
    <AnimatePresence>
      <PopupOverlay>
        <PopupCornerFrame
          accentColor={`${headingColor}60`}
          maxWidth="520px"
          padding="40px 32px"
        >
          <PopupMinimizeX onClick={minimizeGameEnd} />

          <PopupTitle accentColor={headingColor} size="xl">
            {headingText}
          </PopupTitle>

          {isForfeit && !forfeitedByMe && !isDraw && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-center text-xs mb-4"
              style={{ color: '#c4a35a', letterSpacing: '0.08em' }}
            >
              {t('game.end.opponentForfeitSubtitle')}
            </motion.div>
          )}

          {isForfeit && forfeitedByMe && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-center text-xs mb-4"
              style={{ color: '#888888', letterSpacing: '0.08em' }}
            >
              {t('game.end.youForfeitSubtitle')}
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="flex items-center justify-center gap-8 mb-6"
          >
            
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm" style={{ color: '#888888' }}>
                {t('game.you')}
              </span>
              <motion.span
                className="text-4xl font-bold tabular-nums"
                style={{ color: '#c4a35a' }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 1.0, type: 'spring', stiffness: 200 }}
              >
                {myScore}
              </motion.span>
              <span className="text-xs" style={{ color: '#888888' }}>
                {t('game.score')}
              </span>
            </div>

            <div
              style={{
                width: '1px',
                height: '48px',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
              }}
            />

            <div className="flex flex-col items-center gap-1">
              <span className="text-sm" style={{ color: '#888888' }}>
                {t('game.opponent')}
              </span>
              <motion.span
                className="text-4xl font-bold tabular-nums"
                style={{ color: '#b33e3e' }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 1.2, type: 'spring', stiffness: 200 }}
              >
                {oppScore}
              </motion.span>
              <span className="text-xs" style={{ color: '#888888' }}>
                {t('game.score')}
              </span>
            </div>
          </motion.div>

          {isDraw && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.4 }}
              className="text-xs text-center block mb-4"
              style={{ color: '#888888' }}
            >
              {t('game.end.tieBreaker')}
            </motion.span>
          )}

          {isRanked && eloDelta != null && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.4 }}
              className="flex flex-col items-center gap-2 mb-4"
            >
              <span className="text-xs uppercase tracking-wider" style={{ color: '#888888' }}>
                {isEvolving ? t('game.end.evolvingMatch') : t('game.end.rankedMatch')}
              </span>
              <span
                className="text-lg font-bold tabular-nums"
                style={{ color: eloDelta >= 0 ? '#4a9e4a' : '#b33e3e' }}
              >
                {eloDelta >= 0 ? '+' : ''}{eloDelta} ELO
              </span>

              {perfBonus && perfBonus.applied && perfBonus.total > 0 && playerWon && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.6 }}
                  className="flex flex-col items-center gap-1 mt-1"
                  style={{
                    backgroundColor: 'rgba(74, 158, 74, 0.08)',
                    padding: '8px 14px',
                    minWidth: '220px',
                  }}
                >
                  <span
                    className="text-[10px] uppercase tracking-wider"
                    style={{ color: '#4a9e4a' }}
                  >
                    {t('game.end.performanceBonus')}
                    {' '}
                    <span className="font-bold tabular-nums">+{perfBonus.total} ELO</span>
                  </span>
                  {perfBonus.forfeitBonus > 0 && (
                    <span className="text-[10px]" style={{ color: '#888888' }}>
                      {t('game.end.forfeitBonus', { bonus: perfBonus.forfeitBonus })}
                    </span>
                  )}
                  {perfBonus.scoreBonus > 0 && (
                    <span className="text-[10px]" style={{ color: '#888888' }}>
                      {t('game.end.scoreGapBonus', { gap: perfBonus.scoreGap, bonus: perfBonus.scoreBonus })}
                    </span>
                  )}
                  {perfBonus.boardBonus > 0 && (
                    <span className="text-[10px]" style={{ color: '#888888' }}>
                      {t('game.end.boardPressureBonus', { count: perfBonus.loserBoardCount, bonus: perfBonus.boardBonus })}
                    </span>
                  )}
                </motion.div>
              )}

              {leaguesEnabled && newElo !== undefined && (
                <div className="flex flex-col items-center gap-2 mt-1">
                  <EloBadge elo={newElo} size="md" showElo totalGames={totalGames} />
                </div>
              )}

              {leaguesEnabled && isPlacement && totalGames !== undefined && (
                <div className="flex flex-col items-center gap-1 mt-1">
                  <span className="text-xs" style={{ color: '#999' }}>
                    {t('game.end.placementMatch', { current: totalGames, total: PLACEMENT_MATCHES_REQUIRED })}
                  </span>
                  <div
                    className="overflow-hidden"
                    style={{ width: '120px', height: '4px', backgroundColor: 'rgba(255,255,255,0.08)' }}
                  >
                    <div
                      className="h-full"
                      style={{
                        width: `${(totalGames / PLACEMENT_MATCHES_REQUIRED) * 100}%`,
                        backgroundColor: '#666',
                        transition: 'width 0.5s ease',
                      }}
                    />
                  </div>
                </div>
              )}

              {leaguesEnabled && justBecameRanked && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 2.0, type: 'spring' }}
                  className="text-sm font-bold uppercase tracking-wider mt-1"
                  style={{ color: '#c4a35a' }}
                >
                  {t('game.end.nowRanked')}
                </motion.span>
              )}
            </motion.div>
          )}

          <SectionDivider color="rgba(255, 255, 255, 0.06)" width={100} />

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.6 }}
            className="flex flex-col items-center gap-3 mt-4"
          >
            
            {saveState === 'saving' && (
              <span className="text-xs" style={{ color: '#888888' }}>
                {t('game.end.savingReplay')}
              </span>
            )}
            {saveState === 'error' && (
              <span className="text-xs" style={{ color: '#b33e3e' }}>
                {t('game.end.saveError')}
              </span>
            )}

            {saveState === 'saved' && savedGameId && (
              <>
                <span className="text-xs" style={{ color: '#4a9e4a' }}>
                  {t('game.end.replaySaved')}
                </span>
                <Link
                  href={`/replay/${savedGameId}`}
                  className="uppercase tracking-wider text-center text-sm font-bold no-underline"
                  style={{
                    padding: '10px 28px',
                    backgroundColor: 'rgba(74, 158, 74, 0.12)',
                    color: '#4a9e4a',
                    transform: 'skewX(-3deg)',
                    display: 'inline-block',
                    letterSpacing: '0.12em',
                  }}
                >
                  <span style={{ display: 'inline-block', transform: 'skewX(3deg)' }}>
                    {t('game.end.watchReplay')}
                  </span>
                </Link>
              </>
            )}

            {tournamentId ? (
              <PopupActionButton
                onClick={() => { resetGame(); router.push(`/tournaments/${tournamentId}`); }}
                accentColor="#c4a35a"
              >
                {t('game.end.backToTournament')}
              </PopupActionButton>
            ) : (
              <>
                
                {isAIGame && (
                  <PopupActionButton onClick={handleChangeDeck} accentColor="#c4a35a">
                    {t('game.end.rematch')}
                  </PopupActionButton>
                )}

                {isOnlineGame && rematchState === 'none' && (
                  <PopupActionButton onClick={offerRematch} accentColor="#c4a35a">
                    {t('game.end.rematch')}
                  </PopupActionButton>
                )}

                {isOnlineGame && rematchState === 'offered' && (
                  <span className="text-xs" style={{ color: '#c4a35a' }}>
                    {t('game.end.rematchWaiting')}
                  </span>
                )}

                {isOnlineGame && rematchState === 'received' && (
                  <div className="flex gap-3">
                    <PopupActionButton onClick={acceptRematch} accentColor="#4a9e4a">
                      {t('game.end.rematchAccept')}
                    </PopupActionButton>
                    <PopupActionButton onClick={declineRematch} accentColor="#b33e3e">
                      {t('game.end.rematchDecline')}
                    </PopupActionButton>
                  </div>
                )}

                {isOnlineGame && rematchState === 'declined' && (
                  <span className="text-xs" style={{ color: '#b33e3e' }}>
                    {t('game.end.rematchDeclined')}
                  </span>
                )}

                <PopupActionButton onClick={resetGame} accentColor="#c4a35a">
                  {t('game.end.backToMenu')}
                </PopupActionButton>
              </>
            )}
          </motion.div>
        </PopupCornerFrame>
      </PopupOverlay>
    </AnimatePresence>
  );
}
