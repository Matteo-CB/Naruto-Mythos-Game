import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { registerAllSetHandlers } from '@/lib/effects/handlers';
import { getEffectHandler } from '@/lib/effects/EffectRegistry';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { parseDuelCharacterName, isDuelCharacterPresent } from '@/lib/effects/duelUtils';
import { checkFlexibleUpgrade } from '@/lib/engine/rules/PlayValidation';
import { getScenario, hasCuratedScenario } from '@/lib/cards/sim/scenarios';
import { awaitsEffectImplementation } from '@/lib/cards/sim/pendingImplementation';
import type { CardData, CharacterCard, CharacterInPlay, EffectType, GameState } from '@/lib/engine/types';

registerAllSetHandlers();

const PHASE6 = ['SS-113-R', 'SS-129-R', 'SS-131-R', 'SS-133-R'];

function avecMain(base: GameState, ids: string[], joueur: 'player1' | 'player2' = 'player1'): GameState {
  return { ...base, [joueur]: { ...base[joueur], hand: ids.map((i) => getCardById(i) as never) } };
}

function agi(avant: GameState, apres: GameState): boolean {
  return apres.pendingEffects.length > avant.pendingEffects.length || apres.log.length > avant.log.length;
}

function empile(base: CharacterInPlay, dessus: string): CharacterInPlay {
  const carte = getCardById(dessus) as never as CharacterInPlay['card'];
  return { ...base, card: carte, stack: [...base.stack, carte] };
}

