#!/bin/bash
# Tente d'enregistrer les 92 commandes slash auprès de Discord.
# À relancer jusqu'au succès (rate limit journalier Discord : 200 créations/jour).
cd ~/workspace/discord-bot/fusion || exit 1

# Régénère le payload depuis le code actuel
bun -e '
import { Collection } from "discord.js";
import { loadCmds } from "./src/core/loader.ts";
const client = { commands: new Collection() } as any;
await loadCmds(client);
const body = [...client.commands.values()].map((c: any) => c.data.toJSON());
require("node:fs").writeFileSync("/tmp/payload.json", JSON.stringify(body));
console.log("payload:", body.length, "commandes");
' 2>/dev/null | grep payload

TOKEN=$(bun -e 'import c from "./config.ts"; console.log(c.token)' 2>/dev/null | tail -1)
RESP=$(timeout 60 curl -s -X PUT "https://discord.com/api/v10/applications/1559487476987596843/commands" \
  -H "Authorization: Bot $TOKEN" -H "Content-Type: application/json" \
  --data @/tmp/payload.json --max-time 55 -w "\nHTTP:%{http_code}")

echo "$RESP" | tail -3 | head -c 400
echo
if echo "$RESP" | grep -q "HTTP:200"; then
  echo "SUCCESS: commandes enregistrées"
  # Compte les commandes enregistrées
  echo "$RESP" | grep -o '"name":"[^"]*"' | wc -l
  exit 0
else
  echo "RATE-LIMITED ou échec, nouvel essai plus tard"
  exit 1
fi
