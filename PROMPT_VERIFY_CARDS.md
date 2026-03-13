# Prompt — Vérification visuelle des cartes Naruto Mythos TCG

## Objectif

Tu vas recevoir des images de cartes du jeu **Naruto Mythos Trading Card Game** (set "Konoha Shidō"). Pour chaque image, lis attentivement toutes les informations visibles sur la carte et compare-les avec les données JSON que je te fournis. Signale toute différence.

---

## Ce que tu dois lire sur chaque carte

Chaque carte de personnage affiche ces informations :

1. **Numéro** — en haut à gauche ou en bas (format `XXX/130`)
2. **Nom du personnage** — en gros, généralement en français
3. **Titre** — sous le nom, entre guillemets (en français)
4. **Coût en Chakra** — chiffre dans un symbole en haut à gauche
5. **Puissance (Power)** — chiffre en bas à droite
6. **Rareté** — lettre(s) après le numéro (C, UC, R, RA, S, M, etc.)
7. **Mot-clés (Keywords)** — sous le nom/titre, souvent en italique (ex: Team 7, Sannin, Invocation, Jutsu)
8. **Groupe (Village)** — icône ou texte indiquant le village (Leaf Village, Sand Village, Sound Village, Akatsuki, Independent)
9. **Texte d'effet** — le bloc de texte décrivant les effets de la carte. Les types d'effets sont :
   - **MAIN** — effet principal
   - **UPGRADE** — effet d'amélioration
   - **AMBUSH** — effet d'embuscade
   - **SCORE** — effet de score [↯]
   - **[⧗]** — effet continu/passif
10. **Set** — le nom du set (Konoha Shidō / KS)

Pour les **cartes Mission** :
1. **Numéro** — MSS XX
2. **Nom de la mission** — en français
3. **Points de base** — nombre sur la carte
4. **Texte d'effet** — effets SCORE ou continus

---

## Format de réponse attendu

Pour chaque carte analysée, réponds dans ce format :

```
### KS-XXX-R — NOM DU PERSONNAGE

| Champ | Sur la carte | Dans le JSON | Match ? |
|-------|-------------|-------------|---------|
| Nom FR | ... | ... | ✅ / ❌ |
| Titre FR | ... | ... | ✅ / ❌ |
| Chakra | ... | ... | ✅ / ❌ |
| Power | ... | ... | ✅ / ❌ |
| Keywords | ... | ... | ✅ / ❌ |
| Group | ... | ... | ✅ / ❌ |
| Effet(s) | ... | ... | ✅ / ❌ |

**Différences trouvées :** (liste des problèmes ou "Aucune")
```

Si le texte d'effet est long, résume la comparaison en pointant uniquement les différences spécifiques (mot manquant, chiffre différent, condition différente, etc.).

---

## Données JSON de référence

Voici les données de notre base pour chaque carte. Compare ce qui est écrit sur l'image avec ces données :

```
[COLLER ICI LE BLOC JSON DE LA CARTE CONCERNÉE]
```

---

## Instructions importantes

- **Lis le texte en FRANÇAIS** sur la carte — nos noms et titres sont en français
- Les cartes **RA (Rare Art)** et **MV (Mythos Variant)** partagent les mêmes stats que leur version de base (R ou S) — vérifie quand même
- Si le texte est partiellement masqué par l'illustration, indique "partiellement lisible"
- Si tu n'es pas sûr d'un mot, indique "incertain: ..."
- **Concentre-toi sur les données mécaniques** (chakra, power, keywords, groupe, effets) plutôt que sur la mise en forme
- Pour les effets, vérifie en particulier :
  - Les **chiffres** (coûts, puissances, nombre de tokens)
  - Les **conditions** ("in this mission" vs "in play", "Power X or less", etc.)
  - Les **cibles** ("friendly" vs "enemy", "character" vs "hidden character")
  - Les **mots-clés ciblés** ("Leaf Village", "Sound Four", "Summon", etc.)
  - Le **type d'effet** (MAIN vs AMBUSH vs UPGRADE vs SCORE)

---

## Comment procéder

1. Je vais t'envoyer les images par batch (5-10 cartes à la fois)
2. Pour chaque batch, je te donnerai aussi le JSON correspondant
3. Analyse chaque carte et donne-moi le tableau de comparaison
4. À la fin de tous les batchs, fais un résumé global des différences trouvées

Prêt ? Je t'envoie le premier batch.
