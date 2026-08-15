import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { getPlayableAttachments } from '@/lib/data/cardLoader';
import { parseAttachSpec, getCharacterAttachTargets } from '@/lib/effects/attachments';
import type { CardData, GameState } from '@/lib/engine/types';

const HOTES = ['KS-001-C', 'SS-020-C', 'KS-128-R', 'SS-115-R'];

function plateau(hoteId: string, enMain: CardData): GameState {
  const state = buildSimState({
    p1: [simChar(hoteId, { owner: 'player1', instanceId: 'hote' })],
    missions: 2,
    chakra1: 40,
    edgeHolder: 'player1',
  });
  state.phase = 'action';
  state.player1.hand = [enMain as never];
  return state;
}

function equipementsEnJeu(state: GameState): number {
  let total = 0;
  for (const mission of state.activeMissions) {
    total += (mission.attachments ?? []).length;
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      for (const c of mission[side]) total += (c.attachments ?? []).length;
    }
  }
  return total;
}

describe('un equipement joue par le vrai chemin de jeu reste en jeu', () => {
  it('chaque equipement pose sur un hote legal survit a applyAction', () => {
    const perdus: string[] = [];
    let poses = 0;

    for (const brut of getPlayableAttachments()) {
      const carte = brut as unknown as CardData;
      const versMission = parseAttachSpec(carte).toMission;

      for (const hoteId of HOTES) {
        const depart = plateau(hoteId, carte);
        if (!versMission) {
          const cibles = getCharacterAttachTargets(depart, 'player1', 0, carte);
          if (!cibles.some((c) => c.instanceId === 'hote')) continue;
        }

        const apres = GameEngine.applyAction(depart, 'player1', {
          type: 'PLAY_CHARACTER',
          cardIndex: 0,
          missionIndex: 0,
          hidden: false,
        } as never);

        poses += 1;
        if (equipementsEnJeu(apres) === 0) {
          perdus.push(`${carte.id} ${carte.name_fr} sur ${hoteId}`);
        }
        if (versMission) break;
      }
    }

    expect(poses, 'des equipements ont bien ete poses').toBeGreaterThan(10);
    expect(
      perdus,
      `ces equipements disparaissent au lieu de rester en jeu:\n  ${perdus.join('\n  ')}`,
    ).toEqual([]);
  });
});
