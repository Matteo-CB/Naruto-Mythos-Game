import { describe, it, expect, beforeAll } from 'vitest';
import { allCardData } from '@/lib/data/sets';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { GameEngine } from '@/lib/engine/GameEngine';
import type { CardData, CharacterCard, GameState } from '@/lib/engine/types';

beforeAll(() => { initializeRegistry(); });

const MOTIF_REMISE = /pay(?:ing|s)?\s+(?:\d+|X)\s+less|costs?\s+(?:\d+|X)\s+less|less to play/i;

const REMISES_CONNUES = [
  'KS-002-UC', 'KS-007-C', 'KS-008-UC', 'KS-033-UC', 'KS-034-C', 'KS-053-UC',
  'KS-075-C', 'KS-078-UC', 'KS-090-C', 'KS-096-C',
  'KS-105-MV', 'KS-105-R', 'KS-105-RA',
  'KS-109-MV', 'KS-109-R', 'KS-109-RA',
  'KS-125-R', 'KS-125-RA', 'KS-132-S', 'KS-132-SV',
  'KS-135-MV', 'KS-135-S',
  'SS-008-C', 'SS-021-C', 'SS-022-UC',
  'SS-032-C', 'SS-034-C', 'SS-036-C', 'SS-039-C', 'SS-040-UC', 'SS-043-UC',
  'SS-051-UC', 'SS-067-C', 'SS-086-C',
  'SS-111-CHIBIV', 'SS-111-R', 'SS-111-SHINOBIV',
  'SS-126-CHIBIV', 'SS-126-MV', 'SS-126-POPV', 'SS-126-R', 'SS-126-RA', 'SS-126-SPV', 'SS-126_2-MV',
  'SS-132-R', 'SS-133-R',
  'SS-140-R',
  'SS-144-CHIBIV', 'SS-144-S',
  'SS-149-CHIBIV', 'SS-149-L', 'SS-149-POPV', 'SS-149-S', 'SS-149-SPV', 'SS-149-SV',
  'SS-998-L',
].sort();

function cartesQuiReduisentUnCout(): string[] {
  const trouvees = new Set<string>();
  for (const carte of Object.values(allCardData.cards as Record<string, CardData>)) {
    for (const effet of carte.effects ?? []) {
      if (MOTIF_REMISE.test(effet.description)) trouvees.add(carte.id);
    }
  }
  return [...trouvees].sort();
}

describe('toute carte qui reduit un cout doit nourrir Zabuza 136', () => {
  it('aucune carte a remise n a ete ajoutee sans etre verifiee', () => {
    const actuelles = cartesQuiReduisentUnCout();
    const nouvelles = actuelles.filter((id) => !REMISES_CONNUES.includes(id));
    const disparues = REMISES_CONNUES.filter((id) => !actuelles.includes(id));

    expect(
      nouvelles,
      `Ces cartes reduisent un cout et ne sont pas encore verifiees pour ZABUZA MOMOCHI 136.\n`
      + `Verifiez que leur remise passe par calculateEffectiveCost ou par le parametre costReduction\n`
      + `des aides communes, puis ajoutez leur identifiant a REMISES_CONNUES:\n  ${nouvelles.join('\n  ')}`,
    ).toEqual([]);

    expect(disparues, `Ces cartes ne portent plus de remise, retirez-les de la liste:\n  ${disparues.join('\n  ')}`).toEqual([]);
  });

  it('la liste couvre bien les familles citees par le concepteur', () => {
    const actuelles = cartesQuiReduisentUnCout();
    for (const attendu of ['KS-053-UC', 'KS-135-S', 'KS-033-UC', 'KS-090-C', 'KS-075-C', 'SS-036-C']) {
      expect(actuelles, `${attendu} doit etre reconnu comme une carte a remise`).toContain(attendu);
    }
  });
});

