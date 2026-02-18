# Naruto Mythos TCG - Discord Server Setup Guide

Guide complet pour configurer le serveur Discord manuellement.
Tous les noms sont a copier-coller directement.

---

## ETAPE 1 : Creer le serveur

1. Discord > bouton "+" a gauche > "Creer un serveur" > "Pour moi et mes amis"
2. Nom du serveur : `Naruto Mythos TCG`
3. Supprime les salons par defaut (#general, #vocal-general)

---

## ETAPE 2 : Creer les roles

Parametres serveur > Roles > Creer un role

Cree les roles **dans cet ordre** (le premier cree sera le plus haut) :

### Staff

| Nom | Couleur hex | Afficher separement | Permissions speciales |
|-----|-------------|---------------------|----------------------|
| `Hokage` | `#C4A35A` | Oui | Administrateur |
| `Jonin` | `#5865F2` | Oui | Gerer les messages, Expulser, Bannir, Rendre muet, Deplacer les membres, Gerer les pseudos, Moderer les membres |
| `Developer` | `#6A6ABB` | Oui | Aucune permission speciale |
| `Testeur` | `#3EAAB3` | Oui | Aucune permission speciale |

### Rangs (attribues selon ELO en jeu)

| Nom | Couleur hex | Afficher separement | Description |
|-----|-------------|---------------------|-------------|
| `Kage` | `#FFD700` | Oui | ELO 2000+ |
| `Chunin` | `#B37E3E` | Oui | ELO 1200-1999 |
| `Genin` | `#3E8B3E` | Oui | ELO < 1200 |

### Villages (auto-assignable par les membres)

| Nom | Couleur hex | Afficher separement |
|-----|-------------|---------------------|
| `Leaf Village` | `#3E8B3E` | Non |
| `Sand Village` | `#D4B896` | Non |
| `Sound Village` | `#5A5A8A` | Non |
| `Akatsuki` | `#B33E3E` | Non |
| `Independent` | `#888888` | Non |

### Langue

| Nom | Couleur | Afficher separement |
|-----|---------|---------------------|
| `English` | Aucune | Non |
| `Francais` | Aucune | Non |

### Notifications (mentionnable = Oui)

| Nom | Couleur | Afficher separement |
|-----|---------|---------------------|
| `Updates` | Aucune | Non |
| `Tournaments` | Aucune | Non |
| `Events` | Aucune | Non |

---

## ETAPE 3 : Creer les categories et salons

### Categorie : `══  WELCOME  ══`

| Salon | Type | Topic (description) | Permissions speciales |
|-------|------|---------------------|----------------------|
| `rules` | Texte | `Server rules - Read before participating - Regles du serveur` | Lecture seule (desactiver "Envoyer des messages" pour @everyone) |
| `announcements` | Texte | `Official announcements & updates - Annonces officielles` | Lecture seule |
| `pick-your-roles` | Texte | `Choose your language, village, and notifications - Choisissez vos roles` | - |
| `introductions` | Texte | `Introduce yourself - Presentez-vous` | - |

### Categorie : `══  ENGLISH  ══`

| Salon | Topic |
|-------|-------|
| `general-en` | `General discussion about Naruto Mythos TCG` |
| `find-a-match` | `Looking for an opponent? Post here with your ELO` |
| `deck-sharing-en` | `Share your deck builds, get feedback, discuss meta` |
| `strategies-en` | `Advanced strategies, mission control, chakra management, combos` |
| `card-discussion-en` | `Discuss card effects, power levels, and synergies` |
| `help-en` | `Need help with rules or game mechanics? Ask here` |

### Categorie : `══  FRANCAIS  ══`

| Salon | Topic |
|-------|-------|
| `general-fr` | `Discussion generale sur Naruto Mythos TCG` |
| `chercher-un-match` | `Vous cherchez un adversaire ? Postez ici avec votre ELO` |
| `partage-de-decks` | `Partagez vos decks, demandez des conseils, discutez du meta` |
| `strategies-fr` | `Strategies avancees, controle de mission, gestion du chakra, combos` |
| `discussion-cartes` | `Discutez des effets des cartes, de leur puissance et synergies` |
| `aide-fr` | `Besoin d'aide avec les regles ou les mecaniques ? Demandez ici` |

### Categorie : `══  COMPETITIVE  ══`

| Salon | Topic | Permissions speciales |
|-------|-------|-----------------------|
| `leaderboard` | `ELO rankings and top players - Classement ELO` | Lecture seule |
| `tournaments` | `Tournament announcements and sign-ups` | Lecture seule |
| `tournament-chat` | `Live tournament discussion` | - |
| `match-results` | `Post your match results and screenshots` | - |
| `hall-of-fame` | `Notable plays, epic comebacks, legendary moments` | Lecture seule |

### Categorie : `══  DEVELOPMENT  ══`

| Salon | Topic | Permissions speciales |
|-------|-------|-----------------------|
| `changelog` | `Game updates, patches, and new features` | Lecture seule |
| `bug-reports` | `Report bugs with screenshots and steps to reproduce` | - |
| `suggestions` | `Feature requests and improvement ideas` | - |
| `beta-testing` | `Beta builds, test instructions, feedback` | Prive : visible uniquement par `Testeur`, `Developer`, `Hokage` |
| `dev-internal` | `Internal development discussion` | Prive : visible uniquement par `Developer`, `Hokage` |

### Categorie : `══  COMMUNITY  ══`

| Salon | Topic |
|-------|-------|
| `off-topic` | `Talk about anything - Parlez de tout et de rien` |
| `fan-art` | `Share your Naruto fan art - Partagez vos fan arts` |
| `memes` | `Naruto TCG memes and funny moments` |
| `media-clips` | `Game replays, screenshots, video content` |

### Categorie : `══  VOICE  ══`

| Salon | Type |
|-------|------|
| `Game Voice EN` | Vocal |
| `Game Voice FR` | Vocal |
| `Tournament Voice` | Vocal |
| `Chill Zone` | Vocal |

---

## ETAPE 4 : Configurer les salons en lecture seule

Pour chaque salon marque "Lecture seule" :
1. Clic sur la roue a cote du salon > Permissions
2. Dans le role `@everyone` : desactive "Envoyer des messages"
3. Ajoute le role `Hokage` : active "Envoyer des messages"
4. Ajoute le role `Developer` : active "Envoyer des messages"

---

## ETAPE 5 : Configurer les salons prives

### `beta-testing`
1. Roue > Permissions > le salon est prive (desactiver "Voir le salon" pour @everyone)
2. Ajouter les roles `Testeur`, `Developer`, `Hokage` avec "Voir le salon" et "Envoyer des messages" actives

### `dev-internal`
1. Meme chose, mais uniquement `Developer` et `Hokage`

---

## ETAPE 6 : Messages d'accueil

Copie-colle ces messages dans les salons correspondants.

### Dans `#rules` :

```
**NARUTO MYTHOS TCG**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Welcome to the official Naruto Mythos TCG community.
Bienvenue dans la communaute officielle du jeu Naruto Mythos TCG.

**EN | Rules**
1. Be respectful to all members
2. No spam, flooding, or excessive caps
3. No NSFW, hate speech, or harassment
4. Use the appropriate channels for each topic
5. No cheating, exploiting, or account sharing
6. No advertising or self-promotion without permission
7. Follow Discord ToS at all times
8. Staff decisions are final

**FR | Regles**
1. Soyez respectueux envers tous les membres
2. Pas de spam, flood ou majuscules excessives
3. Pas de contenu NSFW, discours haineux ou harcelement
4. Utilisez les salons appropries pour chaque sujet
5. Pas de triche, d'exploitation ou de partage de compte
6. Pas de publicite ou d'auto-promotion sans permission
7. Respectez les Conditions d'Utilisation de Discord
8. Les decisions du staff sont definitives

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Naruto Mythos TCG | naruto.daikicorp.fr
```

### Dans `#pick-your-roles` :

```
**CHOOSE YOUR ROLES / CHOISISSEZ VOS ROLES**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

React to pick your roles.
Reagissez pour choisir vos roles.

**Village Affiliation / Affiliation au Village**
🍃 Leaf Village
🏜️ Sand Village
🔊 Sound Village
☁️ Akatsuki
⚪ Independent

**Language / Langue**
🇬🇧 English
🇫🇷 Francais

**Notifications**
📢 Updates - Game patches and news
🏆 Tournaments - Tournament announcements
🎉 Events - Community events

**Rank Roles / Roles de Rang (automatiques)**
Kage | ELO 2000+
Chunin | ELO 1200-1999
Genin | ELO < 1200
(Assigned automatically based on your in-game ELO)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Ensuite, ajoute les reactions correspondantes sur ce message :
🍃 🏜️ 🔊 ☁️ ⚪ 🇬🇧 🇫🇷 📢 🏆 🎉

### Dans `#introductions` :

```
**WELCOME TO NARUTO MYTHOS TCG**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Naruto Mythos is a digital trading card game where you play as a Kage
sending ninja on missions to earn victory points.

**Game Features:**
| 4-turn strategic gameplay with 66 unique cards
| 5 factions: Leaf, Sand, Sound, Akatsuki, Independent
| 7 rarities: Common, Uncommon, Rare, Rare Art, Secret, Mythos, Legendary
| 4 effect types: MAIN, UPGRADE, AMBUSH, SCORE
| 4 AI difficulties: Easy, Medium, Hard, Expert
| Online matchmaking with ELO rankings
| Deck builder with 30+ card decks and 3 mission cards
| Full English and French support

**Play now:** naruto.daikicorp.fr

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Dans `#leaderboard` :

```
**ELO LEADERBOARD**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Rankings are updated from in-game data.

**ELO System:**
| Starting ELO: 1000
| K-Factor: 32 (below 2000) / 16 (2000+)
| Win: +ELO / Loss: -ELO / Draw: minimal change
| Minimum ELO floor: 100

**Ranks:**
| Genin  | Below 1200 ELO
| Chunin | 1200 - 1999 ELO
| Kage   | 2000+ ELO

Full leaderboard: naruto.daikicorp.fr/leaderboard

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Only rated online matches affect ELO.
```

### Dans `#changelog` :

```
**CHANGELOG**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Version 0.1.0 - Initial Release**

Features:
| 66 playable cards with full effect implementation
| 326 automated tests passing
| 4 AI difficulty levels (Easy, Medium, Hard, Expert)
| Online multiplayer with rooms and matchmaking
| Deck builder with drag-and-drop + click-to-add
| ELO ranking system
| Friends system with match invitations
| Learn mode with interactive quiz (40+ questions)
| Full EN/FR localization
| Server-authoritative multiplayer (anti-cheat)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Naruto Mythos TCG | Development
```

### Dans `#beta-testing` :

```
**BETA TESTING CHANNEL**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This channel is restricted to Testeur role members.
Ce salon est reserve aux membres avec le role Testeur.

**What to test / Quoi tester :**
| New card effects and interactions
| Online multiplayer stability
| UI/UX issues on different devices
| AI difficulty balance
| Deck builder functionality

**How to report / Comment rapporter :**
| Describe the bug clearly
| Steps to reproduce
| Expected vs actual behavior
| Screenshots or screen recordings
| Browser and device information

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Thank you for helping improve the game!
```

---

## ETAPE 7 : Parametres du serveur

1. **Parametres serveur > Vue d'ensemble**
   - Notifications par defaut : "Uniquement les @mentions"

2. **Parametres serveur > Securite**
   - Niveau de verification : Moyen (doit avoir un compte Discord de 5+ minutes)

3. **Parametres serveur > Communaute** (optionnel)
   - Active le mode Communaute si tu veux les fonctionnalites avancees (salons d'annonces, bienvenue automatique, etc.)

---

## ETAPE 8 : Reaction Roles (optionnel mais recommande)

Pour que les membres puissent s'auto-assigner des roles en cliquant sur les reactions dans `#pick-your-roles`, tu peux utiliser un bot gratuit :

**Carl-bot** (recommande) :
1. Va sur https://carl.gg
2. Invite Carl-bot sur ton serveur
3. Va dans le dashboard > Reaction Roles
4. Selectionne le message dans #pick-your-roles
5. Associe chaque reaction a son role :
   - 🍃 = Leaf Village
   - 🏜️ = Sand Village
   - 🔊 = Sound Village
   - ☁️ = Akatsuki
   - ⚪ = Independent
   - 🇬🇧 = English
   - 🇫🇷 = Francais
   - 📢 = Updates
   - 🏆 = Tournaments
   - 🎉 = Events

---

## Resume final

| Element | Nombre |
|---------|--------|
| Roles | 16 |
| Categories | 7 |
| Salons texte | 27 |
| Salons vocaux | 4 |
| Salons lecture seule | 5 |
| Salons prives | 2 |
| Messages d'accueil | 6 |

Temps estime : 20-30 minutes
