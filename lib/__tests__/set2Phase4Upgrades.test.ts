import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { registerAllSetHandlers } from '@/lib/effects/handlers';
import { getEffectHandler } from '@/lib/effects/EffectRegistry';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { attachCardToCharacter } from '@/lib/effects/attachments';
import { jiraiyaGoldSources } from '@/lib/effects/handlers/SS/goldCards';
import { team8AlliesIn } from '@/lib/effects/handlers/SS/kurenai018';
import { equipementsJouablesDepuisLaMain, bonusArmeSurTenten } from '@/lib/effects/handlers/SS/tenten022';
import { ennemisDeMemePuissance } from '@/lib/effects/handlers/SS/asuma138';
import { narutosEnJeu, narutosJouablesEnMain, coutCacheReduit } from '@/lib/effects/handlers/SS/iruka140';
import type { CardData, CharacterInPlay, GameState } from '@/lib/engine/types';

registerAllSetHandlers();

function avecMain(base: GameState, ids: string[]): GameState {
  return { ...base, player1: { ...base.player1, hand: ids.map((i) => getCardById(i) as never) } };
}

function empile(base: CharacterInPlay, dessus: string): CharacterInPlay {
  const carte = getCardById(dessus) as never as CharacterInPlay['card'];
  return { ...base, card: carte, stack: [...base.stack, carte] };
}

function jusquAuBout(depart: GameState, pas = 8): GameState {
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

describe('Kurenai Yuhi 018, renforcer l_Equipe 8 une fois par effet', () => {
  function plateau() {
    const kurenai = empile(simChar('KS-034-C', { owner: 'player1', instanceId: 'sim-kurenai' }), 'SS-018-UC');
    const hinata = simChar('SS-016-C', { owner: 'player1', instanceId: 'sim-hinata' });
    return { state: buildSimState({ p1: [kurenai, hinata], p2: [], missions: 1, chakra1: 20 }), kurenai };
  }

  it('le jeu frais donne 1 jeton a chaque autre allie Equipe 8', () => {
    const { state, kurenai } = plateau();
    expect(team8AlliesIn(state, 'player1', 0, 'sim-kurenai').map((c) => c.instanceId),
      'Kurenai ne se compte pas elle-meme').toEqual(['sim-hinata']);

    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(state, 'player1', kurenai, 0, false));
    expect(charDe(fin, 'sim-hinata')?.powerTokens, 'Hinata gagne 1').toBe(1);
    expect(charDe(fin, 'sim-kurenai')?.powerTokens, 'Kurenai ne se renforce pas').toBe(0);
  });

  it('le jeu en amelioration declenche le MAIN et l_UPGRADE, donc 2 jetons', () => {
    const { state, kurenai } = plateau();
    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(state, 'player1', kurenai, 0, true));
    expect(charDe(fin, 'sim-hinata')?.powerTokens, 'un jeton par effet').toBe(2);
  });

  it('refuser les deux questions ne donne aucun jeton', () => {
    const { state, kurenai } = plateau();
    const joue = EffectEngine.resolvePlayEffects(state, 'player1', kurenai, 0, true);
    expect(joue.pendingEffects.length, 'une question est posee').toBeGreaterThan(0);
    expect(joue.pendingEffects.every((p) => p.isOptional), 'elles sont refusables').toBe(true);
    expect(charDe(joue, 'sim-hinata')?.powerTokens, 'rien tant qu_on ne repond pas').toBe(0);
  });

  it('sans autre allie Equipe 8, la carte le journalise sans rien demander', () => {
    const kurenai = empile(simChar('KS-034-C', { owner: 'player1', instanceId: 'sim-kurenai' }), 'SS-018-UC');
    const state = buildSimState({ p1: [kurenai], p2: [], missions: 1, chakra1: 20 });
    const joue = EffectEngine.resolvePlayEffects(state, 'player1', kurenai, 0, false);
    expect(joue.pendingEffects.length, 'aucune question').toBe(0);
    expect(joue.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'le refus est journalise').toBe(true);
  });
});

