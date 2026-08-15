import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { registerAllSetHandlers } from '@/lib/effects/handlers';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import { withFirstStrikeStatus } from '@/lib/engine/rules/firstStrike';
import {
  personnagesIndependantsDans, ennemisLesPlusForts, leplusFortEstDans, chakraVolable,
} from '@/lib/effects/handlers/SS/ambushSet5';
import { zabuzasDeplacables, equipementsAvecDestination } from '@/lib/effects/handlers/SS/moveTargets5';
import {
  equipementsEnnemisDans, ciblesDOrochimaru, seuilDOrochimaru, cachesEnnemisDans,
  alliesCachablesDans, reductionPremiereFrappe,
} from '@/lib/effects/handlers/SS/set5Others';
import type { CardData, CharacterCard, CharacterInPlay, GameState } from '@/lib/engine/types';

registerAllSetHandlers();

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

function revele(state: GameState, char: CharacterInPlay, mission = 0): GameState {
  const visible: GameState = {
    ...state,
    activeMissions: state.activeMissions.map((m) => ({
      ...m,
      player1Characters: m.player1Characters.map((c) => c.instanceId === char.instanceId
        ? { ...c, isHidden: false, wasRevealedAtLeastOnce: true } : c),
    })),
  };
  const retourne = { ...char, isHidden: false, wasRevealedAtLeastOnce: true };
  return EffectEngine.resolveRevealEffects(visible, 'player1', retourne, mission, true);
}

function equipe(state: GameState, hote: string, carteId: string, owner: 'player1' | 'player2', attId: string): GameState {
  return {
    ...state,
    activeMissions: state.activeMissions.map((m) => ({
      ...m,
      player1Characters: m.player1Characters.map((c) => c.instanceId === hote
        ? { ...c, attachments: [...(c.attachments ?? []), { instanceId: attId, card: getCardById(carteId) as never, owner }] } : c),
      player2Characters: m.player2Characters.map((c) => c.instanceId === hote
        ? { ...c, attachments: [...(c.attachments ?? []), { instanceId: attId, card: getCardById(carteId) as never, owner }] } : c),
    })),
  };
}

describe('Shino Aburame 017, la carte revelee au hasard', () => {
  it('une carte chere fait gagner 2 Chakra', () => {
    const shino = simChar('SS-017-C', { owner: 'player1', instanceId: 'sim-shino', hidden: true });
    let s = buildSimState({ p1: [shino], p2: [], missions: 1, chakra1: 0 });
    s = { ...s, player2: { ...s.player2, hand: [getCardById('KS-104-R') as never] } };

    const fin = jusquAuBout(revele(s, shino));
    expect(fin.player1.chakra, 'deux Chakra gagnes').toBe(2);
    expect(fin.log.some((l) => l.messageKey === 'game.log.effect.ss017Revealed'), 'la revelation est journalisee').toBe(true);
  });

  it('une carte bon marche ne rapporte rien mais est quand meme revelee', () => {
    const shino = simChar('SS-017-C', { owner: 'player1', instanceId: 'sim-shino', hidden: true });
    let s = buildSimState({ p1: [shino], p2: [], missions: 1, chakra1: 0 });
    s = { ...s, player2: { ...s.player2, hand: [getCardById('SS-021-C') as never] } };

    const fin = jusquAuBout(revele(s, shino));
    expect(fin.player1.chakra, 'aucun Chakra gagne').toBe(0);
    expect(fin.log.some((l) => l.messageKey === 'game.log.effect.ss017Revealed'), 'la revelation a bien eu lieu').toBe(true);
  });

  it('sans main adverse, la carte se tait avec un journal', () => {
    const shino = simChar('SS-017-C', { owner: 'player1', instanceId: 'sim-shino', hidden: true });
    const s = buildSimState({ p1: [shino], p2: [], missions: 1, chakra1: 0 });
    const joue = revele(s, shino);
    expect(joue.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'le refus est journalise').toBe(true);
  });

  it('jouee face visible, l_AMBUSH ne se declenche pas', () => {
    const shino = simChar('SS-017-C', { owner: 'player1', instanceId: 'sim-shino' });
    let s = buildSimState({ p1: [shino], p2: [], missions: 1, chakra1: 0 });
    s = { ...s, player2: { ...s.player2, hand: [getCardById('KS-104-R') as never] } };

    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(s, 'player1', shino, 0, false));
    expect(fin.player1.chakra, 'hors fenetre, rien ne se passe').toBe(0);
    expect(fin.log.length, 'et rien n_est journalise').toBe(0);
  });
});

