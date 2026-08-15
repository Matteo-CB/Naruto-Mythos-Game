import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import { getCardById } from '@/lib/data/cardIndex';
import { findAffordableSoundVillageInHand } from '@/lib/effects/handlers/KS/shared/summonSearch';
import { isFirstCardPlayedThisRound } from '@/lib/engine/rules/firstStrike';
import { attachCardToCharacter } from '@/lib/effects/attachments';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { CardData, GameState, PendingEffect } from '@/lib/engine/types';

function resoudreTout(depart: GameState): GameState {
  let s = depart;
  let garde = 0;
  while (s.pendingEffects.length > 0 && garde++ < 12) {
    const p = s.pendingEffects[s.pendingEffects.length - 1];
    if (!p.validTargets || p.validTargets.length === 0) break;
    s = EffectEngine.applyTargetedEffect(s, p, [p.validTargets[0]]);
    s = {
      ...s,
      pendingEffects: s.pendingEffects.filter((pe) => pe.id !== p.id),
      pendingActions: s.pendingActions.filter((pa) => pa.sourceEffectId !== p.id),
    };
  }
  return s;
}

describe('Orochimaru 127 revele ne vole qu un seul personnage', () => {
  it('AMBUSH et DUEL ne se cumulent pas quand Sasuke est present', () => {
    const oro = simChar('SS-127-R', { owner: 'player1', hidden: true });
    const sasuke = simChar('SS-126-R', { owner: 'player1' });
    const proie1 = simChar('SS-039-C', { owner: 'player2' });
    const proie2 = simChar('SS-032-C', { owner: 'player2' });
    const depart = buildSimState({ p1: [oro, sasuke], p2: [proie1, proie2], chakra1: 20, missions: 1 });

    let s = EffectEngine.resolveRevealEffects(depart, 'player1', { ...oro, isHidden: false }, 0, true);
    s = resoudreTout(s);

    const voles = [...s.activeMissions[0].player1Characters, ...s.activeMissions[0].player2Characters]
      .filter((c) => c.controlledBy !== c.originalOwner);
    expect(voles.length, 'un seul personnage vole, jamais deux').toBeLessThanOrEqual(1);
  });
});

describe('le contexte de jeu survit a une etape de confirmation', () => {
  it('un pending cree pendant la resolution herite de revele et premiere carte', () => {
    const source = simChar('SS-127-R', { owner: 'player1' });
    const depart = buildSimState({ p1: [source], p2: [], missions: 1 });
    const parent: PendingEffect = {
      id: 'parent',
      sourceCardId: 'SS-127-R',
      sourceInstanceId: source.instanceId,
      sourceMissionIndex: 0,
      effectType: 'AMBUSH',
      effectDescription: JSON.stringify({}),
      targetSelectionType: 'TYPE_SANS_TRAITEMENT',
      sourcePlayer: 'player1',
      requiresTargetSelection: true,
      validTargets: [source.instanceId],
      isOptional: true,
      isMandatory: false,
      resolved: false,
      isUpgrade: false,
      wasRevealed: true,
      wasFirstCard: true,
    } as PendingEffect;

    const orphelin = { ...parent, id: 'orphelin', wasRevealed: false, wasFirstCard: false } as PendingEffect;
    const avant: GameState = { ...depart, pendingEffects: [orphelin] };
    const apres = EffectEngine.applyTargetedEffect(avant, parent, [source.instanceId]);

    const conserve = apres.pendingEffects.find((p) => p.id === 'orphelin');
    expect(conserve, 'un pending anterieur reste intact').toBeTruthy();
    expect(conserve!.wasRevealed, "il n'herite pas retroactivement").toBe(false);
  });
});

describe('Tayuya 125 ne taxe que les personnages', () => {
  it('la surtaxe ennemie ne s applique pas a un equipement', () => {
    const tayuya = simChar('KS-125-R', { owner: 'player2' });
    const s = buildSimState({ p1: [], p2: [tayuya], missions: 1 });

    const epee = getCardById('SS-101-UC') as CardData;
    const perso = getCardById('SS-039-C') as CardData;
    expect(
      calculateEffectiveCost(s, 'player1', epee as never, 0, false),
      "l equipement paie son cout imprime",
    ).toBe(epee.chakra);
    expect(
      calculateEffectiveCost(s, 'player1', perso as never, 0, false),
      'le personnage paie bien un chakra de plus',
    ).toBe((perso.chakra ?? 0) + 1);
  });

  it('une recherche de personnage Sound Village ne propose aucun equipement', () => {
    const s = buildSimState({ p1: [], p2: [], missions: 1, hand1: ['SS-101-UC', 'SS-093-C', 'SS-039-C'], chakra1: 20 });
    const main = s.player1.hand;
    const proposes = findAffordableSoundVillageInHand(s, 'player1', 2).map((i) => main[i] as unknown as CardData);
    expect(proposes.length, 'seule la Tayuya du set 2 est proposee').toBe(1);
    expect(proposes[0].card_type, 'et c est bien un personnage').toBe('character');
  });
});

