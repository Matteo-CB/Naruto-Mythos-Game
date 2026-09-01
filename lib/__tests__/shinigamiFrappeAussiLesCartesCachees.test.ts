import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { getCardById } from '@/lib/data/cardIndex';
import { shinigami057BeforePower, SHINIGAMI_057_ID } from '@/lib/engine/phases/MissionPhase';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { GameState } from '@/lib/engine/types';

const RACINE = process.cwd();
const CIBLE = 'KS-009-C';

function plateau(cacheeSeulement: boolean): GameState {
  return buildSimState({
    p1: [simChar(SHINIGAMI_057_ID, { owner: 'player1', instanceId: 'shinigami' })],
    p2: cacheeSeulement
      ? [simChar(CIBLE, { owner: 'player2', instanceId: 'cachee', hidden: true })]
      : [
          simChar(CIBLE, { owner: 'player2', instanceId: 'cachee', hidden: true }),
          simChar('KS-010-C', { owner: 'player2', instanceId: 'visible' }),
        ],
    missions: 2,
    chakra1: 20,
  });
}

function ennemisEnJeu(state: GameState): string[] {
  return state.activeMissions.flatMap((m) => m.player2Characters.map((c) => c.instanceId));
}

describe('SHINIGAMI 057 frappe aussi une carte cachee, son texte ne l en empeche pas', () => {
  beforeAll(() => { initializeRegistry(); });

  it('son texte imprime ne restreint pas la cible', () => {
    const carte = getCardById(SHINIGAMI_057_ID);
    const principal = (carte?.effects ?? []).find((e) => e.description.includes('defeat an enemy character'));
    expect(principal, 'la carte porte bien cet effet').toBeTruthy();
    expect(principal?.description, 'aucune mention de non-hidden').not.toMatch(/non-?hidden/i);
  });

  it('une carte cachee seule est vaincue au lieu d etre ignoree', () => {
    const avant = plateau(true);
    expect(ennemisEnJeu(avant)).toEqual(['cachee']);
    const apres = shinigami057BeforePower(avant);
    expect(ennemisEnJeu(apres), 'la cachee est bien vaincue').toEqual([]);
    expect(
      apres.log.some((l) => l.messageKey === 'game.log.effect.noTarget' && String(l.messageParams?.id) === SHINIGAMI_057_ID),
      'il ne doit plus se declarer sans cible',
    ).toBe(false);
  });

  it('avec une cachee et une visible, le controleur choisit entre les deux', () => {
    const apres = shinigami057BeforePower(plateau(false));
    const choix = apres.pendingEffects.find((e) => e.targetSelectionType === 'SS057_DEFEAT_BEFORE_POWER');
    expect(choix, 'une fenetre de choix est ouverte').toBeTruthy();
    expect([...(choix?.validTargets ?? [])].sort(), 'les deux ennemis sont proposes').toEqual(['cachee', 'visible']);
  });

  it('un Shinigami lui-meme cache ne declenche rien, une carte cachee n a pas d effet', () => {
    const state = buildSimState({
      p1: [simChar(SHINIGAMI_057_ID, { owner: 'player1', instanceId: 'shinigami', hidden: true })],
      p2: [simChar(CIBLE, { owner: 'player2', instanceId: 'cachee', hidden: true })],
      missions: 2,
      chakra1: 20,
    });
    const apres = shinigami057BeforePower(state);
    expect(ennemisEnJeu(apres), 'rien ne se passe').toEqual(['cachee']);
  });

  it('le code ne filtre plus les caches hors de ses cibles', () => {
    const source = readFileSync(join(RACINE, 'lib/engine/phases/MissionPhase.ts'), 'utf8');
    const bloc = source.slice(source.indexOf('export function shinigami057BeforePower'), source.indexOf('export function applyStartOfMissionPhase') + 1 || undefined);
    expect(bloc, 'ecarter les caches n etait justifie par aucun texte imprime')
      .not.toContain("[ennemiSide].filter((c) => !c.isHidden)");
    expect(bloc, 'la source cachee reste ignoree, elle, c est la regle').toContain('if (char.isHidden');
  });
});
