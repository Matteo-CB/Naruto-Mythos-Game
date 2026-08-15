import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { registerAllSetHandlers } from '@/lib/effects/handlers';
import { getEffectHandler } from '@/lib/effects/EffectRegistry';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { hasCuratedScenario } from '@/lib/cards/sim/scenarios';
import { PENDING_EFFECT_IMPLEMENTATION } from '@/lib/cards/sim/pendingImplementation';
import { ennemisMoinsChersQue } from '@/lib/effects/handlers/SS/haku135';
import type { CardData, CharacterInPlay, EffectType, GameState } from '@/lib/engine/types';

registerAllSetHandlers();

function avecDeck(base: GameState, ids: string[]): GameState {
  return { ...base, player1: { ...base.player1, deck: ids.map((i) => getCardById(i) as never) } };
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

function empile(base: CharacterInPlay, dessus: string): CharacterInPlay {
  const carte = getCardById(dessus) as never as CharacterInPlay['card'];
  return { ...base, card: carte, stack: [...base.stack, carte] };
}

function plateau(ennemiId: string, deckIds: string[], ennemiCache = false) {
  const haku = empile(simChar('SS-052-C', { owner: 'player1', instanceId: 'sim-haku' }), 'SS-135-R');
  const ennemi = simChar(ennemiId, { owner: 'player2', instanceId: 'sim-ennemi', hidden: ennemiCache });
  let s = buildSimState({ p1: [haku], p2: [ennemi], missions: 1, chakra1: 10 });
  s = avecDeck(s, deckIds);
  return { state: s, haku };
}

describe('Haku 135, defausser puis cacher moins cher', () => {
  it('l_ennemi moins cher que la carte defaussee est cache', () => {
    const { state, haku } = plateau('SS-021-C', ['KS-104-R', 'KS-009-C']);
    expect(ennemisMoinsChersQue(state, 'player1', 0, 5).map((c) => c.instanceId),
      'le cout 1 est sous le seuil 5').toEqual(['sim-ennemi']);

    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(state, 'player1', haku, 0, true));

    expect(fin.player1.discardPile.some((c) => c.id === 'KS-104-R'), 'la carte du dessus est defaussee').toBe(true);
    expect(fin.player1.deck.length, 'la pioche a perdu une carte').toBe(1);
    expect(charDe(fin, 'sim-ennemi')?.isHidden, 'l_ennemi est cache').toBe(true);
    expect(fin.log.some((l) => l.messageKey === 'game.log.effect.ss135Hidden'), 'le journal le dit').toBe(true);
  });

  it('un ennemi aussi cher n_est pas une cible, mais la defausse a bien eu lieu', () => {
    const { state, haku } = plateau('KS-104-R', ['KS-104-R', 'KS-009-C']);
    expect(ennemisMoinsChersQue(state, 'player1', 0, 5).length, 'cinq n_est pas inferieur a cinq').toBe(0);

    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(state, 'player1', haku, 0, true));

    expect(fin.player1.discardPile.some((c) => c.id === 'KS-104-R'), 'la defausse a eu lieu').toBe(true);
    expect(charDe(fin, 'sim-ennemi')?.isHidden, 'l_ennemi reste visible').toBe(false);
    expect(fin.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'le refus est journalise').toBe(true);
  });

  it('un ennemi deja cache n_est pas une cible', () => {
    const { state } = plateau('SS-021-C', ['KS-104-R'], true);
    expect(ennemisMoinsChersQue(state, 'player1', 0, 5).length, 'on ne cache pas ce qui est cache').toBe(0);
  });

  it('une pioche vide fait taire la carte sans rien defausser', () => {
    const { state, haku } = plateau('SS-021-C', []);
    const joue = EffectEngine.resolvePlayEffects(state, 'player1', haku, 0, true);

    expect(joue.pendingEffects.length, 'aucune question').toBe(0);
    expect(joue.player1.discardPile.length, 'rien n_est defausse').toBe(0);
    expect(joue.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'le refus est journalise').toBe(true);
  });

  it('jouee autrement qu_en amelioration, la carte ne fait rien', () => {
    const { state, haku } = plateau('SS-021-C', ['KS-104-R', 'KS-009-C']);
    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(state, 'player1', haku, 0, false));

    expect(fin.player1.discardPile.length, 'rien n_est defausse').toBe(0);
    expect(charDe(fin, 'sim-ennemi')?.isHidden, 'l_ennemi reste visible').toBe(false);
    expect(fin.log.length, 'et rien n_est journalise').toBe(0);
  });

  it('refuser laisse la pioche et le plateau intacts', () => {
    const { state, haku } = plateau('SS-021-C', ['KS-104-R', 'KS-009-C']);
    const joue = EffectEngine.resolvePlayEffects(state, 'player1', haku, 0, true);

    expect(joue.pendingEffects[joue.pendingEffects.length - 1].isOptional, 'la question est refusable').toBe(true);
    expect(joue.player1.deck.length, 'tant qu_on ne repond pas, rien ne bouge').toBe(2);
    expect(charDe(joue, 'sim-ennemi')?.isHidden, 'et l_ennemi reste visible').toBe(false);
  });
});

