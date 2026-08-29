import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  getSealedSetIds,
  getLatestSealedSetId,
  isSetSealedReady,
  SET_REGISTRY,
} from '@/lib/data/sets/registry';
import { generateSealedPool } from '@/lib/sealed/boosterGenerator';
import {
  poolDePrixDeTournoi,
  tirerUnPrixDeTournoi,
  estUnPrixDeTournoiValide,
  sortDUnBooster,
} from '@/lib/tournament/prizePool';
import { SETS_RECOMPENSES, WINNER_BOOSTER_COUNT, PARTICIPANT_BOOSTER_COUNT } from '@/lib/tournament/prizes';
import { pickDailyPrizeCardId } from '@/lib/tournament/dailyTournament';
import { getCardById } from '@/lib/data/cardIndex';
import { getAllCards } from '@/lib/data/cardLoader';
import { isLockedVariantCard } from '@/lib/variants/isVariant';
import { seasonCardIds, SEASON_SET_ID, SEASON_COMPANION_SET_ID } from '@/lib/battlepass/season';

const RACINE = process.cwd();

describe('le scelle du set 2 est ouvert partout', () => {
  it('le set 2 est declare pret pour le scelle', () => {
    expect(isSetSealedReady('SS')).toBe(true);
    expect(SET_REGISTRY.SS.sealedReady).toBe(true);
    expect(getSealedSetIds()).toContain('SS');
  });

  it('c est lui que le jeu propose par defaut', () => {
    expect(getLatestSealedSetId()).toBe('SS');
    const enLigne = readFileSync(join(RACINE, 'app/[locale]/play/online/page.tsx'), 'utf8');
    expect(enLigne, 'plus de set ecrit en dur').toContain('getLatestSealedSetId()');
    expect(enLigne).not.toContain("SEALED_DEFAULT_SET_CHOICE = 'KS'");
    const formulaire = readFileSync(join(RACINE, 'components/tournament/CreateTournamentForm.tsx'), 'utf8');
    expect(formulaire, 'un tournoi scelle part sur le set courant').toContain('getLatestSealedSetId()');
  });

  it('une reserve du set 2 se genere vraiment', () => {
    const pool = generateSealedPool(5, 'SS');
    expect(pool.boosters).toHaveLength(5);
    expect(pool.allCards).toHaveLength(50);
    for (const booster of pool.boosters) {
      expect(booster.setId, 'chaque booster annonce son set').toBe('SS');
      for (const carte of booster.cards) {
        expect(carte.cardId.startsWith('SS-'), `${carte.cardId} doit venir du set 2`).toBe(true);
      }
    }
  });

  it('les deux sets restent generables cote a cote', () => {
    for (const set of ['KS', 'SS']) {
      const pool = generateSealedPool(4, set);
      expect(pool.boosters, set).toHaveLength(4);
      expect(pool.allCards.length, set).toBe(40);
      for (const booster of pool.boosters) expect(booster.setId, set).toBe(set);
    }
  });
});

describe('le prix de tournoi se tire dans le set 2, hors booster et hors palier', () => {
  const pool = poolDePrixDeTournoi();

  it('le pool n est pas vide et ne contient que des variantes du set 2', () => {
    expect(pool.length).toBeGreaterThan(0);
    for (const id of pool) {
      const carte = getCardById(id);
      expect(carte, id).toBeTruthy();
      expect(carte!.set, `${id} doit venir du set 2`).toBe(SEASON_SET_ID);
      expect(isLockedVariantCard(carte!), `${id} doit etre une variante`).toBe(true);
    }
  });

  it('aucune carte du pool ne peut sortir d un booster', () => {
    for (const id of pool) {
      const carte = getCardById(id)!;
      expect(sortDUnBooster(id, String(carte.rarity)), `${id} sort d un booster`).toBe(false);
    }
  });

  it('aucune carte du pool n est deja une recompense de palier', () => {
    const paliers = new Set(seasonCardIds());
    for (const id of pool) {
      expect(paliers.has(id), `${id} est deja donne par le battlepass`).toBe(false);
    }
  });

  it('toute variante du set 2 est soit en booster, soit en palier, soit dans le pool', () => {
    const paliers = new Set(seasonCardIds());
    const dansLePool = new Set(pool);
    for (const carte of getAllCards()) {
      if (carte.set !== SEASON_SET_ID || !isLockedVariantCard(carte)) continue;
      const enBooster = sortDUnBooster(carte.id, String(carte.rarity));
      const couverte = enBooster || paliers.has(carte.id) || dansLePool.has(carte.id);
      expect(couverte, `${carte.id} n est obtenable nulle part`).toBe(true);
    }
  });

  it('une carte de booster et une carte de palier sont refusees comme prix', () => {
    const enBooster = getAllCards().find((c) => c.set === SEASON_SET_ID && isLockedVariantCard(c) && sortDUnBooster(c.id, String(c.rarity)));
    expect(enBooster, 'le set 2 a bien des variantes en booster').toBeTruthy();
    expect(estUnPrixDeTournoiValide(enBooster!.id)).toBe(false);
    const palier = seasonCardIds()[0];
    if (palier) expect(estUnPrixDeTournoiValide(palier)).toBe(false);
  });

  it('le tirage reste dans le pool, aux deux extremes du hasard', () => {
    for (const hasard of [0, 0.25, 0.5, 0.75, 0.999999]) {
      const tire = tirerUnPrixDeTournoi(() => hasard);
      expect(pool, `hasard ${hasard}`).toContain(tire);
    }
  });

  it('le tournoi quotidien tire dans le meme pool', () => {
    for (const hasard of [0, 0.4, 0.99]) {
      expect(pool).toContain(pickDailyPrizeCardId(() => hasard));
    }
  });
});

describe('les boosters de recompense couvrent les deux sets', () => {
  it('le set de la saison et son set compagnon sont tous deux servis', () => {
    expect(SETS_RECOMPENSES).toContain(SEASON_SET_ID);
    expect(SETS_RECOMPENSES).toContain(SEASON_COMPANION_SET_ID);
    expect(new Set(SETS_RECOMPENSES).size, 'jamais deux fois le meme set').toBe(SETS_RECOMPENSES.length);
  });

  it('le gagnant et le participant recoivent de chaque set', () => {
    const source = readFileSync(join(RACINE, 'lib/tournament/prizes.ts'), 'utf8');
    expect(source).toContain('offrirLesBoosters(userId, WINNER_BOOSTER_COUNT)');
    expect(source).toContain('offrirLesBoosters(userId, PARTICIPANT_BOOSTER_COUNT)');
    expect(source, 'plus un seul set servi en dur').not.toContain('grantBoosters(userId, BATTLEPASS_SEASON_SET_ID, WINNER_BOOSTER_COUNT)');
    expect(WINNER_BOOSTER_COUNT).toBeGreaterThan(PARTICIPANT_BOOSTER_COUNT);
  });

  it('un tournoi sans carte configuree en tire une quand meme', () => {
    const source = readFileSync(join(RACINE, 'lib/tournament/prizes.ts'), 'utf8');
    expect(source).toContain('tirerUnPrixDeTournoi()');
  });
});
