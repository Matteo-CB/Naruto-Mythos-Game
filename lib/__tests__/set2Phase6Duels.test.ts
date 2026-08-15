import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { GameEngine } from '@/lib/engine/GameEngine';
import { registerAllSetHandlers } from '@/lib/effects/handlers';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { checkFlexibleUpgrade } from '@/lib/engine/rules/PlayValidation';
import { triggerOnPlayReactions } from '@/lib/effects/ContinuousEffects';
import {
  hokagesEnJeu, hokagesDeplacables, duelOrochimaruTenu, invocationsJouablesIci,
} from '@/lib/effects/handlers/SS/duels6';
import type { CardData, CharacterCard, CharacterInPlay, GameState } from '@/lib/engine/types';

registerAllSetHandlers();

function avecMain(base: GameState, ids: string[], joueur: 'player1' | 'player2' = 'player1'): GameState {
  return { ...base, [joueur]: { ...base[joueur], hand: ids.map((i) => getCardById(i) as never) } };
}

function jusquAuBout(depart: GameState, pas = 10): GameState {
  let s = depart;
  for (let i = 0; i < pas && s.pendingEffects.length > 0; i++) {
    const p = s.pendingEffects[s.pendingEffects.length - 1];
    const cibles = p.validTargets ?? [];
    if (cibles.length === 0) break;
    s = EffectEngine.applyTargetedEffect(s, p, [cibles[0]]);
    s = {
      ...s,
      pendingEffects: s.pendingEffects.filter((pe) => pe.id !== p.id),
      pendingActions: s.pendingActions.filter((pa) => pa.sourceEffectId !== p.id),
    };
  }
  return s;
}

function charDe(state: GameState, instanceId: string): CharacterInPlay | null {
  for (const m of state.activeMissions) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const c = m[side].find((x) => x.instanceId === instanceId);
      if (c) return c;
    }
  }
  return null;
}

