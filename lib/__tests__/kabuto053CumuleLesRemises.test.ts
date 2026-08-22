import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { GameEngine } from '@/lib/engine/GameEngine';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById, getCharacterById } from '@/lib/data/cardIndex';
import type { GameState } from '@/lib/engine/types';

const KABUTO_053 = 'KS-053-UC';
const RASA_051 = 'SS-051-UC';
const SABLE = 'SS-047-UC';

beforeAll(() => { initializeRegistry(); });

function plateau(avecRasa: boolean, chakra: number): GameState {
  const p1 = [simChar('KS-052-C', { owner: 'player1', instanceId: 'kabuto-base' })];
  if (avecRasa) p1.push(simChar(RASA_051, { owner: 'player1', instanceId: 'rasa' }));

  const s = buildSimState({ p1, p2: [], missions: 2, chakra1: chakra, edgeHolder: 'player1' });
  s.phase = 'action';
  s.activePlayer = 'player1';
  s.player1.hand = [getCardById(KABUTO_053) as never];
  s.player1.discardPile = [getCharacterById(SABLE)!];
  return s;
}

function repond(depart: GameState): GameState {
  let courant = depart;
  let garde = 0;
  while (courant.pendingActions.length > 0 && garde < 10) {
    const q = courant.pendingActions[0];
    courant = GameEngine.applyAction(courant, q.player, {
      type: 'SELECT_TARGET', pendingActionId: q.id, selectedTargets: [q.options[0]],
    } as never);
    garde += 1;
  }
  return courant;
}

function joue(avecRasa: boolean, chakra: number): GameState {
  const depart = GameEngine.applyAction(plateau(avecRasa, chakra), 'player1', {
    type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0,
  } as never);
  return repond(depart);
}

function enJeu(s: GameState, cardId: string): boolean {
  return s.activeMissions.some((m) =>
    m.player1Characters.some((c) => {
      const top = c.stack?.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return top.id === cardId;
    }));
}

describe('KABUTO YAKUSHI 053 cumule sa remise avec celles en jeu', () => {
  it('RASA 051 reduit bien le cout des personnages du Sable', () => {
    const avec = plateau(true, 30);
    const sans = plateau(false, 30);
    const carte = getCharacterById(SABLE)!;
    const prixAvec = calculateEffectiveCost(avec, 'player1', carte, 0, false);
    const prixSans = calculateEffectiveCost(sans, 'player1', carte, 0, false);
    expect(prixSans - prixAvec, 'Rasa retire bien 1 au cout du Sable').toBe(1);
  });

  it('le personnage sort de la defausse meme quand seul le cumul le rend payable', () => {
    const carte = getCharacterById(SABLE)!;
    const prixSansRasa = calculateEffectiveCost(plateau(false, 30), 'player1', carte, 0, false);
    const budget = Math.max(0, prixSansRasa - 3 - 1);

    const avecRasa = joue(true, budget + 4);
    expect(
      enJeu(avecRasa, SABLE),
      'avec Rasa, la remise cumulee doit permettre de le jouer',
    ).toBe(true);
  });

  it('le chakra debite tient compte des deux remises', () => {
    const restantAvecRasa = joue(true, 30).player1.chakra;
    const restantSansRasa = joue(false, 30).player1.chakra;
    expect(
      restantAvecRasa - restantSansRasa,
      'avec Rasa le personnage du Sable coute un chakra de moins',
    ).toBe(1);
  });
});

describe('aucun cout imprime en dur dans la chaine Kabuto 053', () => {
  const HANDLER = readFileSync(join(__dirname, '..', 'effects', 'handlers', 'KS', 'uncommon', 'kabuto053.ts'), 'utf8');
  const MOTEUR = readFileSync(join(__dirname, '..', 'effects', 'EffectEngine.ts'), 'utf8');

  it('le handler calcule le cout reel', () => {
    expect(HANDLER).toContain('calculateEffectiveCost');
    expect(HANDLER, 'le cout imprime ne sert plus a decider').not.toContain('(topCard.chakra ?? 0) - 3');
  });

  it('la confirmation et le paiement calculent le cout reel', () => {
    const debut = MOTEUR.indexOf("case 'KABUTO053_CONFIRM_MAIN'");
    const bloc = MOTEUR.slice(debut, debut + 2200);
    expect(bloc).toContain('calculateEffectiveCost');

    const paiement = MOTEUR.indexOf('static kabuto053PlayFromDiscard');
    const corps = MOTEUR.slice(paiement, paiement + 6000);
    expect(corps).toContain('prixEffectifK053');
    expect(corps, 'le prix paye ne part plus du cout imprime').not.toContain('(card.chakra ?? 0) - 3)');
  });
});
