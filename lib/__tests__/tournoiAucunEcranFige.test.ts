import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const RACINE = process.cwd();
const SERVEUR = readFileSync(join(RACINE, 'lib/socket/server.ts'), 'utf8');

// Un joueur peut avoir plusieurs sockets vivantes: deux onglets, ou une reconnexion dont
// l ancienne connexion n est pas encore tombee. Tout ce qui s adresse a un siege doit partir
// sur toutes ses sockets, sinon l onglet qu il regarde reste fige et il perd le match sans
// avoir rien pu faire. C est ce qui est arrive au tournoi du vendredi 28 aout.
describe('rien de ce qui s adresse a un siege ne part vers une seule socket', () => {
  it('l etat de jeu passe par l envoi a toutes les sockets du joueur', () => {
    expect(SERVEUR).toContain("envoyerAuSiege(io, room.hostSocket, room.hostId, 'game:state-update'");
    expect(SERVEUR).toContain("envoyerAuSiege(io, room.guestSocket, room.guestId, 'game:state-update'");
    expect(SERVEUR).not.toMatch(/io\.to\(room\.hostSocket\)\.emit\('game:state-update'/);
    expect(SERVEUR).not.toMatch(/io\.to\(room\.guestSocket\)\.emit\('game:state-update'/);
  });

  it('le depart de partie et le delai de mulligan aussi', () => {
    expect(SERVEUR).toContain("envoyerAuSiege(io, room.hostSocket, room.hostId, 'game:started'");
    expect(SERVEUR).toContain("envoyerAuSiege(io, room.guestSocket, room.guestId, 'game:started'");
    expect(SERVEUR).not.toMatch(/io\.to\(room\.hostSocket\)\.emit\('game:started'/);
    expect(SERVEUR).toContain("envoyerAuSiege(io, room.hostSocket, room.hostId, 'game:mulligan-deadline'");
    expect(SERVEUR).not.toMatch(/io\.to\(room\.hostSocket\)\.emit\('game:mulligan-deadline'/);
  });

  it('l envoi au siege sert bien toutes les sockets, sans doublon', () => {
    const debut = SERVEUR.indexOf('function envoyerAuSiege(');
    expect(debut, 'la fonction d envoi au siege existe').toBeGreaterThan(-1);
    const corps = SERVEUR.slice(debut, SERVEUR.indexOf('\n}', debut));
    expect(corps, 'la socket du siege est servie').toContain('io.to(socketDuSiege).emit');
    expect(corps, 'les autres sockets du joueur aussi').toContain('getUserSocketIds(userId)');
    expect(corps, 'sans envoyer deux fois a la meme').toContain('deja.has(autre)');
  });

  it('le tirage deja resolu est rejoue au joueur qui revient', () => {
    const debut = SERVEUR.indexOf("socket.on('coin-flip-done'");
    const handler = SERVEUR.slice(debut, SERVEUR.indexOf('});', debut) + 3);
    expect(handler).toContain('room.coinFlipResolved');
    expect(handler).toContain("socket.emit('coin-flip-sync')");
  });
});
