#!/bin/bash
# Attendre que le rate limit soit réinitialisé (1h après le dernier échec)

echo "⏳ Attente de 70 minutes pour le rate limit Let's Encrypt..."
sleep 4200  # 70 minutes

echo "📜 Tentative d'obtention du certificat..."
certbot certonly --webroot -w /var/www/certbot -d narutomythosgame.com -d www.narutomythosgame.com --non-interactive --agree-tos --email admin@narutomythosgame.com

if [ $? -eq 0 ]; then
    echo "✅ Certificat obtenu ! Activation HSTS..."
    sed -i 's/# add_header Strict-Transport-Security/add_header Strict-Transport-Security/' /etc/nginx/sites-enabled/narutomythosgame.conf
    nginx -t && systemctl reload nginx
    echo "🎉 SSL Let's Encrypt activé !"
else
    echo "❌ Échec. Réessayez manuellement plus tard avec ./renew-ssl.sh"
fi
