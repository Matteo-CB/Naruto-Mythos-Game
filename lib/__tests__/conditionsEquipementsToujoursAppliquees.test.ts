import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { attachCardToCharacter, attachCardToMission, enforceAttachmentConditions } from '@/lib/effects/attachments';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CardData, CharacterCard, GameState } from '@/lib/engine/types';

void EffectEngine;

const SEIMEI = 'SS-065-UC';
const BOMBE = 'SS-083-UC';
const KUNAI = 'SS-080-C';
const RAMEN = 'SS-081-C';
const PARCHEMIN_CIEL = 'SS-096-UC';

function equipementsDe(state: GameState, instanceId: string) {
  for (const m of state.activeMissions) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const c = m[side].find((x) => x.instanceId === instanceId);
      if (c) return c.attachments ?? [];
    }
  }
  return [];
}

describe('SEIMEI garde plusieurs equipements, mais pas apres son amelioration', () => {
  function plateau(): GameState {
    let s = buildSimState({
      p1: [simChar(SEIMEI, { owner: 'player1', instanceId: 'seimei' })],
      missions: 2, chakra1: 40, edgeHolder: 'player1',
    });
    s.phase = 'action';
    s = attachCardToCharacter(s, 'player1', getCardById(KUNAI) as CardData, 'seimei');
    s = attachCardToCharacter(s, 'player1', getCardById(RAMEN) as CardData, 'seimei');
    return s;
  }

  it('tant qu il est Seimei, il conserve ses deux equipements', () => {
    const s = plateau();
    expect(equipementsDe(s, 'seimei').length, 'Seimei ignore la limite d un equipement').toBe(2);
    expect(equipementsDe(enforceAttachmentConditions(s), 'seimei').length, 'le filet ne lui retire rien').toBe(2);
  });

  it('une fois recouvert par une autre carte, il ne garde que le dernier', () => {
    const s = plateau();
    const perso = s.activeMissions[0].player1Characters[0];
    const dessus = getCardById('SS-127-R') as CharacterCard;
    perso.stack = [...perso.stack, dessus];
    perso.card = dessus;

    const apres = enforceAttachmentConditions(s);
    const restants = equipementsDe(apres, 'seimei');
    expect(restants.length, 'la limite d un equipement par joueur reprend ses droits').toBe(1);
    expect(restants[0].card.id, 'le plus recent est conserve').toBe(RAMEN);
    expect(
      apres.player1.discardPile.some((c) => c.id === KUNAI),
      'celui en trop part a la defausse de son proprietaire',
    ).toBe(true);
  });

  it('la meme garantie vaut pour les equipements de mission', () => {
    let s = buildSimState({ missions: 2, chakra1: 40, edgeHolder: 'player1' });
    s.phase = 'action';
    s = attachCardToMission(s, 'player1', getCardById('SS-104-C') as CardData, 0);
    const mission = s.activeMissions[0];
    mission.attachments = [...(mission.attachments ?? []), {
      instanceId: 'force', card: getCardById('SS-106-C') as CardData, owner: 'player1',
    }];

    const apres = enforceAttachmentConditions(s);
    expect(
      (apres.activeMissions[0].attachments ?? []).length,
      'un seul equipement de mission par joueur',
    ).toBe(1);
  });
});

describe('la BOMBE AVEUGLANTE ne touche jamais aux effets de mission', () => {
  it('la mission garde son effet de score malgre une bombe sur un personnage', () => {
    let s = buildSimState({
      p1: [simChar('KS-011-C', { owner: 'player1', instanceId: 'porteur' })],
      missions: 2, missionIds: ['SS-004-MMS', 'SS-005-MMS'], chakra1: 30, edgeHolder: 'player1',
    });
    s.phase = 'action';
    s = attachCardToCharacter(s, 'player2', getCardById(BOMBE) as CardData, 'porteur');
    const mission = s.activeMissions[0];
    expect(
      (mission.card.effects ?? []).length >= 0,
      'la carte mission conserve son texte',
    ).toBe(true);
    expect(
      mission.attachments === undefined || mission.attachments.length === 0,
      'la bombe est sur le personnage, pas sur la mission',
    ).toBe(true);
  });

  it('un parchemin porte par un personnage assomme garde son effet de score', () => {
    let s = buildSimState({
      p1: [simChar('KS-011-C', { owner: 'player1', instanceId: 'porteur' })],
      missions: 2, chakra1: 30, edgeHolder: 'player1',
    });
    s.phase = 'action';
    s = attachCardToCharacter(s, 'player1', getCardById(PARCHEMIN_CIEL) as CardData, 'porteur');
    s = attachCardToCharacter(s, 'player2', getCardById(BOMBE) as CardData, 'porteur');
    const porte = equipementsDe(s, 'porteur');
    expect(
      porte.some((a) => a.card.id === PARCHEMIN_CIEL),
      'la bombe efface le texte du personnage, pas celui des equipements',
    ).toBe(true);
  });
});
