import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry, getEffectHandler } from '@/lib/effects/EffectRegistry';
import { createActionPhaseState, mockCharInPlay, mockMission } from './testHelpers';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { GameEngine } from '@/lib/engine/GameEngine';
import { getCardById } from '@/lib/data/cardIndex';
import { getAllCards } from '@/lib/data/cardLoader';
import { parseDuelCharacterName } from '@/lib/effects/duelUtils';
import { withFirstStrikeStatus } from '@/lib/engine/rules/firstStrike';
import { kimimaro077Limit, KIMIMARO_077_DUEL } from '@/lib/effects/handlers/SS/kimimaro077';
import { OROCHIMARU_127_DUEL } from '@/lib/effects/handlers/SS/orochimaru127';
import { OROCHIMARU_130_DUEL } from '@/lib/effects/handlers/SS/orochimaru130';
import { getEffectivePower } from '@/lib/effects/powerUtils';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import type { GameState, CharacterInPlay, CharacterCard } from '@/lib/engine/types';

function plateau(missions = 2): GameState {
  const s = createActionPhaseState();
  s.activeMissions = Array.from({ length: missions }, (_, i) => ({
    card: mockMission({ basePoints: 3 + i }),
    rank: 'D' as const,
    basePoints: 3 + i,
    rankBonus: 1,
    player1Characters: [] as CharacterInPlay[],
    player2Characters: [] as CharacterInPlay[],
    wonBy: null,
  }));
  s.player1.chakra = 20;
  s.player2.chakra = 20;
  return s;
}

function perso(instanceId: string, camp: 'player1' | 'player2', carte: Partial<CharacterCard> | CharacterCard, extra: Partial<CharacterInPlay> = {}) {
  return mockCharInPlay(
    { instanceId, controlledBy: camp, originalOwner: camp, missionIndex: 0, ...extra },
    carte as Partial<CharacterCard>,
  );
}

beforeAll(() => { initializeRegistry(); });

describe('le nom de duel se lit sur toutes les cartes', () => {
  it('chaque DUEL imprime designe un personnage qui existe', () => {
    const noms = getAllCards().map((c) => (c.name_en || '').toUpperCase()).filter(Boolean);
    const casses: string[] = [];
    for (const c of getAllCards()) {
      for (const e of c.effects ?? []) {
        if (e.type !== 'DUEL') continue;
        const parsed = parseDuelCharacterName(e.description);
        if (!parsed || !noms.some((n) => n.includes(parsed.toUpperCase()))) {
          casses.push(`${c.id} -> ${JSON.stringify(parsed)}`);
        }
      }
    }
    expect(casses).toEqual([]);
  });

  it('les conditions de duel ecrites en dur dans les handlers designent un vrai personnage', () => {
    const noms = getAllCards().map((c) => (c.name_en || '').toUpperCase()).filter(Boolean);
    for (const condition of [KIMIMARO_077_DUEL, OROCHIMARU_127_DUEL, OROCHIMARU_130_DUEL]) {
      const parsed = parseDuelCharacterName(condition);
      expect(parsed, condition).toBeTruthy();
      expect(noms.some((n) => n.includes((parsed as string).toUpperCase())), condition).toBe(true);
    }
  });

  it('coupe le nom avant une alteration d effet', () => {
    expect(parseDuelCharacterName('DUEL Gaara MAIN effect: Instead, the cost limit is 7.')).toBe('Gaara');
    expect(parseDuelCharacterName('DUEL Hiruzen Sarutobi FIRST STRIKE effect: Instead, defeat them.')).toBe('Hiruzen Sarutobi');
    expect(parseDuelCharacterName('DUEL Sasuke Uchiha: The AMBUSH effect becomes a MAIN effect.')).toBe('Sasuke Uchiha');
    expect(parseDuelCharacterName('DUEL Gaara')).toBe('Gaara');
  });
});

describe('Orochimaru 127, son AMBUSH devient un MAIN quand Sasuke est la', () => {
  function scene(avecSasuke: boolean) {
    const s = plateau();
    const oro = perso('oro', 'player1', getCardById('SS-127-R') as CharacterCard);
    s.activeMissions[0].player1Characters = avecSasuke
      ? [oro, perso('sasuke', 'player1', { name_fr: 'SASUKE UCHIHA', name_en: 'SASUKE UCHIHA', power: 3 })]
      : [oro];
    s.activeMissions[0].player2Characters = [perso('ennemi', 'player2', { name_fr: 'ENNEMI', name_en: 'ENEMY', power: 2 })];
    return { s, oro };
  }

  it('joue face visible avec Sasuke : la prise de controle est proposee', () => {
    const { s, oro } = scene(true);
    const apres = EffectEngine.resolvePlayEffects(s, 'player1', oro, 0, false);
    expect(apres.pendingEffects.map((p) => p.targetSelectionType)).toContain('SS127_CONFIRM');
  });

  it('joue face visible sans Sasuke : rien ne se declenche', () => {
    const { s, oro } = scene(false);
    const apres = EffectEngine.resolvePlayEffects(s, 'player1', oro, 0, false);
    expect(apres.pendingEffects).toHaveLength(0);
  });
});

