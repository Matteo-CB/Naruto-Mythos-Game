import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { GameEngine } from '@/lib/engine/GameEngine';
import { packVisibleState, unpackVisibleState } from '@/lib/socket/statePack';
import { getCardById, getPlayableCharacters } from '@/lib/data/cardIndex';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { coutMinimalPourPoser } from '@/lib/engine/rules/coutMinimal';
import { canAffordAsUpgrade } from '@/lib/effects/handlers/KS/shared/upgradeCheck';
import type { CharacterCard, GameState } from '@/lib/engine/types';

const RACINE = process.cwd();
const MAIN = readFileSync(join(RACINE, 'components/game/PlayerHand.tsx'), 'utf8');

const BASE = 'KS-009-C';

function carte(id: string): CharacterCard {
  return getCardById(id) as CharacterCard;
}

function plateau(chakra: number): GameState {
  const state = buildSimState({
    p1: [simChar(BASE, { owner: 'player1', instanceId: 'a1' })],
    p2: [
      simChar('KS-108-R', { owner: 'player2', instanceId: 'e1', hidden: true }),
      simChar('KS-128-R', { owner: 'player2', instanceId: 'e2' }),
    ],
    missions: 3,
    chakra1: chakra,
  });
  state.activePlayer = 'player1';
  state.phase = 'action';
  return state;
}

function vueClient(state: GameState) {
  return GameEngine.getVisibleState(state, 'player1') as never;
}