describe('Shigure 068, compter les Independants', () => {
  it('le compte inclut Shigure et les deux camps', () => {
    const shigure = simChar('SS-068-UC', { owner: 'player1', instanceId: 'sim-shigure', hidden: true });
    const allie = simChar('SS-073-C', { owner: 'player1', instanceId: 'sim-allie' });
    const ennemi = simChar('SS-052-C', { owner: 'player2', instanceId: 'sim-ennemi' });
    const s = buildSimState({ p1: [shigure, allie], p2: [ennemi], missions: 1, chakra1: 0 });

    expect(personnagesIndependantsDans(s, 0), 'le cache ne compte pas encore').toBe(2);

    const fin = jusquAuBout(revele(s, shigure));
    expect(charDe(fin, 'sim-shigure')?.powerTokens, 'trois Independants une fois revele').toBe(3);
  });
});

describe('Asuma Sarutobi 013, frapper le plus fort', () => {
  it('quand le plus fort est ici, il gagne 5 jetons', () => {
    const asuma = simChar('SS-013-UC', { owner: 'player1', instanceId: 'sim-asuma', hidden: true });
    const fort = simChar('KS-104-R', { owner: 'player2', instanceId: 'sim-fort' });
    const s = buildSimState({ p1: [asuma], p2: [fort], missions: 1, chakra1: 0 });

    expect(ennemisLesPlusForts(s, 'player1').map((c) => c.instanceId), 'un seul plus fort').toEqual(['sim-fort']);
    const fin = jusquAuBout(revele(s, asuma));
    expect(charDe(fin, 'sim-asuma')?.powerTokens, 'cinq jetons').toBe(5);
  });

  it('quand le plus fort est ailleurs, la carte se tait avec un journal', () => {
    const asuma = simChar('SS-013-UC', { owner: 'player1', instanceId: 'sim-asuma', hidden: true });
    const petit = simChar('SS-021-C', { owner: 'player2', instanceId: 'sim-petit' });
    const s = buildSimState({ p1: [asuma], p2: [petit], missions: 2, chakra1: 0 });
    const fort = simChar('KS-104-R', { owner: 'player2', instanceId: 'sim-fort', missionIndex: 1 });
    s.activeMissions[1].player2Characters.push(fort);

    expect(leplusFortEstDans(s, 'player1', 0), 'le plus fort est dans l_autre mission').toBe(false);
    const joue = revele(s, asuma);
    expect(joue.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'le refus est journalise').toBe(true);
  });

  it('revele en amelioration, l_AMBUSH puis sa repetition donnent dix jetons', () => {
    const asuma = simChar('SS-013-UC', { owner: 'player1', instanceId: 'sim-asuma', hidden: true });
    asuma.stack = [getCardById('SS-012-C') as never as CharacterCard, getCardById('SS-013-UC') as never as CharacterCard];
    const fort = simChar('KS-104-R', { owner: 'player2', instanceId: 'sim-fort' });
    const s = buildSimState({ p1: [asuma], p2: [fort], missions: 1, chakra1: 0 });

    const visible = {
      ...s,
      activeMissions: s.activeMissions.map((m) => ({
        ...m,
        player1Characters: m.player1Characters.map((c) => c.instanceId === 'sim-asuma'
          ? { ...c, isHidden: false, wasRevealedAtLeastOnce: true } : c),
      })),
    };
    const retourne = { ...asuma, isHidden: false, wasRevealedAtLeastOnce: true };
    const fin = jusquAuBout(EffectEngine.resolveRevealUpgradeEffects(visible, 'player1', retourne, 0, true), 14);

    expect(charDe(fin, 'sim-asuma')?.powerTokens, 'cinq pour l_AMBUSH, cinq pour la repetition').toBe(10);
  });

  it('jouee en amelioration sans revelation, la repetition ne se produit pas', () => {
    const asuma = simChar('SS-013-UC', { owner: 'player1', instanceId: 'sim-asuma' });
    asuma.stack = [getCardById('SS-012-C') as never as CharacterCard, getCardById('SS-013-UC') as never as CharacterCard];
    const fort = simChar('KS-104-R', { owner: 'player2', instanceId: 'sim-fort' });
    const s = buildSimState({ p1: [asuma], p2: [fort], missions: 1, chakra1: 0 });

    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(s, 'player1', asuma, 0, true), 14);
    expect(charDe(fin, 'sim-asuma')?.powerTokens, 'sans AMBUSH, rien a repeter').toBe(0);
    expect(fin.log.length, 'et pas un mot dans le journal').toBe(0);
  });

  it('les egalites comptent toutes comme le plus fort', () => {
    const asuma = simChar('SS-013-UC', { owner: 'player1', instanceId: 'sim-asuma', hidden: true });
    const a = simChar('KS-104-R', { owner: 'player2', instanceId: 'sim-a' });
    const b = simChar('KS-104-R', { owner: 'player2', instanceId: 'sim-b' });
    const s = buildSimState({ p1: [asuma], p2: [a, b], missions: 2, chakra1: 0 });

    expect(ennemisLesPlusForts(s, 'player1').map((c) => c.instanceId).sort(), 'les deux sont retenus').toEqual(['sim-a', 'sim-b']);
    expect(leplusFortEstDans(s, 'player1', 0), 'ils sont ici, la condition est remplie').toBe(true);
  });
});

