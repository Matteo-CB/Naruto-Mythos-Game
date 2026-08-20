import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { createActionPhaseState, mockCharInPlay, mockMission } from './testHelpers';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { attachCardToCharacter } from '@/lib/effects/attachments';
import { isCopyableCharacter } from '@/lib/effects/handlers/KS/shared/copyExclusions';
import { getCardById } from '@/lib/data/cardIndex';
import type { CardData, CharacterCard, CharacterInPlay, GameState } from '@/lib/engine/types';

const BOMBE = 'SS-083-UC';
const KAKASHI_016 = 'KS-016-UC';
const INO_020 = 'KS-020-UC';
const SAKON_062 = 'KS-062-UC';
const JIROBO_057 = 'KS-057-C';

beforeAll(() => { initializeRegistry(); });

function plateau(): GameState {
  const s = createActionPhaseState();
  s.activeMissions = Array.from({ length: 2 }, (_, i) => ({
    card: mockMission({ basePoints: 3 + i }),
    rank: 'D' as const,
    basePoints: 3 + i,
    rankBonus: 1,
    player1Characters: [] as CharacterInPlay[],
    player2Characters: [] as CharacterInPlay[],
    wonBy: null,
  }));
  s.player1.chakra = 20;
  s.player2.chakra = 20;
  return s;
}

function perso(instanceId: string, camp: 'player1' | 'player2', cardId: string): CharacterInPlay {
  return mockCharInPlay(
    { instanceId, controlledBy: camp, originalOwner: camp, missionIndex: 0 },
    getCardById(cardId) as CharacterCard,
  );
}

function poserLaBombe(state: GameState, poseur: 'player1' | 'player2', cible: string): GameState {
  return attachCardToCharacter(state, poseur, getCardById(BOMBE) as CardData, cible);
}

function sceneKakashi(avecBombe: boolean) {
  let s = plateau();
  const kakashi = perso('kakashi', 'player1', KAKASHI_016);
  s.activeMissions[0].player1Characters = [
    kakashi,
    perso('proie', 'player1', JIROBO_057),
  ];
  s.activeMissions[0].player2Characters = [perso('ino', 'player2', INO_020)];
  if (avecBombe) s = poserLaBombe(s, 'player1', 'ino');
  const source = s.activeMissions[0].player1Characters.find((c) => c.instanceId === 'kakashi')!;
  return { s, kakashi: source };
}

describe('un personnage sous Bombe Aveuglante n a plus rien a copier', () => {
  it('temoin: sans la bombe, KAKASHI 016 propose bien de copier INO 020', () => {
    const { s, kakashi } = sceneKakashi(false);
    const apres = EffectEngine.resolvePlayEffects(s, 'player1', kakashi, 0, false);
    expect(apres.pendingEffects.map((p) => p.targetSelectionType)).toContain('KAKASHI016_CONFIRM_MAIN');
  });

  it('avec la bombe sur INO 020, KAKASHI 016 n a plus aucune cible et le dit dans le journal', () => {
    const { s, kakashi } = sceneKakashi(true);
    const apres = EffectEngine.resolvePlayEffects(s, 'player1', kakashi, 0, false);
    expect(apres.pendingEffects, 'aucune fenetre de copie ne s ouvre').toHaveLength(0);
    expect(apres.log[apres.log.length - 1].messageKey).toBe('game.log.effect.noTarget');
  });

  it('SAKON 062 ne copie plus un Sound Four allie que l adversaire a bombarde', () => {
    let s = plateau();
    const sakon = perso('sakon', 'player1', SAKON_062);
    s.activeMissions[0].player1Characters = [sakon, perso('jirobo', 'player1', JIROBO_057)];

    const sansBombe = EffectEngine.resolveRevealEffects(s, 'player1', sakon, 0, true);
    expect(
      sansBombe.pendingEffects.map((p) => p.targetSelectionType),
      'temoin: le Sound Four allie est copiable',
    ).toContain('SAKON062_CONFIRM_AMBUSH');

    s = poserLaBombe(s, 'player2', 'jirobo');
    const source = s.activeMissions[0].player1Characters.find((c) => c.instanceId === 'sakon')!;
    const avecBombe = EffectEngine.resolveRevealEffects(s, 'player1', source, 0, true);
    expect(avecBombe.pendingEffects).toHaveLength(0);
    expect(avecBombe.log[avecBombe.log.length - 1].messageKey).toBe('game.log.effect.noTarget');
  });

  it('le filtre commun refuse aussi bien la carte cachee que la carte au texte efface', () => {
    let s = plateau();
    s.activeMissions[0].player2Characters = [perso('ino', 'player2', INO_020)];
    const normal = s.activeMissions[0].player2Characters[0];
    expect(isCopyableCharacter(normal)).toBe(true);
    expect(isCopyableCharacter({ ...normal, isHidden: true })).toBe(false);

    s = poserLaBombe(s, 'player1', 'ino');
    expect(isCopyableCharacter(s.activeMissions[0].player2Characters[0])).toBe(false);
  });
});

describe('une amelioration posee sur un personnage sous Bombe Aveuglante ne declenche rien', () => {
  it('le texte de la nouvelle carte est efface avant de s activer', () => {
    let s = plateau();
    s.activeMissions[0].player2Characters = [perso('ino', 'player2', INO_020)];
    s = poserLaBombe(s, 'player1', 'ino');
    const cible = s.activeMissions[0].player2Characters[0];

    const apres = EffectEngine.resolvePlayEffects(s, 'player2', cible, 0, true);
    expect(apres.pendingEffects, 'ni le MAIN ni l UPGRADE ne se declenchent').toHaveLength(0);
    expect(apres.log[apres.log.length - 1].messageKey).toBe('game.log.effect.ss083Blank');
  });
});
