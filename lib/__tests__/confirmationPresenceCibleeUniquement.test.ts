import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const RACINE = join(__dirname, '..', '..');
const HANDLERS = readFileSync(join(RACINE, 'lib', 'socket', 'tournamentHandlers.ts'), 'utf8');
const GATE = readFileSync(join(RACINE, 'components', 'tournament', 'MatchEntryGate.tsx'), 'utf8');

describe('la demande de confirmation de presence ne part qu aux deux joueurs du match', () => {
  it('aucune diffusion de please-confirm-ready a la salle du tournoi', () => {
    const lignes = HANDLERS.split('\n')
      .map((l, i) => ({ n: i + 1, l }))
      .filter(({ l }) => l.includes('please-confirm-ready') && l.includes('io.to('));

    expect(
      lignes.map(({ n, l }) => `${n}: ${l.trim()}`),
      "diffuser cette demande a tout le tournoi fait repondre chaque joueur pour le match d un autre, "
      + "ce qui ecrase sa propre confirmation et le fait declarer absent",
    ).toEqual([]);
  });

  it('chaque envoi passe par emitToUser', () => {
    const envois = HANDLERS.split('\n').filter((l) => l.includes("'tournament:please-confirm-ready'"));
    expect(envois.length, 'le mecanisme existe toujours').toBeGreaterThan(0);
    for (const ligne of envois) {
      expect(ligne, `envoi non cible: ${ligne.trim()}`).toContain('emitToUser');
    }
  });

  it('la fenetre du joueur ne remplace pas une confirmation en attente par celle d un autre match', () => {
    expect(
      GATE,
      'la fenetre doit garder la confirmation en cours si elle porte sur un autre match',
    ).toContain('current.matchId === d.matchId');
  });
});

describe('un joueur connecte n est jamais disqualifie pour absence', () => {
  it('le plafond de relances laisse le match ouvert au lieu de trancher', () => {
    const debut = HANDLERS.indexOf('if (stalls >= NO_CONTEST_HARD_CAP)');
    expect(debut, 'le plafond existe toujours').toBeGreaterThan(-1);
    const bloc = HANDLERS.slice(debut, debut + 1200);

    expect(bloc, 'aucun forfait ne part de cette branche: les joueurs y sont connectes').not.toContain('handleMatchForfeit');
    expect(bloc, 'le match est rouvert pour que les joueurs reessaient').toContain('reopenTournamentMatch');
  });

  it('le premier controle d absence laisse cinq minutes', async () => {
    const { ABSENCE_TIMEOUT_MS } = await import('@/lib/tournament/absenceManager');
    expect(ABSENCE_TIMEOUT_MS, 'deux minutes etaient trop courtes pour rejoindre un match').toBe(5 * 60 * 1000);
  });
});

describe('les annonces du tournoi Chunin partent dans le salon reserve', () => {
  const TIERS = readFileSync(join(RACINE, 'lib', 'tournament', 'nwlTiers.ts'), 'utf8');
  const PARTNER = readFileSync(join(RACINE, 'lib', 'tournament', 'nwlPartner.ts'), 'utf8');

  it('le salon Chunin est declare', () => {
    expect(PARTNER).toContain("NWL_CHUNIN_ANNOUNCE_CHANNEL_ID = '1540492429017481296'");
  });

  it('le code d acces Chunin ne part plus dans le salon general', () => {
    const at = TIERS.indexOf('NWL_CHUNIN_TOURNAMENT_NAME, code, NWL_CHUNIN_START_HOUR)}`,');
    expect(at, 'le message de code Chunin existe').toBeGreaterThan(-1);
    const bloc = TIERS.slice(Math.max(0, at - 300), at);
    expect(bloc, 'il vise le salon reserve aux Chunin').toContain('NWL_CHUNIN_ANNOUNCE_CHANNEL_ID');
  });

  it('la victoire et le rappel suivent le palier', () => {
    expect(TIERS).toContain('function salonDuPalier(');
    expect(TIERS).toContain('salonDuPalier(tournoi.partner)');
    expect(TIERS).toContain('salonDuPalier(t.partner)');
  });

  it('le Genin et le Kage restent dans le salon general', () => {
    const at = TIERS.indexOf('function salonDuPalier(');
    const corps = TIERS.slice(at, at + 240);
    expect(corps, 'seul le Chunin est detourne').toContain('NWL_CHUNIN_PARTNER_KEY');
    expect(corps).toContain('NWL_ANNOUNCE_CHANNEL_ID');
  });
});