describe('Tenten 022, l_arme qui renforce et l_equipement a prix reduit', () => {
  function plateau(mainIds: string[]) {
    const tenten = empile(simChar('SS-021-C', { owner: 'player1', instanceId: 'sim-tenten' }), 'SS-022-UC');
    let s = buildSimState({ p1: [tenten], p2: [], missions: 1, chakra1: 6 });
    s = avecMain(s, mainIds);
    return { state: s, tenten };
  }

  it('l_UPGRADE joue un equipement de la main en payant 2 de moins', () => {
    const { state, tenten } = plateau(['SS-099-UC']);
    expect(equipementsJouablesDepuisLaMain(state, 'player1', 2), 'le sabre est abordable').toEqual([0]);

    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(state, 'player1', tenten, 0, true));
    expect(fin.player1.hand.length, 'la carte quitte la main').toBe(0);
    expect(fin.player1.chakra, 'trois moins deux, donc un paye').toBe(5);
    expect((charDe(fin, 'sim-tenten')?.attachments ?? []).map((a) => a.card.id), 'le sabre est pose').toEqual(['SS-099-UC']);
  });

  it('poser une Arme sur Tenten lui donne 3 jetons de Puissance', () => {
    const { state } = plateau([]);
    const kunai = getCardById('SS-080-C') as CardData;
    expect(bonusArmeSurTenten(charDe(state, 'sim-tenten'), kunai), 'le Kunai est une Arme').toBe(3);

    const pose = attachCardToCharacter(state, 'player1', kunai, 'sim-tenten');
    expect(charDe(pose, 'sim-tenten')?.powerTokens, 'trois jetons').toBe(3);
    expect(pose.log.some((l) => l.messageKey === 'game.log.effect.ss022WeaponBonus'), 'le journal le dit').toBe(true);
  });

  it('un equipement sans mot cle Arme ne donne rien', () => {
    const { state } = plateau([]);
    const ramen = getCardById('SS-081-C') as CardData;
    expect(bonusArmeSurTenten(charDe(state, 'sim-tenten'), ramen), 'le Ramen n_est pas une Arme').toBe(0);
    const pose = attachCardToCharacter(state, 'player1', ramen, 'sim-tenten');
    expect(charDe(pose, 'sim-tenten')?.powerTokens, 'aucun jeton').toBe(0);
  });

  it('une Arme posee sur un autre personnage ne declenche rien', () => {
    const tenten = empile(simChar('SS-021-C', { owner: 'player1', instanceId: 'sim-tenten' }), 'SS-022-UC');
    const autre = simChar('SS-016-C', { owner: 'player1', instanceId: 'sim-autre' });
    const state = buildSimState({ p1: [tenten, autre], p2: [], missions: 1, chakra1: 6 });
    const pose = attachCardToCharacter(state, 'player1', getCardById('SS-080-C') as CardData, 'sim-autre');
    expect(charDe(pose, 'sim-autre')?.powerTokens, 'le voisin ne gagne rien').toBe(0);
  });

  it('sans equipement abordable, la carte le journalise sans rien demander', () => {
    const { state, tenten } = plateau(['KS-009-C']);
    const joue = EffectEngine.resolvePlayEffects(state, 'player1', tenten, 0, true);
    expect(joue.pendingEffects.length, 'aucune question').toBe(0);
    expect(joue.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'le refus est journalise').toBe(true);
  });
});

