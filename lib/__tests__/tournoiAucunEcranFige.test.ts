import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const RACINE = process.cwd();
const SERVEUR = readFileSync(join(RACINE, 'lib/socket/server.ts'), 'utf8');

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

  it('recevoir l etat suffit a entrer en partie, meme sans avoir vu le depart', () => {
    const client = readFileSync(join(RACINE, 'lib/socket/client.ts'), 'utf8');
    expect(client, 'le depart de partie est une fonction reutilisable').toContain('const demarrerLaPartie = () =>');
    const debut = client.indexOf("'game:state-update',");
    expect(debut, 'le gestionnaire d etat existe').toBeGreaterThan(-1);
    const handler = client.slice(debut, client.indexOf("socket.on(", debut + 30));
    expect(handler, 'un etat recu sans evenement de depart lance quand meme la partie').toContain('demarrerLaPartie()');
    expect(handler).toContain('!get().gameStarted');
  });

  it('un joueur dont la partie tourne au serveur n est jamais renvoye a l accueil', () => {
    const page = readFileSync(join(RACINE, 'app/[locale]/game/page.tsx'), 'utf8');
    const debut = page.indexOf('redirectTimerRef.current = setTimeout(');
    expect(debut, 'la redirection de secours existe').toBeGreaterThan(-1);
    const bloc = page.slice(debut, page.indexOf('}, 5000)', debut));
    expect(bloc, 'la partie vivante au serveur retient le joueur sur le plateau').toContain('partieVivanteAuServeur');
    expect(bloc).toContain('!!ss.visibleState && !ss.gameEnded');
  });

  it('le tirage deja resolu est rejoue au joueur qui revient', () => {
    const debut = SERVEUR.indexOf("socket.on('coin-flip-done'");
    const handler = SERVEUR.slice(debut, SERVEUR.indexOf('});', debut) + 3);
    expect(handler).toContain('room.coinFlipResolved');
    expect(handler).toContain("socket.emit('coin-flip-sync')");
  });
});
