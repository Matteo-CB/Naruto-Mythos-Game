import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { registerAllSetHandlers } from '@/lib/effects/handlers';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { attachCardToCharacter, getCharacterAttachTargets } from '@/lib/effects/attachments';
import { indicesDeNourriture } from '@/lib/effects/handlers/SS/foodDiscard';
import { cachesDeplacables } from '@/lib/effects/handlers/SS/hiddenMove';
import { ennemisDuMemeNom, sommetAdverse } from '@/lib/effects/handlers/SS/nameReveal';
import { equipementsDeplacablesVers } from '@/lib/effects/handlers/SS/seimei065';
import { ennemisJouesMoinsCher } from '@/lib/effects/handlers/SS/zabuza136';
import type { CardData, GameState } from '@/lib/engine/types';

registerAllSetHandlers();

function avecDeck(base: GameState, joueur: 'player1' | 'player2', ids: string[]): GameState {
  return { ...base, [joueur]: { ...base[joueur], deck: ids.map((i) => getCardById(i) as never) } };
}

function avecMain(base: GameState, ids: string[]): GameState {
  return { ...base, player1: { ...base.player1, hand: ids.map((i) => getCardById(i) as never) } };
}

function jusquAuBout(depart: GameState): GameState {
  let s = depart;
  for (let i = 0; i < 8 && s.pendingEffects.length > 0; i++) {
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

function charDe(state: GameState, instanceId: string) {
  for (const m of state.activeMissions) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const trouve = m[side].find((c) => c.instanceId === instanceId);
      if (trouve) return trouve;
    }
  }
  return null;
}

describe('Choji Akimichi 009, defausser une Nourriture pour du Chakra et une pioche', () => {
  it('la Nourriture part en defausse, le Chakra monte de 1 et une carte est piochee', () => {
    const choji = simChar('SS-009-C', { owner: 'player1' });
    let s = buildSimState({ p1: [choji], p2: [], missions: 1, chakra1: 5 });
    s = avecMain(s, ['SS-081-C', 'KS-009-C']);
    s = avecDeck(s, 'player1', ['KS-010-C', 'KS-005-C']);

    expect(indicesDeNourriture(s, 'player1'), 'seul le Ramen est une Nourriture').toEqual([0]);

    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(s, 'player1', choji, 0, false));

    expect(fin.player1.discardPile.some((c) => c.id === 'SS-081-C'), 'le Ramen est defausse').toBe(true);
    expect(fin.player1.chakra, 'un Chakra de plus').toBe(6);
    expect(fin.player1.deck.length, 'une carte a quitte la pioche').toBe(1);
    expect(fin.player1.hand.some((c) => c.id === 'KS-010-C'), 'la carte piochee est en main').toBe(true);
    expect(fin.log.some((l) => l.messageKey === 'game.log.effect.ss009Fed'), 'le journal decrit le repas').toBe(true);
  });

  it('sans Nourriture en main, rien n_est demande et le refus est journalise', () => {
    const choji = simChar('SS-009-C', { owner: 'player1' });
    let s = buildSimState({ p1: [choji], p2: [], missions: 1, chakra1: 5 });
    s = avecMain(s, ['KS-009-C']);

    const joue = EffectEngine.resolvePlayEffects(s, 'player1', choji, 0, false);

    expect(joue.pendingEffects.length, 'aucune question posee').toBe(0);
    expect(joue.player1.chakra, 'aucun Chakra gagne').toBe(5);
    expect(joue.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'le refus est journalise').toBe(true);
  });
});

