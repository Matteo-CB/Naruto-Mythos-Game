import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { getCardById } from '@/lib/data/cardIndex';
import { attachCardToCharacter } from '@/lib/effects/attachments';
import { jiraiyaGoldSources } from '@/lib/effects/handlers/SS/goldCards';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { CardData, GameState } from '@/lib/engine/types';

const RACINE = process.cwd();
const SEPARATEUR = String.fromCharCode(92);
const SAUT = new RegExp(String.fromCharCode(92) + 'r?' + String.fromCharCode(92) + 'n');
const BOMBE_AVEUGLANTE = 'SS-083-UC';
const JIRAIYA_OR = 'SS-998-L';
const JIRAIYA_SECRET = 'SS-144-S';

function deuxJiraiya(): GameState {
  return buildSimState({
    p1: [simChar(JIRAIYA_OR, { owner: 'player1', instanceId: 'jiraiya-a' })],
    p2: [],
    missions: 3,
    chakra1: 30,
  });
}

describe('un texte efface arrete aussi les effets reconnus par numero de carte', () => {
  beforeAll(() => { initializeRegistry(); });

  it('deux Jiraiya donnent bien deux Chakra tant que leur texte est intact', () => {
    const state = deuxJiraiya();
    state.activeMissions[1].player1Characters.push(
      simChar(JIRAIYA_SECRET, { owner: 'player1', instanceId: 'jiraiya-b' }) as never,
    );
    expect(jiraiyaGoldSources(state, 'player1').map((c) => c.instanceId).sort())
      .toEqual(['jiraiya-a', 'jiraiya-b']);
  });

  it('la partie signalee: une Bombe aveuglante sur chaque Jiraiya coupe tout le Chakra', () => {
    let state = deuxJiraiya();
    state.activeMissions[1].player1Characters.push(
      simChar(JIRAIYA_SECRET, { owner: 'player1', instanceId: 'jiraiya-b' }) as never,
    );
    const bombe = getCardById(BOMBE_AVEUGLANTE) as CardData;
    state = attachCardToCharacter(state, 'player2', bombe, 'jiraiya-a');
    expect(jiraiyaGoldSources(state, 'player1').map((c) => c.instanceId), 'un seul reste actif')
      .toEqual(['jiraiya-b']);

    state = attachCardToCharacter(state, 'player2', bombe, 'jiraiya-b');
    expect(jiraiyaGoldSources(state, 'player1'), 'les deux sont muets').toEqual([]);
  });

  it('un Jiraiya cache ne donne rien non plus, et la regle vaut pour les trois impressions', () => {
    const cache = buildSimState({
      p1: [simChar(JIRAIYA_OR, { owner: 'player1', instanceId: 'jiraiya-a', hidden: true })],
      p2: [], missions: 2, chakra1: 30,
    });
    expect(jiraiyaGoldSources(cache, 'player1')).toEqual([]);

    for (const impression of [JIRAIYA_OR, JIRAIYA_SECRET, 'SS-144-CHIBIV']) {
      const carte = getCardById(impression);
      expect(carte, `${impression} existe`).toBeTruthy();
      const texte = (carte?.effects ?? []).some((e) => e.description.includes('gain 1 Chakra'));
      expect(texte, `${impression} porte bien le gain de Chakra`).toBe(true);
    }
  });

  it('la Bombe aveuglante ne retire que le texte, pas le nom ni la puissance', () => {
    let state = deuxJiraiya();
    state = attachCardToCharacter(state, 'player2', getCardById(BOMBE_AVEUGLANTE) as CardData, 'jiraiya-a');
    const cible = state.activeMissions[0].player1Characters[0];
    const imprime = getCardById(JIRAIYA_OR);
    expect(cible.card.name_en).toBe(imprime?.name_en);
    expect(cible.card.power).toBe(imprime?.power);
    expect(cible.card.chakra).toBe(imprime?.chakra);
  });

  it('une Sakura 123 effacee n amplifie plus les jetons de puissance', async () => {
    const { amplifiedPowerup } = await import('@/lib/effects/ContinuousEffects');
    const AMPLI = 'SS-123-R';
    let state = buildSimState({
      p1: [
        simChar(AMPLI, { owner: 'player1', instanceId: 'ampli' }),
        simChar('KS-009-C', { owner: 'player1', instanceId: 'allie' }),
      ],
      p2: [], missions: 2, chakra1: 20,
    });
    expect(amplifiedPowerup(state, 'allie', 2), 'l amplificateur ajoute 1').toBe(3);
    state = attachCardToCharacter(state, 'player2', getCardById(BOMBE_AVEUGLANTE) as CardData, 'ampli');
    expect(amplifiedPowerup(state, 'allie', 2), 'texte efface, plus d amplification').toBe(2);
  });

  it('reconnaitre une carte par son numero n exempte pas de verifier le texte efface', () => {
    function fichiers(dossier: string, acc: string[] = []): string[] {
      for (const entree of readdirSync(dossier)) {
        const chemin = join(dossier, entree);
        if (statSync(chemin).isDirectory()) {
          if (entree === '__tests__') continue;
          fichiers(chemin, acc);
        } else if (entree.endsWith('.ts')) acc.push(chemin);
      }
      return acc;
    }

    const source = readFileSync(join(RACINE, 'lib/effects/handlers/SS/goldCards.ts'), 'utf8');
    const bloc = source.slice(source.indexOf('export function jiraiyaGoldSources'));
    expect(bloc, 'le site signale par les joueurs est protege').toContain('textIsBlanked(char)');

    const surveilles = [
      ...fichiers(join(RACINE, 'lib/effects')),
      ...fichiers(join(RACINE, 'lib/engine')),
    ];
    const fichiersAvecReconnaissance = surveilles.filter((chemin) => {
      const contenu = readFileSync(chemin, 'utf8');
      return /PRINTINGS\.includes\(/.test(contenu);
    });
    for (const chemin of fichiersAvecReconnaissance) {
      const relatif = chemin.slice(RACINE.length + 1).split(SEPARATEUR).join('/');
      const contenu = readFileSync(chemin, 'utf8');
      const protege = contenu.includes('textIsBlanked') || contenu.includes('effetsActifsDe');
      expect(
        protege,
        `${relatif} reconnait des cartes par leur impression et doit verifier le texte efface`,
      ).toBe(true);
    }
    expect(fichiersAvecReconnaissance.length, 'au moins un fichier reconnait des impressions').toBeGreaterThan(0);
  });
});
