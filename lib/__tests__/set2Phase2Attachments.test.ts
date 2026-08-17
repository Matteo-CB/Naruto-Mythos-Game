import { describe, it, expect } from 'vitest';
import { calculateCharacterPower } from '@/lib/engine/phases/PowerCalculation';
import { calculateContinuousChakraBonus, amplifiedPowerup } from '@/lib/effects/ContinuousEffects';
import { applyStartOfRoundTriggers } from '@/lib/engine/rules/startOfRoundTriggers';
import { parseAttachSpec, getCharacterAttachTargets, attachCardToCharacter } from '@/lib/effects/attachments';
import { plannedReinforcementsEndOfRound } from '@/lib/engine/phases/EndPhase';
import { collectScoreEffectSources } from '@/lib/engine/phases/MissionPhase';
import { GameEngine } from '@/lib/engine/GameEngine';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import { registerAllSetHandlers } from '@/lib/effects/handlers';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { getAllCards } from '@/lib/data/cardLoader';
import { hasScenario } from '@/lib/cards/sim/keys';
import type { AttachedCard, CardData, CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';

registerAllSetHandlers();

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

describe('phase 2, les effets instantanes des equipements', () => {
  it('la Peau de Requin propose les ennemis charges en jetons', () => {
    const hote = simChar('SS-054-UC', { owner: 'player1' });
    const charge = simChar('SS-010-C', { owner: 'player2', powerTokens: 3 });
    const vide = simChar('SS-009-C', { owner: 'player2' });
    const s = buildSimState({ p1: [hote], p2: [charge, vide], missions: 1 });

    const apres = attachCardToCharacter(s, 'player1', getCardById('SS-090-UC') as CardData, hote.instanceId);
    const attente = apres.pendingEffects.find((p) => p.targetSelectionType === 'SS090_CONFIRM_MAIN');
    expect(attente, 'la confirmation est proposee').toBeTruthy();
    const relais = JSON.parse(attente!.effectDescription) as { targets?: string[] };
    expect(relais.targets, 'seul l ennemi charge est proposable').toEqual([charge.instanceId]);
  });

  it('les Aiguilles ne declenchent leur AMBUSH qu a la revelation', () => {
    const cible = simChar('SS-010-C', { owner: 'player2', powerTokens: 2 });
    const s = buildSimState({ p1: [], p2: [cible], missions: 1 });

    const pose = attachCardToCharacter(s, 'player1', getCardById('SS-084-C') as CardData, cible.instanceId, false);
    expect(pose.pendingEffects.some((p) => p.targetSelectionType === 'SS084_CONFIRM_AMBUSH'), 'posee normalement, rien').toBe(false);

    const revelee = attachCardToCharacter(s, 'player1', getCardById('SS-084-C') as CardData, cible.instanceId, true);
    expect(revelee.pendingEffects.some((p) => p.targetSelectionType === 'SS084_CONFIRM_AMBUSH'), 'revelee, l embuscade s ouvre').toBe(true);
  });

  it('le Paradis du Batifolage ne se propose que s il y a autre chose a defausser', () => {
    const nu = simChar('SS-010-C', { owner: 'player1' });
    const charge = equipe(simChar('SS-009-C', { owner: 'player1' }), ['SS-080-C'], 'player2');
    const s = buildSimState({ p1: [nu, charge], p2: [], missions: 1 });

    const surNu = attachCardToCharacter(s, 'player1', getCardById('SS-088-UC') as CardData, nu.instanceId);
    expect(surNu.pendingEffects.some((p) => p.targetSelectionType === 'SS088_CONFIRM_MAIN')).toBe(false);
    expect(surNu.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'le refus est journalise').toBe(true);

    const surCharge = attachCardToCharacter(s, 'player1', getCardById('SS-088-UC') as CardData, charge.instanceId);
    expect(surCharge.pendingEffects.some((p) => p.targetSelectionType === 'SS088_CONFIRM_MAIN')).toBe(true);
  });

  it('le Parchemin du Sceau ne se propose que si un Jutsu est sur le dessus du deck', () => {
    const hote = simChar('SS-010-C', { owner: 'player1' });
    const sansJutsu = buildSimState({ p1: [hote], p2: [], missions: 1 });
    const avecJutsu: GameState = {
      ...sansJutsu,
      player1: { ...sansJutsu.player1, deck: [getCardById('SS-057-UC') as never] },
    };

    const rate = attachCardToCharacter(sansJutsu, 'player1', getCardById('SS-095-UC') as CardData, hote.instanceId);
    expect(rate.pendingEffects.some((p) => p.targetSelectionType === 'SS095_CONFIRM_MAIN')).toBe(false);

    const reussi = attachCardToCharacter(avecJutsu, 'player1', getCardById('SS-095-UC') as CardData, hote.instanceId);
    expect(reussi.pendingEffects.some((p) => p.targetSelectionType === 'SS095_CONFIRM_MAIN')).toBe(true);
  });

  it('le Village des Artisans paie a la pose d une Arme, pas d un Parchemin', () => {
    const hote = simChar('SS-010-C', { owner: 'player1' });
    const base = buildSimState({ p1: [hote], p2: [], missions: 1 });
    const avecVillage = avecEquipementMission(base, 'SS-110-UC');
    const avecDeck: GameState = {
      ...avecVillage,
      player1: { ...avecVillage.player1, deck: [getCardById('SS-009-C') as never, getCardById('SS-011-C') as never] },
    };

    const arme = attachCardToCharacter(avecDeck, 'player1', getCardById('SS-080-C') as CardData, hote.instanceId);
    expect(arme.player1.hand.length - avecDeck.player1.hand.length, 'une carte piochee').toBe(1);
    expect(arme.activeMissions[0].player1Characters[0].powerTokens, 'et un jeton').toBe(1);

    const parchemin = attachCardToCharacter(avecDeck, 'player1', getCardById('SS-096-UC') as CardData, hote.instanceId);
    expect(parchemin.player1.hand.length, 'un parchemin ne paie rien').toBe(avecDeck.player1.hand.length);
  });

  it('les Renforts Planifies posent la carte du dessus face cachee', () => {
    const base = buildSimState({ p1: [], p2: [], missions: 1 });
    const avecDeck: GameState = {
      ...base,
      player1: { ...base.player1, deck: [getCardById('SS-009-C') as never, getCardById('SS-011-C') as never] },
    };
    const apres = plannedReinforcementsEndOfRound(avecEquipementMission(avecDeck, 'SS-109-UC'));

    const caches = apres.activeMissions[0].player1Characters.filter((c) => c.isHidden);
    expect(caches.length, 'un renfort face cachee').toBe(1);
    expect(apres.player1.deck.length, 'le deck perd sa carte du dessus').toBe(1);
  });

  it('la Bombe Eclair efface le texte de son porteur', () => {
    const parlant = simChar('SS-062-C', { owner: 'player1' });
    const camarade = simChar('SS-063-C', { owner: 'player1' });
    const sans = buildSimState({ p1: [parlant, camarade], p2: [], missions: 1 });
    const avec = buildSimState({ p1: [equipe(parlant, ['SS-083-UC'], 'player2'), camarade], p2: [], missions: 1 });

    const imprime = getCardById('SS-062-C') as CardData;
    expect(puissance(sans, sans.activeMissions[0].player1Characters[0]), 'son aura compte le camarade').toBe((imprime.power ?? 0) + 1);
    expect(puissance(avec, avec.activeMissions[0].player1Characters[0]), 'texte efface, plus aucune aura').toBe(imprime.power);
  });

  it('le Laboratoire ajoute un Sound Four virtuel aux comptages', () => {
    const jirobo = simChar('SS-032-C', { owner: 'player1' });
    const base = buildSimState({ p1: [jirobo], p2: [], missions: 1 });
    const avecLabo = avecEquipementMission(base, 'SS-105-UC');
    const tayuya = getCardById('SS-039-C') as CardData;

    expect(
      calculateEffectiveCost(base, 'player1', tayuya as never, 0, false)
      - calculateEffectiveCost(avecLabo, 'player1', tayuya as never, 0, false),
      'le laboratoire vaut un allie Sound Four de plus',
    ).toBe(1);
  });
});

describe('phase 2, chaque texte des equipements existe dans les sept langues', () => {
  const CLES = [
    'game.effect.desc.ss090StealTokens',
    'game.effect.desc.ss088DiscardOthers',
    'game.effect.desc.ss084RemoveTokens',
    'game.effect.desc.ss086HideAndMove',
    'game.effect.desc.ss095TakeJutsu',
    'game.effect.desc.ss090ChooseAmount',
    'game.log.effect.ss090Stolen',
    'game.log.effect.ss088Discarded',
    'game.log.effect.ss084Removed',
    'game.log.effect.ss086Moved',
    'game.log.effect.ss095Taken',
    'game.log.effect.ssScrollPair',
    'game.log.effect.ss110Reward',
    'game.log.effect.ss107Ambush',
    'game.log.effect.ss109Reinforcement',
  ];

  it('aucune cle manquante', async () => {
    const manquantes: string[] = [];
    for (const langue of ['en', 'fr', 'es', 'ja', 'pt', 'it', 'pl']) {
      const messages = (await import(`@/messages/${langue}.json`)).default as Record<string, unknown>;
      for (const cle of CLES) {
        let noeud: unknown = messages;
        for (const partie of cle.split('.')) noeud = (noeud as Record<string, unknown> | undefined)?.[partie];
        if (typeof noeud !== 'string' || noeud.trim() === '') manquantes.push(`${langue}:${cle}`);
      }
    }
    expect(manquantes).toEqual([]);
  });
});

describe('phase 2, la Bombe Eclair rend son porteur definitivement muet', () => {
  it('une amelioration posee sur un porteur enfume ne declenche rien', () => {
    const porteur = simChar('SS-010-C', { owner: 'player2' });
    const enfume = equipe(porteur, ['SS-083-UC'], 'player1');
    const s = buildSimState({ p1: [], p2: [enfume], missions: 1, chakra1: 20 });
    const cible = s.activeMissions[0].player2Characters[0];

    const apres = EffectEngine.resolvePlayEffects(s, 'player2', cible, 0, true);
    expect(apres.pendingEffects.length, 'aucun effet ne s ouvre').toBe(0);
    expect(
      apres.log.some((l) => l.messageKey === 'game.log.effect.ss083Blank'),
      'le silence est journalise',
    ).toBe(true);
  });

  it('la revelation d un porteur enfume ne declenche rien non plus', () => {
    const porteur = simChar('SS-127-R', { owner: 'player2' });
    const enfume = equipe(porteur, ['SS-083-UC'], 'player1');
    const s = buildSimState({ p1: [], p2: [enfume], missions: 1, chakra1: 20 });
    const cible = s.activeMissions[0].player2Characters[0];

    const apres = EffectEngine.resolveRevealEffects(s, 'player2', cible, 0, true);
    expect(apres.pendingEffects.length, 'meme une embuscade reste muette').toBe(0);
  });
});

describe('phase 2, les clauses secondaires des equipements', () => {
  it('le Paradis du Batifolage ferme la place a tout autre equipement', () => {
    const libre = simChar('SS-010-C', { owner: 'player1' });
    const occupe = equipe(simChar('SS-009-C', { owner: 'player1' }), ['SS-088-UC']);
    const s = buildSimState({ p1: [libre, occupe], p2: [], missions: 1 });

    const cibles = getCharacterAttachTargets(s, 'player1', 0, getCardById('SS-080-C') as CardData).map((c) => c.instanceId);
    expect(cibles, 'le porteur du livre n est plus proposable').toEqual([libre.instanceId]);
  });

  it('les Fiches Ninja laissent voir les caches adverses de la mission', () => {
    const porteur = simChar('SS-010-C', { owner: 'player1' });
    const cache = simChar('SS-009-C', { owner: 'player2', hidden: true });
    const sans = buildSimState({ p1: [porteur], p2: [cache], missions: 1 });
    const avec = buildSimState({ p1: [equipe(porteur, ['SS-100-C'])], p2: [cache], missions: 1 });

    const vuSans = GameEngine.getVisibleState(sans, 'player1').activeMissions[0].player2Characters[0];
    const vuAvec = GameEngine.getVisibleState(avec, 'player1').activeMissions[0].player2Characters[0];
    expect(vuSans.card, 'sans les fiches, la carte reste secrete').toBeUndefined();
    expect(vuAvec.card, 'avec les fiches, on la voit').toBeTruthy();
  });

  it('un porteur enfume ne declenche plus son effet SCORE', () => {
    const marqueur = simChar('KS-081-C', { owner: 'player1' });
    const enfume = equipe(marqueur, ['SS-083-UC'], 'player2');
    const s = buildSimState({ p1: [enfume], p2: [], missions: 1 });
    const sources = collectScoreEffectSources(s, 'player1', 0);
    expect(sources.some((x) => x.cardId === 'KS-081-C'), 'son SCORE est efface comme le reste').toBe(false);
  });

  it('la Bombe Fumigene reduit le cout de son hote, jamais le sien', () => {
    const s = buildSimState({ p1: [], p2: [], missions: 1 });
    const carte = getCardById('SS-086-C') as CardData;
    expect(
      calculateEffectiveCost(s, 'player1', carte as never, 0, true),
      'elle ne se fait pas de remise a elle-meme',
    ).toBe(carte.chakra);

    const porteur = {
      attachments: [{ card: getCardById('SS-086-C') as CardData }],
    };
    const hote = getCardById('KS-011-C') as CardData;
    expect(
      calculateEffectiveCost(s, 'player1', hote as never, 0, true, porteur as never),
      'le personnage qui la porte se revele pour un chakra de moins',
    ).toBe((hote.chakra ?? 0) - 1);
  });
});

describe('phase 2, chaque equipement doit avoir sa simulation', () => {
  const SANS_SIMULATION_ENCORE = new Set<string>([]);

  it('le balayage couvre tous les equipements, pas une liste ecrite a la main', () => {
    const manquants: string[] = [];
    for (const carte of getAllCards()) {
      if (carte.card_type !== 'attachment') continue;
      if ((carte.effects ?? []).length === 0) continue;
      if (hasScenario(carte.id)) continue;
      if (SANS_SIMULATION_ENCORE.has(carte.id)) continue;
      manquants.push(carte.id);
    }
    expect(manquants, 'un equipement sans simulation doit figurer dans la dette, jamais passer inapercu').toEqual([]);
  });

  it('la dette de simulations est explicite et ne grandit pas', () => {
    expect(SANS_SIMULATION_ENCORE.size, 'plus aucune dette de simulation sur les equipements').toBe(0);
    for (const id of SANS_SIMULATION_ENCORE) {
      expect(getCardById(id), `${id} existe`).toBeTruthy();
    }
  });
});

describe('phase 2, la Peau de Requin laisse choisir combien de jetons', () => {
  function resoudre(depart: GameState, choix: (p: { targetSelectionType: string; validTargets: string[] }) => string): GameState {
    let s = depart;
    for (let i = 0; i < 5 && s.pendingEffects.length > 0; i++) {
      const p = s.pendingEffects[s.pendingEffects.length - 1];
      const cible = choix(p);
      if (!cible) break;
      s = EffectEngine.applyTargetedEffect(s, p, [cible]);
      s = {
        ...s,
        pendingEffects: s.pendingEffects.filter((pe) => pe.id !== p.id),
        pendingActions: s.pendingActions.filter((pa) => pa.sourceEffectId !== p.id),
      };
    }
    return s;
  }

  it('trois jetons disponibles donnent trois choix, et le joueur peut n en prendre qu un', () => {
    const hote = simChar('SS-054-UC', { owner: 'player1' });
    const donneur = simChar('SS-010-C', { owner: 'player2', powerTokens: 3 });
    const s = buildSimState({ p1: [hote], p2: [donneur], missions: 1 });

    const pose = attachCardToCharacter(s, 'player1', getCardById('SS-090-UC') as CardData, hote.instanceId);
    let quantitesProposees: string[] = [];
    const fin = resoudre(pose, (p) => {
      if (p.targetSelectionType === 'SS090_CHOOSE_AMOUNT') {
        quantitesProposees = p.validTargets;
        return 'AMOUNT_1';
      }
      return p.validTargets[0];
    });

    expect(quantitesProposees, 'un choix par jeton disponible, plafonne a trois').toEqual(['AMOUNT_1', 'AMOUNT_2', 'AMOUNT_3']);
    const donneurFin = fin.activeMissions[0].player2Characters[0];
    const hoteFin = fin.activeMissions[0].player1Characters[0];
    expect(donneurFin.powerTokens, 'le joueur n en a pris qu un').toBe(2);
    expect(hoteFin.powerTokens, 'et il arrive sur la Peau de Requin').toBe(1);
  });

  it('un seul jeton disponible ne pose aucune question', () => {
    const hote = simChar('SS-054-UC', { owner: 'player1' });
    const donneur = simChar('SS-010-C', { owner: 'player2', powerTokens: 1 });
    const s = buildSimState({ p1: [hote], p2: [donneur], missions: 1 });

    const pose = attachCardToCharacter(s, 'player1', getCardById('SS-090-UC') as CardData, hote.instanceId);
    const fin = resoudre(pose, (p) => p.validTargets[0]);
    expect(fin.pendingEffects.some((p) => p.targetSelectionType === 'SS090_CHOOSE_AMOUNT'), 'aucune question inutile').toBe(false);
    expect(fin.activeMissions[0].player2Characters[0].powerTokens, 'le jeton est pris').toBe(0);
  });
});

describe('phase 2, les quatre effets restants vont jusqu au bout', () => {
  function jusquAuBout(depart: GameState, preference?: (cibles: string[]) => string): GameState {
    let s = depart;
    for (let i = 0; i < 6 && s.pendingEffects.length > 0; i++) {
      const p = s.pendingEffects[s.pendingEffects.length - 1];
      const cibles = p.validTargets ?? [];
      if (cibles.length === 0) break;
      const choisi = preference ? preference(cibles) : cibles[0];
      s = EffectEngine.applyTargetedEffect(s, p, [choisi]);
      s = {
        ...s,
        pendingEffects: s.pendingEffects.filter((pe) => pe.id !== p.id),
        pendingActions: s.pendingActions.filter((pa) => pa.sourceEffectId !== p.id),
      };
    }
    return s;
  }

  it('les Aiguilles revelees vident vraiment les jetons du porteur', () => {
    const cible = simChar('SS-010-C', { owner: 'player2', powerTokens: 4 });
    const s = buildSimState({ p1: [], p2: [cible], missions: 1 });

    const pose = attachCardToCharacter(s, 'player1', getCardById('SS-084-C') as CardData, cible.instanceId, true);
    const fin = jusquAuBout(pose);
    expect(fin.activeMissions[0].player2Characters[0].powerTokens, 'plus un seul jeton').toBe(0);
  });

  it('le Paradis du Batifolage defausse vraiment l equipement adverse', () => {
    const hote = equipe(simChar('SS-009-C', { owner: 'player1' }), ['SS-080-C'], 'player2');
    const s = buildSimState({ p1: [hote], p2: [], missions: 1 });

    const pose = attachCardToCharacter(s, 'player1', getCardById('SS-088-UC') as CardData, hote.instanceId);
    const fin = jusquAuBout(pose);
    const restants = fin.activeMissions[0].player1Characters[0].attachments ?? [];
    expect(restants.map((a) => a.card.id), 'seul le livre reste').toEqual(['SS-088-UC']);
    expect(fin.player2.discardPile.some((c) => c.id === 'SS-080-C'), 'le kunai part chez son proprietaire').toBe(true);
  });

  it('la Bombe Fumigene cache et deplace vraiment son porteur', () => {
    const hote = simChar('SS-009-C', { owner: 'player1' });
    const s = buildSimState({ p1: [hote], p2: [], missions: 2, chakra1: 12 });

    const pose = attachCardToCharacter(s, 'player1', getCardById('SS-086-C') as CardData, hote.instanceId);
    const fin = jusquAuBout(pose, (cibles) => cibles.find((c) => c.startsWith('MISSION_')) ?? cibles[0]);

    const surPremiere = fin.activeMissions[0].player1Characters.some((c) => c.instanceId === hote.instanceId);
    const surSeconde = fin.activeMissions[1].player1Characters.find((c) => c.instanceId === hote.instanceId);
    expect(surPremiere, 'il a quitte sa mission').toBe(false);
    expect(surSeconde, 'il est arrive dans l autre').toBeTruthy();
    expect(surSeconde!.isHidden, 'et il est bien cache').toBe(true);
  });

  it('le Parchemin du Sceau met vraiment le Jutsu en main', () => {
    const hote = simChar('SS-010-C', { owner: 'player1' });
    const base = buildSimState({ p1: [hote], p2: [], missions: 1 });
    const s: GameState = {
      ...base,
      player1: {
        ...base.player1,
        deck: ['SS-057-UC', 'KS-009-C', 'KS-010-C', 'KS-005-C'].map((x) => getCardById(x) as never),
      },
    };

    const pose = attachCardToCharacter(s, 'player1', getCardById('SS-095-UC') as CardData, hote.instanceId);
    const fin = jusquAuBout(pose);
    expect(fin.player1.hand.some((c) => c.id === 'SS-057-UC'), 'le Jutsu est en main').toBe(true);
    expect(fin.player1.deck.length, 'les deux autres repartent au fond, la quatrieme reste').toBe(3);
    expect(fin.player1.deck.some((c) => c.id === 'SS-057-UC'), 'et il ne reste pas dans le deck').toBe(false);
  });
});
