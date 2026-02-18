#!/bin/bash
set -e

echo "🚀 Déploiement de Naruto Mythos Game..."

# Libérer le port 3000 si utilisé
echo "📡 Libération du port 3000..."
sudo fuser -k 3000/tcp 2>/dev/null || true
sleep 2

# Arrêter l'ancien conteneur s'il existe
echo "🛑 Arrêt de l'ancien conteneur..."
docker rm -f naruto-mythos 2>/dev/null || true

# Charger les variables d'environnement
export $(grep -v '^#' .env.production | xargs)

# Démarrer le nouveau conteneur
echo "🚀 Démarrage du conteneur..."
docker run -d \
  --name naruto-mythos \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e HOSTNAME=0.0.0.0 \
  -e DATABASE_URL="$DATABASE_URL" \
  -e NEXTAUTH_SECRET="$NEXTAUTH_SECRET" \
  -e NEXTAUTH_URL="$NEXTAUTH_URL" \
  -e NEXT_PUBLIC_SOCKET_URL="$NEXT_PUBLIC_SOCKET_URL" \
  --restart unless-stopped \
  naruto-game-app

# Attendre que le serveur démarre
echo "⏳ Attente du démarrage..."
sleep 5

# Vérifier le healthcheck
echo "🔍 Vérification du healthcheck..."
if curl -s http://localhost:3000/api/health | grep -q '"status":"ok"'; then
    echo "✅ Healthcheck OK!"
else
    echo "❌ Healthcheck failed!"
    docker logs naruto-mythos --tail 20
    exit 1
fi

# Afficher les infos
echo ""
echo "========================================="
echo "🎉 Déploiement terminé avec succès !"
echo "========================================="
echo "🔗 https://narutomythosgame.com (nouveau domaine)"
echo "🔌 WebSocket: wss://narutomythosgame.com"
echo "⚠️  Certificat temporaire - Renouveler avec ./renew-ssl.sh"
echo "========================================="
