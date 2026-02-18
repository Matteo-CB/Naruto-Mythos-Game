'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useGameStore } from '@/stores/gameStore';
import { useUIStore } from '@/stores/uiStore';

export function ActionBar() {
  const t = useTranslations();
  const visibleState = useGameStore((s) => s.visibleState);
  const performAction = useGameStore((s) => s.performAction);
  const isProcessing = useGameStore((s) => s.isProcessing);

  const selectedCardIndex = useUIStore((s) => s.selectedCardIndex);
  const selectedMissionIndex = useUIStore((s) => s.selectedMissionIndex);
  const selectedTargetId = useUIStore((s) => s.selectedTargetId);
  const clearSelection = useUIStore((s) => s.clearSelection);

  if (!visibleState) return null;

  const {
    phase,
    activePlayer,
    myPlayer,
    myState,
  } = visibleState;

  const isMyTurn = activePlayer === myPlayer && !isProcessing;
  const isActionPhase = phase === 'action';
  const hasPassed = myState.hasPassed;

  // Determine available actions
  const hasCardSelected = selectedCardIndex !== null;
  const hasMissionSelected = selectedMissionIndex !== null;
  const hasTargetSelected = selectedTargetId !== null;
  const cardAndMissionReady = hasCardSelected && hasMissionSelected;

  // Get selected card info
  const selectedCard =
    hasCardSelected && selectedCardIndex < myState.hand.length
      ? myState.hand[selectedCardIndex]
      : null;

  const canAffordCard = selectedCard ? myState.chakra >= selectedCard.chakra : false;
  const canAffordHidden = myState.chakra >= 1;

  // Can reveal: need a hidden character selected as target
  const canReveal = isMyTurn && isActionPhase && hasTargetSelected && !hasPassed;

  // Determine chakra cost for reveal
  let revealCost = 0;
  if (hasTargetSelected && visibleState.activeMissions) {
    for (const m of visibleState.activeMissions) {
      const myChars =
        myPlayer === 'player1' ? m.player1Characters : m.player2Characters;
      const target = myChars.find((c) => c.instanceId === selectedTargetId);
      if (target && target.isHidden && target.card) {
        revealCost = target.card.chakra;
        break;
      }
    }
  }
  const canAffordReveal = myState.chakra >= revealCost;

  // Handlers
  const handlePlayVisible = () => {
    if (!cardAndMissionReady || !canAffordCard || !isMyTurn || hasPassed) return;
    performAction({
      type: 'PLAY_CHARACTER',
      cardIndex: selectedCardIndex!,
      missionIndex: selectedMissionIndex!,
      hidden: false,
    });
    clearSelection();
  };

  const handlePlayHidden = () => {
    if (!cardAndMissionReady || !canAffordHidden || !isMyTurn || hasPassed) return;
    performAction({
      type: 'PLAY_HIDDEN',
      cardIndex: selectedCardIndex!,
      missionIndex: selectedMissionIndex!,
    });
    clearSelection();
  };

  const handleReveal = () => {
    if (!canReveal || !canAffordReveal || !selectedTargetId) return;
    // Find which mission the target is on
    let targetMissionIndex = -1;
    if (visibleState.activeMissions) {
      for (let i = 0; i < visibleState.activeMissions.length; i++) {
        const m = visibleState.activeMissions[i];
        const myChars =
          myPlayer === 'player1' ? m.player1Characters : m.player2Characters;
        if (myChars.find((c) => c.instanceId === selectedTargetId)) {
          targetMissionIndex = i;
          break;
        }
      }
    }
    if (targetMissionIndex >= 0) {
      performAction({
        type: 'REVEAL_CHARACTER',
        missionIndex: targetMissionIndex,
        characterInstanceId: selectedTargetId,
      });
    }
    clearSelection();
  };

  const handlePass = () => {
    if (!isMyTurn || !isActionPhase || hasPassed) return;
    performAction({ type: 'PASS' });
    clearSelection();
  };

  const handleCancel = () => {
    clearSelection();
  };

  // Don't show during non-action phases (except a minimal display)
  if (!isActionPhase) {
    return (
      <div
        className="flex items-center justify-center py-1.5 px-4 rounded-full"
        style={{
          backgroundColor: 'rgba(10, 10, 14, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
        }}
      >
        <span className="text-xs" style={{ color: '#888888' }}>
          {phase === 'mulligan'
            ? t('game.mulligan.description')
            : phase === 'start'
              ? `${t('game.phase.start')}...`
              : phase === 'mission'
                ? `${t('game.phase.mission')}...`
                : phase === 'end'
                  ? `${t('game.phase.end')}...`
                  : ''}
        </span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="flex items-center justify-center gap-2 py-2 px-4 rounded-full"
      style={{
        backgroundColor: 'rgba(10, 10, 14, 0.85)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
      }}
    >
      {/* Status text */}
      {!isMyTurn && (
        <span className="text-xs" style={{ color: '#888888' }}>
          {t('game.opponentTurn')}
        </span>
      )}

      {isMyTurn && hasPassed && (
        <span className="text-xs" style={{ color: '#888888' }}>
          {t('game.processing')}
        </span>
      )}

      {isMyTurn && !hasPassed && (
        <>
          {/* Selection hint */}
          {!hasCardSelected && !hasTargetSelected && (
            <span className="text-xs" style={{ color: '#888888' }}>
              {t('game.selectTarget')}
            </span>
          )}

          {hasCardSelected && !hasMissionSelected && (
            <span className="text-xs" style={{ color: '#888888' }}>
              {t('game.selectMission')}
            </span>
          )}

          {/* Play visible button */}
          {cardAndMissionReady && (
            <ActionButton
              label={`${t('game.play')} (${selectedCard?.chakra ?? 0} ${t('game.chakra').toLowerCase()})`}
              onClick={handlePlayVisible}
              disabled={!canAffordCard}
              variant="primary"
            />
          )}

          {/* Play hidden button */}
          {cardAndMissionReady && (
            <ActionButton
              label={t('game.actions.playHiddenCharacter')}
              onClick={handlePlayHidden}
              disabled={!canAffordHidden}
              variant="secondary"
            />
          )}

          {/* Reveal button */}
          {canReveal && (
            <ActionButton
              label={`${t('game.reveal')} (${revealCost} ${t('game.chakra').toLowerCase()})`}
              onClick={handleReveal}
              disabled={!canAffordReveal}
              variant="primary"
            />
          )}

          {/* Cancel selection */}
          {(hasCardSelected || hasTargetSelected || hasMissionSelected) && (
            <ActionButton
              label={t('common.cancel')}
              onClick={handleCancel}
              disabled={false}
              variant="danger"
            />
          )}

          {/* Pass button */}
          <ActionButton
            label={t('game.pass')}
            onClick={handlePass}
            disabled={false}
            variant="muted"
          />
        </>
      )}
    </motion.div>
  );
}

// ----- Button sub-component -----

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'muted';

const variantStyles: Record<
  ButtonVariant,
  {
    bg: string;
    bgHover: string;
    border: string;
    text: string;
    textDisabled: string;
  }
> = {
  primary: {
    bg: '#c4a35a',
    bgHover: '#d4b36a',
    border: '#c4a35a',
    text: '#0a0a0a',
    textDisabled: '#555555',
  },
  secondary: {
    bg: 'rgba(196, 163, 90, 0.1)',
    bgHover: 'rgba(196, 163, 90, 0.18)',
    border: 'rgba(196, 163, 90, 0.4)',
    text: '#c4a35a',
    textDisabled: '#555555',
  },
  danger: {
    bg: 'rgba(179, 62, 62, 0.1)',
    bgHover: 'rgba(179, 62, 62, 0.18)',
    border: 'rgba(179, 62, 62, 0.4)',
    text: '#b33e3e',
    textDisabled: '#555555',
  },
  muted: {
    bg: 'rgba(255, 255, 255, 0.04)',
    bgHover: 'rgba(255, 255, 255, 0.08)',
    border: 'rgba(255, 255, 255, 0.1)',
    text: '#888888',
    textDisabled: '#444444',
  },
};

function ActionButton({
  label,
  onClick,
  disabled,
  variant,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  variant: ButtonVariant;
}) {
  const styles = variantStyles[variant];

  return (
    <motion.button
      whileHover={disabled ? {} : { scale: 1.04 }}
      whileTap={disabled ? {} : { scale: 0.96 }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="px-4 py-1.5 rounded-md text-xs font-medium cursor-pointer"
      style={{
        backgroundColor: disabled ? 'rgba(255, 255, 255, 0.02)' : styles.bg,
        border: `1px solid ${disabled ? 'rgba(255, 255, 255, 0.05)' : styles.border}`,
        color: disabled ? styles.textDisabled : styles.text,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: disabled ? 'none' : '0 2px 8px rgba(0, 0, 0, 0.3)',
      }}
    >
      {label}
    </motion.button>
  );
}
