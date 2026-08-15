import { describe, it, expect } from 'vitest';
import { calculateCharacterPower } from '@/lib/engine/phases/PowerCalculation';
import { calculateContinuousChakraBonus } from '@/lib/effects/ContinuousEffects';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import { applyStartOfRoundTriggers } from '@/lib/engine/rules/startOfRoundTriggers';
import { akamaru015EndOfRound, enma132EndOfRound } from '@/lib/engine/phases/EndPhase';
import { shinigami057BeforePower } from '@/lib/engine/phases/MissionPhase';
import { triggerOnPlayReactions } from '@/lib/effects/ContinuousEffects';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CardData, CharacterInPlay, GameState } from '@/lib/engine/types';

function puissance(state: GameState, char: CharacterInPlay, owner: 'player1' | 'player2' = 'player1'): number {
  return calculateCharacterPower(state, char, owner);
}

function avecEquipement(char: CharacterInPlay, cardId: string, owner: 'player1' | 'player2' = 'player1'): CharacterInPlay {
  return {
    ...char,
    attachments: [{ instanceId: `att_${cardId}_${char.instanceId}`, card: getCardById(cardId) as CardData, owner }],
  };
}

describe('phase 1, auras de puissance du set 2', () => {
  it('Hiruzen 001 compte les alliés Feuille, et seulement si tous le sont', () => {
    const hiruzen = simChar('SS-001-UC', { owner: 'player1' });
    const feuille1 = simChar('SS-010-C', { owner: 'player1' });
    const feuille2 = simChar('SS-024-C', { owner: 'player1' });
    const seul = buildSimState({ p1: [hiruzen], p2: [], missions: 1 });
    const entoure = buildSimState({ p1: [hiruzen, feuille1, feuille2], p2: [], missions: 1 });

    const base = puissance(seul, hiruzen);
    expect(puissance(entoure, hiruzen), 'deux alliés Feuille, donc +2').toBe(base + 2);

    const etranger = simChar('SS-032-C', { owner: 'player1' });
    const melange = buildSimState({ p1: [hiruzen, feuille1, etranger], p2: [], missions: 1 });
    expect(puissance(melange, hiruzen), 'un allié non Feuille annule la condition').toBe(base);
  });

  it('Genma 027 gagne 2 Puissance par mission en jeu', () => {
    const genma = simChar('SS-027-UC', { owner: 'player1' });
    const une = buildSimState({ p1: [genma], p2: [], missions: 1 });
    const deux = buildSimState({ p1: [genma], p2: [], missions: 2 });
    expect(puissance(deux, genma) - puissance(une, genma), 'une mission de plus vaut 2 Puissance').toBe(2);
  });

  it('Konohamaru 062 compte les autres Élèves, jamais lui-même', () => {
    const konohamaru = simChar('SS-062-C', { owner: 'player1' });
    const seul = buildSimState({ p1: [konohamaru], p2: [], missions: 1 });
    const imprime = getCardById('SS-062-C') as CardData;
    expect(puissance(seul, konohamaru), 'il ne se compte pas lui-même').toBe(imprime.power);
  });

  it('les Frères Démons se renforcent mutuellement, jamais seuls', () => {
    const gozu = simChar('SS-069-UC', { owner: 'player1' });
    const meizu = simChar('SS-070-UC', { owner: 'player1' });
    const seul = buildSimState({ p1: [gozu], p2: [], missions: 1 });
    const paire = buildSimState({ p1: [gozu, meizu], p2: [], missions: 1 });
    expect(puissance(paire, gozu) - puissance(seul, gozu), 'le frère vaut +2').toBe(2);
  });

  it('Genma 026 ne gagne ses 2 Puissance qu avec un Senbon', () => {
    const genma = simChar('SS-026-UC-inexistant'.replace('-UC-inexistant', '-C'), { owner: 'player1' });
    const sans = buildSimState({ p1: [genma], p2: [], missions: 1 });
    const avec = buildSimState({ p1: [avecEquipement(genma, 'SS-079-C')], p2: [], missions: 1 });
    const genmaEquipe = avec.activeMissions[0].player1Characters[0];
    expect(puissance(avec, genmaEquipe) - puissance(sans, genma), 'le Senbon vaut +2 plus sa propre puissance').toBe(3);
  });

  it('Aoi 066 reprend le coût de son arme', () => {
    const aoi = simChar('SS-066-C', { owner: 'player1' });
    const sans = buildSimState({ p1: [aoi], p2: [], missions: 1 });
    const arme = getCardById('SS-099-UC') as CardData;
    const avec = buildSimState({ p1: [avecEquipement(aoi, 'SS-099-UC')], p2: [], missions: 1 });
    const aoiEquipe = avec.activeMissions[0].player1Characters[0];
    const ecart = puissance(avec, aoiEquipe) - puissance(sans, aoi);
    expect(ecart, "le coût de l'arme s'ajoute, en plus de la puissance de l'arme").toBe((arme.chakra ?? 0) + (arme.power ?? 0));
  });

  it('Itachi 054 perd 3 Puissance face à Sasuke, et seulement là', () => {
    const itachi = simChar('SS-054-UC', { owner: 'player1' });
    const sasuke = simChar('SS-126-R', { owner: 'player2' });
    const seul = buildSimState({ p1: [itachi], p2: [], missions: 1 });
    const duel = buildSimState({ p1: [itachi], p2: [sasuke], missions: 1 });
    expect(puissance(duel, itachi) - puissance(seul, itachi), 'le duel coûte 3 Puissance').toBe(-3);
  });
});

