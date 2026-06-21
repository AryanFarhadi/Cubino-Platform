#!/bin/bash
# One-time Playit.gg setup for TeamSpeak (CGNAT — no port forward, no WARP on clients)
set -e

echo "=== Playit agent status ==="
systemctl is-active playit && playit status || true

if [ ! -f /etc/playit/playit.toml ]; then
  CODE=$(playit claim generate)
  echo ""
  echo "Open this link in your browser (one time only):"
  echo "  https://playit.gg/claim/${CODE}"
  echo ""
  echo "After claiming, run:  playit setup"
  echo "Then add a UDP tunnel in https://playit.gg/account/agents"
  echo "  Local: 127.0.0.1:9987  Protocol: UDP"
else
  echo "Playit already claimed."
fi

echo ""
echo "TeamSpeak local: 127.0.0.1:9987"
echo "Friends connect to the public address shown in your Playit dashboard."