describe('Kisame Hoshigaki 055, voler du Chakra', () => {
  it('le vol deplace bien 1 Chakra', () => {
    const kisame = simChar('SS-055-UC', { owner: 'player1', instanceId: 'sim-kisame', hidden: true });
    const s = buildSimState({ p1: [kisame], p2: [], missions: 1, chakra1: 3 });
    s.player2.chakra = 4;

    const fin = jusquAuBout(revele(s, kisame));
    expect(fin.player1.chakra, 'un de plus').toBe(4);
    expect(fin.player2.chakra, 'un de moins').toBe(3);
  });

  it('un adversaire a sec ne donne rien', () => {
    const kisame = simChar('SS-055-UC', { owner: 'player1', instanceId: 'sim-kisame', hidden: true });
    const s = buildSimState({ p1: [kisame], p2: [], missions: 1, chakra1: 3 });
    s.player2.chakra = 0;

    expect(chakraVolable(s, 'player1'), 'rien a voler').toBe(0);
    const joue = revele(s, kisame);
    expect(joue.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'le refus est journalise').toBe(true);
  });
});

describe('Haku 052, deplacer un Zabuza', () => {
  it('un Zabuza d_une autre mission rejoint celle-ci', () => {
    const haku = simChar('SS-052-C', { owner: 'player1', instanceId: 'sim-haku', hidden: true });
    const s = buildSimState({ p1: [haku], p2: [], missions: 2, chakra1: 0 });
    const zabuza = simChar('SS-136-R', { owner: 'player1', instanceId: 'sim-zabuza', missionIndex: 1 });
    s.activeMissions[1].player1Characters.push(zabuza);

    expect(zabuzasDeplacables(s, 0).map((z) => z.char.instanceId), 'le Zabuza est deplacable').toEqual(['sim-zabuza']);
    const fin = jusquAuBout(revele(s, haku));
    expect(fin.activeMissions[0].player1Characters.some((c) => c.instanceId === 'sim-zabuza'), 'il est arrive ici').toBe(true);
  });

  it('sans Zabuza en jeu, la carte se tait avec un journal', () => {
    const haku = simChar('SS-052-C', { owner: 'player1', instanceId: 'sim-haku', hidden: true });
    const s = buildSimState({ p1: [haku], p2: [], missions: 2, chakra1: 0 });
    const joue = revele(s, haku);
    expect(joue.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'le refus est journalise').toBe(true);
  });
});