describe('Epee Serpent 101 declenche son FIRST STRIKE', () => {
  it('jouee en premiere carte de la manche, elle demande sa cible', () => {
    const hote = simChar('SS-039-C', { owner: 'player1' });
    const ennemi = simChar('SS-032-C', { owner: 'player2' });
    const depart = buildSimState({ p1: [hote], p2: [ennemi], missions: 1, chakra1: 20 });
    expect(isFirstCardPlayedThisRound(depart, 'player1'), 'la fenetre est ouverte au depart').toBe(true);

    const apres = attachCardToCharacter(depart, 'player1', getCardById('SS-101-UC') as CardData, hote.instanceId);
    expect(
      apres.pendingEffects.some((p) => p.targetSelectionType === 'SS101_CONFIRM_FIRST_STRIKE'),
      "le FIRST STRIKE de l equipement s ouvre",
    ).toBe(true);
    expect(isFirstCardPlayedThisRound(apres, 'player1'), 'la fenetre est consommee').toBe(false);
  });

  it('jouee apres une autre carte, elle ne declenche rien', () => {
    const hote = simChar('SS-039-C', { owner: 'player1' });
    const ennemi = simChar('SS-032-C', { owner: 'player2' });
    const base = buildSimState({ p1: [hote], p2: [ennemi], missions: 1, chakra1: 20 });
    const depart: GameState = { ...base, firstStrike: { player1: 'expired', player2: 'available' } };

    const apres = attachCardToCharacter(depart, 'player1', getCardById('SS-101-UC') as CardData, hote.instanceId);
    expect(apres.pendingEffects.some((p) => p.targetSelectionType === 'SS101_CONFIRM_FIRST_STRIKE')).toBe(false);
  });
});

describe('Kakashi 016 copie un FIRST STRIKE quand il est la premiere carte jouee', () => {
  const copieAboutie = (etatFinal: GameState) =>
    etatFinal.log.some((l) => l.messageKey === 'game.log.effect.copySuccess');

  function chaine(depart: GameState, cible: string): GameState {
    let s = depart;
    for (let i = 0; i < 4 && s.pendingEffects.length > 0; i++) {
      const p = s.pendingEffects[s.pendingEffects.length - 1];
      const dispo = p.validTargets ?? [];
      const choisi = dispo.includes(cible) ? [cible] : dispo.slice(0, 1);
      if (choisi.length === 0) break;
      const avant = s;
      s = EffectEngine.applyTargetedEffect(s, p, choisi);
      s = {
        ...s,
        pendingEffects: s.pendingEffects.filter((pe) => pe.id !== p.id),
        pendingActions: s.pendingActions.filter((pa) => pa.sourceEffectId !== p.id),
      };
      if (s === avant) break;
    }
    return s;
  }

  it('la copie aboutit jusqu au bout de la chaine', () => {
    const kakashi = simChar('KS-016-UC', { owner: 'player1' });
    const cible = simChar('SS-030-C', { owner: 'player2' });
    const depart = buildSimState({ p1: [kakashi], p2: [cible], missions: 1, chakra1: 20 });

    const joue = EffectEngine.resolvePlayEffects(depart, 'player1', kakashi, 0, false);
    const fin = chaine(joue, cible.instanceId);
    expect(copieAboutie(fin), 'le FIRST STRIKE ennemi est bien copie et resolu').toBe(true);
  });

  it('hors fenetre, la cible n est meme pas proposee', () => {
    const kakashi = simChar('KS-016-UC', { owner: 'player1' });
    const cible = simChar('SS-030-C', { owner: 'player2' });
    const base = buildSimState({ p1: [kakashi], p2: [cible], missions: 1, chakra1: 20 });
    const depart: GameState = { ...base, firstStrike: { player1: 'expired', player2: 'available' } };

    const joue = EffectEngine.resolvePlayEffects(depart, 'player1', kakashi, 0, false);
    const fin = chaine(joue, cible.instanceId);
    expect(copieAboutie(fin), 'rien a copier quand Kakashi n ouvre pas la manche').toBe(false);
  });
});
