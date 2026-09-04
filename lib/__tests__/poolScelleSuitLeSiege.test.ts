import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const RACINE = process.cwd();
const SERVEUR = readFileSync(join(RACINE, 'lib/socket/server.ts'), 'utf8');

function gestionnaireSelectDeck(): string {
  const debut = SERVEUR.indexOf("socket.on('room:select-deck'");
  expect(debut, 'le gestionnaire existe').toBeGreaterThan(0);
  const fin = SERVEUR.indexOf("socket.on('", debut + 40);
  return SERVEUR.slice(debut, fin > debut ? fin : debut + 12000);
}

describe('la soumission du deck lit toujours le siege, jamais l identifiant de socket', () => {
  it('le siege est resolu par le registre, avec repli sur l identite', () => {
    const bloc = gestionnaireSelectDeck();
    expect(bloc, 'la resolution passe par le registre des sockets')
      .toContain('resolveRoomSeatForSocket(socket, io) ?? placeAvantPartiePourIdentite(socket, io)');
    expect(bloc, 'et le siege en decoule').toContain('const siegeDuJoueur: Seat | null = place?.seat');
  });

  it('le pool scelle est choisi par le siege, pas par une egalite de socket', () => {
    const bloc = gestionnaireSelectDeck();
    const scelle = bloc.slice(bloc.indexOf('if (room.isSealed) {'));
    expect(scelle, 'le pool suit le siege')
      .toContain("const poolIds = siegeDuJoueur === 'player1' ? room.hostSealedPoolIds : room.guestSealedPoolIds");
    expect(
      scelle.slice(0, scelle.indexOf('const poolIds')),
      "un siege introuvable est refuse au lieu d etre pris pour l invite",
    ).toContain('room.error.seatGone');
    expect(
      scelle,
      'apres une reconnexion l identifiant de socket a change, le comparer designe le mauvais joueur',
    ).not.toContain('const isHost = socket.id === room.hostSocket');
  });

  it('les autres decisions du gestionnaire suivent le meme siege', () => {
    const bloc = gestionnaireSelectDeck();
    expect(bloc, 'le controle des holos').toContain("const holoOwnerId = siegeDuJoueur === 'player1'");
    expect(bloc, 'le controle des variantes').toContain("const ownerId = siegeDuJoueur === 'player1'");
    expect(bloc, 'et la notification de l adversaire').toContain("const otherSocket = siegeDuJoueur === 'player1' ? room.guestSocket : room.hostSocket");
  });

  it('il ne reste aucune comparaison brute hors du repli de resolution', () => {
    const bloc = gestionnaireSelectDeck();
    const restantes = bloc.split(String.fromCharCode(10))
      .map((l, i) => ({ l: l.trim(), i }))
      .filter((x) => x.l.includes('socket.id === room.hostSocket') || x.l.includes('socket.id === room.guestSocket'))
      .filter((x) => !x.l.startsWith('?? (socket.id === room.hostSocket'));
    expect(
      restantes.map((x) => x.l),
      'la seule comparaison admise est le repli interne de siegeDuJoueur',
    ).toEqual([]);
  });

  it('le message d erreur du pool existe dans les sept langues', () => {
    for (const code of ['en', 'fr', 'es', 'pt', 'it', 'pl', 'ja']) {
      const m = JSON.parse(readFileSync(join(RACINE, `messages/${code}.json`), 'utf8'));
      expect(m.game?.error?.invalidDeck, `${code}: deck invalide`).toBeTruthy();
      expect(m.room?.error?.seatGone, `${code}: siege introuvable`).toBeTruthy();
    }
  });
});
