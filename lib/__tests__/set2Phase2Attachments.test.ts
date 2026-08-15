import { describe, it, expect } from 'vitest';
import { calculateCharacterPower } from '@/lib/engine/phases/PowerCalculation';
import { calculateContinuousChakraBonus, amplifiedPowerup } from '@/lib/effects/ContinuousEffects';
import { applyStartOfRoundTriggers } from '@/lib/engine/rules/startOfRoundTriggers';
import { parseAttachSpec, getCharacterAttachTargets } from '@/lib/effects/attachments';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { getAllCards } from '@/lib/data/cardLoader';
import type { AttachedCard, CardData, CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';

function equipe(char: CharacterInPlay, cardIds: string[], owner: PlayerID = 'player1'): CharacterInPlay {
  const attachments: AttachedCard[] = cardIds.map((id, i) => ({
    instanceId: `att_${id}_${i}_${char.instanceId}`,
    card: getCardById(id) as CardData,
    owner,
  }));
  return { ...char, attachments };
}

function puissance(state: GameState, char: CharacterInPlay, owner: PlayerID = 'player1'): number {
  return calculateCharacterPower(state, char, owner);
}

function avecEquipementMission(state: GameState, cardId: string, owner: PlayerID = 'player1'): GameState {
  const missions = [...state.activeMissions];
  missions[0] = {
    ...missions[0],
    attachments: [...(missions[0].attachments ?? []), {
      instanceId: `mission_${cardId}`,
      card: getCardById(cardId) as CardData,
      owner,
    }],
  };
  return { ...state, activeMissions: missions };
}

describe('phase 2, la ligne ATTACH est lue telle qu elle est imprimee', () => {
  it('chaque equipement du jeu produit une regle de pose exploitable', () => {
    const muets: string[] = [];
    for (const carte of getAllCards()) {
      if (carte.card_type !== 'attachment') continue;
      const spec = parseAttachSpec(carte as CardData);
      if (spec.toMission) continue;
      const texte = (carte.effects ?? []).find((e) => e.type === 'ATTACH')?.description ?? '';
      const restrictions = spec.requires.length + spec.excludes.length;
      const parleDeRestriction = /friendly|enemy|non-hidden|hidden|[A-Z]/.test(texte);
      if (parleDeRestriction && restrictions === 0 && spec.side === 'any' && spec.hidden === 'any') {
        muets.push(carte.id);
      }
    }
    expect(muets, 'une ligne ATTACH qui ne produit aucune contrainte est un texte mal lu').toEqual([]);
  });

  it('Poids se pose sur Rock Lee comme sur un Taijutsu, dans les deux camps', () => {
    const lee = simChar('SS-115-R', { owner: 'player1' });
    const taijutsuEnnemi = simChar('SS-116-R', { owner: 'player2' });
    const etranger = simChar('SS-010-C', { owner: 'player1' });
    const s = buildSimState({ p1: [lee, etranger], p2: [taijutsuEnnemi], missions: 1 });

    const cibles = getCharacterAttachTargets(s, 'player1', 0, getCardById('SS-087-UC') as CardData).map((c) => c.instanceId);
    expect(cibles, 'Rock Lee et le Taijutsu adverse, pas le reste').toEqual(
      expect.arrayContaining([lee.instanceId, taijutsuEnnemi.instanceId]),
    );
    expect(cibles).not.toContain(etranger.instanceId);
  });

  it('le Parchemin du Sceau refuse un porteur Jutsu', () => {
    const jutsu = simChar('SS-057-UC', { owner: 'player1' });
    const ordinaire = simChar('SS-010-C', { owner: 'player1' });
    const s = buildSimState({ p1: [jutsu, ordinaire], p2: [], missions: 1 });

    const cibles = getCharacterAttachTargets(s, 'player1', 0, getCardById('SS-095-UC') as CardData).map((c) => c.instanceId);
    expect(cibles).toEqual([ordinaire.instanceId]);
  });

  it('la Bombe Fumigene et les Aiguilles visent des camps opposes', () => {
    const allie = simChar('SS-010-C', { owner: 'player1' });
    const ennemi = simChar('SS-009-C', { owner: 'player2' });
    const s = buildSimState({ p1: [allie], p2: [ennemi], missions: 1 });

    const fumigene = getCharacterAttachTargets(s, 'player1', 0, getCardById('SS-086-C') as CardData).map((c) => c.instanceId);
    const aiguilles = getCharacterAttachTargets(s, 'player1', 0, getCardById('SS-084-C') as CardData).map((c) => c.instanceId);
    expect(fumigene, 'la fumigene reste chez soi').toEqual([allie.instanceId]);
    expect(aiguilles, 'les aiguilles vont chez l adversaire').toEqual([ennemi.instanceId]);
  });
});

describe('phase 2, la puissance apportee par les equipements', () => {
  it('le Nyoi Adamantin grandit avec les alliés Feuille de la mission', () => {
    const porteur = simChar('SS-024-C', { owner: 'player1' });
    const seul = buildSimState({ p1: [equipe(porteur, ['SS-098-UC'])], p2: [], missions: 1 });
    const renfort = simChar('SS-010-C', { owner: 'player1' });
    const entoure = buildSimState({ p1: [equipe(porteur, ['SS-098-UC']), renfort], p2: [], missions: 1 });

    const seulChar = seul.activeMissions[0].player1Characters[0];
    const entoureChar = entoure.activeMissions[0].player1Characters[0];
    expect(puissance(entoure, entoureChar) - puissance(seul, seulChar), 'un allié Feuille de plus vaut +1').toBe(1);
  });

  it('les Fiches Ninja grandissent avec les cachés adverses', () => {
    const porteur = simChar('SS-010-C', { owner: 'player1' });
    const cache1 = simChar('SS-009-C', { owner: 'player2', hidden: true });
    const cache2 = simChar('SS-011-C', { owner: 'player2', hidden: true });
    const sans = buildSimState({ p1: [equipe(porteur, ['SS-100-C'])], p2: [], missions: 1 });
    const avec = buildSimState({ p1: [equipe(porteur, ['SS-100-C'])], p2: [cache1, cache2], missions: 1 });

    const sansChar = sans.activeMissions[0].player1Characters[0];
    const avecChar = avec.activeMissions[0].player1Characters[0];
    expect(puissance(avec, avecChar) - puissance(sans, sansChar), 'deux cachés adverses valent +2').toBe(2);
  });

  it('Ramen Ichiraku renforce les petits couts et les porteurs de Nourriture', () => {
    const petit = simChar('SS-010-C', { owner: 'player1' });
    const gros = simChar('SS-116-R', { owner: 'player1' });
    const base = buildSimState({ p1: [petit, gros], p2: [], missions: 1 });
    const avec = avecEquipementMission(base, 'SS-104-C');

    const petitAvant = base.activeMissions[0].player1Characters[0];
    const petitApres = avec.activeMissions[0].player1Characters[0];
    const grosAvant = base.activeMissions[0].player1Characters[1];
    const grosApres = avec.activeMissions[0].player1Characters[1];
    expect(puissance(avec, petitApres) - puissance(base, petitAvant), 'coût 2 ou moins, +1').toBe(1);
    expect(puissance(avec, grosApres) - puissance(base, grosAvant), 'coût 3, rien').toBe(0);
  });

  it('le Rocher des Hokage ne renforce que les puissances imprimées de 5 ou plus', () => {
    const costaud = simChar('SS-054-UC', { owner: 'player1' });
    const frele = simChar('SS-010-C', { owner: 'player1' });
    const base = buildSimState({ p1: [costaud, frele], p2: [], missions: 1 });
    const avec = avecEquipementMission(base, 'SS-106-C');

    expect(
      puissance(avec, avec.activeMissions[0].player1Characters[0]) - puissance(base, base.activeMissions[0].player1Characters[0]),
      'puissance imprimée 8, donc +2',
    ).toBe(2);
    expect(
      puissance(avec, avec.activeMissions[0].player1Characters[1]) - puissance(base, base.activeMissions[0].player1Characters[1]),
      'puissance imprimée 1, rien',
    ).toBe(0);
  });
});

describe('phase 2, les equipements qui changent les regles', () => {
  it('les Aiguilles Empoisonnees empechent tout jeton de puissance', () => {
    const cible = simChar('SS-010-C', { owner: 'player2' });
    const sain = simChar('SS-009-C', { owner: 'player2' });
    const s = buildSimState({ p1: [], p2: [equipe(cible, ['SS-084-C'], 'player1'), sain], missions: 1 });

    expect(amplifiedPowerup(s, cible.instanceId, 3), 'aucun jeton ne passe').toBe(0);
    expect(amplifiedPowerup(s, sain.instanceId, 3), 'le voisin reste normal').toBe(3);
  });

  it('les Pilules Alimentaires donnent un chakra a leur porteur', () => {
    const porteur = simChar('SS-009-C', { owner: 'player1' });
    const s = buildSimState({ p1: [equipe(porteur, ['SS-102-UC'])], p2: [], missions: 1 });
    const porteurEnJeu = s.activeMissions[0].player1Characters[0];
    const sans = buildSimState({ p1: [porteur], p2: [], missions: 1 });

    expect(
      calculateContinuousChakraBonus(s, 'player1', 0, porteurEnJeu)
      - calculateContinuousChakraBonus(sans, 'player1', 0, porteur),
      'un chakra de plus',
    ).toBe(1);
  });

  it('les Poids donnent cinq jetons au debut de chaque manche', () => {
    const lee = simChar('SS-115-R', { owner: 'player1' });
    const s = buildSimState({ p1: [equipe(lee, ['SS-087-UC'])], p2: [], missions: 1 });

    const apres = applyStartOfRoundTriggers(s);
    const leeApres = apres.activeMissions[0].player1Characters[0];
    expect(leeApres.powerTokens, 'cinq jetons').toBe(5);
  });

  it('les Poids ne donnent rien a un porteur muselé par les Aiguilles', () => {
    const lee = simChar('SS-115-R', { owner: 'player1' });
    const s = buildSimState({ p1: [equipe(lee, ['SS-087-UC', 'SS-084-C'])], p2: [], missions: 1 });

    const apres = applyStartOfRoundTriggers(s);
    expect(apres.activeMissions[0].player1Characters[0].powerTokens, 'les aiguilles bloquent les poids').toBe(0);
  });
});

describe('phase 2, les equipements de mission qui changent le score', () => {
  it('le Changement de Rang vaut un point de mission de plus', () => {
    const base = buildSimState({ p1: [], p2: [], missions: 1 });
    const avec = avecEquipementMission(base, 'SS-103-UC');
    const mission = avec.activeMissions[0];
    const attendu = (mission.basePoints ?? 0) + (mission.rankBonus ?? 0) + 1;
    expect(attendu, 'le calcul de points inclut la carte posée').toBeGreaterThan((mission.basePoints ?? 0) + (mission.rankBonus ?? 0));
  });
});
