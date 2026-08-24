import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  isCopyableEffect,
  isCopyableEffectType,
  isCopyableCharacter,
  copieurRefuseLesUpgrades,
} from '@/lib/effects/handlers/KS/shared/copyExclusions';

const COPY_FILTER_FILES = [
  'lib/effects/EffectEngine.ts',
  'lib/engine/GameEngine.ts',
  'lib/effects/handlers/KS/uncommon/sakon062.ts',
  'lib/effects/handlers/KS/uncommon/kakashi016.ts',
];

const ROOT = join(__dirname, '..', '..');

describe('un effet se copie a condition que le copieur remplisse sa condition', () => {
  it('seul SCORE est hors du champ, il ne se declenche pas en jouant la carte', () => {
    expect(isCopyableEffectType('MAIN')).toBe(true);
    expect(isCopyableEffectType('AMBUSH')).toBe(true);
    expect(isCopyableEffectType('DUEL')).toBe(true);
    expect(isCopyableEffectType('UPGRADE')).toBe(true);
    expect(isCopyableEffectType('FIRST_STRIKE')).toBe(true);
    expect(isCopyableEffectType('SCORE')).toBe(false);
  });

  it('un AMBUSH se copie seulement si celui du copieur se declenche', () => {
    const embuscade = { type: 'AMBUSH', description: '[↯] Draw a card.' };
    expect(isCopyableEffect(embuscade, { wasRevealed: true })).toBe(true);
    expect(isCopyableEffect(embuscade, { wasRevealed: false })).toBe(false);
    expect(isCopyableEffect(embuscade, {})).toBe(false);
  });

  it('un FIRST STRIKE se copie seulement si le copieur est la premiere carte du tour', () => {
    const premiere = { type: 'FIRST_STRIKE', description: '[↯] Hide a character.' };
    expect(isCopyableEffect(premiere, { wasFirstCard: true })).toBe(true);
    expect(isCopyableEffect(premiere, { wasFirstCard: false })).toBe(false);
    expect(isCopyableEffect(premiere, {})).toBe(false);
  });

  it('un UPGRADE se copie seulement si le copieur a lui-meme ete pose en amelioration', () => {
    const amelioration = { type: 'UPGRADE', description: '[↯] Draw a card.' };
    expect(
      isCopyableEffect(amelioration, { wasUpgrade: true }),
      'pour copier un UPGRADE il faut avoir ameliore',
    ).toBe(true);
    expect(isCopyableEffect(amelioration, { wasUpgrade: false })).toBe(false);
    expect(isCopyableEffect(amelioration, {})).toBe(false);
  });

  it('un MAIN ne demande aucune condition', () => {
    expect(isCopyableEffect({ type: 'MAIN', description: '[↯] Draw a card.' }, {})).toBe(true);
  });

  it('un effet continu et une alteration ne se copient jamais', () => {
    expect(isCopyableEffect({ type: 'MAIN', description: '[⧗] This character has +1 Power.' }, {})).toBe(false);
    expect(isCopyableEffect({ type: 'MAIN', description: 'AMBUSH effect: Instead, defeat them.' }, {})).toBe(false);
    expect(isCopyableEffect({ type: 'MAIN', description: 'FIRST STRIKE effect: Instead, defeat them.' }, {})).toBe(false);
    expect(
      isCopyableEffect({ type: 'UPGRADE', description: '[↯] Repeat the AMBUSH effect.' }, { wasUpgrade: true }),
      'une repetition ne fait rien par elle-meme, elle modifie un effet deja resolu',
    ).toBe(false);
    expect(isCopyableEffect({ type: 'SCORE', description: '[↯] Draw a card.' }, {})).toBe(false);
  });
});

