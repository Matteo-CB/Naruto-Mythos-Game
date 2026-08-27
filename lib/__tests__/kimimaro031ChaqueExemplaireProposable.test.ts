import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById, getAllCards } from '@/lib/data/cardIndex';
import { GameEngine } from '@/lib/engine/GameEngine';
import { soundFourNameOf, discardableSoundFour } from '@/lib/effects/handlers/SS/kimimaro031';
import type { CardData, CharacterCard, GameState } from '@/lib/engine/types';

beforeAll(() => { initializeRegistry(); });

const KIMIMARO = 'SS-031-UC';
const KIMIMARO_CHIBI = 'SS-031-CHIBIV';
const JIROBO_BEBE = 'SS-032-C';
const JIROBO_SET1 = 'KS-057-C';
const TAYUYA_RARE = 'KS-125-R';
const TAYUYA_SET1 = 'KS-065-UC';

function plateau(main: string[]): GameState {
  const s = buildSimState({
    p1: [simChar('KS-013-C', { owner: 'player1', instanceId: 'socle' })],
    p2: [], missions: 2, chakra1: 40,
  });
  s.phase = 'action';
  s.activePlayer = 'player1';
  s.player1.chakra = 40;
  s.player1.hand = main.map((id) => getCardById(id) as CharacterCard);
  return s;
}

const idsProposes = (s: GameState, deja: Parameters<typeof discardableSoundFour>[2] = []) =>
  discardableSoundFour(s, 'player1', deja)
    .map((c) => (s.player1.hand as unknown as CardData[])[c.handIndex].id);

describe('chaque exemplaire en main peut etre choisi, pas seulement le premier', () => {
  it('deux JIROBO differents sont tous les deux proposes', () => {
    const s = plateau([JIROBO_SET1, JIROBO_BEBE]);
    expect(
      idsProposes(s).sort(),
      'la carte dit "jusqu a un de chaque", ce qui limite le nombre, pas le choix de l exemplaire',
    ).toEqual([JIROBO_BEBE, JIROBO_SET1].sort());
  });

  it('deux TAYUYA differentes sont toutes les deux proposees', () => {
    const s = plateau([TAYUYA_SET1, TAYUYA_RARE]);
    expect(idsProposes(s).sort()).toEqual([TAYUYA_RARE, TAYUYA_SET1].sort());
  });

  it('deux exemplaires identiques sont proposes deux fois', () => {
    const s = plateau([JIROBO_BEBE, JIROBO_BEBE]);
    expect(discardableSoundFour(s, 'player1', []).map((c) => c.handIndex)).toEqual([0, 1]);
  });

  it('un nom deja depense disparait entierement de la liste', () => {
    const s = plateau([JIROBO_SET1, JIROBO_BEBE, TAYUYA_RARE]);
    expect(
      idsProposes(s, ['JIROBO']),
      'la limite d un par nom se joue sur les noms deja utilises',
    ).toEqual([TAYUYA_RARE]);
  });
});

describe('le nom se lit en mot entier, jamais en morceau', () => {
  it('les quatre noms sont reconnus sur les deux sets', () => {
    for (const [id, attendu] of [
      [JIROBO_BEBE, 'JIROBO'], [JIROBO_SET1, 'JIROBO'],
      [TAYUYA_RARE, 'TAYUYA'], ['KS-059-C', 'KIDOMARU'],
      ['KS-061-C', 'SAKON'], ['SS-037-UC', 'SAKON'],
    ] as const) {
      expect(soundFourNameOf(getCardById(id) as unknown as CardData), id).toBe(attendu);
    }
  });

  it('aucune carte du catalogue n est prise pour un Quatre du Son par accident', () => {
    const faux: string[] = [];
    for (const carte of getAllCards() as unknown as CardData[]) {
      const nom = soundFourNameOf(carte);
      if (!nom) continue;
      const complet = `${carte.name_fr ?? ''} ${carte.name_en ?? ''}`.toUpperCase();
      const mot = new RegExp(`(^|[^A-Z])${nom}([^A-Z]|$)`);
      if (!mot.test(complet)) faux.push(`${carte.id} (${carte.name_en}) pris pour ${nom}`);
    }
    expect(faux, 'un nom reconnu dans un fragment ferait defausser la mauvaise carte').toEqual([]);
  });
});