describe('la regle de l amelioration ne compte pas comme une remise de carte', () => {
  function plateauAmelioration(avecRasa: boolean): GameState {
    const p2 = [simChar('KS-077-C', { owner: 'player2', instanceId: 'kanku' })];
    if (avecRasa) p2.push(simChar('SS-051-UC', { owner: 'player2', instanceId: 'rasa' }));
    const s = buildSimState({ p1: [], p2, missions: 2, chakra1: 40, edgeHolder: 'player2' });
    s.player2.chakra = 40;
    s.phase = 'action';
    s.activePlayer = 'player2';
    s.player2.hand = [getCardById('KS-078-UC') as CharacterCard];
    return s;
  }

  function ameliore(avecRasa: boolean) {
    const apres = GameEngine.applyAction(plateauAmelioration(avecRasa), 'player2', {
      type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'kanku',
    } as never);
    return apres.activeMissions[0].player2Characters.find((c) => c.instanceId === 'kanku');
  }

  it('payer seulement la difference ne rend pas la carte vulnerable', () => {
    expect(
      ameliore(false)?.playedBelowPrintedCost,
      'la carte dit "pour moins que son cout imprime a cause d un effet de carte": '
      + 'payer la difference lors d une amelioration est une regle du jeu, pas un effet de carte',
    ).toBe(false);
  });

  it('une vraie remise de carte la rend vulnerable, meme en amelioration', () => {
    expect(
      ameliore(true)?.playedBelowPrintedCost,
      'RASA 051 retire 1 au cout du Sable: la carte a bien ete jouee sous son cout imprime',
    ).toBe(true);
  });
});

describe('le drapeau suit toujours la derniere pose, pas celle enfouie dessous', () => {
  function avecRasa(): GameState {
    const s = buildSimState({
      p1: [], p2: [simChar('SS-051-UC', { owner: 'player2', instanceId: 'rasa' })],
      missions: 2, chakra1: 40, edgeHolder: 'player2',
    });
    s.phase = 'action';
    s.activePlayer = 'player2';
    s.player2.chakra = 40;
    s.player2.hand = [
      getCardById('KS-077-C') as CharacterCard,
      getCardById('KS-078-UC') as CharacterCard,
    ];
    return s;
  }

  function personnage(s: GameState) {
    return s.activeMissions[0].player2Characters.find((c) => c.instanceId !== 'rasa');
  }

  it('la carte du dessous posee a prix reduit est bien marquee', () => {
    const s = GameEngine.applyAction(avecRasa(), 'player2', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0,
    } as never);
    expect(personnage(s)?.playedBelowPrintedCost, 'KANKURO 077 paye 2 au lieu de 3 grace a RASA').toBe(true);
  });

  it('une amelioration a plein tarif efface la vulnerabilite heritee du dessous', () => {
    const pose = GameEngine.applyAction(avecRasa(), 'player2', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0,
    } as never);
    const cible = personnage(pose)!;

    const sansRasa = JSON.parse(JSON.stringify(pose)) as GameState;
    sansRasa.activeMissions[0].player2Characters = sansRasa.activeMissions[0].player2Characters
      .filter((c) => c.instanceId !== 'rasa');
    sansRasa.activePlayer = 'player2';
    sansRasa.phase = 'action';

    const apres = GameEngine.applyAction(sansRasa, 'player2', {
      type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: cible.instanceId,
    } as never);

    expect(
      personnage(apres)?.playedBelowPrintedCost,
      "une amelioration garde le meme identifiant, donc le personnage compte comme pose au dernier tour: "
      + 'si le drapeau du dessous survivait, ZABUZA tuerait une carte posee a plein tarif',
    ).toBe(false);
  });

  it('une amelioration remisee reste vulnerable meme si le dessous ne l etait pas', () => {
    const plein = buildSimState({
      p1: [], p2: [simChar('SS-051-UC', { owner: 'player2', instanceId: 'rasa' })],
      missions: 2, chakra1: 40, edgeHolder: 'player2',
    });
    plein.phase = 'action';
    plein.activePlayer = 'player2';
    plein.player2.chakra = 40;
    plein.activeMissions[0].player2Characters.push(
      simChar('KS-077-C', { owner: 'player2', instanceId: 'socle' }) as never,
    );
    plein.player2.hand = [getCardById('KS-078-UC') as CharacterCard];

    const apres = GameEngine.applyAction(plein, 'player2', {
      type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'socle',
    } as never);
    expect(
      apres.activeMissions[0].player2Characters.find((c) => c.instanceId === 'socle')?.playedBelowPrintedCost,
      'RASA fait payer 3 pour une carte imprimee a 4',
    ).toBe(true);
  });
});