describe('Shino Aburame 113, la defausse et son duel', () => {
  function plateau(avecKankuro: boolean) {
    const shino = simChar('SS-113-R', { owner: 'player1', instanceId: 'sim-shino' });
    const p2 = avecKankuro ? [simChar('KS-077-C', { owner: 'player2', instanceId: 'sim-kankuro' })] : [];
    let s = buildSimState({ p1: [shino], p2, missions: 1, chakra1: 0 });
    s = avecMain(s, ['KS-104-R', 'KS-009-C'], 'player2');
    return { state: s, shino };
  }

  it('sans Kankuro, l_adversaire choisit lui-meme la carte defaussee', () => {
    const { state, shino } = plateau(false);
    const joue = EffectEngine.resolvePlayEffects(state, 'player1', shino, 0, false);
    const confirmation = joue.pendingEffects[joue.pendingEffects.length - 1];
    const apres = EffectEngine.applyTargetedEffect(joue, confirmation, [confirmation.validTargets![0]]);

    const question = apres.pendingEffects[apres.pendingEffects.length - 1];
    expect(question.targetSelectionType, 'on passe directement au choix').toBe('SS113_CHOOSE_DISCARD');
    expect(question.selectingPlayer, 'c_est l_adversaire qui decide').toBe('player2');

    const fin = jusquAuBout(apres);
    expect(fin.player2.hand.length, 'une carte est partie').toBe(1);
    expect(fin.player2.discardPile.length, 'elle est en defausse').toBe(1);
    expect(fin.log.some((l) => l.messageKey === 'game.log.effect.ss113Chosen'), 'le journal le dit').toBe(true);
  });

  it('avec Kankuro, la question du duel precede la defausse', () => {
    const { state, shino } = plateau(true);
    expect(duelOrochimaruTenu(state, 0), 'ce duel n_est pas celui d_Orochimaru').toBe(false);

    const joue = EffectEngine.resolvePlayEffects(state, 'player1', shino, 0, false);
    const confirmation = joue.pendingEffects[joue.pendingEffects.length - 1];
    const apres = EffectEngine.applyTargetedEffect(joue, confirmation, [confirmation.validTargets![0]]);

    const question = apres.pendingEffects[apres.pendingEffects.length - 1];
    expect(question.targetSelectionType, 'le duel est propose avant').toBe('SS113_CONFIRM_DUEL_MODIFIER');
    expect(question.isOptional, 'et il est refusable').toBe(true);
    expect(apres.player2.hand.length, 'rien n_est encore defausse').toBe(2);

    const fin = jusquAuBout(apres);
    expect(fin.player2.hand.length, 'la defausse aleatoire a eu lieu').toBe(1);
    expect(fin.log.some((l) => l.messageKey === 'game.log.effect.ss113Random'), 'au hasard').toBe(true);
  });

  it('refuser le duel rend la main a l_adversaire pour choisir', () => {
    const { state, shino } = plateau(true);
    const joue = EffectEngine.resolvePlayEffects(state, 'player1', shino, 0, false);
    const confirmation = joue.pendingEffects[joue.pendingEffects.length - 1];
    const apres = EffectEngine.applyTargetedEffect(joue, confirmation, [confirmation.validTargets![0]]);

    const modificateur = apres.pendingEffects[apres.pendingEffects.length - 1];
    const refuse = GameEngine.applyAction(apres, 'player1',
      { type: 'DECLINE_OPTIONAL_EFFECT', pendingEffectId: modificateur.id });

    const suite = refuse.pendingEffects[refuse.pendingEffects.length - 1];
    expect(suite?.targetSelectionType, 'la defausse normale prend le relais').toBe('SS113_CHOOSE_DISCARD');
    expect(suite?.selectingPlayer, 'et l_adversaire choisit').toBe('player2');
  });

  it('la main adverse vide fait taire la carte avec un journal', () => {
    const shino = simChar('SS-113-R', { owner: 'player1', instanceId: 'sim-shino' });
    const s = buildSimState({ p1: [shino], p2: [], missions: 1, chakra1: 0 });
    const joue = EffectEngine.resolvePlayEffects(s, 'player1', shino, 0, false);
    expect(joue.pendingEffects.length, 'aucune question').toBe(0);
    expect(joue.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'le refus est journalise').toBe(true);
  });
});