describe('Ryugan 073, deplacer un equipement', () => {
  it('l_equipement change de porteur', () => {
    const ryugan = simChar('SS-073-C', { owner: 'player1', instanceId: 'sim-ryugan', hidden: true });
    const porteur = simChar('SS-010-C', { owner: 'player1', instanceId: 'sim-porteur' });
    const autre = simChar('SS-016-C', { owner: 'player1', instanceId: 'sim-autre' });
    let s = buildSimState({ p1: [ryugan, porteur, autre], p2: [], missions: 1, chakra1: 0 });
    s = equipe(s, 'sim-porteur', 'SS-080-C', 'player1', 'att-073');

    expect(equipementsAvecDestination(s).length, 'un equipement deplacable').toBe(1);
    const fin = jusquAuBout(revele(s, ryugan));
    expect((charDe(fin, 'sim-porteur')?.attachments ?? []).length, 'l_ancien porteur est desarme').toBe(0);
    const nouveauPorteur = fin.activeMissions[0].player1Characters
      .find((c) => (c.attachments ?? []).some((a) => a.instanceId === 'att-073'));
    expect(nouveauPorteur, 'un autre personnage le porte maintenant').toBeTruthy();
    expect(nouveauPorteur?.instanceId, 'ce n_est plus l_ancien porteur').not.toBe('sim-porteur');
  });

  it('sans equipement en jeu, la carte se tait avec un journal', () => {
    const ryugan = simChar('SS-073-C', { owner: 'player1', instanceId: 'sim-ryugan', hidden: true });
    const s = buildSimState({ p1: [ryugan], p2: [], missions: 1, chakra1: 0 });
    const joue = revele(s, ryugan);
    expect(joue.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'le refus est journalise').toBe(true);
  });
});

describe('Trois Serpents Geants 056, defausser un equipement ennemi', () => {
  it('l_equipement ennemi part dans la defausse de son proprietaire', () => {
    const serpents = simChar('SS-056-UC', { owner: 'player1', instanceId: 'sim-serpents', hidden: true });
    const ennemi = simChar('SS-010-C', { owner: 'player2', instanceId: 'sim-ennemi' });
    let s = buildSimState({ p1: [serpents], p2: [ennemi], missions: 1, chakra1: 0 });
    s = equipe(s, 'sim-ennemi', 'SS-080-C', 'player2', 'att-056');

    expect(equipementsEnnemisDans(s, 'player1', 0).length, 'une cible').toBe(1);
    const fin = jusquAuBout(revele(s, serpents));
    expect((charDe(fin, 'sim-ennemi')?.attachments ?? []).length, 'l_ennemi est desarme').toBe(0);
    expect(fin.player2.discardPile.some((c) => c.id === 'SS-080-C'), 'la carte part chez son proprietaire').toBe(true);
  });

  it('un equipement allie n_est pas une cible', () => {
    const serpents = simChar('SS-056-UC', { owner: 'player1', instanceId: 'sim-serpents', hidden: true });
    const allie = simChar('SS-010-C', { owner: 'player1', instanceId: 'sim-allie' });
    let s = buildSimState({ p1: [serpents, allie], p2: [], missions: 1, chakra1: 0 });
    s = equipe(s, 'sim-allie', 'SS-080-C', 'player1', 'att-056b');

    expect(equipementsEnnemisDans(s, 'player1', 0).length, 'aucune cible').toBe(0);
  });
});

describe('Orochimaru 145, le seuil qui change a la revelation', () => {
  function plateau(hidden: boolean) {
    const oro = simChar('SS-145-S', { owner: 'player1', instanceId: 'sim-oro', hidden });
    oro.stack = [getCardById('SS-130-R') as never as CharacterCard, getCardById('SS-145-S') as never as CharacterCard];
    const petit = simChar('SS-021-C', { owner: 'player2', instanceId: 'sim-petit' });
    const moyen = simChar('SS-010-C', { owner: 'player2', instanceId: 'sim-moyen' });
    return { state: buildSimState({ p1: [oro], p2: [petit, moyen], missions: 1, chakra1: 0 }), oro };
  }

  it('joue face visible, le seuil est strict', () => {
    const { state, oro } = plateau(false);
    expect(seuilDOrochimaru(oro, false), 'deux cartes empilees, seuil strict').toEqual({ seuil: 2, strict: true });
    expect(ciblesDOrochimaru(state, 'player1', 0, 2, true).map((c) => c.instanceId), 'seul le cout 1 tombe').toEqual(['sim-petit']);

    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(state, 'player1', oro, 0, false));
    expect(charDe(fin, 'sim-petit'), 'le petit est vaincu').toBeNull();
    expect(charDe(fin, 'sim-moyen'), 'le cout 2 survit').toBeTruthy();
  });

  it('revele, le seuil devient inclusif et emporte les deux', () => {
    const { state, oro } = plateau(true);
    expect(ciblesDOrochimaru(state, 'player1', 0, 2, false).length, 'les deux sont vises').toBe(2);

    const fin = jusquAuBout(revele(state, oro));
    expect(charDe(fin, 'sim-petit'), 'le cout 1 tombe').toBeNull();
    expect(charDe(fin, 'sim-moyen'), 'le cout 2 tombe aussi').toBeNull();
  });
});