describe('Ebisu 023, regarder son sommet de pioche et choisir', () => {
  it('la carte choisie passe au fond sans changer la taille de la pioche', () => {
    const ebisu = simChar('SS-023-C', { owner: 'player1' });
    let s = buildSimState({ p1: [ebisu], p2: [], missions: 1 });
    s = avecDeck(s, 'player1', ['KS-009-C', 'KS-010-C', 'KS-005-C']);

    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(s, 'player1', ebisu, 0, false));

    expect(fin.player1.deck.length, 'la pioche garde ses trois cartes').toBe(3);
    expect(fin.player1.deck[0].id, 'la deuxieme carte est remontee').toBe('KS-010-C');
    expect(fin.player1.deck[2].id, 'la carte regardee est au fond').toBe('KS-009-C');
    expect(fin.log.some((l) => l.messageKey === 'game.log.effect.ss023Bottom'), 'le journal le dit').toBe(true);
  });

  it('refuser laisse la carte au sommet', () => {
    const ebisu = simChar('SS-023-C', { owner: 'player1' });
    let s = buildSimState({ p1: [ebisu], p2: [], missions: 1 });
    s = avecDeck(s, 'player1', ['KS-009-C', 'KS-010-C']);

    const joue = EffectEngine.resolvePlayEffects(s, 'player1', ebisu, 0, false);
    expect(joue.pendingEffects.length, 'la question est posee').toBeGreaterThan(0);
    expect(joue.pendingEffects[joue.pendingEffects.length - 1].isOptional, 'elle est refusable').toBe(true);
    expect(joue.player1.deck[0].id, 'tant qu_on ne repond pas, rien ne bouge').toBe('KS-009-C');
  });

  it('une pioche vide se contente d_un refus', () => {
    const ebisu = simChar('SS-023-C', { owner: 'player1' });
    let s = buildSimState({ p1: [ebisu], p2: [], missions: 1 });
    s = avecDeck(s, 'player1', []);

    const joue = EffectEngine.resolvePlayEffects(s, 'player1', ebisu, 0, false);
    expect(joue.pendingEffects.length, 'aucune question').toBe(0);
    expect(joue.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'le refus est journalise').toBe(true);
  });
});

describe('Hayate Gekko 025, deplacer un allie cache', () => {
  it('l_allie cache change de mission et reste cache', () => {
    const hayate = simChar('SS-025-C', { owner: 'player1' });
    const cache = simChar('SS-010-C', { owner: 'player1', instanceId: 'sim-cache', hidden: true });
    const s = buildSimState({ p1: [hayate, cache], p2: [], missions: 2 });

    expect(cachesDeplacables(s, 'player1', 0).map((c) => c.instanceId), 'le cache est deplacable').toEqual(['sim-cache']);

    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(s, 'player1', hayate, 0, false));

    expect(fin.activeMissions[0].player1Characters.some((c) => c.instanceId === 'sim-cache'), 'il a quitte la mission').toBe(false);
    expect(fin.activeMissions[1].player1Characters.some((c) => c.instanceId === 'sim-cache'), 'il est arrive ailleurs').toBe(true);
    expect(charDe(fin, 'sim-cache')?.isHidden, 'il est toujours cache').toBe(true);
  });

  it('un allie face visible n_est pas une cible', () => {
    const hayate = simChar('SS-025-C', { owner: 'player1' });
    const visible = simChar('SS-010-C', { owner: 'player1', instanceId: 'sim-visible' });
    const s = buildSimState({ p1: [hayate, visible], p2: [], missions: 2 });

    expect(cachesDeplacables(s, 'player1', 0).length, 'aucune cible').toBe(0);
    const joue = EffectEngine.resolvePlayEffects(s, 'player1', hayate, 0, false);
    expect(joue.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'le refus est journalise').toBe(true);
  });

  it('sans autre mission ou aller, il n_y a pas de cible', () => {
    const hayate = simChar('SS-025-C', { owner: 'player1' });
    const cache = simChar('SS-010-C', { owner: 'player1', instanceId: 'sim-cache', hidden: true });
    const s = buildSimState({ p1: [hayate, cache], p2: [], missions: 1 });

    expect(cachesDeplacables(s, 'player1', 0).length, 'nulle part ou aller').toBe(0);
  });
});