describe('Hashirama 129 et Tobirama 131, les Hokage', () => {
  it('Hashirama renforce un Hokage en jeu', () => {
    const hashirama = simChar('SS-129-R', { owner: 'player1', instanceId: 'sim-hashirama' });
    const hokage = simChar('SS-131-R', { owner: 'player1', instanceId: 'sim-hokage' });
    const s = buildSimState({ p1: [hashirama, hokage], p2: [], missions: 1, chakra1: 0 });

    expect(hokagesEnJeu(s).map((c) => c.instanceId).sort(), 'les deux sont Hokage').toEqual(['sim-hashirama', 'sim-hokage']);
    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(s, 'player1', hashirama, 0, false));
    const total = (charDe(fin, 'sim-hashirama')?.powerTokens ?? 0) + (charDe(fin, 'sim-hokage')?.powerTokens ?? 0);
    expect(total, 'deux jetons places sur un Hokage').toBe(2);
  });

  it('Tobirama deplace un Hokage vers une autre mission', () => {
    const tobirama = simChar('SS-131-R', { owner: 'player1', instanceId: 'sim-tobirama' });
    const hokage = simChar('SS-133-R', { owner: 'player1', instanceId: 'sim-hokage' });
    const s = buildSimState({ p1: [tobirama, hokage], p2: [], missions: 2, chakra1: 0 });

    expect(hokagesDeplacables(s).length, 'les deux peuvent bouger').toBe(2);
    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(s, 'player1', tobirama, 0, false));
    const restants = fin.activeMissions[0].player1Characters.length;
    expect(restants, 'un Hokage a quitte la mission').toBe(1);
  });

  it('sans Hokage en jeu, les deux se taisent avec un journal', () => {
    const tobirama = simChar('SS-131-R', { owner: 'player1', instanceId: 'sim-tobirama' });
    const s = buildSimState({ p1: [tobirama], p2: [], missions: 1, chakra1: 0 });
    const joue = EffectEngine.resolvePlayEffects(s, 'player1', tobirama, 0, false);
    expect(joue.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'le refus est journalise').toBe(true);
  });

  it('le duel Orochimaru ouvre l_amelioration sur un autre nom', () => {
    const cible = simChar('KS-009-C', { owner: 'player1', instanceId: 'sim-cible' });
    const orochimaru = simChar('SS-127-R', { owner: 'player1', instanceId: 'sim-orochimaru' });
    const avec = buildSimState({ p1: [cible, orochimaru], p2: [], missions: 1, chakra1: 20 });
    const sans = buildSimState({ p1: [cible], p2: [], missions: 1, chakra1: 20 });

    const hashirama = getCardById('SS-129-R') as never as CharacterCard;
    const naruto = getCardById('KS-009-C') as never as CharacterCard;

    expect(duelOrochimaruTenu(avec, 0), 'Orochimaru est la').toBe(true);
    expect(checkFlexibleUpgrade(hashirama, naruto, avec, 0), 'l_amelioration libre est ouverte').toBe(true);
    expect(checkFlexibleUpgrade(hashirama, naruto, sans, 0), 'sans Orochimaru elle reste fermee').toBe(false);
    expect(checkFlexibleUpgrade(hashirama, naruto), 'et sans plateau on ne suppose rien').toBe(false);
  });

  it('l_amelioration libre ne beneficie qu_aux deux Senju', () => {
    const orochimaru = simChar('SS-127-R', { owner: 'player1', instanceId: 'sim-orochimaru' });
    const s = buildSimState({ p1: [orochimaru], p2: [], missions: 1, chakra1: 20 });
    const autre = getCardById('SS-133-R') as never as CharacterCard;
    const naruto = getCardById('KS-009-C') as never as CharacterCard;
    expect(checkFlexibleUpgrade(autre, naruto, s, 0), 'Hiruzen 133 ne gagne rien').toBe(false);
  });
});

