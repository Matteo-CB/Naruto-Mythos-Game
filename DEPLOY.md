# Déploiement sur Railway

Ce guide explique comment déployer Naruto Mythos Game sur Railway.app gratuitement avec support WebSocket.

## Prérequis

1. Un compte [Railway.app](https://railway.app) (gratuit)
2. Ton domaine `naruto.daikicorp.fr` configuré
3. MongoDB Atlas (déjà configuré)

## Étapes de déploiement

### 1. Connexion à Railway

```bash
# Installer Railway CLI (optionnel mais recommandé)
npm install -g @railway/cli

# Se connecter
railway login
```

### 2. Créer un projet

Via le dashboard Railway:
1. Va sur https://railway.app/dashboard
2. Clique sur "New Project"
3. Choix "Deploy from GitHub repo"
4. Connecte ton repo `Naruto-Mythos-Game`

### 3. Configurer les variables d'environnement

Dans l'onglet "Variables" de ton service Railway, ajoute :

```env
DATABASE_URL=mongodb+srv://dlkdigitalagency_db_user:Wz4j5KDYHmXcm9D4@cluster0.q4izgvf.mongodb.net/naruto-mythos-tcg?appName=Cluster0
NEXTAUTH_SECRET=change-me-to-a-secure-secret-in-production-at-least-32-chars
NEXTAUTH_URL=https://naruto.daikicorp.fr
NEXT_PUBLIC_SOCKET_URL=
NODE_ENV=production
HOSTNAME=0.0.0.0
PORT=3000
```

⚠️ **Important**: Génère un vrai secret pour `NEXTAUTH_SECRET` avec :
```bash
openssl rand -base64 32
```

### 4. Déployer

Railway détectera automatiquement le `Dockerfile` et déploiera l'application.

### 5. Configurer le domaine personnalisé

1. Dans Railway, va dans l'onglet "Settings" de ton service
2. Section "Public Networking"
3. Clique sur "+ Custom Domain"
4. Ajoute `naruto.daikicorp.fr`
5. Railway te donnera un CNAME à ajouter dans ta configuration DNS chez ton registrar

Exemple de record DNS à ajouter :
```
Type: CNAME
Name: naruto
Value: [le-domaine-railway-fourni]
TTL: 3600
```

### 6. Vérifier le déploiement

Une fois le DNS propagé (quelques minutes), accède à :
- https://naruto.daikicorp.fr

Le healthcheck est disponible sur :
- https://naruto.daikicorp.fr/api/health

## Dépannage

### Les WebSocket ne fonctionnent pas

1. Vérifie que `NEXT_PUBLIC_SOCKET_URL` est vide ou égal à `NEXTAUTH_URL`
2. Vérifie les logs Railway pour les erreurs CORS
3. Assure-toi que le domaine est correctement configuré dans les variables

### Erreur de connexion MongoDB

1. Vérifie que l'IP de Railway est whitelistée dans MongoDB Atlas
2. Dans MongoDB Atlas > Network Access > Add IP Address > Allow Access from Anywhere (0.0.0.0/0) pour tester

### Problèmes de build

Vérifie les logs de build dans Railway. Si besoin, redéploie avec "Clear Cache and Redeploy".

## Limites du plan gratuit Railway

- 500 heures d'exécution par mois (environ 20 jours si continu)
- Le service s'arrête après 5 minutes d'inactivité (mais redémarre automatiquement)
- Pour un usage continu, envisage le plan Hobby ($5/mois)

## Alternative : Render.com

Si Railway ne convient pas, Render.com offre aussi un plan gratuit avec WebSocket :

1. Crée un compte sur https://render.com
2. New Web Service > Build and deploy from GitHub
3. Config:
   - Build Command: `npm install -g pnpm && pnpm install && npx prisma generate && pnpm build`
   - Start Command: `node --import tsx server/index.ts`
4. Ajoute les mêmes variables d'environnement