describe('copie d un effet FIRST STRIKE', () => {
  function scene(premiereCarte: boolean) {
    let s = plateau();
    const kakashi = perso('kakashi', 'player1', getCardById('KS-016-UC') as CharacterCard);
    s.activeMissions[0].player1Characters = [
      kakashi,
      perso('proie', 'player1', { name_fr: 'PROIE', name_en: 'PREY', chakra: 1, power: 1 }),
    ];
    s.activeMissions[0].player2Characters = [perso('itachi', 'player2', getCardById('SS-053-C') as CharacterCard)];
    if (!premiereCarte) s = withFirstStrikeStatus(s, 'player1', 'expired');
    return { s, kakashi };
  }

  it('copiable quand le copieur est la premiere carte jouee de la manche', () => {
    const { s, kakashi } = scene(true);
    const apres = EffectEngine.resolvePlayEffects(s, 'player1', kakashi, 0, false);
    expect(apres.pendingEffects.map((p) => p.targetSelectionType)).toContain('KAKASHI016_CONFIRM_MAIN');
  });

  it('non copiable quand le copieur n est pas la premiere carte, et le refus est journalise', () => {
    const { s, kakashi } = scene(false);
    const apres = EffectEngine.resolvePlayEffects(s, 'player1', kakashi, 0, false);
    expect(apres.pendingEffects).toHaveLength(0);
    expect(apres.log[apres.log.length - 1].messageKey).toBe('game.log.effect.noTarget');
  });
});

describe('Sasuke 148 compare la puissance imprimee de la cible a sa puissance reelle', () => {
  function scene() {
    const s = plateau();
    const sasuke = perso('sasuke', 'player1', getCardById('SS-148-S') as CharacterCard);
    const oroCard = getCardById('KS-138-S') as CharacterCard;
    s.activeMissions[0].player1Characters = [
      sasuke,
      perso('naruto', 'player1', { name_fr: 'NARUTO UZUMAKI', name_en: 'NARUTO UZUMAKI', power: 3 }),
    ];
    s.activeMissions[0].player2Characters = [
      perso('oro', 'player2', oroCard, { stack: [getCardById('KS-126-R') as CharacterCard, oroCard] }),
    ];
    return { s, sasuke };
  }

  it('le POWERUP 3 du duel rend un Orochimaru imprime 8 vulnerable a un Sasuke imprime 7', () => {
    const { s, sasuke } = scene();
    expect(getEffectivePower(s, sasuke, 'player1')).toBe(7);

    let etat = EffectEngine.resolvePlayEffects(s, 'player1', sasuke, 0, false);
    let garde = 0;
    while (etat.pendingEffects.some((p) => !p.resolved) && garde < 6) {
      garde++;
      const pending = etat.pendingEffects.find((p) => !p.resolved)!;
      etat = EffectEngine.applyTargetedEffect(etat, pending, [pending.validTargets[0]]);
    }

    expect(etat.activeMissions[0].player2Characters.some((c) => c.instanceId === 'oro')).toBe(false);
  });
});

describe('Sakura 007 applique son effet de debut de manche sans prendre le tour', () => {
  it('le porteur de l Edge reste celui qui joue en premier', () => {
    const s = plateau();
    s.turn = 1;
    s.phase = 'end';
    s.edgeHolder = 'player1';
    s.missionDeck = [mockMission({ basePoints: 4 })];
    s.player1.deck = [getCardById('KS-009-C') as CharacterCard, getCardById('KS-010-C') as CharacterCard];
    s.player2.deck = [getCardById('KS-009-C') as CharacterCard, getCardById('KS-010-C') as CharacterCard];
    s.activeMissions[0].player1Characters = [
      perso('sakura', 'player1', getCardById('SS-007-C') as CharacterCard),
      perso('allie', 'player1', { name_fr: 'NARUTO UZUMAKI', name_en: 'NARUTO UZUMAKI', power: 2, keywords: ['Team 7'] }),
    ];

    const apres = GameEngine.transitionToStartPhase(s);

    expect(apres.phase).toBe('action');
    expect(apres.activePlayer).toBe('player1');
    expect(apres.pendingActions).toHaveLength(0);
    const allie = apres.activeMissions[0].player1Characters.find((c) => c.instanceId === 'allie');
    expect(allie?.powerTokens).toBe(2);
  });
});

describe('Zaku 041 est bien present dans le jeu', () => {
  it('porte ses valeurs, son illustration et son aura', () => {
    const c = getCardById('SS-041-UC') as CharacterCard;
    expect(c).toBeTruthy();
    expect(c.title_en).toBe('Pride in Sound Village');
    expect(c.chakra).toBe(2);
    expect(c.power).toBe(3);
    expect(c.has_visual).toBe(true);
    expect(c.image_file).toContain('SS-041-UC.webp');
  });
});