describe('Ibiki Morino 029, reveler le sommet adverse et cacher le meme nom', () => {
  it('l_ennemi du meme nom que la carte revelee est cache', () => {
    const ibiki = simChar('SS-029-UC', { owner: 'player1' });
    const ennemi = simChar('SS-010-C', { owner: 'player2', instanceId: 'sim-meme-nom' });
    let s = buildSimState({ p1: [ibiki], p2: [ennemi], missions: 1 });
    s = avecDeck(s, 'player2', ['SS-010-C', 'KS-009-C']);

    const carte = sommetAdverse(s, 'player1') as CardData;
    expect(ennemisDuMemeNom(s, 'player1', carte).map((c) => c.instanceId), 'la cible est trouvee').toEqual(['sim-meme-nom']);

    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(s, 'player1', ibiki, 0, false));

    expect(charDe(fin, 'sim-meme-nom')?.isHidden, 'l_ennemi est cache').toBe(true);
    expect(fin.log.some((l) => l.messageKey === 'game.log.effect.ss029Revealed'), 'la revelation est annoncee').toBe(true);
    expect(fin.player2.deck.length, 'la carte revelee reste dans la pioche').toBe(2);
  });

  it('un ennemi d_un autre nom n_est pas une cible', () => {
    const ibiki = simChar('SS-029-UC', { owner: 'player1' });
    const ennemi = simChar('KS-009-C', { owner: 'player2', instanceId: 'sim-autre' });
    let s = buildSimState({ p1: [ibiki], p2: [ennemi], missions: 1 });
    s = avecDeck(s, 'player2', ['SS-010-C']);

    const joue = EffectEngine.resolvePlayEffects(s, 'player1', ibiki, 0, false);
    expect(joue.pendingEffects.length, 'aucune question').toBe(0);
    expect(joue.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'le refus est journalise').toBe(true);
  });

  it('un ennemi deja cache n_est pas une cible, il n_a pas de nom visible', () => {
    const ibiki = simChar('SS-029-UC', { owner: 'player1' });
    const ennemi = simChar('SS-010-C', { owner: 'player2', instanceId: 'sim-deja-cache', hidden: true });
    let s = buildSimState({ p1: [ibiki], p2: [ennemi], missions: 1 });
    s = avecDeck(s, 'player2', ['SS-010-C']);

    const carte = sommetAdverse(s, 'player1') as CardData;
    expect(ennemisDuMemeNom(s, 'player1', carte).length, 'le cache est hors de portee').toBe(0);
  });

  it('une pioche adverse vide se contente d_un refus', () => {
    const ibiki = simChar('SS-029-UC', { owner: 'player1' });
    let s = buildSimState({ p1: [ibiki], p2: [], missions: 1 });
    s = avecDeck(s, 'player2', []);

    const joue = EffectEngine.resolvePlayEffects(s, 'player1', ibiki, 0, false);
    expect(joue.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'le refus est journalise').toBe(true);
  });
});

describe('Seimei 065, rassembler les equipements et ignorer les conditions', () => {
  it('l_equipement allie quitte son porteur et arrive sur Seimei', () => {
    const seimei = simChar('SS-065-UC', { owner: 'player1', instanceId: 'sim-seimei' });
    const porteur = simChar('SS-010-C', { owner: 'player1', instanceId: 'sim-porteur' });
    let s = buildSimState({ p1: [seimei, porteur], p2: [], missions: 1 });
    s = attachCardToCharacter(s, 'player1', getCardById('SS-080-C') as CardData, 'sim-porteur');

    expect(equipementsDeplacablesVers(s, 'player1', 'sim-seimei').length, 'un equipement a deplacer').toBe(1);

    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(s, 'player1', seimei, 0, false));

    expect((charDe(fin, 'sim-porteur')?.attachments ?? []).length, 'le porteur est desarme').toBe(0);
    expect((charDe(fin, 'sim-seimei')?.attachments ?? []).map((a) => a.card.id), 'Seimei porte le Kunai').toEqual(['SS-080-C']);
    expect(fin.log.some((l) => l.messageKey === 'game.log.effect.ss065Moved'), 'le journal le dit').toBe(true);
  });

  it('Seimei porte plusieurs equipements du meme joueur, la limite d_un par joueur ne s_applique pas', () => {
    const seimei = simChar('SS-065-UC', { owner: 'player1', instanceId: 'sim-seimei' });
    let s = buildSimState({ p1: [seimei], p2: [], missions: 1 });
    s = attachCardToCharacter(s, 'player1', getCardById('SS-080-C') as CardData, 'sim-seimei');
    s = attachCardToCharacter(s, 'player1', getCardById('SS-079-C') as CardData, 'sim-seimei');

    expect((charDe(s, 'sim-seimei')?.attachments ?? []).map((a) => a.card.id), 'les deux tiennent').toEqual(['SS-080-C', 'SS-079-C']);
    expect(s.player1.discardPile.length, 'aucun equipement remplace').toBe(0);
  });

  it('un porteur ordinaire garde la limite d_un equipement par joueur', () => {
    const ino = simChar('SS-010-C', { owner: 'player1', instanceId: 'sim-ordinaire' });
    let s = buildSimState({ p1: [ino], p2: [], missions: 1 });
    s = attachCardToCharacter(s, 'player1', getCardById('SS-080-C') as CardData, 'sim-ordinaire');
    s = attachCardToCharacter(s, 'player1', getCardById('SS-079-C') as CardData, 'sim-ordinaire');

    expect((charDe(s, 'sim-ordinaire')?.attachments ?? []).map((a) => a.card.id), 'le second remplace le premier').toEqual(['SS-079-C']);
    expect(s.player1.discardPile.some((c) => c.id === 'SS-080-C'), 'le premier part en defausse').toBe(true);
  });

  it('Seimei accepte un equipement reserve a un autre groupe', () => {
    const seimei = simChar('SS-065-UC', { owner: 'player1', instanceId: 'sim-seimei' });
    const ino = simChar('SS-010-C', { owner: 'player1', instanceId: 'sim-ordinaire' });
    const s = buildSimState({ p1: [seimei, ino], p2: [], missions: 1 });

    const eventail = getCardById('SS-085-UC') as CardData;
    const cibles = getCharacterAttachTargets(s, 'player1', 0, eventail).map((c) => c.instanceId);

    expect(cibles, 'seule Seimei ignore la condition Village du Sable').toEqual(['sim-seimei']);
  });
});

