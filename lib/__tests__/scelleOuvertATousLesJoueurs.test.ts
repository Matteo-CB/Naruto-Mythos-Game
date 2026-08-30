import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SEALED_TEMPORAIREMENT_FERME, sealedOuvertPour } from '@/lib/sealed/sealedGate';

const RACINE = process.cwd();

describe('le scelle est ouvert a tout le monde', () => {
  it('la fermeture temporaire est levee', () => {
    expect(SEALED_TEMPORAIREMENT_FERME).toBe(false);
  });

  it('un joueur ordinaire y accede, et meme un visiteur non identifie', () => {
    expect(sealedOuvertPour({ username: 'joueur', email: 'joueur@exemple.fr' })).toBe(true);
    expect(sealedOuvertPour(null)).toBe(true);
  });

  it('les deux portes du scelle passent par la meme verification', () => {
    const page = readFileSync(join(RACINE, 'app/[locale]/play/sealed/page.tsx'), 'utf8');
    expect(page).toContain('sealedOuvertPour');
    const serveur = readFileSync(join(RACINE, 'lib/socket/server.ts'), 'utf8');
    expect(serveur).toContain('sealedOuvertPour');
  });
});