describe('Kabuto 030 montre la carte avant de choisir la mission', () => {
  it('la selection de mission transporte la carte revelee', () => {
    const s = plateau();
    const kabuto = perso('kabuto', 'player1', getCardById('SS-030-C') as CharacterCard);
    s.activeMissions[0].player1Characters = [kabuto];
    s.player1.deck = [getCardById('KS-010-C') as CharacterCard];

    const handler = getEffectHandler('SS-030-C', 'FIRST_STRIKE')!;
    const res = handler({
      state: s, sourcePlayer: 'player1', sourceCard: kabuto,
      sourceMissionIndex: 0, triggerType: 'FIRST_STRIKE', isUpgrade: false,
    });

    const relais = JSON.parse(res.description as string);
    expect(relais.nextType).toBe('SS030_PLACE_HIDDEN');
    const charge = JSON.parse(relais.nextText);
    expect(charge.cardName_fr).toBeTruthy();
    expect(charge.cardImageFile).toBeTruthy();
    expect(charge.cardCost).toBeTypeOf('number');
    expect(charge.cardPower).toBeTypeOf('number');
  });
});

describe('les deux autres DUEL qui etaient muets sont reveilles', () => {
  it('Kimimaro 077 monte sa limite de cout a 7 quand Gaara est dans sa mission', () => {
    const s = plateau();
    const kimimaro = perso('kimimaro', 'player1', getCardById('SS-077-UC') as CharacterCard);
    s.activeMissions[0].player1Characters = [kimimaro];
    expect(kimimaro077Limit(s, s.activeMissions[0].player1Characters[0])).toBe(5);

    s.activeMissions[0].player2Characters = [perso('gaara', 'player2', { name_fr: 'GAARA', name_en: 'GAARA', power: 4 })];
    expect(kimimaro077Limit(s, s.activeMissions[0].player1Characters[0])).toBe(7);
  });

  it('Orochimaru 130 propose de vaincre au lieu de cacher quand Hiruzen est la', () => {
    const s = plateau();
    const oro = perso('oro130', 'player1', getCardById('SS-130-R') as CharacterCard);
    s.activeMissions[0].player1Characters = [oro];
    s.activeMissions[0].player2Characters = [
      perso('feuille', 'player2', { name_fr: 'IRUKA UMINO', name_en: 'IRUKA UMINO', power: 2, group: 'Leaf Village' }),
    ];

    const handler = getEffectHandler('SS-130-R', 'FIRST_STRIKE')!;
    const sansHiruzen = handler({
      state: s, sourcePlayer: 'player1', sourceCard: oro,
      sourceMissionIndex: 0, triggerType: 'FIRST_STRIKE', isUpgrade: false,
    });
    expect(sansHiruzen.targetSelectionType).toBe('SS130_CONFIRM_FIRST_STRIKE');

    s.activeMissions[0].player2Characters.push(
      perso('hiruzen', 'player2', { name_fr: 'HIRUZEN SARUTOBI', name_en: 'HIRUZEN SARUTOBI', power: 5, group: 'Leaf Village' }),
    );
    const avecHiruzen = handler({
      state: s, sourcePlayer: 'player1', sourceCard: oro,
      sourceMissionIndex: 0, triggerType: 'FIRST_STRIKE', isUpgrade: false,
    });
    expect(avecHiruzen.targetSelectionType).toBe('SS130_CONFIRM_DUEL_MODIFIER');
  });
});

describe('Kin Tsuchi 043, sa remise est un effet continu', () => {
  it('porte le marqueur sablier, pas le marqueur instantane', () => {
    const c = getCardById('SS-043-UC') as CharacterCard;
    expect(c.effects[0].type).toBe('MAIN');
    expect(c.effects[0].description.startsWith('[⧗]')).toBe(true);
  });

  it('coute 2 avec une defausse vide et 1 des qu une carte y est', () => {
    const kin = getCardById('SS-043-UC') as CharacterCard;
    const s = plateau();
    expect(calculateEffectiveCost(s, 'player1', kin, 0, false)).toBe(2);
    s.player1.discardPile = [getCardById('KS-010-C') as CharacterCard];
    expect(calculateEffectiveCost(s, 'player1', kin, 0, false)).toBe(1);
  });

  it('est jouable avec 1 seul chakra quand la defausse n est pas vide', () => {
    const kin = getCardById('SS-043-UC') as CharacterCard;
    const s = plateau();
    s.player1.chakra = 1;
    s.player1.hand = [kin];
    s.player1.discardPile = [getCardById('KS-010-C') as CharacterCard];

    const apres = GameEngine.applyAction(s, 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0 } as never);
    expect(apres.activeMissions[0].player1Characters).toHaveLength(1);
    expect(apres.player1.chakra).toBe(0);
  });
});