describe('Zabuza Momochi 136, punir un personnage joue a prix casse', () => {
  function plateau(options: { reduit: boolean; tourPrecedent: boolean }): GameState {
    const zabuza = simChar('SS-136-R', { owner: 'player1' });
    const cible = simChar('SS-010-C', { owner: 'player2', instanceId: 'sim-cible' });
    const s = buildSimState({ p1: [zabuza], p2: [cible], missions: 1 });
    s.activeMissions[0].player2Characters[0].playedBelowPrintedCost = options.reduit;
    s.lastActionPlayer = 'player1';
    s.lastTurnPlayedIds = { player1: [], player2: options.tourPrecedent ? ['sim-cible'] : [] };
    return s;
  }

  it('l_ennemi joue au tour precedent sous son cout imprime est vaincu', () => {
    const s = plateau({ reduit: true, tourPrecedent: true });
    expect(ennemisJouesMoinsCher(s, 'player1', 0).map((c) => c.instanceId), 'la cible est identifiee').toEqual(['sim-cible']);

    const zabuza = s.activeMissions[0].player1Characters[0];
    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(s, 'player1', zabuza, 0, false));

    expect(charDe(fin, 'sim-cible'), 'la cible a quitte le terrain').toBeNull();
    expect(fin.player2.discardPile.some((c) => c.id === 'SS-010-C'), 'elle est dans la defausse de son proprietaire').toBe(true);
  });

  it('un ennemi paye au prix imprime n_est pas une cible', () => {
    const s = plateau({ reduit: false, tourPrecedent: true });
    expect(ennemisJouesMoinsCher(s, 'player1', 0).length, 'aucune cible').toBe(0);

    const zabuza = s.activeMissions[0].player1Characters[0];
    const joue = EffectEngine.resolvePlayEffects(s, 'player1', zabuza, 0, false);
    expect(joue.pendingEffects.length, 'aucune question').toBe(0);
    expect(joue.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'le refus est journalise').toBe(true);
  });

  it('un ennemi a prix casse mais joue plus tot n_est pas une cible', () => {
    const s = plateau({ reduit: true, tourPrecedent: false });
    expect(ennemisJouesMoinsCher(s, 'player1', 0).length, 'seul le tour precedent compte').toBe(0);
  });
});

describe('le moteur marque les personnages joues sous leur cout imprime', () => {
  it('une reduction de cout laisse une trace, un prix plein n_en laisse pas', async () => {
    const { GameEngine } = await import('@/lib/engine/GameEngine');
    const kurenai = simChar('KS-034-C', { owner: 'player1' });
    let s = buildSimState({ p1: [kurenai], p2: [], missions: 1, chakra1: 20 });
    s = avecMain(s, ['KS-030-C', 'KS-009-C']);
    s.phase = 'action';

    const apres = GameEngine.applyAction(s, 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false });
    const pose = apres.activeMissions[0].player1Characters.find((c) => c.card.id === 'KS-030-C');

    expect(pose, 'le personnage est en jeu').toBeTruthy();
    expect(pose?.playedBelowPrintedCost, 'la reduction Team 8 est enregistree').toBe(true);
    expect(apres.activeMissions[0].player1Characters[0].playedBelowPrintedCost, 'Kurenai posee a la main ne porte pas la marque').toBeUndefined();
  });

  it('le tour precedent de chaque joueur est archive a chaque nouvelle action', async () => {
    const { GameEngine } = await import('@/lib/engine/GameEngine');
    const ino = simChar('SS-010-C', { owner: 'player1' });
    let s = buildSimState({ p1: [ino], p2: [], missions: 1, chakra1: 20 });
    s = avecMain(s, ['KS-009-C']);
    s.phase = 'action';

    const joue = GameEngine.applyAction(s, 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false });
    expect(joue.lastActionPlayer, 'le joueur actif est retenu').toBe('player1');
    expect(joue.turnPlayedIds?.length, 'la carte jouee est suivie').toBe(1);

    const suivant = GameEngine.applyAction(joue, 'player2', { type: 'PASS' });
    expect(suivant.lastTurnPlayedIds?.player1?.length, 'le tour de player1 est archive').toBe(1);
  });
});

