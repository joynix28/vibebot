#!/bin/bash
# install-vps.sh -- Installe VibeBot (Fusion Bot) sur un VPS Ubuntu 24.04
# Usage : sudo ./install-vps.sh   (voir DEPLOY_VPS.md pour le guide complet)
set -euo pipefail
APP_DIR="/opt/vibebot"
APP_USER="vibebot"
REPO="https://github.com/joynix28/vibebot.git"
if [ "$(id -u)" -ne 0 ]; then echo "Lance ce script en root : sudo ./install-vps.sh"; exit 1; fi

echo "== 1/6 Paquets systeme =="
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl git ffmpeg ca-certificates unzip

echo "== 2/6 Bun =="
if ! command -v bun >/dev/null 2>&1; then
  BUN_HOST="bun.sh"
  curl -fsSL "https://${BUN_HOST}/install" | bash
  ln -sf "$HOME/.bun/bin/bun" /usr/local/bin/bun
fi
bun --version

echo "== 3/6 Utilisateur $APP_USER =="
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$APP_USER"
fi

echo "== 4/6 Code source =="
if [ -d "$APP_DIR/.git" ]; then
  echo "   Depot existant, mise a jour..."
  git -C "$APP_DIR" pull --ff-only || true
elif [ -d "$APP_DIR" ]; then
  echo "   $APP_DIR existe deja (copie locale), on le garde tel quel."
else
  git clone "$REPO" "$APP_DIR"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "== 5/6 Dependances (bun install) =="
sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && bun install"

echo "== 6/6 Service systemd =="
cat > /etc/systemd/system/vibebot.service <<SERVICE_EOF
[Unit]
Description=VibeBot -- Fusion Bot Discord
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=vibebot
WorkingDirectory=/opt/vibebot
ExecStart=/usr/local/bin/bun --preload ./preload.ts index.ts
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SERVICE_EOF

systemctl daemon-reload

echo ""
echo "Installation terminee."
echo ""
echo "Prochaines etapes :"
echo "  1. Renseigne /opt/vibebot/.env (voir .env.example et DEPLOY_VPS.md)"
echo "  2. sudo systemctl enable --now vibebot"
echo "  3. sudo journalctl -u vibebot -f   # verifier les logs"
