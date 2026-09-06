import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { readViewport, RETRECISSEMENT_DU_CLAVIER } from '@/lib/ui/viewport';

const RACINE = process.cwd();
const ECHELLE = readFileSync(join(RACINE, 'components/game/GameScaleContext.tsx'), 'utf8');

interface FenetreSimulee {
  innerWidth: number;
  innerHeight: number;
  visualViewport?: { width: number; height: number } | null;
  document: { documentElement: { clientWidth: number; clientHeight: number } };
}

const original = globalThis.window;

function poserLaFenetre(f: FenetreSimulee): void {
  (globalThis as unknown as { window: unknown }).window = f;
  (globalThis as unknown as { document: unknown }).document = f.document;
}

function tablette(hauteurVisible: number, hauteurReelle = 800): FenetreSimulee {
  return {
    innerWidth: 1280,
    innerHeight: hauteurReelle,
    visualViewport: { width: 1280, height: hauteurVisible },
    document: { documentElement: { clientWidth: 1280, clientHeight: hauteurReelle } },
  };
}

afterEach(() => {
  (globalThis as unknown as { window: unknown }).window = original;
});

describe('le clavier virtuel ne redimensionne plus le plateau', () => {
  it('le seuil de bascule du plateau est bien celui que le clavier faisait franchir', () => {
    expect(ECHELLE, 'le plateau passe en disposition mobile sous cette hauteur').toContain('const isMobile = vh < 500');
  });

  it('sans clavier, la hauteur visible est utilisee telle quelle', () => {
    poserLaFenetre(tablette(800, 800));
    expect(readViewport()).toEqual({ width: 1280, height: 800 });
  });

  it('clavier ouvert sur tablette: la hauteur de mise en page est conservee', () => {
    poserLaFenetre(tablette(340, 800));
    const v = readViewport();
    expect(v.height, 'sinon le plateau bascule en disposition mobile pendant la frappe').toBe(800);
    expect(v.height >= 500, 'et le seuil mobile n est pas franchi').toBe(true);
  });

  it('un petit retrecissement, comme la barre d adresse, reste pris en compte', () => {
    poserLaFenetre(tablette(740, 800));
    expect(
      readViewport().height,
      'seul un ecart superieur au seuil est attribue au clavier',
    ).toBe(740);
  });

  it('le seuil separe bien les deux cas', () => {
    poserLaFenetre(tablette(800 - RETRECISSEMENT_DU_CLAVIER, 800));
    expect(readViewport().height, 'juste au seuil: pas encore le clavier').toBe(800 - RETRECISSEMENT_DU_CLAVIER);
    poserLaFenetre(tablette(800 - RETRECISSEMENT_DU_CLAVIER - 1, 800));
    expect(readViewport().height, 'juste au dela: le clavier').toBe(800);
  });

  it('un telephone en paysage reste en disposition mobile, clavier ou non', () => {
    poserLaFenetre({
      innerWidth: 850, innerHeight: 420,
      visualViewport: { width: 850, height: 420 },
      document: { documentElement: { clientWidth: 850, clientHeight: 420 } },
    });
    expect(readViewport().height, 'aucun clavier ouvert ici').toBe(420);

    poserLaFenetre({
      innerWidth: 850, innerHeight: 420,
      visualViewport: { width: 850, height: 180 },
      document: { documentElement: { clientWidth: 850, clientHeight: 420 } },
    });
    expect(
      readViewport().height,
      'clavier ouvert: on garde la hauteur de mise en page, la disposition ne bouge pas',
    ).toBe(420);
  });

  it('sans visualViewport, on retombe sur la fenetre', () => {
    poserLaFenetre({
      innerWidth: 1024, innerHeight: 768, visualViewport: null,
      document: { documentElement: { clientWidth: 1024, clientHeight: 768 } },
    });
    expect(readViewport()).toEqual({ width: 1024, height: 768 });
  });

  it('des valeurs nulles ne renvoient jamais zero', () => {
    poserLaFenetre({
      innerWidth: 0, innerHeight: 0, visualViewport: { width: 0, height: 0 },
      document: { documentElement: { clientWidth: 0, clientHeight: 0 } },
    });
    const v = readViewport();
    expect(v.width).toBeGreaterThan(0);
    expect(v.height).toBeGreaterThan(0);
  });
});