describe('la defausse rapporte bien ce que la carte annonce', () => {
  function jouerPuis(main: string[], choisir: (ids: string[]) => number): GameState {
    let s = GameEngine.applyAction(plateau([KIMIMARO, ...main]), 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0,
    } as never);
    for (let i = 0; i < 8 && s.pendingActions.length > 0; i += 1) {
      const pa = s.pendingActions[0];
      const options = (pa.options ?? []) as string[];
      const lie = s.pendingEffects.find((e) => e.id === pa.sourceEffectId);
      let choix = options[0];
      if (lie?.targetSelectionType === 'SS031_CHOOSE_DISCARD') {
        const enMain = s.player1.hand as unknown as CardData[];
        const voulu = choisir(options.map((o) => enMain[Number(o)]?.id ?? ''));
        if (voulu >= 0) choix = options[voulu];
      }
      const suivant = GameEngine.applyAction(s, pa.player, {
        type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [choix],
      } as never);
      if (suivant === s) break;
      s = suivant;
    }
    return s;
  }

  it('defausser TAYUYA donne 2 Chakra', () => {
    const avant = 40 - (getCardById(KIMIMARO) as unknown as CardData).chakra!;
    const apres = jouerPuis([TAYUYA_RARE], (ids) => ids.indexOf(TAYUYA_RARE));
    expect(apres.player1.chakra, 'la carte annonce 2 Chakra').toBe(avant + 2);
    expect(
      (apres.player1.discardPile as unknown as CardData[]).map((c) => c.id),
      'et la carte choisie est bien celle qui part',
    ).toContain(TAYUYA_RARE);
  });

  it('choisir la deuxieme TAYUYA de la main la defausse elle, et donne le Chakra', () => {
    const avant = 40 - (getCardById(KIMIMARO) as unknown as CardData).chakra!;
    const apres = jouerPuis([TAYUYA_SET1, TAYUYA_RARE], (ids) => ids.indexOf(TAYUYA_RARE));
    expect(
      (apres.player1.discardPile as unknown as CardData[]).map((c) => c.id),
      'c est le bug remonte: le joueur cliquait sa carte et rien ne se passait',
    ).toContain(TAYUYA_RARE);
    expect(apres.player1.chakra, 'et le gain arrive').toBe(avant + 2);
  });

  it('defausser le JIROBO du set 2 donne bien POWERUP 3', () => {
    const apres = jouerPuis([JIROBO_SET1, JIROBO_BEBE], (ids) => ids.indexOf(JIROBO_BEBE));
    expect(
      (apres.player1.discardPile as unknown as CardData[]).map((c) => c.id),
    ).toContain(JIROBO_BEBE);
    const kimi = apres.activeMissions[0].player1Characters
      .find((c) => c.stack[c.stack.length - 1].id === KIMIMARO);
    expect(kimi?.powerTokens, 'POWERUP 3 sur Kimimaro').toBe(3);
  });
});

describe('les deux impressions de KIMIMARO se comportent pareil', () => {
  it('le texte et le comportement sont partages', () => {
    const base = getCardById(KIMIMARO) as unknown as CardData;
    const chibi = getCardById(KIMIMARO_CHIBI) as unknown as CardData;
    expect(chibi.chakra).toBe(base.chakra);
    expect(chibi.power).toBe(base.power);
    for (const cle of ['JIROBO', 'TAYUYA', 'KIDOMARU', 'SAKON']) {
      const texte = (chibi.effects ?? []).map((e) => e.description).join(' ').toUpperCase();
      expect(texte, `${cle} doit figurer sur la variante`).toContain(cle);
    }
  });
});