describe("la main ne peut pas faire planter le plateau avec l etat client", () => {
  beforeAll(() => { initializeRegistry(); });

  it("l etat envoye au client n a pas de cles player1 et player2", () => {
    const vue = vueClient(plateau(2)) as unknown as Record<string, unknown>;
    expect(vue.player1, 'le client recoit myState, jamais player1').toBeUndefined();
    expect(vue.player2).toBeUndefined();
    expect(vue.myState, 'sa propre reserve est la').toBeTruthy();
  });

  it("un adversaire cache arrive sans carte ni pile, c est la forme reelle", () => {
    const vue = vueClient(plateau(2)) as unknown as {
      activeMissions: Array<{ player2Characters: Array<Record<string, unknown>> }>;
    };
    const cache = vue.activeMissions[0].player2Characters.find((c) => c.isHidden);
    expect(cache, 'il y a bien un cache adverse').toBeTruthy();
    expect(cache?.card, 'sa carte est masquee').toBeUndefined();
    expect(cache?.topCard, 'son haut de pile aussi').toBeUndefined();
    expect(cache?.stack, "et sa pile n est jamais transmise").toBeUndefined();
  });

  it("la pile n est transmise que pour un personnage reellement visible", () => {
    const etat = plateau(2);
    const cache = etat.activeMissions[0].player2Characters.find((c) => c.isHidden)!;
    cache.stack = [carte('KS-108-R'), carte('KS-133-S')];
    const mien = etat.activeMissions[0].player1Characters[0];
    mien.stack = [carte(BASE), carte('KS-010-C')];

    const vue = GameEngine.getVisibleState(etat, 'player1') as unknown as {
      activeMissions: Array<{
        player1Characters: Array<Record<string, unknown>>;
        player2Characters: Array<Record<string, unknown>>;
      }>;
    };
    const vuCache = vue.activeMissions[0].player2Characters.find((c) => c.isHidden);
    expect(vuCache?.stack, 'la pile d un cache adverse reste secrete').toBeUndefined();
    expect(vuCache?.stackSize, 'seule sa hauteur est publique').toBe(2);

    const vuMien = vue.activeMissions[0].player1Characters[0];
    expect(Array.isArray(vuMien.stack), 'ma propre pile arrive').toBe(true);
    expect((vuMien.stack as Array<{ id: string }>).map((k) => k.id)).toEqual([BASE, 'KS-010-C']);
  });

  it("une pile d une seule carte n alourdit pas l envoi", () => {
    const vue = GameEngine.getVisibleState(plateau(2), 'player1') as unknown as {
      activeMissions: Array<{ player1Characters: Array<Record<string, unknown>> }>;
    };
    const seul = vue.activeMissions[0].player1Characters[0];
    expect(seul.stackSize).toBe(1);
    expect(seul.stack, 'inutile de doubler la carte, card suffit').toBeUndefined();
    expect((seul.card as { id: string }).id, 'et card est bien le haut de pile').toBe(BASE);
  });

  it("la pile survit a l aller-retour socket, et voyage compressee", () => {
    const etat = plateau(2);
    etat.activeMissions[0].player1Characters[0].stack = [carte(BASE), carte('KS-010-C')];
    const vue = GameEngine.getVisibleState(etat, 'player1');

    const paquet = packVisibleState(vue) as unknown as {
      state: { activeMissions: Array<{ player1Characters: Array<{ stack?: unknown[] }> }> };
    };
    const empaquetee = paquet.state.activeMissions[0].player1Characters[0].stack;
    expect(Array.isArray(empaquetee), 'la pile est bien envoyee').toBe(true);
    expect(
      JSON.stringify(empaquetee).length,
      'elle voyage compressee, pas en cartes entieres',
    ).toBeLessThan(JSON.stringify([carte(BASE), carte('KS-010-C')]).length / 4);

    const rendue = unpackVisibleState(paquet as never) as unknown as {
      activeMissions: Array<{ player1Characters: Array<{ stack?: Array<{ id: string }> }> }>;
    };
    expect(
      rendue.activeMissions[0].player1Characters[0].stack?.map((k) => k.id),
      'et revient identique cote client',
    ).toEqual([BASE, 'KS-010-C']);
  });

  it("aucune carte du catalogue ne fait lever le calcul de la main", () => {
    const vue = vueClient(plateau(2));
    const erreurs: string[] = [];
    for (const c of getPlayableCharacters() as CharacterCard[]) {
      try { coutMinimalPourPoser(vue, 'player1', c); }
      catch (e) { erreurs.push(`cout ${c.id}: ${String(e)}`); }
      try { canAffordAsUpgrade(vue, 'player1', c, 0, 2); }
      catch (e) { erreurs.push(`amelioration ${c.id}: ${String(e)}`); }
    }
    expect(erreurs.slice(0, 3), 'une seule levee ici demonte tout le plateau').toEqual([]);
  });

  it("la reduction de cout arrive vraiment jusqu au client", () => {
    const etat = buildSimState({
      p1: [simChar('SS-051-UC', { owner: 'player1', instanceId: 'rasa' })],
      p2: [], missions: 2, chakra1: 5,
    });
    etat.activePlayer = 'player1';
    etat.phase = 'action';
    const sable = (getPlayableCharacters() as CharacterCard[]).find(
      (x) => x.group === 'Sand Village' && (x.chakra ?? 0) >= 2 && x.id !== 'SS-051-UC');
    expect(sable, 'il existe une carte Sand Village a reduire').toBeTruthy();
    const surServeur = coutMinimalPourPoser(etat as never, 'player1', sable!);
    const surClient = coutMinimalPourPoser(vueClient(etat), 'player1', sable!);
    expect(surClient, 'le client annonce le meme prix que le serveur').toBe(surServeur);
    expect(surClient, 'et ce prix est bien reduit').toBeLessThan(sable!.chakra ?? 0);
  });

  it("la branche amelioration marche cote client quand on lui donne le Chakra", () => {
    const base = carte(BASE);
    const meilleure = (getPlayableCharacters() as CharacterCard[])
      .filter((x) => x.name_fr === base.name_fr && (x.chakra ?? 0) > (base.chakra ?? 0))
      .sort((a, b) => (a.chakra ?? 0) - (b.chakra ?? 0))[0];
    expect(meilleure, 'il existe une amelioration plus chere du meme nom').toBeTruthy();

    const etat = plateau(9);
    expect(canAffordAsUpgrade(etat as never, 'player1', meilleure, 0), 'cote serveur, inchange').toBe(true);
    expect(
      canAffordAsUpgrade(vueClient(etat), 'player1', meilleure, 0, 9),
      'cote client avec le Chakra passe en parametre',
    ).toBe(true);
    expect(
      canAffordAsUpgrade(vueClient(etat), 'player1', meilleure, 0),
      'sans Chakra lisible, on repond non au lieu de lever',
    ).toBe(false);
  });

  it("un etat tronque ne fait rien exploser", () => {
    for (const etat of [
      {}, { activeMissions: null }, { activeMissions: [{}] }, { myState: {} },
    ] as never[]) {
      expect(() => canAffordAsUpgrade(etat, 'player1', carte('KS-108-R'), 0, 3)).not.toThrow();
      expect(() => coutMinimalPourPoser(etat, 'player1', carte('KS-108-R'))).not.toThrow();
    }
  });

  it("la main protege son calcul, un echec ne doit jamais demonter le plateau", () => {
    const bloc = MAIN.slice(MAIN.indexOf('const coutDePose'), MAIN.indexOf('const effectPopupMinimized'));
    expect(bloc, 'le calcul est protege').toContain('try {');
    expect(bloc.slice(bloc.indexOf('} catch')), 'et retombe sur le cout imprime').toContain('card.chakra');
    expect(bloc, 'le Chakra est passe explicitement, il n est pas lisible dans l etat client').toContain(', 0, chakra)');
  });
});