describe('Asuma Sarutobi 138, defausser pour frapper a puissance egale', () => {
  function plateau(mainIds: string[], ennemi = 'KS-104-R') {
    const asuma = empile(simChar('SS-012-C', { owner: 'player1', instanceId: 'sim-asuma' }), 'SS-138-R');
    const cible = simChar(ennemi, { owner: 'player2', instanceId: 'sim-egale' });
    let s = buildSimState({ p1: [asuma], p2: [cible], missions: 1, chakra1: 20 });
    s = avecMain(s, mainIds);
    return { state: s, asuma };
  }

  it('le MAIN defausse une carte et donne sa Puissance en jetons', () => {
    const { state, asuma } = plateau(['KS-011-C']);
    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(state, 'player1', asuma, 0, false));

    expect(fin.player1.discardPile.some((c) => c.id === 'KS-011-C'), 'la carte est defaussee').toBe(true);
    expect(charDe(fin, 'sim-asuma')?.powerTokens, 'deux jetons pour une carte de Puissance 2').toBe(2);
  });

  it('l_UPGRADE vainc l_ennemi dont la Puissance egale celle d_Asuma apres le MAIN', () => {
    const { state, asuma } = plateau(['KS-011-C']);
    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(state, 'player1', asuma, 0, true), 12);

    expect(charDe(fin, 'sim-asuma')?.powerTokens, 'Asuma passe a 4 plus 2').toBe(2);
    expect(charDe(fin, 'sim-egale'), 'la cible de Puissance 6 est vaincue').toBeNull();
  });

  it('un ennemi d_une autre Puissance n_est pas une cible', () => {
    const { state } = plateau(['KS-011-C'], 'KS-005-C');
    expect(ennemisDeMemePuissance(state, 'player1', 0, 'sim-asuma').length, 'aucune cible').toBe(0);
  });

  it('la main vide empeche le MAIN et le journalise', () => {
    const { state, asuma } = plateau([]);
    const joue = EffectEngine.resolvePlayEffects(state, 'player1', asuma, 0, false);
    expect(joue.pendingEffects.length, 'aucune question').toBe(0);
    expect(joue.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'le refus est journalise').toBe(true);
  });
});

describe('Iruka Umino 140, cacher un Naruto et en poser un autre', () => {
  function plateau(mainIds: string[], avecNaruto = true) {
    const iruka = empile(simChar('SS-024-C', { owner: 'player1', instanceId: 'sim-iruka' }), 'SS-140-R');
    const ennemis = avecNaruto ? [simChar('KS-010-C', { owner: 'player2', instanceId: 'sim-naruto' })] : [];
    let s = buildSimState({ p1: [iruka], p2: ennemis, missions: 2, chakra1: 20 });
    s = avecMain(s, mainIds);
    return { state: s, iruka };
  }

  it('le MAIN cache un Naruto Uzumaki en jeu, meme ennemi', () => {
    const { state, iruka } = plateau([]);
    expect(narutosEnJeu(state).map((c) => c.instanceId), 'le Naruto ennemi est visible').toEqual(['sim-naruto']);

    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(state, 'player1', iruka, 0, false));
    expect(charDe(fin, 'sim-naruto')?.isHidden, 'il est cache').toBe(true);
  });

  it('l_UPGRADE pose un Naruto de la main face cachee sans rien payer', () => {
    const { state, iruka } = plateau(['KS-009-C']);
    expect(coutCacheReduit(2), 'un moins deux, plancher a zero').toBe(0);
    expect(narutosJouablesEnMain(state, 'player1', 2), 'le Naruto de la main est jouable').toEqual([0]);

    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(state, 'player1', iruka, 0, true), 12);
    expect(fin.player1.chakra, 'rien n_est paye').toBe(20);
    expect(fin.player1.hand.length, 'la carte quitte la main').toBe(0);

    const poses = fin.activeMissions.flatMap((m) => m.player1Characters).filter((c) => c.card.id === 'KS-009-C');
    expect(poses.length, 'le Naruto est en jeu').toBe(1);
    expect(poses[0].isHidden, 'il est face cachee').toBe(true);
    expect(poses[0].wasRevealedAtLeastOnce, 'il n_a jamais ete montre').toBe(false);
  });

  it('sans Naruto visible en jeu, le MAIN le journalise sans rien demander', () => {
    const { state, iruka } = plateau([], false);
    const joue = EffectEngine.resolvePlayEffects(state, 'player1', iruka, 0, false);
    expect(joue.pendingEffects.length, 'aucune question').toBe(0);
    expect(joue.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'le refus est journalise').toBe(true);
  });

  it('sans Naruto en main, l_UPGRADE le journalise sans rien demander', () => {
    const { state, iruka } = plateau(['KS-011-C']);
    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(state, 'player1', iruka, 0, true), 12);

    expect(fin.pendingEffects.some((p) => p.targetSelectionType === 'SS140_PLAY_HIDDEN'),
      'aucune pose face cachee proposee').toBe(false);
    expect(fin.player1.hand.length, 'la main est intacte').toBe(1);
    expect(fin.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'le refus est journalise').toBe(true);
  });
});