describe('phase 1, gains de chakra du set 2', () => {
  it('Ino 010 exige un autre coéquipier de la Team 10', () => {
    const ino = simChar('SS-010-C', { owner: 'player1' });
    const seule = buildSimState({ p1: [ino], p2: [], missions: 1 });
    expect(calculateContinuousChakraBonus(seule, 'player1', 0, ino), 'seule, aucun bonus').toBe(0);

    const choji = simChar('SS-009-C', { owner: 'player1' });
    const equipe = buildSimState({ p1: [ino, choji], p2: [], missions: 1 });
    expect(calculateContinuousChakraBonus(equipe, 'player1', 0, ino), 'avec un coéquipier, +1').toBe(1);
  });

  it('Teuchi 061 ne donne rien si un allié est caché dans sa mission', () => {
    const teuchi = simChar('SS-061-C', { owner: 'player1' });
    const propre = buildSimState({ p1: [teuchi], p2: [], missions: 1 });
    expect(calculateContinuousChakraBonus(propre, 'player1', 0, teuchi)).toBe(1);

    const cache = simChar('SS-009-C', { owner: 'player1', hidden: true });
    const avecCache = buildSimState({ p1: [teuchi, cache], p2: [], missions: 1 });
    expect(calculateContinuousChakraBonus(avecCache, 'player1', 0, teuchi), 'un allié caché annule le bonus').toBe(0);
  });
});

describe('phase 1, effets sur les équipements et les déclenchements', () => {
  it('Grand-mère Sansho 067 réduit le coût des équipements Nourriture, pas des autres', () => {
    const sansho = simChar('SS-067-C', { owner: 'player1' });
    const s = buildSimState({ p1: [sansho], p2: [], missions: 1 });
    const curry = getCardById('SS-082-C') as CardData;
    const kunai = getCardById('SS-080-C') as CardData;
    expect(calculateEffectiveCost(s, 'player1', curry as never, 0, false), 'la Nourriture coûte 1 de moins').toBe(Math.max(0, (curry.chakra ?? 0) - 1));
    expect(calculateEffectiveCost(s, 'player1', kunai as never, 0, false), 'une arme garde son coût').toBe(kunai.chakra);
  });

  it('Might Guy 116 renforce la Team Guy équipée au début de la manche', () => {
    const guy = simChar('SS-116-R', { owner: 'player1' });
    const lee = avecEquipement(simChar('SS-115-R', { owner: 'player1' }), 'SS-087-UC');
    const sansEquipement = simChar('SS-112-R', { owner: 'player1' });
    const s = buildSimState({ p1: [guy, lee, sansEquipement], p2: [], missions: 1 });

    const apres = applyStartOfRoundTriggers(s);
    const leeApres = apres.activeMissions[0].player1Characters.find((c) => c.instanceId === lee.instanceId)!;
    const nejiApres = apres.activeMissions[0].player1Characters.find((c) => c.instanceId === sansEquipement.instanceId)!;
    expect(leeApres.powerTokens, "l'équipé reçoit 2 jetons").toBe(2);
    expect(nejiApres.powerTokens, "le non équipé n'en reçoit aucun").toBe(0);
  });

  it('Gato 075 paie quand un Rogue Ninja arrive dans sa mission', () => {
    const gato = simChar('SS-075-UC', { owner: 'player1' });
    const rogue = simChar('SS-054-UC', { owner: 'player1' });
    const s = buildSimState({ p1: [gato, rogue], p2: [], missions: 1, chakra1: 3 });

    const apres = triggerOnPlayReactions(s, 'player1', 0, false, rogue.instanceId);
    expect(apres.player1.chakra - s.player1.chakra, 'un chakra gagné').toBe(1);
    const rogueApres = apres.activeMissions[0].player1Characters.find((c) => c.instanceId === rogue.instanceId)!;
    expect(rogueApres.powerTokens, 'et un jeton sur le nouveau venu').toBe(1);
  });
});

