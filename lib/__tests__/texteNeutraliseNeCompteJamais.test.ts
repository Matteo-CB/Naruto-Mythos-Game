import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { getCardById } from '@/lib/data/cardIndex';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import { attachCardToCharacter } from '@/lib/effects/attachments';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { effetsActifsDe, textIsBlanked, FLASH_BOMB } from '@/lib/effects/handlers/SS/attachmentStatics';
import { getAllCards } from '@/lib/data/cardLoader';
import type { CardData, CharacterCard, GameState } from '@/lib/engine/types';

const RACINE = process.cwd();
const SEPARATEUR = String.fromCharCode(92);
const SAUT_DE_LIGNE = new RegExp(String.fromCharCode(92) + 'r?' + String.fromCharCode(92) + 'n');
const BOMBE = 'SS-083-UC';
const RASA = 'SS-051-UC';

function fichiers(dossier: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) {
      if (entree === '__tests__' || entree === 'node_modules') continue;
      fichiers(chemin, acc);
    } else if (entree.endsWith('.ts')) {
      acc.push(chemin);
    }
  }
  return acc;
}

describe('une carte au texte neutralise n apporte plus rien, quelle que soit la carte', () => {
  beforeAll(() => { initializeRegistry(); });

  function avecBombeSur(cardId: string): GameState {
    let state = buildSimState({
      p1: [simChar(cardId, { owner: 'player1', instanceId: 'source' })],
      p2: [],
      missions: 3,
      chakra1: 30,
    });
    state = attachCardToCharacter(state, 'player2', getCardById(BOMBE) as CardData, 'source');
    return state;
  }

  it('la bombe aveuglante vide bien le texte de sa cible', () => {
    const state = avecBombeSur(RASA);
    const cible = state.activeMissions[0].player1Characters[0];
    expect(textIsBlanked(cible)).toBe(true);
    expect(effetsActifsDe(cible)).toEqual([]);
  });

  it('un Rasa neutralise ne reduit plus le cout des allies du Village du Sable', () => {
    const sable = getCardById('SS-047-UC') as CharacterCard;
    expect(sable.group).toBe('Sand Village');

    const sansBombe = buildSimState({
      p1: [simChar(RASA, { owner: 'player1', instanceId: 'source' })],
      p2: [], missions: 3, chakra1: 30,
    });
    expect(calculateEffectiveCost(sansBombe, 'player1', sable, 0, false)).toBe((sable.chakra ?? 0) - 1);
    expect(calculateEffectiveCost(avecBombeSur(RASA), 'player1', sable, 0, false)).toBe(sable.chakra);
  });

  it('la remise vaut aussi depuis une autre mission, et deux sources se cumulent', () => {
    const sable = getCardById('SS-047-UC') as CharacterCard;
    const state = buildSimState({
      p1: [
        simChar(RASA, { owner: 'player1', instanceId: 'r1' }),
        simChar(RASA, { owner: 'player1', instanceId: 'r2' }),
      ],
      p2: [], missions: 3, chakra1: 30,
    });
    expect(calculateEffectiveCost(state, 'player1', sable, 2, false)).toBe(Math.max(0, (sable.chakra ?? 0) - 2));
  });

  it('la remise se lit sur le texte imprime, pas sur un numero de carte', () => {
    const source = readFileSync(join(RACINE, 'lib/engine/rules/ChakraValidation.ts'), 'utf8');
    const bloc = source.slice(source.indexOf('remiseDeGroupePartout'), source.indexOf('export function calculateEffectiveCost'));
    expect(bloc, 'aucun identifiant de carte code en dur').not.toMatch(/'SS'|'51'|number\s*===\s*51/);
    expect(bloc).toContain('effetsActifsDe');
  });

  it('un Rasa cache ne reduit rien non plus', () => {
    const sable = getCardById('SS-047-UC') as CharacterCard;
    const state = buildSimState({
      p1: [simChar(RASA, { owner: 'player1', instanceId: 'r1', hidden: true })],
      p2: [], missions: 3, chakra1: 30,
    });
    expect(calculateEffectiveCost(state, 'player1', sable, 0, false)).toBe(sable.chakra);
  });

  it('la bombe ne touche que le texte: nom, cout, puissance et groupe restent', () => {
    const state = avecBombeSur(RASA);
    const cible = state.activeMissions[0].player1Characters[0];
    const imprime = getCardById(RASA) as CharacterCard;
    expect(cible.card.name_en).toBe(imprime.name_en);
    expect(cible.card.chakra).toBe(imprime.chakra);
    expect(cible.card.power).toBe(imprime.power);
    expect(cible.card.group).toBe(imprime.group);
  });

  it('aucun autre fichier ne lit les effets d une carte en jeu sans la lecture active', () => {
    const cibles = [
      ...fichiers(join(RACINE, 'lib/effects')),
      ...fichiers(join(RACINE, 'lib/engine')),
    ];
    const motif = /(?:^|[^a-zA-Z])(?:top|topCard|cTop|haut|top\d*)\s*(?:\?\.|\.)effects/;
    const fautifs: string[] = [];

    for (const chemin of cibles) {
      const relatif = chemin.slice(RACINE.length + 1).split(SEPARATEUR).join('/');
      if (FICHIERS_PROTEGES_EN_AMONT.includes(relatif)) continue;
      const lignes = readFileSync(chemin, 'utf8').split(SAUT_DE_LIGNE);
      lignes.forEach((ligne, i) => {
        if (!motif.test(ligne)) return;
        fautifs.push(`${relatif}:${i + 1}  ${ligne.trim().slice(0, 110)}`);
      });
    }

    expect(
      fautifs,
      'lire les effets d une carte en jeu doit passer par effetsActifsDe, sinon une carte au texte efface continue d agir',
    ).toEqual([]);
  });

  it('chaque fichier dispense porte bien la protection qui le dispense', () => {
    const resolveurs = readFileSync(join(RACINE, 'lib/effects/EffectEngine.ts'), 'utf8');
    expect(
      (resolveurs.match(/if \(textIsBlanked\(character\)\) \{/g) ?? []).length,
      'les trois resolveurs de jeu, de revelation et d amelioration refusent une carte au texte efface',
    ).toBe(3);

    for (const chemin of ['lib/effects/EffectEngine.ts', 'lib/effects/handlers/KS/uncommon/kakashi016.ts', 'lib/effects/handlers/KS/uncommon/sakon062.ts', 'lib/engine/GameEngine.ts']) {
      const source = readFileSync(join(RACINE, chemin), 'utf8');
      expect(source, `${chemin} filtre les cartes copiables`).toContain('isCopyableCharacter');
    }

    const helper = readFileSync(join(RACINE, 'lib/effects/handlers/SS/attachmentStatics.ts'), 'utf8');
    expect(helper, 'le helper est la source unique et rend une liste vide').toContain('if (textIsBlanked(char)) return [];');
  });

  it('la bombe aveuglante est bien la carte qui vide le texte', () => {
    expect(FLASH_BOMB).toBe(83);
    const bombe = getAllCards().find((c) => c.id === BOMBE);
    expect(bombe?.set).toBe('SS');
    expect(Number(bombe?.number)).toBe(FLASH_BOMB);
  });
});

const FICHIERS_PROTEGES_EN_AMONT = [
  'lib/effects/EffectEngine.ts',
  'lib/effects/handlers/KS/uncommon/kakashi016.ts',
  'lib/effects/handlers/KS/uncommon/sakon062.ts',
  'lib/effects/handlers/SS/attachmentStatics.ts',
  'lib/engine/GameEngine.ts',
];