describe('Kiba Inuzuka 014, regarder puis frapper', () => {
  it('un cache bon marche est vaincu', () => {
    const kiba = simChar('SS-014-C', { owner: 'player1', instanceId: 'sim-kiba' });
    const cache = simChar('SS-010-C', { owner: 'player2', instanceId: 'sim-cache', hidden: true });
    const s = buildSimState({ p1: [kiba], p2: [cache], missions: 1, chakra1: 0 });

    expect(cachesEnnemisDans(s, 'player1', 0).map((c) => c.instanceId), 'la cible est vue').toEqual(['sim-cache']);
    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(s, 'player1', kiba, 0, false));
    expect(charDe(fin, 'sim-cache'), 'le cache a cout 2 est vaincu').toBeNull();
  });

  it('un cache trop cher survit mais reste regarde', () => {
    const kiba = simChar('SS-014-C', { owner: 'player1', instanceId: 'sim-kiba' });
    const cache = simChar('KS-104-R', { owner: 'player2', instanceId: 'sim-cache', hidden: true });
    const s = buildSimState({ p1: [kiba], p2: [cache], missions: 1, chakra1: 0 });

    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(s, 'player1', kiba, 0, false));
    expect(charDe(fin, 'sim-cache'), 'le cout 5 survit').toBeTruthy();
    expect(fin.log.some((l) => l.messageKey === 'game.log.effect.ss014Peeked'), 'il a quand meme ete regarde').toBe(true);
  });

  it('hors de la fenetre de premiere frappe, rien ne se declenche', () => {
    const kiba = simChar('SS-014-C', { owner: 'player1', instanceId: 'sim-kiba' });
    const cache = simChar('SS-010-C', { owner: 'player2', instanceId: 'sim-cache', hidden: true });
    let s = buildSimState({ p1: [kiba], p2: [cache], missions: 1, chakra1: 0 });
    s = withFirstStrikeStatus(s, 'player1', 'expired');

    const fin = jusquAuBout(EffectEngine.resolvePlayEffects(s, 'player1', kiba, 0, false));
    expect(charDe(fin, 'sim-cache'), 'le cache survit').toBeTruthy();
    expect(fin.log.length, 'et rien n_est journalise').toBe(0);
  });
});

describe('Tenten 021, moins chere en premiere frappe', () => {
  it('la reduction s_applique au paiement quand la fenetre est ouverte', () => {
    const s = buildSimState({ p1: [], p2: [], missions: 1, chakra1: 10 });
    const carte = getCardById('SS-021-C') as CardData;

    expect(reductionPremiereFrappe(s, 'player1', carte), 'un de moins').toBe(1);
    expect(calculateEffectiveCost(s, 'player1', carte as never, 0, false), 'un moins un, donc zero').toBe(0);
  });

  it('la fenetre fermee, elle coute son prix imprime', () => {
    let s = buildSimState({ p1: [], p2: [], missions: 1, chakra1: 10 });
    s = withFirstStrikeStatus(s, 'player1', 'expired');
    const carte = getCardById('SS-021-C') as CardData;

    expect(reductionPremiereFrappe(s, 'player1', carte), 'aucune reduction').toBe(0);
    expect(calculateEffectiveCost(s, 'player1', carte as never, 0, false), 'prix imprime').toBe(1);
  });

  it('la reduction ne touche aucune autre carte', () => {
    const s = buildSimState({ p1: [], p2: [], missions: 1, chakra1: 10 });
    const autre = getCardById('SS-010-C') as CardData;
    expect(reductionPremiereFrappe(s, 'player1', autre), 'une autre carte ne gagne rien').toBe(0);
  });
});