describe('Hiruzen Sarutobi 133, le declencheur et le duel', () => {
  it('un allie Village de Konoha joue dans sa mission gagne 2 de Puissance', () => {
    const hiruzen = simChar('SS-133-R', { owner: 'player1', instanceId: 'sim-hiruzen' });
    const arrivant = simChar('KS-009-C', { owner: 'player1', instanceId: 'sim-arrivant' });
    const s = buildSimState({ p1: [hiruzen, arrivant], p2: [], missions: 1, chakra1: 0 });

    const fin = triggerOnPlayReactions(s, 'player1', 0, false, 'sim-arrivant');
    expect(charDe(fin, 'sim-arrivant')?.powerTokens, 'deux jetons').toBe(2);
    expect(fin.log.some((l) => l.messageKey === 'game.log.effect.ss133Powerup'), 'le journal le dit').toBe(true);
  });

  it('un allie d_un autre village ne declenche rien', () => {
    const hiruzen = simChar('SS-133-R', { owner: 'player1', instanceId: 'sim-hiruzen' });
    const arrivant = simChar('SS-052-C', { owner: 'player1', instanceId: 'sim-arrivant' });
    const s = buildSimState({ p1: [hiruzen, arrivant], p2: [], missions: 1, chakra1: 0 });

    const fin = triggerOnPlayReactions(s, 'player1', 0, false, 'sim-arrivant');
    expect(charDe(fin, 'sim-arrivant')?.powerTokens, 'aucun jeton').toBe(0);
  });

  it('un ennemi de Konoha ne declenche rien non plus', () => {
    const hiruzen = simChar('SS-133-R', { owner: 'player1', instanceId: 'sim-hiruzen' });
    const ennemi = simChar('KS-009-C', { owner: 'player2', instanceId: 'sim-ennemi' });
    const s = buildSimState({ p1: [hiruzen], p2: [ennemi], missions: 1, chakra1: 0 });

    const fin = triggerOnPlayReactions(s, 'player2', 0, false, 'sim-ennemi');
    expect(charDe(fin, 'sim-ennemi')?.powerTokens, 'aucun jeton').toBe(0);
  });

  it('le duel joue une Invocation de la main dans cette mission a prix reduit', () => {
    const hiruzen = simChar('SS-133-R', { owner: 'player1', instanceId: 'sim-hiruzen' });
    const orochimaru = simChar('SS-127-R', { owner: 'player1', instanceId: 'sim-orochimaru' });
    let s = buildSimState({ p1: [hiruzen, orochimaru], p2: [], missions: 2, chakra1: 10 });
    s = avecMain(s, ['KS-096-C']);

    const jouables = invocationsJouablesIci(s, 'player1', 0, 2);
    expect(jouables.handIndices, 'l_invocation de la main est jouable ici').toEqual([0]);

    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(s, 'player1', hiruzen, 0, false), 12);
    expect(fin.activeMissions[0].player1Characters.some((c) => c.card.id === 'KS-096-C'),
      'elle arrive bien dans cette mission').toBe(true);
    expect(fin.activeMissions[1].player1Characters.some((c) => c.card.id === 'KS-096-C'),
      'et nulle part ailleurs').toBe(false);
    expect(fin.player1.hand.length, 'elle quitte la main').toBe(0);
  });

  it('sans Orochimaru, le duel ne se declenche pas', () => {
    const hiruzen = simChar('SS-133-R', { owner: 'player1', instanceId: 'sim-hiruzen' });
    let s = buildSimState({ p1: [hiruzen], p2: [], missions: 2, chakra1: 10 });
    s = avecMain(s, ['KS-096-C']);

    const joue = EffectEngine.resolvePlayEffects(s, 'player1', hiruzen, 0, false);
    expect(joue.pendingEffects.length, 'aucune question').toBe(0);
    expect(joue.player1.hand.length, 'la main est intacte').toBe(1);
  });
});

describe('les textes de la phase 6 existent partout', () => {
  it('les sept langues portent les nouvelles cles', async () => {
    const descriptions = ['ss113Discard', 'ss113DuelModifier', 'ss113ChooseDiscard', 'ss129PowerupHokage',
      'ss131MoveHokage', 'ss131MoveDestination', 'ss133PlaySummon'];
    const journaux = ['ss113Random', 'ss113Chosen', 'ss133Powerup'];
    for (const langue of ['fr', 'en', 'es', 'ja', 'pt', 'it', 'pl']) {
      const messages = (await import(`@/messages/${langue}.json`)).default as never;
      const desc = (messages as { game: { effect: { desc: Record<string, string> } } }).game.effect.desc;
      const log = (messages as { game: { log: { effect: Record<string, string> } } }).game.log.effect;
      for (const cle of descriptions) expect(typeof desc[cle], `${langue} porte ${cle}`).toBe('string');
      for (const cle of journaux) expect(typeof log[cle], `${langue} porte ${cle}`).toBe('string');
    }
  });

  it('les quatre cartes ont leur texte d_effet dans les sept langues', async () => {
    const { getCardEffectDescriptions } = await import('@/lib/data/effectDescriptions');
    for (const langue of ['fr', 'en', 'es', 'ja', 'pt', 'it', 'pl']) {
      for (const id of ['SS-113-R', 'SS-129-R', 'SS-131-R', 'SS-133-R']) {
        const attendu = (getCardById(id) as CardData).effects?.length ?? 0;
        const textes = getCardEffectDescriptions(id, langue);
        expect(textes?.length, `${langue} decrit chaque effet de ${id}`).toBe(attendu);
        expect(textes!.every((t) => t.trim().length > 0), `${langue} ne laisse pas ${id} vide`).toBe(true);
      }
    }
  });
});
