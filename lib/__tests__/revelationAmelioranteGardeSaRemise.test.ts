import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { GameEngine } from '@/lib/engine/GameEngine';
import type { CharacterCard, GameState } from '@/lib/engine/types';

beforeAll(() => { initializeRegistry(); });

const SHINO_REMISE = 'KS-033-UC';
const SHINO_SOCLE = 'KS-032-C';
const JUTSU_ENNEMI = 'KS-010-C';
const ZABUZA_3 = 'KS-086-C';
const ZABUZA_4 = 'SS-136-R';

function plateau(avecJutsuEnnemi: boolean): GameState {
  const p1 = avecJutsuEnnemi
    ? [simChar(JUTSU_ENNEMI, { owner: 'player1', instanceId: 'jutsu' })]
    : [];
  const s = buildSimState({
    p1,
    p2: [
      simChar(SHINO_SOCLE, { owner: 'player2', instanceId: 'socle' }),
      simChar(SHINO_REMISE, { owner: 'player2', instanceId: 'cache', hidden: true }),
    ],
    missions: 3, chakra1: 40, edgeHolder: 'player2',
  });
  s.phase = 'action';
  s.activePlayer = 'player2';
  s.player2.chakra = 40;
  s.player1.chakra = 40;
  s.activeMissions[1].player1Characters.push(
    simChar(ZABUZA_3, { owner: 'player1', instanceId: 'zab3', missionIndex: 1 }) as never,
  );
  s.player1.hand = [getCardById(ZABUZA_4) as CharacterCard];
  return s;
}

function repondre(etat: GameState, choix: (options: string[]) => string): GameState {
  let s = etat;
  for (let garde = 0; garde < 10 && s.pendingActions.length > 0; garde += 1) {
    const pa = s.pendingActions[0];
    const options = (pa.options ?? []) as string[];
    const suivant = GameEngine.applyAction(s, pa.player, {
      type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [choix(options)],
    } as never);
    if (suivant === s) break;
    s = suivant;
  }
  return s;
}

function shino(s: GameState) {
  for (const m of s.activeMissions) {
    const trouve = m.player2Characters.find((c) => c.instanceId === 'socle');
    if (trouve) return trouve;
  }
  return undefined;
}

function revelerPuisDeplacerVersZabuza(avecJutsuEnnemi: boolean): GameState {
  let s = GameEngine.applyAction(plateau(avecJutsuEnnemi), 'player2', {
    type: 'REVEAL_CHARACTER', characterInstanceId: 'cache', missionIndex: 0,
  } as never);
  s = repondre(s, (o) => o[0]);
  return s;
}

function joueZabuza(etat: GameState): GameState {
  const s = { ...etat, activePlayer: 'player1' as const, phase: 'action' as const };
  return GameEngine.applyAction(s, 'player1', {
    type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 1, targetInstanceId: 'zab3',
  } as never);
}

describe('une revelation qui devient une amelioration garde sa remise', () => {
  it('la carte revelee a prix reduit est marquee comme telle', () => {
    const s = revelerPuisDeplacerVersZabuza(true);
    expect(
      shino(s)?.playedBelowPrintedCost,
      'SHINO 033 se revele en payant 4 de moins grace a son propre effet: '
      + 'la carte est bien arrivee sous son cout imprime',
    ).toBe(true);
  });

  it('le deplacement qui suit ne perd pas la marque', () => {
    const s = revelerPuisDeplacerVersZabuza(true);
    expect(shino(s)?.missionIndex ?? -1, 'son effet UPGRADE l a deplacee').not.toBe(0);
    expect(shino(s)?.playedBelowPrintedCost, 'la marque voyage avec le personnage').toBe(true);
  });

  it('ZABUZA 136 la voit et propose de la vaincre', () => {
    const apres = joueZabuza(revelerPuisDeplacerVersZabuza(true));
    const refus = apres.log.filter((l) => l.messageKey === 'game.log.effect.noTarget');
    expect(
      refus.length,
      'la carte est dans sa mission et a ete posee au tour precedent sous son cout imprime: '
      + 'annoncer aucune cible valide est le bug remonte par les joueurs',
    ).toBe(0);
    expect(apres.pendingActions.length, 'ZABUZA demande confirmation').toBeGreaterThan(0);
  });

  it('la cible choisie est bien vaincue', () => {
    const apres = repondre(joueZabuza(revelerPuisDeplacerVersZabuza(true)), (o) => o[0]);
    expect(shino(apres), 'SHINO quitte le plateau').toBeUndefined();
    expect(
      apres.player2.discardPile.some((c) => c.id === SHINO_REMISE),
      'et part dans la defausse de son proprietaire',
    ).toBe(true);
  });
});

describe('payer seulement la difference ne rend pas la carte vulnerable', () => {
  it('sans Jutsu ennemi, la revelation coute son plein tarif', () => {
    const s = revelerPuisDeplacerVersZabuza(false);
    expect(
      shino(s)?.playedBelowPrintedCost,
      'la remise de SHINO exige un Jutsu ennemi dans la mission: sans lui, '
      + 'la carte paye 4, et la regle de l amelioration qui deduit le socle n est pas un effet de carte',
    ).toBe(false);
  });

  it('ZABUZA 136 ne trouve alors aucune cible', () => {
    const apres = joueZabuza(revelerPuisDeplacerVersZabuza(false));
    expect(
      apres.log.some((l) => l.messageKey === 'game.log.effect.noTarget'),
      'aucune carte n a ete posee sous son cout imprime',
    ).toBe(true);
  });
});

describe('la marque decrit la derniere carte posee, pas celle enfouie dessous', () => {
  it('une revelation a plein tarif efface la remise du socle', () => {
    const depart = plateau(false);
    depart.activeMissions[0].player2Characters = depart.activeMissions[0].player2Characters
      .map((c) => (c.instanceId === 'socle' ? { ...c, playedBelowPrintedCost: true } : c));

    let s = GameEngine.applyAction(depart, 'player2', {
      type: 'REVEAL_CHARACTER', characterInstanceId: 'cache', missionIndex: 0,
    } as never);
    s = repondre(s, (o) => o[0]);

    expect(
      shino(s)?.playedBelowPrintedCost,
      'si la marque du dessous survivait, ZABUZA tuerait une carte posee a plein tarif',
    ).toBe(false);
  });
});

describe('les trois chemins d amelioration marquent tous la carte du dessus', () => {
  const ACTION_PHASE = readFileSync(
    join(__dirname, '..', 'engine', 'phases', 'ActionPhase.ts'), 'utf8',
  );

  it('la fusion par revelation reprend la marque de la carte revelee', () => {
    const at = ACTION_PHASE.indexOf('const upgraded = { ...upgradeTarget };');
    expect(at, 'la fusion par revelation existe toujours').toBeGreaterThan(-1);
    expect(
      ACTION_PHASE.slice(at, at + 400),
      'l objet conserve sur le plateau est construit depuis le personnage deja en place: '
      + 'sans cette ligne il garde la marque de la carte enfouie et la remise de la revelation disparait',
    ).toContain('upgraded.playedBelowPrintedCost = char.playedBelowPrintedCost;');
  });

  it('l amelioration depuis la main marque la carte au cout effectif', () => {
    expect(ACTION_PHASE).toContain(
      'existingChar.playedBelowPrintedCost = effectiveNewCost < (newCard.chakra ?? 0);',
    );
  });

  it('la pose simple marque aussi la carte', () => {
    expect(ACTION_PHASE).toContain('playedBelowPrintedCost: effectiveCost < (card.chakra ?? 0),');
  });
});
