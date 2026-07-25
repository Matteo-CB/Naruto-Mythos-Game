import type { PlayerID } from '@/lib/engine/types';

export interface IdlePendingAction {
  player: PlayerID;
  sourceEffectId?: string;
}

export interface IdlePendingEffect {
  id: string;
  resolved: boolean;
  selectingPlayer?: PlayerID | null;
  isOptional: boolean;
  isMandatory: boolean;
  rootOptional?: boolean;
}

export interface IdleStateView {
  phase: string;
  activePlayer: PlayerID;
  pendingForcedResolver?: PlayerID | null;
  pendingActions: IdlePendingAction[];
  pendingEffects: IdlePendingEffect[];
}

export interface IdleFlags {
  idleWarningUsed: boolean;
  disconnectVerified: boolean;
}

export type IdleDecision =
  | { kind: 'defeat'; reason: 'disconnect' | 'idle-second' | 'idle-mandatory' }
  | { kind: 'auto-decline'; pendingEffectId: string }
  | { kind: 'auto-pass' }
  | { kind: 'warn' }
  | { kind: 'unstick' };

export function isPendingEffectDeclinable(effect: {
  isOptional: boolean;
  isMandatory: boolean;
  rootOptional?: boolean;
}): boolean {
  if (effect.rootOptional) return true;
  if (effect.isOptional) return true;
  return !effect.isMandatory;
}

type NaturalResolution =
  | { kind: 'decline'; pendingEffectId: string }
  | { kind: 'pass' }
  | { kind: 'blocked' }
  | { kind: 'unhandled' };

function resolveNaturally(state: IdleStateView, player: PlayerID): NaturalResolution {
  const pendingActionForPlayer = state.pendingActions.find((a) => a.player === player);
  if (pendingActionForPlayer) {
    const sourceEffect = pendingActionForPlayer.sourceEffectId
      ? state.pendingEffects.find((e) => e.id === pendingActionForPlayer.sourceEffectId)
      : undefined;
    if (sourceEffect && isPendingEffectDeclinable(sourceEffect)) {
      return { kind: 'decline', pendingEffectId: sourceEffect.id };
    }
    return { kind: 'blocked' };
  }

  const optionalEffect = state.pendingEffects.find(
    (e) => !e.resolved && e.selectingPlayer === player && isPendingEffectDeclinable(e),
  );
  if (optionalEffect) return { kind: 'decline', pendingEffectId: optionalEffect.id };

  const mandatoryEffect = state.pendingEffects.find(
    (e) => !e.resolved && e.selectingPlayer === player,
  );
  if (mandatoryEffect) return { kind: 'blocked' };

  if (state.phase === 'action' && state.activePlayer === player && !state.pendingForcedResolver) {
    return { kind: 'pass' };
  }

  return { kind: 'unhandled' };
}

export function decideIdleOutcome(
  state: IdleStateView,
  player: PlayerID,
  flags: IdleFlags,
): IdleDecision {
  if (flags.disconnectVerified) return { kind: 'defeat', reason: 'disconnect' };

  const natural = resolveNaturally(state, player);
  if (natural.kind === 'unhandled') return { kind: 'unstick' };

  if (!flags.idleWarningUsed) {
    if (natural.kind === 'blocked') return { kind: 'warn' };
    if (natural.kind === 'decline') return { kind: 'auto-decline', pendingEffectId: natural.pendingEffectId };
    return { kind: 'auto-pass' };
  }

  if (natural.kind === 'blocked') return { kind: 'defeat', reason: 'idle-mandatory' };
  return { kind: 'defeat', reason: 'idle-second' };
}
