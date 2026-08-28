import type { GameState, PlayerID } from '@/lib/engine/types';
import { emitEngineQuestEvent } from './engineEmit';

// Un effet resolu annonce toujours le meme fait: quelle carte, de quel set, quel numero
// imprime, sur quelle mission et a quelle manche. La couche quete en tire le reste.

const CROCHET_PAR_EFFET: Readonly<Record<string, string>> = {
  DUEL: 'duel.triggered.with.source',
  FIRST_STRIKE: 'first_strike.used.with.source',
};

export function numeroImprime(cardId: string | undefined | null): number | null {
  if (!cardId) return null;
  const m = /^[A-Z]{2,3}-(\d+)/.exec(cardId);
  return m ? Number(m[1]) : null;
}

export function setDeLaCarte(cardId: string | undefined | null): string | null {
  if (!cardId) return null;
  const m = /^([A-Z]{2,3})-/.exec(cardId);
  return m ? m[1] : null;
}

export function equipementsDeLaMission(state: GameState, missionIndex: number | undefined): number[] {
  if (missionIndex === undefined || missionIndex < 0) return [];
  const mission = state.activeMissions?.[missionIndex];
  if (!mission) return [];
  const numeros: number[] = [];
  for (const att of mission.attachments ?? []) {
    const n = numeroImprime(att.card?.id);
    if (n !== null) numeros.push(n);
  }
  for (const side of ['player1Characters', 'player2Characters'] as const) {
    for (const ch of mission[side] ?? []) {
      for (const att of ch.attachments ?? []) {
        const n = numeroImprime(att.card?.id);
        if (n !== null) numeros.push(n);
      }
    }
  }
  return numeros;
}

export function annoncerEffetResolu(
  state: GameState,
  player: PlayerID,
  effectType: string,
  source: { cardId?: string; name?: string; missionIndex?: number },
): void {
  const hook = CROCHET_PAR_EFFET[effectType];
  if (!hook) return;
  const cardId = source.cardId;
  const set = setDeLaCarte(cardId);
  const sourceNumber = numeroImprime(cardId);
  if (set === null || sourceNumber === null) return;
  emitEngineQuestEvent(state, player, hook, {
    set,
    sourceNumber,
    sourceName: source.name,
    round: state.turn,
    missionAttachments: equipementsDeLaMission(state, source.missionIndex),
  });
}
