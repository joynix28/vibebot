# 🖥️ Déployer VibeBot sur un VPS

Guide pour faire tourner le bot sur un petit serveur avec internet normal
(la voix Discord / musique ne marchera **que** là — ma VM de test bloque l'UDP).

Budget : ~4–5 €/mois (Hetzner CX22, OVH, Contabo…), Ubuntu 24.04.

## 1. Avant de commencer (checklist)

- [ ] **Régénère ton token Discord** (portail développeur → Bot → Reset Token) —
  l'ancien a circulé dans le chat, il faut le jeter.
- [ ] Récupère aussi un **nouveau CLIENT_SECRET** (OAuth2 → Reset Secret) si tu veux
  garder le dashboard public.
- [ ] Active les **intents privilégiés** sur le portail Discord :
  Server Members Intent, Message Content Intent, Presence Intent.
- [ ] Ton **Discord user ID** (pour `OWNER_ID`) : mode développeur Discord →
  clic droit sur ton profil → « Copier l'identifiant ».
- [ ] Si tu veux le dashboard public : un nom de domaine (ou réutilise
  `demo-tktdash.link2me.fr` avec un nouveau tunnel Cloudflare — le token
  cloudflared actuel a aussi circulé, régénère-le).

## 2. Crée le serveur

Hetzner Cloud → nouveau serveur → Ubuntu 24.04 → datacenter Falkenstein
ou Nuremberg (proche de Paris). Le moins cher suffit (2 vCPU / 4 Go).

Note ton IP, connecte-toi :

```bash
ssh root@TON_IP
```

## 3. Lance le script d'installation

```bash
curl -fsSL https://raw.githubusercontent.com/joynix28/vibebot/main/install-vps.sh -o install-vps.sh
# OU copie le fichier install-vps.sh depuis ce dossier
chmod +x install-vps.sh
sudo ./install-vps.sh
```

Le script fait : paquets système (`ffmpeg` pour la voix, `git`, `curl`),
installation de Bun, création de l'utilisateur `vibebot`, clone du dépôt
dans `/opt/vibebot`, `bun install`, et création du service systemd
`vibebot` (redémarrage auto en cas de crash).

⚠️ Le script clone la branche `main` de GitHub. Si le dernier commit local
n'est pas encore poussé, copie plutôt ton dossier local :

```bash
scp -r ~/workspace/discord-bot/fusion root@TON_IP:/opt/vibebot
```

## 4. Configure le `.env`

```bash
sudo -u vibebot cp /opt/vibebot/.env.example /opt/vibebot/.env
sudo -u vibebot nano /opt/vibebot/.env
```

Renseigne au minimum :

```
TOKEN=ton_nouveau_token_discord
CLIENT_ID=1559487476987596843
CLIENT_SECRET=ton_nouveau_secret
OWNER_ID=ton_id_discord
REDIRECT_URI=https://ton-domaine.fr/callback
BASE_URL=https://ton-domaine.fr
DASHBOARD_PORT=3000
```

## 5. Démarre le bot

```bash
sudo systemctl enable --now vibebot
sudo journalctl -u vibebot -f   # voir les logs
```

Le bot s'enregistre tout seul auprès de Discord au démarrage
(les 86 commandes ; Discord peut rate-limiter, le bot réessaie).

## 6. Dashboard public (optionnel)

Sur un VPS, pas besoin de proxy bizarre — installe cloudflared normalement :

```bash
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
  | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' \
  | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update && sudo apt-get install -y cloudflared
sudo cloudflared service install TON_TOKEN_TUNNEL
```

Puis déclare le hostname dans le dashboard Cloudflare Zero Trust →
`http://localhost:3000`, et ajoute `https://ton-domaine.fr/callback`
dans les redirections OAuth2 du portail Discord.

## Commandes utiles

| Action | Commande |
|---|---|
| Voir les logs | `sudo journalctl -u vibebot -f` |
| Redémarrer | `sudo systemctl restart vibebot` |
| Mettre à jour | `cd /opt/vibebot && git pull && bun install && sudo systemctl restart vibebot` |
| Statut | `sudo systemctl status vibebot` |

## Différences avec l'hébergement actuel

- ✅ La **voix fonctionne** (UDP sortant autorisé) → `/play`, `/musique` OK
- ✅ Plus de tunnel bricolé : cloudflared direct
- ✅ Redémarrage auto via systemd (plus besoin du watchdog toutes les 15 min)
- ❌ Ça coûte ~4–5 €/mois — mais c'est TON serveur, pas ma VM de test