describe('phase 6, la matrice des duels', () => {
  it('les quatre cartes sont sorties de la liste des effets en attente et ont leur simulation', () => {
    expect(PHASE6.filter((id) => awaitsEffectImplementation(id)), 'aucune en attente').toEqual([]);
    expect(PHASE6.filter((id) => !hasCuratedScenario(id)), 'chacune a un scenario').toEqual([]);
  });

  it('chaque effet imprime non continu a son handler', () => {
    const manquants: string[] = [];
    for (const id of PHASE6) {
      for (const effet of (getCardById(id) as CardData).effects ?? []) {
        if (effet.description.includes('[⧗]')) continue;
        if (!getEffectHandler(id, effet.type as EffectType)) manquants.push(`${id} ${effet.type}`);
      }
    }
    expect(manquants, 'chaque effet a un handler').toEqual([]);
  });

  it('chaque nom de partenaire imprime correspond a une vraie carte', () => {
    for (const id of PHASE6) {
      for (const effet of (getCardById(id) as CardData).effects ?? []) {
        if (effet.type !== 'DUEL') continue;
        const nom = parseDuelCharacterName(effet.description);
        expect(nom, `${id} nomme son partenaire`).toBeTruthy();
        expect(['KANKURO', 'OROCHIMARU'], `${id} nomme un partenaire connu`).toContain((nom ?? '').toUpperCase());
      }
    }
  });

  it('un partenaire ennemi remplit la condition autant qu_un allie', () => {
    const hiruzen = simChar('SS-133-R', { owner: 'player1', instanceId: 'sim-hiruzen' });
    const allie = simChar('SS-127-R', { owner: 'player1', instanceId: 'sim-allie' });
    const ennemi = simChar('SS-127-R', { owner: 'player2', instanceId: 'sim-ennemi' });

    const cote = buildSimState({ p1: [hiruzen, allie], p2: [], missions: 1, chakra1: 10 });
    const face = buildSimState({ p1: [hiruzen], p2: [ennemi], missions: 1, chakra1: 10 });

    expect(isDuelCharacterPresent(cote, 0, 'Orochimaru'), 'partenaire allie').toBe(true);
    expect(isDuelCharacterPresent(face, 0, 'Orochimaru'), 'partenaire ennemi').toBe(true);

    const avecMainCote = avecMain(cote, ['KS-096-C']);
    const avecMainFace = avecMain(face, ['KS-096-C']);
    expect(agi(avecMainCote, EffectEngine.resolvePlayEffects(avecMainCote, 'player1', hiruzen, 0, false)),
      'le duel se declenche avec un allie').toBe(true);
    expect(agi(avecMainFace, EffectEngine.resolvePlayEffects(avecMainFace, 'player1', hiruzen, 0, false)),
      'et aussi avec un ennemi').toBe(true);
  });

  it('un partenaire dans une autre mission ne remplit pas la condition', () => {
    const hiruzen = simChar('SS-133-R', { owner: 'player1', instanceId: 'sim-hiruzen' });
    let s = buildSimState({ p1: [hiruzen], p2: [], missions: 2, chakra1: 10 });
    s = avecMain(s, ['KS-096-C']);
    s.activeMissions[1].player1Characters.push(
      simChar('SS-127-R', { owner: 'player1', instanceId: 'sim-ailleurs', missionIndex: 1 }));

    expect(isDuelCharacterPresent(s, 0, 'Orochimaru'), 'il n_est pas dans cette mission').toBe(false);
    const apres = EffectEngine.resolvePlayEffects(s, 'player1', hiruzen, 0, false);
    expect(agi(s, apres), 'le duel ne se declenche pas').toBe(false);
  });

  it('un partenaire retire avant la resolution ferme le duel', () => {
    const hiruzen = simChar('SS-133-R', { owner: 'player1', instanceId: 'sim-hiruzen' });
    const orochimaru = simChar('SS-127-R', { owner: 'player1', instanceId: 'sim-orochimaru' });
    let avant = buildSimState({ p1: [hiruzen, orochimaru], p2: [], missions: 2, chakra1: 10 });
    avant = avecMain(avant, ['KS-096-C']);

    const apresDepart: GameState = {
      ...avant,
      activeMissions: avant.activeMissions.map((m, i) => i === 0
        ? { ...m, player1Characters: m.player1Characters.filter((c) => c.instanceId !== 'sim-orochimaru') }
        : m),
    };

    expect(isDuelCharacterPresent(apresDepart, 0, 'Orochimaru'), 'le partenaire est parti').toBe(false);
    const apres = EffectEngine.resolvePlayEffects(apresDepart, 'player1', hiruzen, 0, false);
    expect(agi(apresDepart, apres), 'le duel ne se declenche plus').toBe(false);
  });

  it('les effets de la phase agissent aussi a la revelation et en amelioration', () => {
    const muettes: string[] = [];
    for (const id of ['SS-113-R', 'SS-129-R', 'SS-131-R']) {
      const source = empile(simChar('KS-009-C', { owner: 'player1', instanceId: `mx-${id}` }), id);
      const hokage = simChar('SS-131-R', { owner: 'player1', instanceId: 'mx-hokage' });
      let s = buildSimState({ p1: [source, hokage], p2: [], missions: 2, chakra1: 10 });
      s = avecMain(s, ['KS-104-R'], 'player2');

      const revele = EffectEngine.resolveRevealEffects(s, 'player1', source, 0, true);
      if (!agi(s, revele)) muettes.push(`${id} revelation`);

      const ameliore = EffectEngine.resolvePlayEffects(s, 'player1', source, 0, true);
      if (!agi(s, ameliore)) muettes.push(`${id} amelioration`);
    }
    expect(muettes, 'aucun effet muet sur ces chemins').toEqual([]);
  });

  it('le duel des Senju suit le plateau, mission par mission', () => {
    const orochimaru = simChar('SS-127-R', { owner: 'player1', instanceId: 'sim-orochimaru' });
    const s = buildSimState({ p1: [orochimaru], p2: [], missions: 2, chakra1: 20 });
    const tobirama = getCardById('SS-131-R') as never as CharacterCard;
    const naruto = getCardById('KS-009-C') as never as CharacterCard;

    expect(checkFlexibleUpgrade(tobirama, naruto, s, 0), 'ouvert la ou Orochimaru se trouve').toBe(true);
    expect(checkFlexibleUpgrade(tobirama, naruto, s, 1), 'ferme dans l_autre mission').toBe(false);
  });
});