describe('Mizuki 060 et Tazuna 076, les deux SCORE', () => {
  it('Mizuki cache un allie et marque un point', () => {
    const mizuki = simChar('SS-060-UC', { owner: 'player1', instanceId: 'sim-mizuki' });
    const allie = simChar('KS-009-C', { owner: 'player1', instanceId: 'sim-allie' });
    const s = buildSimState({ p1: [mizuki, allie], p2: [], missions: 1, chakra1: 0, missionIds: ['KS-010-MMS'] });

    expect(alliesCachablesDans(s, 'player1', 0, 'sim-mizuki').map((c) => c.instanceId),
      'Mizuki ne se cache pas lui-meme').toEqual(['sim-allie']);

    const depart = s.player1.missionPoints;
    const fin = jusquAuBout(EffectEngine.resolveScoreEffects(s, 'player1', 0));
    expect(charDe(fin, 'sim-allie')?.isHidden, 'l_allie est cache').toBe(true);
    expect(fin.player1.missionPoints - depart, 'un point gagne').toBe(1);
  });

  it('Mizuki seul dans sa mission ne peut rien cacher', () => {
    const mizuki = simChar('SS-060-UC', { owner: 'player1', instanceId: 'sim-mizuki' });
    const s = buildSimState({ p1: [mizuki], p2: [], missions: 1, chakra1: 0, missionIds: ['KS-010-MMS'] });
    const joue = EffectEngine.resolveScoreEffects(s, 'player1', 0);
    expect(joue.log.some((l) => l.messageKey === 'game.log.effect.noTarget'), 'le refus est journalise').toBe(true);
    expect(joue.player1.missionPoints, 'aucun point').toBe(s.player1.missionPoints);
  });

  it('Tazuna donne deux points', () => {
    const tazuna = simChar('SS-076-UC', { owner: 'player1', instanceId: 'sim-tazuna' });
    const s = buildSimState({ p1: [tazuna], p2: [], missions: 1, chakra1: 0, missionIds: ['KS-010-MMS'] });
    const depart = s.player1.missionPoints;
    const fin = jusquAuBout(EffectEngine.resolveScoreEffects(s, 'player1', 0));
    expect(fin.player1.missionPoints - depart, 'deux points gagnes').toBe(2);
  });
});

describe('les textes de la phase 5 existent partout', () => {
  it('les sept langues portent les nouvelles cles', async () => {
    const descriptions = ['ss017RevealRandom', 'ss068PowerupIndependent', 'ss055StealChakra', 'ss013PowerupStrongest',
      'ss052MoveZabuza', 'ss052MoveDestination', 'ss073MoveAttachment', 'ss073ChooseHost', 'ss056DiscardAttachment',
      'ss145DefeatBelow', 'ss145DefeatUpTo', 'ss014PeekAndDefeat', 'ss060HideFriendly', 'ss076GainPoints'];
    const journaux = ['ss017Revealed', 'ss017Chakra', 'ss055Stolen', 'ss056Discarded', 'ss073Moved', 'ss145Defeated',
      'ss145Threshold', 'ss014Peeked', 'ss014Defeated', 'ss021Cheaper', 'ss060Scored', 'ss076Scored'];

    for (const langue of ['fr', 'en', 'es', 'ja', 'pt', 'it', 'pl']) {
      const messages = (await import(`@/messages/${langue}.json`)).default as never;
      const desc = (messages as { game: { effect: { desc: Record<string, string> } } }).game.effect.desc;
      const log = (messages as { game: { log: { effect: Record<string, string> } } }).game.log.effect;
      for (const cle of descriptions) expect(typeof desc[cle], `${langue} porte ${cle}`).toBe('string');
      for (const cle of journaux) expect(typeof log[cle], `${langue} porte ${cle}`).toBe('string');
    }
  });

  it('les douze cartes ont leur texte d_effet dans les sept langues', async () => {
    const { getCardEffectDescriptions } = await import('@/lib/data/effectDescriptions');
    const ids = ['SS-017-C', 'SS-052-C', 'SS-068-UC', 'SS-073-C', 'SS-013-UC', 'SS-055-UC',
      'SS-056-UC', 'SS-145-S', 'SS-014-C', 'SS-021-C', 'SS-060-UC', 'SS-076-UC'];
    for (const langue of ['fr', 'en', 'es', 'ja', 'pt', 'it', 'pl']) {
      for (const id of ids) {
        const attendu = (getCardById(id) as CardData).effects?.length ?? 0;
        const textes = getCardEffectDescriptions(id, langue);
        expect(textes?.length, `${langue} decrit chaque effet de ${id}`).toBe(attendu);
        expect(textes!.every((t) => t.trim().length > 0), `${langue} ne laisse pas ${id} vide`).toBe(true);
      }
    }
  });
});
