#!/bin/bash
set -e

# ============================================
# NARUTO MYTHOS TCG - Script de deploiement
# ============================================
# Usage: ./deploy.sh
#
# Ce script:
# 1. Pull le dernier code depuis GitHub
# 2. Copie la page maintenance + assets + configs Nginx
# 3. Reload Nginx (active la page maintenance AVANT d'arreter Docker)
# 4. Arrete le container Docker (graceful shutdown)
# 5. Purge tous les anciens containers, images et cache
# 6. Rebuild et relance depuis zero
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

# 2. Copier maintenance.html + assets + configs Nginx
echo "[2/6] Copie des assets maintenance et configs Nginx..."
sudo mkdir -p /var/www/naruto-mythos/public/images
sudo mkdir -p /var/www/naruto-mythos/public/fonts
sudo cp public/maintenance.html /var/www/naruto-mythos/
sudo cp -r public/images/cards /var/www/naruto-mythos/public/images/ 2>/dev/null || true
sudo cp -r public/images/icons /var/www/naruto-mythos/public/images/ 2>/dev/null || true
sudo cp -r public/fonts/* /var/www/naruto-mythos/public/fonts/ 2>/dev/null || true

# Copier les configs Nginx et creer les symlinks
sudo cp nginx/narutomythosgame.conf /etc/nginx/sites-available/
sudo cp nginx/naruto-mythos.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/narutomythosgame.conf /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/naruto-mythos.conf /etc/nginx/sites-enabled/
echo ""

# 3. Reload Nginx AVANT d'arreter Docker
# Comme ca, quand Docker tombe, Nginx sert la page maintenance (error_page 502)
echo "[3/6] Reload Nginx (active la page maintenance)..."
sudo nginx -t && sudo systemctl reload nginx
echo ""

# 4. Liberer le port et stopper le container (envoie SIGTERM => graceful shutdown)
echo "[4/6] Arret du container Docker (graceful shutdown)..."
sudo fuser -k 3000/tcp 2>/dev/null || true
sleep 2
docker compose down --timeout 15 2>/dev/null || true
docker rm -f naruto-mythos 2>/dev/null || true
echo ""

# 5. Purger tout: containers arretes, images, build cache, volumes orphelins
echo "[5/6] Purge des anciens containers, images et cache..."
docker system prune -af 2>/dev/null || true
docker builder prune -af 2>/dev/null || true
docker volume prune -f 2>/dev/null || true
echo ""

# 6. Charger env et rebuild + relancer (zero cache)
echo "[6/6] Rebuild et lancement du container..."
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

echo "========================================"
echo "  Deploiement termine avec succes!"
echo "========================================"
echo ""
echo "  Site: https://narutomythosgame.com"
echo "  Logs: docker compose logs -f"
echo "  Health: curl http://localhost:3000/api/health"
echo "========================================"
