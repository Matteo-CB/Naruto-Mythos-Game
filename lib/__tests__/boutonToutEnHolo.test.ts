import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { useDeckBuilderStore } from '@/stores/deckBuilderStore';
import { getCardById } from '@/lib/data/cardIndex';
import { holoIdFor } from '@/lib/holo/holoId';
import type { CharacterCard } from '@/lib/engine/types';

const RACINE = process.cwd();
const LOCALES = ['en', 'fr', 'es', 'pt', 'it', 'pl', 'ja'];
const COMMUNE = 'KS-009-C';
const AUTRE_COMMUNE = 'KS-005-C';
const RARE = 'KS-108-R';

function carte(id: string): CharacterCard {
  return getCardById(id) as CharacterCard;
}

function poserLeDeck(ids: string[], debloques: string[]): void {
  const store = useDeckBuilderStore.getState();
  store.clearDeck();
  useDeckBuilderStore.setState({
    deckChars: ids.map((id) => ({ ...carte(id) })),
    unlockedVariantIds: new Set(debloques),
  });
}

describe('un seul bouton passe tout le deck en holo', () => {
  beforeEach(() => {
    useDeckBuilderStore.getState().clearDeck();
    useDeckBuilderStore.setState({ unlockedVariantIds: new Set() });
  });

  it('sans aucun holo debloque, il n y a rien a proposer', () => {
    poserLeDeck([COMMUNE, AUTRE_COMMUNE], []);
    expect(useDeckBuilderStore.getState().holosDisponiblesDansLeDeck()).toEqual({ total: 0, poses: 0 });
    expect(useDeckBuilderStore.getState().basculerTousLesHolos()).toBe(0);
  });

  it('il ne compte que les cartes dont le holo est reellement possede', () => {
    poserLeDeck([COMMUNE, AUTRE_COMMUNE], [holoIdFor(COMMUNE)]);
    expect(useDeckBuilderStore.getState().holosDisponiblesDansLeDeck()).toEqual({ total: 1, poses: 0 });
  });

  it('un clic passe toutes les cartes eligibles en holo', () => {
    poserLeDeck([COMMUNE, COMMUNE, AUTRE_COMMUNE], [holoIdFor(COMMUNE), holoIdFor(AUTRE_COMMUNE)]);
    const changees = useDeckBuilderStore.getState().basculerTousLesHolos();
    expect(changees, 'les trois cartes basculent').toBe(3);
    expect(useDeckBuilderStore.getState().deckChars.every((c) => c.isHolo)).toBe(true);
    expect(useDeckBuilderStore.getState().isDirty).toBe(true);
  });

  it('un second clic les repasse toutes en normal', () => {
    poserLeDeck([COMMUNE, AUTRE_COMMUNE], [holoIdFor(COMMUNE), holoIdFor(AUTRE_COMMUNE)]);
    useDeckBuilderStore.getState().basculerTousLesHolos();
    const retirees = useDeckBuilderStore.getState().basculerTousLesHolos();
    expect(retirees).toBe(2);
    expect(useDeckBuilderStore.getState().deckChars.some((c) => c.isHolo)).toBe(false);
  });

  it('un deck a moitie holo se complete au lieu de se vider', () => {
    poserLeDeck([COMMUNE, AUTRE_COMMUNE], [holoIdFor(COMMUNE), holoIdFor(AUTRE_COMMUNE)]);
    useDeckBuilderStore.getState().toggleCharHolo(0);
    expect(useDeckBuilderStore.getState().holosDisponiblesDansLeDeck()).toEqual({ total: 2, poses: 1 });
    const changees = useDeckBuilderStore.getState().basculerTousLesHolos();
    expect(changees, 'seule la carte restante bouge').toBe(1);
    expect(useDeckBuilderStore.getState().deckChars.every((c) => c.isHolo)).toBe(true);
  });

  it('une carte non eligible au holo n est jamais touchee', () => {
    poserLeDeck([COMMUNE, RARE], [holoIdFor(COMMUNE), holoIdFor(RARE)]);
    useDeckBuilderStore.getState().basculerTousLesHolos();
    const deck = useDeckBuilderStore.getState().deckChars;
    expect(deck.find((c) => c.id === COMMUNE)?.isHolo).toBe(true);
    expect(deck.find((c) => c.id === RARE)?.isHolo, 'les rares n ont pas de version holo').toBeFalsy();
  });

  it('le bouton n apparait que s il y a quelque chose a basculer', () => {
    const page = readFileSync(join(RACINE, 'app/[locale]/deck-builder/page.tsx'), 'utf8');
    expect(page).toContain('holoDuDeck.total > 0 &&');
    expect(page).toContain('basculerTousLesHolos()');
    expect(page, 'le libelle suit l etat du deck').toContain('holoTousPoses');
  });

  it('les libelles existent dans les sept langues', () => {
    for (const code of LOCALES) {
      const m = JSON.parse(readFileSync(join(RACINE, `messages/${code}.json`), 'utf8'));
      for (const cle of ['holoApplyAll', 'holoRemoveAll', 'holoAllApplied', 'holoAllRemoved']) {
        expect(m.deckBuilder?.[cle], `${code}: ${cle}`).toBeTruthy();
      }
      expect(m.deckBuilder.holoApplyAll, `${code}: le bouton annonce le nombre`).toContain('{count}');
    }
  });
});
