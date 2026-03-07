#!/bin/bash
set -e

# ============================================
# NARUTO MYTHOS TCG - Script de deploiement
# ============================================
# Usage: ./deploy.sh
#
# Ce script:
# 1. Pull le dernier code depuis GitHub
# 2. Copie la page maintenance + assets pour Nginx
# 3. Arrete le container Docker (graceful shutdown)
# 4. Purge tous les anciens containers, images et cache
# 5. Rebuild et relance depuis zero
# 6. Reload Nginx
# ============================================

# Detecter le repertoire du script (= racine du projet)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================"
echo "  NARUTO MYTHOS - Deploiement"
echo "========================================"
echo ""

# 1. Pull le code
echo "[1/6] Pull du code depuis GitHub..."
git pull origin main
echo ""

# 2. Copier maintenance.html + assets vers un dossier Nginx-accessible
# Ces fichiers restent disponibles meme quand Docker est down
echo "[2/6] Copie des assets maintenance pour Nginx..."
sudo mkdir -p /var/www/naruto-mythos/public/images
sudo mkdir -p /var/www/naruto-mythos/public/fonts
sudo cp public/maintenance.html /var/www/naruto-mythos/
sudo cp -r public/images/cards /var/www/naruto-mythos/public/images/ 2>/dev/null || true
sudo cp -r public/images/icons /var/www/naruto-mythos/public/images/ 2>/dev/null || true
sudo cp -r public/fonts/* /var/www/naruto-mythos/public/fonts/ 2>/dev/null || true
echo ""

# 3. Liberer le port et stopper le container (envoie SIGTERM => graceful shutdown)
echo "[3/6] Arret du container Docker (graceful shutdown)..."
sudo fuser -k 3000/tcp 2>/dev/null || true
sleep 2
docker compose down --timeout 15 2>/dev/null || true
docker rm -f naruto-mythos 2>/dev/null || true
echo ""

# 4. Purger tout: containers arretes, images, build cache, volumes orphelins
echo "[4/6] Purge des anciens containers, images et cache..."
docker system prune -af 2>/dev/null || true
docker builder prune -af 2>/dev/null || true
docker volume prune -f 2>/dev/null || true
echo ""

# 5. Charger env et rebuild + relancer (zero cache)
echo "[5/6] Rebuild et lancement du container..."
if [ -f .env.production ]; then
  export $(grep -v '^#' .env.production | xargs)
fi
docker compose build --no-cache
docker compose up -d
echo ""

# Attendre le demarrage
echo "    Attente du demarrage (15s)..."
sleep 15

# Verifier le healthcheck
echo "    Verification du healthcheck..."
if curl -sf http://localhost:3000/api/health | grep -q '"status":"ok"'; then
    echo "    Healthcheck OK!"
else
    echo "    ATTENTION: Healthcheck pas encore ready (le serveur demarre peut-etre encore)"
    echo "    Verifier avec: curl http://localhost:3000/api/health"
    echo "    Logs: docker compose logs -f"
fi
echo ""

# 6. Reload Nginx
echo "[6/6] Reload Nginx..."
sudo nginx -t && sudo systemctl reload nginx
echo ""

echo "========================================"
echo "  Deploiement termine avec succes!"
echo "========================================"
echo ""
echo "  Site: https://narutomythosgame.com"
echo "  Logs: docker compose logs -f"
echo "  Health: curl http://localhost:3000/api/health"
echo "========================================"
