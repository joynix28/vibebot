#!/bin/bash
# Tunnel public vers le dashboard (localhost.run via le proxy de sortie)
while true; do
  ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=3     -o "ProxyCommand=nc -X connect -x hatch-egress-proxy:3128 %h %p"     -R 80:localhost:3000 nokey@localhost.run > /tmp/lhr.log 2>&1
  echo "tunnel coupé, reconnexion dans 5s..." >> /tmp/lhr.log
  sleep 5
done
