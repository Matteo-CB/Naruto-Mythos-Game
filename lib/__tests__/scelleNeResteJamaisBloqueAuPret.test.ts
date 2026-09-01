import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const RACINE = process.cwd();
const LOCALES = ['en', 'fr', 'es', 'pt', 'it', 'pl', 'ja'];
const SERVEUR = readFileSync(join(RACINE, 'lib/socket/server.ts'), 'utf8');
const CLIENT = readFileSync(join(RACINE, 'lib/socket/client.ts'), 'utf8');
const PAGE = readFileSync(join(RACINE, 'app/[locale]/play/sealed/page.tsx'), 'utf8');

function bloc(source: string, debut: string, fin: string): string {
  const i = source.indexOf(debut);
  expect(i, `${debut} existe`).toBeGreaterThan(0);
  const j = source.indexOf(fin, i);
  return source.slice(i, j > i ? j : i + 4000);
}

describe('une partie scellee ne reste jamais bloquee alors que les deux joueurs sont prets', () => {
  it('une coupure pendant la construction ne detruit plus le siege', () => {
    const branche = bloc(SERVEUR, "} else if (room.isSealed && room.guestId && !room.gameState) {", '} else if (isHost) {');
    expect(branche, "effacer guestId coupait la reconnexion pour toujours").not.toContain('room.guestId = null');
    expect(branche, 'le deck deja soumis ne doit pas etre jete').not.toContain('room.guestDeck = null');
    expect(branche, 'supprimer la salle empechait tout rattrapage').not.toContain('rooms.delete(code)');
    expect(branche, 'seul le socket est relache').toContain("room.guestSocket = null");
    expect(branche, 'seul le socket est relache').toContain("room.hostSocket = ''");
  });

  it('le scelle suit desormais le meme patron que le tournoi avant partie', () => {
    const tournoi = bloc(SERVEUR, 'if (room.tournamentId && !room.gameState) {', 'if (room.gameState && room.gameState.phase === ');
    for (const marqueur of ["room.hostSocket = ''", 'room.guestSocket = null', 'playerRooms.delete(socket.id)']) {
      expect(tournoi, `le patron tournoi contient ${marqueur}`).toContain(marqueur);
    }
  });

  it('la reconnexion sait toujours demarrer la partie quand les deux decks sont la', () => {
    expect(SERVEUR).toContain('} else if (room.hostDeck && room.guestDeck && !room.gameState) {');
  });

  it('un deck ne peut plus etre perdu en silence', () => {
    const handler = bloc(SERVEUR, "socket.on('room:select-deck'", "socket.on('game:request-state'");
    expect(handler, 'le siege se retrouve par identite quand le socket a change')
      .toContain('placeAvantPartiePourIdentite(socket, io)');
    expect(handler, 'plus de retour muet quand la salle manque').toContain("errorKey: 'room.error.roomGone'");
    expect(handler, 'plus de retour muet quand le siege manque').toContain("errorKey: 'room.error.seatGone'");
    expect(handler, "l affectation ne depend plus d une egalite de socket.id")
      .not.toContain('if (socket.id === room.hostSocket) {\n        room.hostDeck = safeDeck;');
  });

  it('la recherche par identite ne prend jamais une salle deja en partie', () => {
    const aide = bloc(SERVEUR, 'function placeAvantPartiePourIdentite', 'function seatIsBound');
    expect(aide, 'une partie en cours ne doit pas etre volee').toContain('if (room.gameState) continue;');
    expect(aide).toContain('markSeatPresent(room, seat, socket.id, io)');
  });

  it('l invite recoit lui aussi l accuse de reception de son deck', () => {
    const accuse = bloc(CLIENT, "socket.on('room:deck-accepted'", "socket.on('sealed:boosters'");
    expect(accuse, 'le drapeau scelle privait le joueur 2 de tout signal').not.toContain('isSealedRoom');
    expect(accuse).toContain('sealedDeckSubmitted: true');
  });

  it("l ecran d attente affiche l erreur, confirme l envoi et offre une sortie", () => {
    const attente = bloc(PAGE, "if (step === 'starting') {", 'if (!sealedOuvertPour(');
    expect(attente, 'le joueur voit que son deck est parti').toContain('sealedDeckSubmitted');
    expect(attente, "l erreur n etait jamais rendue a cette etape").toContain('messageDErreur');
    expect(attente, 'le joueur peut renvoyer son deck').toContain('renvoyerLeDeck');
    expect(attente, 'le joueur peut repartir').toContain("router.push('/play/online')");
  });

  it('le deck envoye est conserve pour pouvoir etre renvoye', () => {
    expect(PAGE).toContain('dernierDeckEnvoye.current = { characters, missions }');
    expect(PAGE).toContain('const deck = dernierDeckEnvoye.current;');
  });

  it('les messages existent dans les sept langues', () => {
    for (const code of LOCALES) {
      const m = JSON.parse(readFileSync(join(RACINE, `messages/${code}.json`), 'utf8'));
      expect(m.room?.error?.roomGone, `${code}: salle disparue`).toBeTruthy();
      expect(m.room?.error?.seatGone, `${code}: siege disparu`).toBeTruthy();
      expect(m.sealed?.deckSent, `${code}: deck bien parti`).toBeTruthy();
      expect(m.common?.retry, `${code}: reessayer`).toBeTruthy();
      expect(m.common?.back, `${code}: retour`).toBeTruthy();
      expect(m.common?.errorOccurred, `${code}: erreur generique`).toBeTruthy();
    }
  });
});
