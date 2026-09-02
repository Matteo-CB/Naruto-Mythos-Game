import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { GameEngine } from '@/lib/engine/GameEngine';
import { getCardById, getPlayableCharacters } from '@/lib/data/cardIndex';
import { getPlayableAttachments } from '@/lib/data/cardLoader';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { coutMinimalPourPoser } from '@/lib/engine/rules/coutMinimal';
import { canAffordAsUpgrade } from '@/lib/effects/handlers/KS/shared/upgradeCheck';
import type { CharacterCard, CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';

const RACINE = process.cwd();
const MAIN = readFileSync(join(RACINE, 'components/game/PlayerHand.tsx'), 'utf8');

const RASA = 'SS-051-UC';
const KURENAI = 'KS-034-C';
const BOMBE = 'SS-083-UC';
const SOCLE = 'KS-009-C';

function carte(id: string): CharacterCard {
  return getCardById(id) as CharacterCard;
}

function coutDePose(vue: unknown, player: PlayerID, card: CharacterCard, chakra: number): number {
  try {
    const frais = coutMinimalPourPoser(vue, player, card);
    if (frais <= chakra) return frais;
    return canAffordAsUpgrade(vue as never, player, card, 0, chakra) ? chakra : frais;
  } catch {
    return card.chakra;
  }
}

interface Plateau {
  nom: string;
  etat: (moi: PlayerID, chakra: number) => GameState;
}

function base(moi: PlayerID, chakra: number, mien: CharacterInPlay[], adverse: CharacterInPlay[], missions = 3): GameState {
  const state = buildSimState({
    p1: moi === 'player1' ? mien : adverse,
    p2: moi === 'player1' ? adverse : mien,
    missions,
    chakra1: chakra,
  });
  state.player1.chakra = chakra;
  state.player2.chakra = chakra;
  state.activePlayer = moi;
  state.phase = 'action';
  return state;
}

function empile(char: CharacterInPlay, ids: string[]): CharacterInPlay {
  char.stack = ids.map(carte);
  char.card = carte(ids[0]);
  return char;
}

const PLATEAUX: Plateau[] = [
  { nom: 'plateau vide, une mission', etat: (m, c) => base(m, c, [], [], 1) },
  { nom: 'plateau vide, quatre missions', etat: (m, c) => base(m, c, [], [], 4) },
  {
    nom: 'un allie visible',
    etat: (m, c) => base(m, c, [simChar(SOCLE, { owner: m, instanceId: 'a1' })], []),
  },
  {
    nom: 'un allie cache',
    etat: (m, c) => base(m, c, [simChar(SOCLE, { owner: m, instanceId: 'a1', hidden: true })], []),
  },
  {
    nom: 'un ennemi cache, carte masquee cote client',
    etat: (m, c) => base(m, c, [], [simChar('KS-108-R', { owner: m === 'player1' ? 'player2' : 'player1', instanceId: 'e1', hidden: true })]),
  },
  {
    nom: 'les deux camps, dont un ennemi cache',
    etat: (m, c) => {
      const adv = m === 'player1' ? 'player2' : 'player1';
      return base(m, c, [simChar(SOCLE, { owner: m, instanceId: 'a1' })], [
        simChar('KS-108-R', { owner: adv, instanceId: 'e1', hidden: true }),
        simChar('KS-128-R', { owner: adv, instanceId: 'e2' }),
      ]);
    },
  },
  {
    nom: 'une pile amelioree de deux cartes',
    etat: (m, c) => base(m, c, [empile(simChar(SOCLE, { owner: m, instanceId: 'a1' }), [SOCLE, 'KS-010-C'])], []),
  },
  {
    nom: 'une pile amelioree de trois cartes',
    etat: (m, c) => base(m, c, [empile(simChar(SOCLE, { owner: m, instanceId: 'a1' }), [SOCLE, 'KS-010-C', 'KS-145-M'])], []),
  },
  {
    nom: 'une pile par amelioration flexible, noms differents',
    etat: (m, c) => base(m, c, [empile(simChar('KS-025-C', { owner: m, instanceId: 'a1' }), ['KS-025-C', 'KS-029-UC'])], []),
  },
  {
    nom: 'un personnage vole a l adversaire',
    etat: (m, c) => {
      const adv = m === 'player1' ? 'player2' : 'player1';
      const vole = simChar('KS-128-R', { owner: adv, instanceId: 'v1' });
      vole.controlledBy = m;
      return base(m, c, [vole], []);
    },
  },
  {
    nom: 'un allie porteur d un equipement',
    etat: (m, c) => {
      const porteur = simChar(SOCLE, { owner: m, instanceId: 'a1' });
      const equipement = getPlayableAttachments()[0];
      if (equipement) {
        (porteur as unknown as { attachments: unknown[] }).attachments = [
          { instanceId: 'eq1', card: equipement, owner: m, isHidden: false },
        ];
      }
      return base(m, c, [porteur], []);
    },
  },
  {
    nom: 'un allie au texte efface par la Bombe aveuglante',
    etat: (m, c) => {
      const porteur = simChar(RASA, { owner: m, instanceId: 'a1' });
      (porteur as unknown as { attachments: unknown[] }).attachments = [
        { instanceId: 'bombe', card: carte(BOMBE), owner: m, isHidden: false },
      ];
      return base(m, c, [porteur], []);
    },
  },
  {
    nom: 'une remise Rasa sur tout le plateau',
    etat: (m, c) => base(m, c, [simChar(RASA, { owner: m, instanceId: 'rasa' })], []),
  },
  {
    nom: 'deux Rasa, remises cumulees',
    etat: (m, c) => base(m, c, [
      simChar(RASA, { owner: m, instanceId: 'rasa1' }),
      simChar(RASA, { owner: m, instanceId: 'rasa2', missionIndex: 0 }),
    ], []),
  },
  {
    nom: 'une remise Kurenai limitee a sa mission',
    etat: (m, c) => base(m, c, [simChar(KURENAI, { owner: m, instanceId: 'kur' })], []),
  },
  {
    nom: 'un homonyme deja pose, non ameliorable',
    etat: (m, c) => base(m, c, [simChar('KS-010-C', { owner: m, instanceId: 'a1' })], []),
  },
  {
    nom: 'plateau charge des deux cotes',
    etat: (m, c) => {
      const adv = m === 'player1' ? 'player2' : 'player1';
      return base(m, c, [
        simChar(SOCLE, { owner: m, instanceId: 'a1' }),
        simChar(RASA, { owner: m, instanceId: 'a2' }),
        simChar(KURENAI, { owner: m, instanceId: 'a3', hidden: true }),
      ], [
        simChar('KS-108-R', { owner: adv, instanceId: 'e1', hidden: true }),
        simChar('KS-128-R', { owner: adv, instanceId: 'e2' }),
        simChar('KS-133-S', { owner: adv, instanceId: 'e3' }),
      ], 4);
    },
  },
];

const CHAKRAS = [0, 1, 2, 3, 5, 12];

const CARTES_DU_SCENARIO = [SOCLE, 'KS-010-C', 'KS-145-M', 'KS-025-C', 'KS-029-UC', RASA, KURENAI, BOMBE, 'KS-108-R', 'KS-128-R', 'KS-133-S'];
const CAMPS: PlayerID[] = ['player1', 'player2'];

describe('la main affiche strictement le meme prix que le moteur, dans tous les cas', () => {
  beforeAll(() => { initializeRegistry(); });

  it('la matrice couvre reellement toutes les situations annoncees', () => {
    expect(PLATEAUX.length, 'chaque forme de plateau a son entree').toBeGreaterThanOrEqual(17);
    expect(new Set(PLATEAUX.map((p) => p.nom)).size, 'aucun doublon').toBe(PLATEAUX.length);
    expect(CAMPS).toEqual(['player1', 'player2']);
    expect(CHAKRAS[0], 'la reserve vide est testee').toBe(0);
    const cartes = (getPlayableCharacters() as CharacterCard[]).length;
    expect(cartes, 'tout le catalogue passe').toBeGreaterThan(400);
    expect(
      PLATEAUX.length * CAMPS.length * CHAKRAS.length * cartes,
      'la matrice ne doit jamais se vider en silence',
    ).toBeGreaterThan(80000);
  });

  it('toutes les cartes citees par les plateaux existent vraiment', () => {
    for (const id of CARTES_DU_SCENARIO) {
      expect(getCardById(id), `${id} doit exister, sinon le scenario ne teste rien`).toBeTruthy();
    }
  });

  it('le catalogue entier traverse chaque plateau sans jamais lever', () => {
    const cartes = getPlayableCharacters() as CharacterCard[];
    expect(cartes.length, 'le catalogue est bien charge').toBeGreaterThan(200);

    const erreurs: string[] = [];
    for (const plateau of PLATEAUX) {
      for (const moi of CAMPS) {
        const etat = plateau.etat(moi, 3);
        const vue = GameEngine.getVisibleState(etat, moi) as never;
        for (const c of cartes) {
          try { coutMinimalPourPoser(vue, moi, c); }
          catch (e) { erreurs.push(`${plateau.nom}/${moi}/cout/${c.id}: ${String(e)}`); }
          try { canAffordAsUpgrade(vue, moi, c, 0, 3); }
          catch (e) { erreurs.push(`${plateau.nom}/${moi}/upgrade/${c.id}: ${String(e)}`); }
        }
      }
    }
    expect(erreurs.slice(0, 5), 'une seule levee ici demonte tout le plateau').toEqual([]);
  });

  it('le prix annonce au client est exactement celui calcule sur le serveur', () => {
    const cartes = getPlayableCharacters() as CharacterCard[];
    const ecarts: string[] = [];

    for (const plateau of PLATEAUX) {
      for (const moi of CAMPS) {
        const etat = plateau.etat(moi, 3);
        const vue = GameEngine.getVisibleState(etat, moi) as never;
        for (const c of cartes) {
          const serveur = coutMinimalPourPoser(etat as never, moi, c);
          const client = coutMinimalPourPoser(vue, moi, c);
          if (serveur !== client) {
            ecarts.push(`${plateau.nom}/${moi}/${c.id}: serveur=${serveur} client=${client}`);
          }
        }
      }
    }
    expect(ecarts.slice(0, 8), 'le joueur doit voir le vrai prix').toEqual([]);
  });

  it('la branche amelioration repond pareil des deux cotes, a Chakra egal', () => {
    const cartes = getPlayableCharacters() as CharacterCard[];
    const ecarts: string[] = [];

    for (const plateau of PLATEAUX) {
      for (const moi of CAMPS) {
        for (const chakra of CHAKRAS) {
          const etat = plateau.etat(moi, chakra);
          const vue = GameEngine.getVisibleState(etat, moi) as never;
          for (const c of cartes) {
            const serveur = canAffordAsUpgrade(etat as never, moi, c, 0);
            const client = canAffordAsUpgrade(vue, moi, c, 0, chakra);
            if (serveur !== client) {
              ecarts.push(`${plateau.nom}/${moi}/chakra${chakra}/${c.id}: serveur=${serveur} client=${client}`);
            }
          }
        }
      }
    }
    expect(ecarts.slice(0, 8), 'la main ne doit pas juger autrement que le moteur').toEqual([]);
  });

  it('une carte affichee payable est toujours reellement payable quelque part', () => {
    const cartes = getPlayableCharacters() as CharacterCard[];
    const fautifs: string[] = [];

    for (const plateau of PLATEAUX) {
      for (const moi of CAMPS) {
        for (const chakra of CHAKRAS) {
          const etat = plateau.etat(moi, chakra);
          const vue = GameEngine.getVisibleState(etat, moi) as never;
          for (const c of cartes) {
            const annonce = coutDePose(vue, moi, c, chakra) <= chakra;
            if (!annonce) continue;
            const prixReel = coutMinimalPourPoser(etat as never, moi, c);
            const payableFrais = prixReel <= chakra;
            const payableAmelioration = canAffordAsUpgrade(etat as never, moi, c, 0);
            if (!payableFrais && !payableAmelioration) {
              fautifs.push(`${plateau.nom}/${moi}/chakra${chakra}/${c.id}: annoncee payable, prix reel ${prixReel}`);
            }
          }
        }
      }
    }
    expect(fautifs.slice(0, 8), 'ne jamais annoncer payable ce qui ne l est pas').toEqual([]);
  });

  it('une carte reellement payable n est jamais grisee a tort', () => {
    const cartes = getPlayableCharacters() as CharacterCard[];
    const fautifs: string[] = [];

    for (const plateau of PLATEAUX) {
      for (const moi of CAMPS) {
        for (const chakra of CHAKRAS) {
          const etat = plateau.etat(moi, chakra);
          const vue = GameEngine.getVisibleState(etat, moi) as never;
          for (const c of cartes) {
            const payable = coutMinimalPourPoser(etat as never, moi, c) <= chakra
              || canAffordAsUpgrade(etat as never, moi, c, 0);
            if (!payable) continue;
            if (coutDePose(vue, moi, c, chakra) > chakra) {
              fautifs.push(`${plateau.nom}/${moi}/chakra${chakra}/${c.id}: payable mais grisee`);
            }
          }
        }
      }
    }
    expect(fautifs.slice(0, 8), 'ne jamais griser ce qui est payable').toEqual([]);
  });

  it('a zero Chakra, seul ce qui coute zero reste allume', () => {
    for (const plateau of PLATEAUX) {
      for (const moi of CAMPS) {
        const etat = plateau.etat(moi, 0);
        const vue = GameEngine.getVisibleState(etat, moi) as never;
        for (const c of getPlayableCharacters() as CharacterCard[]) {
          const affiche = coutDePose(vue, moi, c, 0);
          const reel = coutMinimalPourPoser(etat as never, moi, c);
          if (reel > 0 && !canAffordAsUpgrade(etat as never, moi, c, 0)) {
            expect(affiche, `${plateau.nom}/${moi}/${c.id} doit rester grisee`).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('un etat abime ne fait jamais tomber la main', () => {
    const abimes: unknown[] = [
      undefined, null, {}, { myState: {} },
      { activeMissions: null }, { activeMissions: [] }, { activeMissions: [{}] },
      { activeMissions: [{ player1Characters: null, player2Characters: null }] },
      { activeMissions: [{ player1Characters: [{}], player2Characters: [] }] },
      { activeMissions: [{ player1Characters: [{ isHidden: false, controlledBy: 'player1', originalOwner: 'player1' }], player2Characters: [] }] },
    ];
    for (const etat of abimes) {
      for (const c of [carte(SOCLE), carte('KS-108-R'), carte(RASA)]) {
        expect(() => coutDePose(etat, 'player1', c, 3), String(JSON.stringify(etat))).not.toThrow();
        expect(coutDePose(etat, 'player1', c, 3)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('la main du composant utilise exactement cette logique', () => {
    const bloc = MAIN.slice(MAIN.indexOf('const coutDePose'), MAIN.indexOf('const effectPopupMinimized'));
    expect(bloc).toContain('try {');
    expect(bloc).toContain('coutMinimalPourPoser(visibleState, visibleState.myPlayer, card)');
    expect(bloc).toContain('if (frais <= chakra) return frais;');
    expect(bloc).toContain(', 0, chakra) ? chakra : frais;');
    expect(bloc.slice(bloc.indexOf('} catch'))).toContain('return card.chakra;');
    expect(MAIN, 'et le resultat pilote bien l affichage').toContain('chakra >= coutDePose(card)');
  });
});