describe('phase 1, obligations de fin et de décompte', () => {
  it('Akamaru 015 demande de payer, et meurt si le chakra manque', () => {
    const akamaru = simChar('SS-015-UC', { owner: 'player1' });
    const riche = buildSimState({ p1: [akamaru], p2: [], missions: 1, chakra1: 3 });
    const demande = akamaru015EndOfRound(riche);
    expect(
      demande.pendingEffects.some((p) => p.targetSelectionType === 'SS015_CONFIRM_PAY'),
      'avec du chakra, le joueur choisit',
    ).toBe(true);

    const pauvre: GameState = { ...riche, player1: { ...riche.player1, chakra: 0 } };
    const mort = akamaru015EndOfRound(pauvre);
    expect(mort.pendingEffects.length, 'sans chakra, aucun choix à faire').toBe(0);
    expect(
      mort.activeMissions[0].player1Characters.some((c) => c.instanceId === akamaru.instanceId),
      'le chien quitte le terrain',
    ).toBe(false);
  });

  it('Enma 132 cherche le Nyoi dans le deck et le pose', () => {
    const enma = simChar('SS-132-R', { owner: 'player1' });
    const hote = simChar('SS-010-C', { owner: 'player1' });
    const base = buildSimState({ p1: [enma, hote], p2: [], missions: 1, chakra1: 5 });
    const nyoi = getCardById('SS-098-UC') as CardData;
    const s: GameState = { ...base, player1: { ...base.player1, deck: [nyoi as never] } };

    const apres = enma132EndOfRound(s);
    expect(apres.player1.deck.length, 'le Nyoi sort du deck').toBe(0);
    expect(apres.player1.chakra, 'le coût réduit de 2 est payé').toBe(5 - Math.max(0, (nyoi.chakra ?? 0) - 2));

    const choix = apres.pendingEffects.find((p) => p.targetSelectionType === 'ATTACH_CHOOSE_TARGET');
    expect(choix, 'deux porteurs Feuille possibles, donc le joueur choisit').toBeTruthy();
    expect(choix!.validTargets.sort(), 'Enma et son allié sont proposés').toEqual([enma.instanceId, hote.instanceId].sort());
  });

  it('Enma 132 pose le Nyoi sans rien demander quand un seul porteur existe', () => {
    const enma = simChar('SS-132-R', { owner: 'player1' });
    const base = buildSimState({ p1: [enma], p2: [], missions: 1, chakra1: 5 });
    const nyoi = getCardById('SS-098-UC') as CardData;
    const s: GameState = { ...base, player1: { ...base.player1, deck: [nyoi as never] } };

    const apres = enma132EndOfRound(s);
    const equipes = apres.activeMissions[0].player1Characters.flatMap((c) => c.attachments ?? []);
    expect(equipes.some((a) => a.card.id === 'SS-098-UC'), 'le Nyoi arrive directement sur Enma').toBe(true);
    expect(apres.pendingEffects.length, 'aucune question inutile').toBe(0);
  });

  it('Enma 132 se contente de le dire quand le Nyoi est absent', () => {
    const enma = simChar('SS-132-R', { owner: 'player1' });
    const base = buildSimState({ p1: [enma], p2: [], missions: 1, chakra1: 5 });
    const apres = enma132EndOfRound(base);
    expect(apres.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'le refus est journalisé').toBe(true);
  });

  it('Shinigami 057 emporte un ennemi avant le calcul des puissances', () => {
    const shinigami = simChar('SS-057-UC', { owner: 'player1' });
    const proie = simChar('SS-010-C', { owner: 'player2' });
    const s = buildSimState({ p1: [shinigami], p2: [proie], missions: 1 });

    const apres = shinigami057BeforePower(s);
    expect(
      apres.activeMissions[0].player2Characters.some((c) => c.instanceId === proie.instanceId),
      'la cible unique tombe sans demander',
    ).toBe(false);
  });

  it('Shinigami 057 laisse choisir quand plusieurs ennemis sont là', () => {
    const shinigami = simChar('SS-057-UC', { owner: 'player1' });
    const proie1 = simChar('SS-010-C', { owner: 'player2' });
    const proie2 = simChar('SS-009-C', { owner: 'player2' });
    const s = buildSimState({ p1: [shinigami], p2: [proie1, proie2], missions: 1 });

    const apres = shinigami057BeforePower(s);
    const choix = apres.pendingEffects.find((p) => p.targetSelectionType === 'SS057_DEFEAT_BEFORE_POWER');
    expect(choix, 'un choix est proposé').toBeTruthy();
    expect(choix!.validTargets.length, 'les deux ennemis sont proposés').toBe(2);
  });
});
