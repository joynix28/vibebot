# ⚡ VibeBot (Fusion Bot)

Bot Discord multifonction — **Bun + TypeScript + discord.js v14**, réponses en **Components V2**, dashboard web avec OAuth2 Discord.

Fusion de 12 bots : Security, NdProtect, TempVoice, Xenon, Froggy, LegacyBot, TitanBot, MusicBot, evobot, discord-tickets, CorwinDev Discord-Bot, abot.

## 🧩 Modules

| Module | Contenu |
|---|---|
| 🛡️ Sécurité | Anti-nuke, anti-raid, vérification captcha, whitelist |
| ⛨ Protection | Anti-raid avancé, anti-spam, automod, logs |
| 🎵 Musique | YouTube/SoundCloud, file d'attente, vote-skip, playlists, rôle DJ |
| 🎫 Tickets | Panels, claim, priorités, transcripts, feedback en étoiles |
| 💰 Économie | Monnaie virtuelle, boutique, casino (slots, blackjack, roulette) |
| 🧰 Utilitaires | Infos serveur/membre, outils, jeux interactifs |
| 🔊 Salons vocaux | Salons vocaux temporaires |
| 💾 Backups | Sauvegarde / restauration du serveur |
| 🐸 Froggy | Piège à bots spam |
| 🎉 Communauté | Giveaways, niveaux, candidatures, prison, invitations |

## 🚀 Installation

```bash
bun install
cp .env.example .env   # puis renseigne TOKEN, CLIENT_ID, CLIENT_SECRET…
bun --preload ./preload.ts index.ts
```

Le dashboard web démarre sur `http://localhost:3000` (configurable via `DASHBOARD_PORT`).

## 🔐 Sécurité

- Ne committe **jamais** ton `.env` (tokens Discord, secrets OAuth2).
- Régénère ton token Discord s'il a été exposé.

## 📄 Licence

MIT — Copyright (c) 2026 joynix28.
Toute réutilisation doit conserver la mention de l'autrice d'origine.