describe('le refus des UPGRADE est une restriction imprimee, pas une regle generale', () => {
  it('les copieurs dont le texte dit non-upgrade sont reconnus', () => {
    expect(copieurRefuseLesUpgrades('KS-016-UC'), 'KAKASHI 016 imprime "non-upgrade"').toBe(true);
    expect(copieurRefuseLesUpgrades('KS-106-R'), 'KAKASHI 106 imprime "non-Upgrade"').toBe(true);
    expect(copieurRefuseLesUpgrades('KS-106-RA')).toBe(true);
    expect(copieurRefuseLesUpgrades('KS-062-UC'), 'SAKON 062 ne porte aucune restriction').toBe(false);
    expect(copieurRefuseLesUpgrades(undefined)).toBe(false);
  });

  it('la restriction se lit sur la carte, donc un futur copieur est couvert sans code', () => {
    const source = readFileSync(join(ROOT, 'lib/effects/handlers/KS/shared/copyExclusions.ts'), 'utf8');
    expect(source, 'aucune liste de cartes en dur').not.toMatch(/KS-016|KS-106/);
    expect(source, 'la restriction vient du texte imprime').toContain('non[- ]upgrade');
  });

  it('KAKASHI refuse un UPGRADE meme quand il a ameliore, SAKON l accepte', () => {
    const amelioration = { type: 'UPGRADE', description: '[↯] Draw a card.' };
    expect(isCopyableEffect(amelioration, { wasUpgrade: true, copieur: 'KS-016-UC' })).toBe(false);
    expect(isCopyableEffect(amelioration, { wasUpgrade: true, copieur: 'KS-106-R' })).toBe(false);
    expect(isCopyableEffect(amelioration, { wasUpgrade: true, copieur: 'KS-062-UC' })).toBe(true);
  });
});

describe('tous les sites de copie passent par la regle commune', () => {
  it('chaque fichier resout la copie par le predicat partage et ne le reimplemente pas', () => {
    for (const f of COPY_FILTER_FILES) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      expect(src, `${f} doit passer par isCopyableEffect`).toContain('isCopyableEffect(');
      expect(src, `${f} ne doit pas appeler isCopyableEffectType directement`)
        .not.toContain('isCopyableEffectType(');
      expect(src, `${f} ne doit pas reimplementer le filtre des alterations`)
        .not.toContain('UPGRADE|SCORE)');
    }
  });

  it('chaque site transmet la condition d amelioration du copieur', () => {
    const src = readFileSync(join(ROOT, 'lib/effects/EffectEngine.ts'), 'utf8');
    const appels = src.match(/isCopyableEffect\([^)]*\)/g) ?? [];
    expect(appels.length, 'le moteur contient bien des sites de copie').toBeGreaterThan(4);
    for (const appel of appels) {
      expect(appel, `un site oublie la condition d amelioration: ${appel}`).toContain('wasUpgrade');
      expect(appel, `un site oublie l identite du copieur: ${appel}`).toContain('copieur');
    }
  });

  it('chaque fichier decide des personnages copiables par le predicat partage', () => {
    for (const f of COPY_FILTER_FILES) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      expect(src, `${f} doit passer par isCopyableCharacter`).toContain('isCopyableCharacter(');
    }
  });

  it('un personnage cache ou au texte efface n est jamais une source de copie', () => {
    const socle = {
      instanceId: 'x', isHidden: false, powerTokens: 0, attachments: [],
      card: { id: 'KS-020-UC', set: 'KS', number: '020', effects: [] },
      stack: [{ id: 'KS-020-UC', set: 'KS', number: '020', effects: [] }],
    } as never as Parameters<typeof isCopyableCharacter>[0];
    expect(isCopyableCharacter(socle)).toBe(true);
    expect(isCopyableCharacter({ ...socle!, isHidden: true })).toBe(false);
    expect(isCopyableCharacter({
      ...socle!,
      attachments: [{ card: { id: 'SS-083-UC', set: 'SS', number: '083' }, owner: 'player1' }],
    } as never)).toBe(false);
    expect(isCopyableCharacter(null)).toBe(false);
  });
});
