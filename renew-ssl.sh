#!/bin/bash
# Script pour renouveler le certificat SSL Let's Encrypt
# À exécuter quand le DNS est complètement propagé

echo "🔒 Renouvellement du certificat SSL Let's Encrypt..."
echo ""
echo "Vérification DNS:"
nslookup narutomythosgame.com 8.8.8.8 | grep "Address:"
echo ""
read -p "Le DNS pointe-t-il sur 82.165.93.135 ? (o/n) " confirm

if [ "$confirm" != "o" ]; then
    echo "❌ Annulé. Attendez que le DNS soit propagé."
    exit 1
fi

# Obtenir le certificat
echo "📜 Obtention du certificat Let's Encrypt..."
certbot certonly --webroot -w /var/www/certbot -d narutomythosgame.com -d www.narutomythosgame.com

if [ $? -eq 0 ]; then
    echo "✅ Certificat obtenu avec succès !"
    
    # Mettre à jour la config Nginx pour activer HSTS
    sed -i 's/# add_header Strict-Transport-Security/add_header Strict-Transport-Security/' /etc/nginx/sites-enabled/narutomythosgame.conf
    
    # Reload Nginx
    nginx -t && systemctl reload nginx
    
    echo ""
    echo "🎉 Certificat SSL installé !"
    echo "Testez: https://narutomythosgame.com"
else
    echo "❌ Échec de l'obtention du certificat."
    echo "Réessayez plus tard quand le DNS sera complètement propagé."
fi
