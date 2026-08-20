import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { attachCardToCharacter, attachCardToMission, campDeLEquipement } from '@/lib/effects/attachments';
import { releaseDanglingControl } from '@/lib/effects/controlIntegrity';
import { ciblesDeRetour, equipementEstVole } from '@/lib/effects/attachmentControl';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { AttachedCard, CardData, GameState } from '@/lib/engine/types';

const KUNAI = 'SS-080-C';
const STADE = 'SS-108-C';
const ALLIE = 'KS-011-C';
const VOLEUR = 'KS-020-UC';

beforeAll(() => { initializeRegistry(); });

function plateau(): GameState {
  const s = buildSimState({
    p1: [simChar(ALLIE, { owner: 'player1', instanceId: 'allie1' })],
    p2: [
      simChar(VOLEUR, { owner: 'player2', instanceId: 'ino' }),
      simChar(ALLIE, { owner: 'player2', instanceId: 'allie2' }),
    ],
    missions: 2, chakra1: 30, edgeHolder: 'player1',
  });
  s.phase = 'action';
  return s;
}

function equipementDe(state: GameState, cardId: string): AttachedCard | null {
  for (const m of state.activeMissions) {
    for (const a of m.attachments ?? []) if (a.card.id === cardId) return a;
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      for (const c of m[side]) {
        for (const a of c.attachments ?? []) if (a.card.id === cardId) return a;
      }
    }
  }
  return null;
}

function volePar(state: GameState, cardId: string, cible: string, voleur: string): GameState {
  const apres = attachCardToCharacter(
    state, 'player2', getCardById(cardId) as CardData, cible, false, undefined,
    { owner: 'player1', controllerInstanceId: voleur },
  );
  return apres;
}

describe('un equipement vole revient a son proprietaire quand le voleur quitte le jeu', () => {
  it('temoin: pose normalement, l equipement appartient a celui qui le joue', () => {
    const s = attachCardToCharacter(plateau(), 'player1', getCardById(KUNAI) as CardData, 'allie1');
    const kunai = equipementDe(s, KUNAI)!;
    expect(kunai.owner).toBe('player1');
    expect(equipementEstVole(kunai), 'rien n est vole ici').toBe(false);
  });

  it('vole puis pose par le voleur: il sert le voleur mais reste la propriete de son joueur', () => {
    const s = volePar(plateau(), KUNAI, 'allie2', 'ino');
    const kunai = equipementDe(s, KUNAI)!;

    expect(kunai.owner, 'la carte reste a son proprietaire').toBe('player1');
    expect(kunai.controlledBy, 'le voleur s en sert').toBe('player2');
    expect(campDeLEquipement(kunai), 'il occupe la place du voleur').toBe('player2');
    expect(equipementEstVole(kunai)).toBe(true);
  });

  it('le voleur vaincu, l equipement retourne chez son proprietaire sur une cible valide', () => {
    const s = volePar(plateau(), KUNAI, 'allie2', 'ino');
    const apres = EffectEngine.restoreControlOnLeave(s, 'ino');

    const kunai = equipementDe(apres, KUNAI);
    expect(kunai, 'il reste en jeu, il y avait une cible valide').toBeTruthy();
    expect(kunai!.owner).toBe('player1');
    expect(kunai!.controlledBy, 'il n est plus controle par personne').toBeUndefined();

    const chezLeProprietaire = apres.activeMissions.some((m) =>
      m.player1Characters.some((c) => (c.attachments ?? []).some((a) => a.card.id === KUNAI)));
    expect(chezLeProprietaire, 'il est repose sur un personnage du proprietaire').toBe(true);
  });

  it('sans cible valide chez le proprietaire, il part a sa defausse', () => {
    let s = plateau();
    s.activeMissions[0].player1Characters = [];
    s.activeMissions[1].player1Characters = [];
    s = volePar(s, KUNAI, 'allie2', 'ino');

    const apres = EffectEngine.restoreControlOnLeave(s, 'ino');
    expect(equipementDe(apres, KUNAI), 'plus rien en jeu').toBeNull();
    expect(
      apres.player1.discardPile.some((c) => c.id === KUNAI),
      'il rejoint la defausse de son proprietaire, jamais celle du voleur',
    ).toBe(true);
    expect(apres.player2.discardPile.some((c) => c.id === KUNAI)).toBe(false);
  });

  it('plusieurs cibles possibles: le proprietaire doit choisir', () => {
    let s = plateau();
    s.activeMissions[1].player1Characters = [simChar(ALLIE, { owner: 'player1', instanceId: 'allie3' })];
    s = volePar(s, KUNAI, 'allie2', 'ino');

    const apres = EffectEngine.restoreControlOnLeave(s, 'ino');
    const question = apres.pendingActions[0];
    expect(question, 'une question est posee').toBeTruthy();
    expect(question.player, 'c est au proprietaire de choisir, pas au voleur').toBe('player1');
    expect(question.options.length, 'les deux hotes possibles sont proposes').toBe(2);
  });

  it('un equipement de mission vole revient sur une mission libre du proprietaire', () => {
    let s = attachCardToMission(
      plateau(), 'player2', getCardById(STADE) as CardData, 0, false,
      { owner: 'player1', controllerInstanceId: 'ino' },
    );
    const stade = equipementDe(s, STADE)!;
    expect(stade.owner).toBe('player1');
    expect(campDeLEquipement(stade)).toBe('player2');

    s = EffectEngine.restoreControlOnLeave(s, 'ino');
    const apres = equipementDe(s, STADE);
    const enAttente = s.pendingActions[0];
    expect(
      apres?.controlledBy === undefined || enAttente?.player === 'player1',
      'soit il est repose chez le proprietaire, soit celui-ci choisit ou',
    ).toBe(true);
  });
});

describe('le filet de securite rattrape un controleur disparu sans passer par le retrait', () => {
  it('un equipement dont le controleur n est plus en jeu est rendu a chaque action', () => {
    let s = volePar(plateau(), KUNAI, 'allie2', 'ino');
    s.activeMissions[0].player2Characters = s.activeMissions[0].player2Characters.filter((c) => c.instanceId !== 'ino');

    const apres = releaseDanglingControl(s);
    const kunai = equipementDe(apres, KUNAI);
    const rendu = kunai?.controlledBy === undefined;
    const defausse = apres.player1.discardPile.some((c) => c.id === KUNAI);
    expect(rendu || defausse, 'il ne reste jamais chez le voleur').toBe(true);
  });
});

describe('les cibles de retour respectent les regles de pose', () => {
  it('un equipement de personnage ne vise que les hotes legaux du proprietaire', () => {
    const s = plateau();
    const cibles = ciblesDeRetour(s, getCardById(KUNAI) as CardData, 'player1');
    expect(cibles, 'le seul allie du proprietaire').toEqual(['allie1']);
  });

  it('un equipement de mission ne vise que les missions ou le proprietaire n en a pas deja un', () => {
    let s = plateau();
    s = attachCardToMission(s, 'player1', getCardById(STADE) as CardData, 0);
    const cibles = ciblesDeRetour(s, getCardById(STADE) as CardData, 'player1');
    expect(cibles, 'la mission 0 est deja prise').toEqual(['MISSION_1']);
  });
});
