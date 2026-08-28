import { describe, it, expect } from 'vitest';
import { getAllCards } from '@/lib/data/cardLoader';
import { questsOfSeason, SAISON_COURANTE } from '@/lib/quests/questData';

interface CarteBrute {
  id: string;
  card_type?: string;
  group?: string | null;
  keywords?: string[];
  effects?: Array<{ type?: string }>;
}

const cartes = getAllCards() as unknown as CarteBrute[];
const duSet = cartes.filter((c) => c.id.startsWith('SS-'));

function numero(id: string): number | null {
  const m = /^SS-(\d+)/.exec(id);
  return m ? Number(m[1]) : null;
}

function numerosPortant(type: string, cardType: string): Set<number> {
  const vus = new Set<number>();
  for (const c of duSet) {
    if (c.card_type !== cardType) continue;
    if (!(c.effects ?? []).some((e) => e.type === type)) continue;
    const n = numero(c.id);
    if (n !== null) vus.add(n);
  }
  return vus;
}

const DUELS = numerosPortant('DUEL', 'character');
const PREMIERES_FRAPPES = new Set([
  ...numerosPortant('FIRST_STRIKE', 'character'),
  ...numerosPortant('FIRST_STRIKE', 'attachment'),
]);
const EQUIPEMENTS = new Set(duSet.filter((c) => c.card_type === 'attachment').map((c) => numero(c.id)!).filter((n) => n !== null));
const MISSIONS = new Set(duSet.filter((c) => c.card_type === 'mission').map((c) => numero(c.id)!).filter((n) => n !== null));

const quetes = questsOfSeason(SAISON_COURANTE);

function filtre(id: string): Record<string, unknown> {
  return quetes.find((q) => q.id === id)?.predicate ?? {};
}

describe('chaque quete de Shinobi Shiren vise une carte qui existe vraiment', () => {
  it('chaque DUEL cite une carte qui en porte un', () => {
    for (const q of quetes) {
      if (q.hook !== 'duel.triggered.with.source') continue;
      const n = q.predicate?.sourceNumber;
      if (typeof n !== 'number') continue;
      expect(DUELS.has(n), `${q.id} vise la carte ${n}, qui ne porte pas de DUEL`).toBe(true);
    }
  });

  it('chaque FIRST STRIKE cite une carte qui en porte une', () => {
    for (const q of quetes) {
      if (q.hook !== 'first_strike.used.with.source') continue;
      const n = q.predicate?.sourceNumber;
      if (typeof n !== 'number') continue;
      expect(PREMIERES_FRAPPES.has(n), `${q.id} vise la carte ${n}, sans FIRST STRIKE`).toBe(true);
    }
  });

  it('chaque equipement cite est bien un equipement du set', () => {
    for (const q of quetes) {
      const n = q.predicate?.sourceNumber;
      if (typeof n !== 'number') continue;
      if (!q.hook.includes('attachment') && q.hook !== 'tokens.removed.by.card') continue;
      expect(EQUIPEMENTS.has(n), `${q.id} vise la carte ${n}, qui n est pas un equipement`).toBe(true);
    }
    for (const q of quetes) {
      const n = q.predicate?.attachmentNumber;
      if (typeof n !== 'number') continue;
      expect(EQUIPEMENTS.has(n), `${q.id} cite l equipement ${n}, absent du set`).toBe(true);
    }
  });

  it('chaque mission citee existe', () => {
    for (const q of quetes) {
      const n = q.predicate?.missionNumber;
      if (typeof n !== 'number') continue;
      expect(MISSIONS.has(n), `${q.id} cite la mission ${n}, absente du set`).toBe(true);
    }
  });

  it('chaque mot cle et chaque groupe cite existe dans le set', () => {
    const motsCles = new Set(duSet.flatMap((c) => c.keywords ?? []));
    const groupes = new Set(duSet.map((c) => c.group).filter((g): g is string => !!g));
    for (const q of quetes) {
      const kw = q.predicate?.keyword;
      if (typeof kw === 'string') {
        expect(motsCles.has(kw), `${q.id} cite le mot cle ${kw}, absent du set`).toBe(true);
      }
      const gr = q.predicate?.group;
      if (typeof gr === 'string') {
        expect(groupes.has(gr), `${q.id} cite le groupe ${gr}, absent du set`).toBe(true);
      }
    }
  });

  it('une quete qui demande toutes les cartes vise le compte reel', () => {
    const toutes: Array<[string, number]> = [
      ['ss-duel-tous', DUELS.size],
      ['ss-fs-toutes', PREMIERES_FRAPPES.size],
      ['ss-equip-tous', EQUIPEMENTS.size],
      ['ss-mission-toutes', MISSIONS.size],
    ];
    for (const [id, compte] of toutes) {
      const q = quetes.find((x) => x.id === id);
      expect(q, id).toBeDefined();
      expect(q!.target, `${id} demande ${q!.target} alors que le set en porte ${compte}`).toBe(compte);
      expect(q!.predicate?.distinct, `${id} doit compter des sources differentes`).toBe(true);
    }
  });

  it('les paires citees existent toutes les deux', () => {
    for (const q of quetes) {
      const paire = q.predicate?.pairNumbers;
      if (!Array.isArray(paire)) continue;
      for (const n of paire) {
        const existe = EQUIPEMENTS.has(Number(n)) || DUELS.has(Number(n)) || MISSIONS.has(Number(n));
        expect(existe, `${q.id} cite le numero ${n}, introuvable dans le set`).toBe(true);
      }
    }
  });

  it('les quetes classees disent chacune une chose differente', () => {
    const classees = quetes.filter((q) => q.hook === 'ranked.win.deck.contains');
    const signatures = classees.map((q) => JSON.stringify(q.predicate ?? {}));
    const doublons = signatures.filter((s, i) => signatures.indexOf(s) !== i && !s.includes('monoGroup'));
    expect(doublons, 'deux quetes classees partagent le meme filtre sans le dire').toEqual([]);
  });

  it('la quete sur les deux camps de la Vallee de la Fin cite Naruto 147 et Sasuke 148', () => {
    expect(filtre('ss-legende-8').deckNumbers).toEqual([147, 148]);
  });

  it('aucune quete ne reste sans filtre alors que son texte en exige un', () => {
    for (const q of quetes) {
      if (/\b(with|avec|thanks to|grâce)\b/i.test(q.text_en) && q.target > 0) {
        expect(q.predicate, `${q.id} devrait porter un filtre`).toBeDefined();
      }
    }
  });
});