describe('phase 7, porte de sortie du set 2', () => {
  it('plus aucune carte n_attend son effet', () => {
    expect([...PENDING_EFFECT_IMPLEMENTATION], 'la liste des effets en attente est vide').toEqual([]);
  });

  it('Haku 135 et sa version illustree ont handler, simulation et textes', async () => {
    const { getCardEffectDescriptions } = await import('@/lib/data/effectDescriptions');
    for (const id of ['SS-135-R', 'SS-135-RA']) {
      for (const effet of (getCardById(id) as CardData).effects ?? []) {
        if (effet.description.includes('[⧗]')) continue;
        expect(getEffectHandler(id, effet.type as EffectType), `${id} a son handler`).toBeTruthy();
      }
    }
    expect(hasCuratedScenario('SS-135-R'), 'la simulation existe').toBe(true);

    for (const langue of ['fr', 'en', 'es', 'ja', 'pt', 'it', 'pl']) {
      const textes = getCardEffectDescriptions('SS-135-R', langue);
      expect(textes?.length, `${langue} decrit la carte`).toBe(1);
      expect(textes![0].trim().length, `${langue} ne la laisse pas vide`).toBeGreaterThan(0);
    }
  });

  it('les sept langues portent les cles de la carte', async () => {
    for (const langue of ['fr', 'en', 'es', 'ja', 'pt', 'it', 'pl']) {
      const messages = (await import(`@/messages/${langue}.json`)).default as never;
      const desc = (messages as { game: { effect: { desc: Record<string, string> } } }).game.effect.desc;
      const log = (messages as { game: { log: { effect: Record<string, string> } } }).game.log.effect;
      for (const cle of ['ss135DiscardThenHide', 'ss135HideEnemy']) {
        expect(typeof desc[cle], `${langue} porte ${cle}`).toBe('string');
      }
      for (const cle of ['ss135Discarded', 'ss135Hidden']) {
        expect(typeof log[cle], `${langue} porte ${cle}`).toBe('string');
      }
    }
  });
});

describe('aucun effet du set 2 ne reste sans code', () => {
  it('chaque effet imprime non continu de chaque carte SS a un handler', async () => {
    const { allCardData } = await import('@/lib/data/sets');
    const sans: string[] = [];
    for (const carte of Object.values(allCardData.cards as Record<string, CardData>)) {
      if (!String(carte.id).startsWith('SS-')) continue;
      for (const effet of carte.effects ?? []) {
        if (effet.type === 'ATTACH') continue;
        if (effet.description.includes('[⧗]')) continue;
        if (!getEffectHandler(carte.id, effet.type as EffectType)) sans.push(`${carte.id} ${effet.type}`);
      }
    }
    expect(sans, 'aucun effet imprime sans code').toEqual([]);
  });

  it('les alterations traitees ailleurs sont declarees explicitement', async () => {
    const { ALTERATIONS_APPLIQUEES_AILLEURS } = await import('@/lib/effects/handlers/SS/duelAlterations');
    const { getCardById: parId } = await import('@/lib/data/cardIndex');
    for (const [id, types] of Object.entries(ALTERATIONS_APPLIQUEES_AILLEURS)) {
      const carte = parId(id) as CardData;
      expect(carte, `${id} existe`).toBeTruthy();
      for (const type of types) {
        const effet = (carte.effects ?? []).find((e) => e.type === type);
        expect(effet, `${id} porte bien un ${type}`).toBeTruthy();
        expect(/(MAIN|AMBUSH|UPGRADE|SCORE|DUEL|FIRST STRIKE) effect/.test(effet!.description),
          `${id} ${type} est bien une alteration`).toBe(true);
      }
    }
  });
});
