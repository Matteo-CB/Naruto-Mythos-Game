import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const MOTEUR = readFileSync('lib/effects/EffectEngine.ts', 'utf8');

function blocDuCas(nom: string): string {
  const debut = MOTEUR.indexOf(`case '${nom}': {`);
  expect(debut, `le cas ${nom} existe`).toBeGreaterThan(-1);
  return MOTEUR.slice(debut, debut + 3000);
}

describe('Kakashi 016 revele en amelioration garde son contexte de jeu', () => {
  it('le relais vers la confirmation d amelioration transmet les deux drapeaux', () => {
    const bloc = blocDuCas('KAKASHI016_CONFIRM_MAIN');
    const relais = bloc.slice(bloc.indexOf("KAKASHI016_CONFIRM_UPGRADE") - 600, bloc.indexOf("KAKASHI016_CONFIRM_UPGRADE") + 600);
    expect(
      relais.includes('wasRevealed: pendingEffect.wasRevealed'),
      'sans ce drapeau, une AMBUSH n est plus jugee copiable et la liste de cibles se vide',
    ).toBe(true);
    expect(
      relais.includes('wasFirstCard: pendingEffect.wasFirstCard'),
      'meme raison pour la premiere frappe',
    ).toBe(true);
  });

  it('chaque relais vers la copie transmet aussi les deux drapeaux', () => {
    const morceaux = MOTEUR.split("targetSelectionType: 'KAKASHI_COPY_EFFECT'");
    expect(morceaux.length - 1, 'les deux chemins de copie existent').toBe(2);
    for (let i = 1; i < morceaux.length; i++) {
      const suite = morceaux[i].slice(0, 500);
      expect(suite.includes('wasRevealed'), `chemin ${i}: le drapeau de revelation est transmis`).toBe(true);
      expect(suite.includes('wasFirstCard'), `chemin ${i}: le drapeau de premiere carte est transmis`).toBe(true);
    }
  });
});
