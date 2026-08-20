import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { annoncerRevelationPublique, apercuRevele } from '@/lib/effects/publicReveal';
import { getCardById } from '@/lib/data/cardIndex';
import type { CardData, CharacterCard, GameState } from '@/lib/engine/types';

void EffectEngine;

const GAARA_046 = 'SS-046-UC';
const SABLE = 'KS-074-C';
const FEUILLE_A = 'KS-011-C';
const FEUILLE_B = 'KS-032-C';

function plateauGaara(): GameState {
  const state = buildSimState({
    p2: [simChar(FEUILLE_A, { owner: 'player2', instanceId: 'temoin' })],
    missions: 2,
    chakra1: 40,
    edgeHolder: 'player1',
  });
  state.phase = 'action';
  state.activePlayer = 'player1';
  state.player1.hand = [getCardById(GAARA_046) as CharacterCard];
  state.player1.deck = [
    getCardById(FEUILLE_A) as CharacterCard,
    getCardById(FEUILLE_B) as CharacterCard,
    getCardById(SABLE) as CharacterCard,
  ];
  return state;
}

function joueEtConfirme(): GameState {
  let courant = GameEngine.applyAction(plateauGaara(), 'player1', {
    type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0,
  } as never);
  let garde = 0;
  while (courant.pendingActions.length > 0 && garde < 10) {
    const question = courant.pendingActions[0];
    courant = GameEngine.applyAction(courant, question.player, {
      type: 'SELECT_TARGET', pendingActionId: question.id, selectedTargets: [question.options[0]],
    } as never);
    garde += 1;
  }
  return courant;
}

describe('GAARA 046 revele publiquement ce qu il retourne', () => {
  it('les cartes retournees et la carte du Sable trouvee sont annoncees', () => {
    const apres = joueEtConfirme();
    const revelation = apres.publicReveal;

    expect(revelation, 'une revelation publique est produite').toBeTruthy();
    expect(revelation!.player, 'elle est attribuee au joueur qui a joue Gaara').toBe('player1');
    expect(revelation!.sourceCardId).toBe(GAARA_046);
    expect(
      revelation!.cards.map((c) => c.id),
      'les deux cartes retournees puis la carte du Sable piochee',
    ).toEqual([FEUILLE_A, FEUILLE_B, SABLE]);
    expect(
      revelation!.cards.filter((c) => c.isMatch).map((c) => c.id),
      'seule la carte trouvee est mise en avant',
    ).toEqual([SABLE]);
  });

  it('les deux joueurs recoivent la revelation, pas seulement celui qui la provoque', () => {
    const apres = joueEtConfirme();
    const vuJoueur1 = GameEngine.getVisibleState(apres, 'player1');
    const vuJoueur2 = GameEngine.getVisibleState(apres, 'player2');

    expect(vuJoueur1.publicReveal?.id).toBe(apres.publicReveal!.id);
    expect(
      vuJoueur2.publicReveal?.id,
      'l adversaire voit exactement la meme revelation',
    ).toBe(apres.publicReveal!.id);
    expect(vuJoueur2.publicReveal?.cards.map((c) => c.id)).toEqual([FEUILLE_A, FEUILLE_B, SABLE]);
  });

  it('la main et le deck de celui qui revele restent caches, seule la revelation est publique', () => {
    const apres = joueEtConfirme();
    const vuJoueur2 = GameEngine.getVisibleState(apres, 'player2');
    expect(vuJoueur2.opponentState.handSize).toBeGreaterThan(0);
    expect((vuJoueur2.opponentState as unknown as { hand?: unknown }).hand).toBeUndefined();
  });
});

describe('l annonce de revelation publique est un outil generique', () => {
  it('elle porte un identifiant neuf a chaque fois, pour que le client ne la rejoue pas', () => {
    const base = plateauGaara();
    const une = annoncerRevelationPublique(base, 'player1', GAARA_046, [apercuRevele(getCardById(SABLE) as CardData)]);
    const deux = annoncerRevelationPublique(une, 'player1', GAARA_046, [apercuRevele(getCardById(SABLE) as CardData)]);
    expect(une.publicReveal!.id).not.toBe(deux.publicReveal!.id);
  });

  it('elle ne touche a rien quand il n y a aucune carte a montrer', () => {
    const base = plateauGaara();
    expect(annoncerRevelationPublique(base, 'player1', GAARA_046, [])).toBe(base);
  });

  it('l apercu garde de quoi afficher la carte sans exposer le reste du deck', () => {
    const apercu = apercuRevele(getCardById(SABLE) as CardData, true);
    expect(apercu.id).toBe(SABLE);
    expect(apercu.isMatch).toBe(true);
    expect(apercu.image_file, 'le client a besoin de l illustration').toBeTruthy();
    expect(typeof apercu.chakra).toBe('number');
    expect(typeof apercu.power).toBe('number');
  });
});