describe('les selections de liste du set 2 ouvrent la bonne fenetre', () => {
  it('chaque type de liste sort du selecteur de plateau', () => {
    expect(EffectEngine.actionTypeForSelectionType('SS_DECK_SEARCH_TAKE')).toBe('CHOOSE_CARD_FROM_LIST');
    expect(EffectEngine.actionTypeForSelectionType('SS095_TAKE_JUTSU')).toBe('CHOOSE_CARD_FROM_LIST');
    expect(EffectEngine.actionTypeForSelectionType('SS023_TOP_OR_BOTTOM')).toBe('CHOOSE_CARD_FROM_LIST');
    expect(EffectEngine.actionTypeForSelectionType('SS028_BOTTOM_OR_KEEP')).toBe('CHOOSE_CARD_FROM_LIST');
    expect(EffectEngine.actionTypeForSelectionType('SS065_MOVE_ATTACHMENT')).toBe('CHOOSE_CARD_FROM_LIST');
    expect(EffectEngine.actionTypeForSelectionType('SS009_DISCARD_FOOD')).toBe('DISCARD_CARD');
    expect(EffectEngine.actionTypeForSelectionType('SS025_MOVE_HIDDEN')).toBe('SELECT_TARGET');
  });

  it('la confirmation relaie le bon type de fenetre a la question suivante', () => {
    const suiko = simChar('SS-074-C', { owner: 'player1' });
    let s = buildSimState({ p1: [suiko], p2: [], missions: 1 });
    s = avecDeck(s, 'player1', ['SS-080-C', 'KS-009-C', 'KS-010-C']);

    const joue = EffectEngine.resolvePlayEffects(s, 'player1', suiko, 0, false);
    const confirmation = joue.pendingEffects[joue.pendingEffects.length - 1];
    const apres = EffectEngine.applyTargetedEffect(joue, confirmation, [confirmation.validTargets![0]]);

    const question = apres.pendingActions[apres.pendingActions.length - 1];
    expect(question.type, 'la fouille ouvre une liste de cartes').toBe('CHOOSE_CARD_FROM_LIST');
    expect(question.options[0].startsWith('DECK_'), 'les options designent la pioche').toBe(true);
  });

  it('la destination de la Bombe Fumigene est un simple numero de mission', () => {
    const bombe = getCardById('SS-086-C') as CardData;
    expect(bombe, 'la carte existe').toBeTruthy();
    const hote = simChar('SS-010-C', { owner: 'player1', instanceId: 'sim-hote' });
    const s = buildSimState({ p1: [hote], p2: [], missions: 2 });
    const pose = attachCardToCharacter(s, 'player1', bombe, 'sim-hote');
    const question = pose.pendingEffects[pose.pendingEffects.length - 1];
    const apres = EffectEngine.applyTargetedEffect(pose, question, [question.validTargets![0]]);
    const suite = apres.pendingEffects[apres.pendingEffects.length - 1];

    expect(suite.validTargets?.every((t) => /^\d+$/.test(t)), 'les missions sont designees par leur index').toBe(true);
  });
});

describe('les textes des six dernieres cartes existent partout', () => {
  it('les sept langues portent les nouvelles cles', async () => {
    const langues = ['fr', 'en', 'es', 'ja', 'pt', 'it', 'pl'];
    const descriptions = ['ss009DiscardFood', 'ss023TopOrBottom', 'ss025MoveHidden', 'ss025MoveDestination',
      'ss029HideSameName', 'ss065MoveAttachment', 'ss136DefeatDiscounted'];
    const journaux = ['ss009Fed', 'ss023Bottom', 'ss029Revealed', 'ss065Moved', 'ss136Defeated'];

    for (const langue of langues) {
      const messages = (await import(`@/messages/${langue}.json`)).default as Record<string, never>;
      const desc = (messages as never as { game: { effect: { desc: Record<string, string> } } }).game.effect.desc;
      const log = (messages as never as { game: { log: { effect: Record<string, string> } } }).game.log.effect;
      for (const cle of descriptions) {
        expect(typeof desc[cle], `${langue} porte game.effect.desc.${cle}`).toBe('string');
      }
      for (const cle of journaux) {
        expect(typeof log[cle], `${langue} porte game.log.effect.${cle}`).toBe('string');
      }
    }
  });

  it('les six cartes ont leur texte d_effet dans les sept langues', async () => {
    const { getCardEffectDescriptions } = await import('@/lib/data/effectDescriptions');
    const ids = ['SS-009-C', 'SS-023-C', 'SS-025-C', 'SS-029-UC', 'SS-065-UC', 'SS-136-R'];
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
