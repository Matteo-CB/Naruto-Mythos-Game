# Naruto Mythos TCG - Discord Server Setup Guide

Guide complet pour configurer le serveur Discord.

---

## Modele de permissions

| Role | Acces |
|------|-------|
| `@everyone` | **AUCUN** salon visible |
| `Genin` (minimum) | Tous les salons normaux (Welcome, EN, FR, Competitive, Dev, Community, Voice) |
| `Chunin` / `Kage` | Meme acces que Genin |
| `Testeur` | **UNIQUEMENT** les salons de test (beta-testing, dev-internal, Test Voice) |
| `Developer` | Tous les salons (normaux + test) |
| `Hokage` | Tous les salons (admin) |
| `Jonin` | Salons normaux + moderation |

**Si un membre a uniquement le role Testeur, il ne voit QUE les salons de test.**
**Genin est le role minimum obligatoire pour voir les salons generaux.**

---

## Utilisation du script automatique

```bash
node scripts/discord-setup.mjs VOTRE_BOT_TOKEN VOTRE_GUILD_ID
```

Le script cree automatiquement tous les roles, categories, salons, permissions et embeds.

---

## ETAPE 1 : Roles

### Staff

| Nom | Couleur | Afficher separement | Permissions |
|-----|---------|---------------------|-------------|
| `Hokage` | `#C4A35A` | Oui | Administrateur |
| `Jonin` | `#5865F2` | Oui | Gerer messages, Expulser, Bannir, Moderer |
| `Developer` | `#6A6ABB` | Oui | Aucune (voit tout via overwrites) |
| `Testeur` | `#3EAAB3` | Oui | Aucune (voit uniquement salons test) |

### Rangs (ELO automatique)

| Nom | Couleur | Description |
|-----|---------|-------------|
| `Kage` | `#FFD700` | ELO 2000+ |
| `Chunin` | `#B37E3E` | ELO 1200-1999 |
| `Genin` | `#3E8B3E` | ELO < 1200 (role minimum pour voir les salons) |

### Villages, Langue, Notifications

Meme roles qu'avant (Leaf Village, Sand Village, Sound Village, Akatsuki, Independent, English, Francais, Updates, Tournaments, Events).

---

## ETAPE 2 : Categories et salons

### Categorie : `══  WELCOME  ══` (acces: Genin+)

| Salon | Permissions |
|-------|-------------|
| `rules` | Lecture seule (staff peut ecrire) |
| `announcements` | Lecture seule (staff peut ecrire) |
| `pick-your-roles` | Normal |
| `introductions` | Normal |

### Categorie : `══  ENGLISH  ══` (acces: Genin+)

| Salon | Topic |
|-------|-------|
| `general-en` | General discussion about Naruto Mythos TCG |
| `find-a-match` | Looking for an opponent? Post here with your ELO |
| `deck-sharing-en` | Share your deck builds, get feedback, discuss meta |
| `strategies-en` | Advanced strategies, mission control, chakra management |
| `card-discussion-en` | Discuss card effects, power levels, and synergies |
| `help-en` | Need help with rules or game mechanics? Ask here |

### Categorie : `══  FRANCAIS  ══` (acces: Genin+)

| Salon | Topic |
|-------|-------|
| `general-fr` | Discussion generale sur Naruto Mythos TCG |
| `chercher-un-match` | Vous cherchez un adversaire ? Postez ici avec votre ELO |
| `partage-de-decks` | Partagez vos decks, demandez des conseils, discutez du meta |
| `strategies-fr` | Strategies avancees, controle de mission, gestion du chakra |
| `discussion-cartes` | Discutez des effets des cartes, puissance et synergies |
| `aide-fr` | Besoin d'aide avec les regles ou les mecaniques ? |

### Categorie : `══  COMPETITIVE  ══` (acces: Genin+)

| Salon | Permissions |
|-------|-------------|
| `leaderboard` | Lecture seule |
| `tournaments` | Lecture seule |
| `tournament-chat` | Normal |
| `match-results` | Normal |
| `hall-of-fame` | Lecture seule |

### Categorie : `══  DEVELOPMENT  ══` (acces: Genin+)

| Salon | Permissions |
|-------|-------------|
| `changelog` | Lecture seule |
| `bug-reports` | Normal |
| `suggestions` | Normal |

### Categorie : `══  TESTING  ══` (acces: Testeur UNIQUEMENT)

| Salon | Type | Acces |
|-------|------|-------|
| `beta-testing` | Texte | Testeur, Developer, Hokage |
| `dev-internal` | Texte | Developer, Hokage uniquement |
| `Test Voice` | Vocal | Testeur, Developer, Hokage |

**Un membre avec seulement le role Testeur ne voit QUE cette categorie.**

### Categorie : `══  COMMUNITY  ══` (acces: Genin+)

| Salon | Topic |
|-------|-------|
| `off-topic` | Talk about anything |
| `fan-art` | Share your Naruto fan art |
| `memes` | Naruto TCG memes and funny moments |
| `media-clips` | Game replays, screenshots, video content |

### Categorie : `══  VOICE  ══` (acces: Genin+)

| Salon | Type |
|-------|------|
| `Game Voice EN` | Vocal |
| `Game Voice FR` | Vocal |
| `Tournament Voice` | Vocal |
| `Chill Zone` | Vocal |

---

## Resume

| Element | Nombre |
|---------|--------|
| Roles | 17 |
| Categories | 8 |
| Salons texte | 28 |
| Salons vocaux | 5 (dont Test Voice) |
| Salons lecture seule | 5 |
| Embeds d'accueil | 6 |