describe('Tsunade 141 et Jiraya 144, memes cartes que les impressions Gold', () => {
  it('les deux impressions Secretes ont les memes handlers que les Gold', () => {
    expect(getEffectHandler('SS-141-S', 'MAIN'), 'Tsunade 141 a son MAIN').toBeTruthy();
    expect(getEffectHandler('SS-141-S', 'UPGRADE'), 'Tsunade 141 a son UPGRADE').toBeTruthy();
    expect(getEffectHandler('SS-144-S', 'UPGRADE'), 'Jiraya 144 a son UPGRADE').toBeTruthy();
    expect(getEffectHandler('SS-141-S', 'MAIN'), 'le meme code que la Gold').toBe(getEffectHandler('SS-999-L', 'MAIN'));
    expect(getEffectHandler('SS-144-S', 'UPGRADE'), 'le meme code que la Gold').toBe(getEffectHandler('SS-998-L', 'UPGRADE'));
  });

  it('la Jiraya Secrete donne le Chakra d_Invocation comme la Gold', () => {
    const secrete = simChar('SS-144-S', { owner: 'player1', instanceId: 'sim-jiraya-s' });
    const gold = simChar('SS-998-L', { owner: 'player1', instanceId: 'sim-jiraya-l' });
    const state = buildSimState({ p1: [secrete, gold], p2: [], missions: 1, chakra1: 0 });

    expect(jiraiyaGoldSources(state, 'player1').map((c) => c.instanceId).sort(),
      'les deux impressions comptent').toEqual(['sim-jiraya-l', 'sim-jiraya-s']);
  });

  it('la Tsunade Secrete ouvre la meme question que la Gold', () => {
    const tsunade = empile(simChar('KS-104-R', { owner: 'player1', instanceId: 'sim-tsunade' }), 'SS-141-S');
    let state = buildSimState({ p1: [tsunade], p2: [], missions: 1, chakra1: 20 });
    state = { ...state, player1: { ...state.player1, discardPile: [getCardById('KS-009-C') as never] } };

    const joue = EffectEngine.resolvePlayEffects(state, 'player1', tsunade, 0, false);
    expect(joue.pendingEffects.some((p) => p.targetSelectionType === 'SS001_CONFIRM_MAIN'),
      'la question du melange est posee').toBe(true);
  });
});

describe('les textes de la phase 4 existent partout', () => {
  it('les sept langues portent les nouvelles cles', async () => {
    const descriptions = ['ss018PowerupTeam8', 'ss022PlayAttachment', 'ss022ChooseHost', 'ss138DiscardForPower',
      'ss138DefeatEqual', 'ss140HideNaruto', 'ss140PlayHidden', 'ss140ChooseMission'];
    const journaux = ['ss018PoweredUp', 'ss022Played', 'ss022WeaponBonus', 'ss138Discarded', 'ss138Defeated',
      'ss140Hidden', 'ss140PlayedHidden'];

    for (const langue of ['fr', 'en', 'es', 'ja', 'pt', 'it', 'pl']) {
      const messages = (await import(`@/messages/${langue}.json`)).default as never;
      const desc = (messages as { game: { effect: { desc: Record<string, string> } } }).game.effect.desc;
      const log = (messages as { game: { log: { effect: Record<string, string> } } }).game.log.effect;
      for (const cle of descriptions) expect(typeof desc[cle], `${langue} porte ${cle}`).toBe('string');
      for (const cle of journaux) expect(typeof log[cle], `${langue} porte ${cle}`).toBe('string');
    }
  });

  it('les six cartes ont leur texte d_effet dans les sept langues', async () => {
    const { getCardEffectDescriptions } = await import('@/lib/data/effectDescriptions');
    const ids = ['SS-018-UC', 'SS-022-UC', 'SS-138-R', 'SS-140-R', 'SS-141-S', 'SS-144-S'];
    for (const langue of ['fr', 'en', 'es', 'ja', 'pt', 'it', 'pl']) {
      for (const id of ids) {
        const attendu = (getCardById(id) as CardData).effects?.length ?? 0;
        const textes = getCardEffectDescriptions(id, langue);
        expect(Array.isArray(textes), `${langue} decrit ${id}`).toBe(true);
        expect(textes!.length, `${langue} decrit chaque effet de ${id}`).toBe(attendu);
        expect(textes!.every((t) => t.trim().length > 0), `${langue} ne laisse pas ${id} vide`).toBe(true);
      }
    }
  });
});
